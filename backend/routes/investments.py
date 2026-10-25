import asyncio
import time as _time
from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from db import db
from models import FDIn, StockIn
from router import api_router
from security import CurrentUser, audit, require_perm, require_workspace
from utils import new_id, now_utc

# --------------------------------------------------------------------------
# Live price fetching (yfinance, India-first)
# --------------------------------------------------------------------------
_quote_cache: dict = {}
_CACHE_TTL = 300  # 5 minutes


async def fetch_quote(raw_symbol: str) -> Optional[dict]:
    """
    Resolve a stock symbol and return live price data.
    Strategy (India-first): tries bare symbol → SYMBOL.NS → SYMBOL.BO.
    Results are cached for 5 minutes.
    """
    import yfinance as yf

    key = raw_symbol.strip().upper()
    cached = _quote_cache.get(key)
    if cached and (_time.time() - cached["ts"]) < _CACHE_TTL:
        return cached

    candidates = [key, f"{key}.NS", f"{key}.BO"]

    def _try() -> Optional[dict]:
        for sym in candidates:
            try:
                ticker = yf.Ticker(sym)
                price = ticker.fast_info.last_price
                if price and float(price) > 0:
                    info = ticker.info
                    return {
                        "resolved_symbol": sym,
                        "price": round(float(price), 4),
                        "currency": ticker.fast_info.currency or info.get("currency", "INR"),
                        "name": info.get("shortName") or info.get("longName") or raw_symbol,
                        "ts": _time.time(),
                    }
            except Exception:
                continue
        return None

    result = await asyncio.to_thread(_try)
    if result:
        _quote_cache[key] = result
    return result


# --------------------------------------------------------------------------
# Ownership helpers (shared households)
# --------------------------------------------------------------------------
def validate_ownership(ws: dict, ownership: list) -> list:
    if ws.get("type") != "shared" or not ownership:
        return []
    member_ids = {m["member_id"] for m in ws.get("members", [])}
    items = [{"member_id": o.member_id, "percent": round(o.percent, 2)} for o in ownership if o.percent > 0]
    if not items:
        return []
    for it in items:
        if it["member_id"] not in member_ids:
            raise HTTPException(status_code=400, detail="Ownership includes a non-member")
    total = round(sum(it["percent"] for it in items), 2)
    if abs(total - 100) > 0.01:
        raise HTTPException(status_code=400, detail="Ownership percentages must add up to 100%")
    return items


def my_member_id(ws: dict, user_id: str) -> Optional[str]:
    for m in ws.get("members", []):
        if m.get("user_id") == user_id:
            return m["member_id"]
    return None


def attach_my_share(doc: dict, value: float, member_id: Optional[str]):
    pct = 100.0
    if doc.get("ownership"):
        pct = next((o["percent"] for o in doc["ownership"] if o["member_id"] == member_id), 0.0)
    doc["my_share"] = round(value * pct / 100, 2)


# --------------------------------------------------------------------------
# Fixed Deposits
# --------------------------------------------------------------------------
def fd_maturity(principal: float, rate: float, start: str, maturity: str) -> dict:
    try:
        s = datetime.fromisoformat(start).date()
        m = datetime.fromisoformat(maturity).date()
        years = max((m - s).days / 365.0, 0)
        today = now_utc().date()
        elapsed_years = max(min((today - s).days, (m - s).days) / 365.0, 0)
    except Exception:
        years, elapsed_years = 0, 0
    maturity_value = round(principal * ((1 + rate / 100) ** years), 2)
    accrued = round(principal * ((1 + rate / 100) ** elapsed_years) - principal, 2)
    return {"maturity_value": maturity_value, "accrued_interest": accrued}


@api_router.get("/fixed-deposits")
async def list_fds(workspace_id: str, user: CurrentUser):
    ws = await require_workspace(workspace_id, user)
    mid = my_member_id(ws, user["user_id"])
    fds = await db.fixed_deposits.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    for f in fds:
        f.update(fd_maturity(f["principal"], f["rate"], f["start_date"], f["maturity_date"]))
        attach_my_share(f, f["principal"] + f["accrued_interest"], mid)
    return fds


@api_router.post("/fixed-deposits")
async def create_fd(body: FDIn, user: CurrentUser):
    ws = await require_perm(body.workspace_id, user, "edit")
    ownership = validate_ownership(ws, body.ownership)
    doc = {"id": new_id("fd"), **body.dict(), "ownership": ownership, "created_at": now_utc().isoformat(), "deleted_at": None}
    await db.fixed_deposits.insert_one(dict(doc))
    doc.update(fd_maturity(doc["principal"], doc["rate"], doc["start_date"], doc["maturity_date"]))
    attach_my_share(doc, doc["principal"] + doc["accrued_interest"], my_member_id(ws, user["user_id"]))
    if ownership:
        await audit(ws, user, "ownership", "fixed_deposit", f"Set ownership on {body.name}")
    return doc


@api_router.put("/fixed-deposits/{fd_id}")
async def update_fd(fd_id: str, body: FDIn, user: CurrentUser):
    f = await db.fixed_deposits.find_one({"id": fd_id, "deleted_at": None}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    ws = await require_perm(body.workspace_id, user, "edit")
    ownership = validate_ownership(ws, body.ownership)
    await db.fixed_deposits.update_one({"id": fd_id}, {"$set": {**body.dict(), "ownership": ownership}})
    doc = await db.fixed_deposits.find_one({"id": fd_id}, {"_id": 0})
    doc.update(fd_maturity(doc["principal"], doc["rate"], doc["start_date"], doc["maturity_date"]))
    attach_my_share(doc, doc["principal"] + doc["accrued_interest"], my_member_id(ws, user["user_id"]))
    return doc


@api_router.delete("/fixed-deposits/{fd_id}")
async def delete_fd(fd_id: str, user: CurrentUser):
    f = await db.fixed_deposits.find_one({"id": fd_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(f["workspace_id"], user, "delete")
    await db.fixed_deposits.update_one({"id": fd_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}


# --------------------------------------------------------------------------
# Stocks
# --------------------------------------------------------------------------
@api_router.get("/stocks/quote/{symbol}")
async def get_stock_quote(symbol: str, user: CurrentUser):
    """Fetch a live price quote for a single symbol (India-first resolution)."""
    q = await fetch_quote(symbol)
    if not q:
        raise HTTPException(status_code=404, detail=f"Could not fetch price for '{symbol}'. Try appending .NS or .BO for Indian stocks.")
    return q


_EXCHANGE_LABELS = {
    "NSI": "NSE", "BSE": "BSE", "NMS": "NASDAQ", "NYQ": "NYSE",
    "PCX": "NYSE", "NGM": "NASDAQ", "NCM": "NASDAQ", "ASX": "ASX",
    "LSE": "LSE", "SHH": "Shanghai", "SHZ": "Shenzhen", "TSX": "TSX",
}


@api_router.get("/stocks/search")
async def search_stocks(q: str, user: CurrentUser):
    """Search for stocks by company name or ticker symbol."""
    if len(q.strip()) < 2:
        return []

    def _search():
        import yfinance as yf
        try:
            results = yf.Search(q.strip(), max_results=12).quotes
            out = []
            for r in results:
                if r.get("quoteType") not in ("EQUITY", "ETF"):
                    continue
                sym = r.get("symbol", "")
                if not sym:
                    continue
                exchange_code = r.get("exchange", "")
                out.append({
                    "symbol": sym,
                    "name": r.get("longname") or r.get("shortname") or sym,
                    "exchange": _EXCHANGE_LABELS.get(exchange_code, exchange_code),
                    "type": r.get("quoteType", "EQUITY"),
                })
                if len(out) >= 8:
                    break
            return out
        except Exception:
            return []

    return await asyncio.to_thread(_search)


@api_router.post("/stocks/refresh-prices")
async def refresh_stock_prices(workspace_id: str, user: CurrentUser):
    """Bulk-refresh live prices for all holdings in a workspace."""
    ws = await require_workspace(workspace_id, user)
    mid = my_member_id(ws, user["user_id"])
    stocks = await db.stocks.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)

    if not stocks:
        return {"stocks": [], "failed": [], "refreshed_at": now_utc().isoformat()}

    refreshed_at = now_utc().isoformat()
    failed: list = []
    sem = asyncio.Semaphore(3)  # cap concurrent Yahoo Finance requests

    async def refresh_one(s: dict):
        async with sem:
            # Bust cache so we always get a fresh price on explicit refresh
            _quote_cache.pop(s["symbol"].strip().upper(), None)
            q = await fetch_quote(s["symbol"])
            if q and q["price"] > 0:
                await db.stocks.update_one(
                    {"id": s["id"]},
                    {"$set": {"current_price": q["price"], "last_price_refreshed_at": refreshed_at}},
                )
                s["current_price"] = q["price"]
                s["last_price_refreshed_at"] = refreshed_at
            else:
                failed.append(s["symbol"])

    await asyncio.gather(*[refresh_one(s) for s in stocks])

    for s in stocks:
        s["invested"] = round(s["quantity"] * s["avg_price"], 2)
        s["current_value"] = round(s["quantity"] * s["current_price"], 2)
        s["pnl"] = round(s["current_value"] - s["invested"], 2)
        s["pnl_pct"] = round((s["pnl"] / s["invested"] * 100) if s["invested"] > 0 else 0, 2)
        attach_my_share(s, s["current_value"], mid)

    return {"stocks": stocks, "failed": failed, "refreshed_at": refreshed_at}


@api_router.get("/stocks")
async def list_stocks(workspace_id: str, user: CurrentUser):
    ws = await require_workspace(workspace_id, user)
    mid = my_member_id(ws, user["user_id"])
    stocks = await db.stocks.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    for s in stocks:
        s["invested"] = round(s["quantity"] * s["avg_price"], 2)
        s["current_value"] = round(s["quantity"] * s["current_price"], 2)
        s["pnl"] = round(s["current_value"] - s["invested"], 2)
        s["pnl_pct"] = round((s["pnl"] / s["invested"] * 100) if s["invested"] > 0 else 0, 2)
        attach_my_share(s, s["current_value"], mid)
    return stocks


@api_router.post("/stocks")
async def create_stock(body: StockIn, user: CurrentUser):
    ws = await require_perm(body.workspace_id, user, "edit")
    ownership = validate_ownership(ws, body.ownership)
    doc = {"id": new_id("stk"), **body.dict(), "ownership": ownership, "created_at": now_utc().isoformat(), "deleted_at": None}
    await db.stocks.insert_one(dict(doc))
    doc["invested"] = round(doc["quantity"] * doc["avg_price"], 2)
    doc["current_value"] = round(doc["quantity"] * doc["current_price"], 2)
    doc["pnl"] = round(doc["current_value"] - doc["invested"], 2)
    attach_my_share(doc, doc["current_value"], my_member_id(ws, user["user_id"]))
    if ownership:
        await audit(ws, user, "ownership", "stock", f"Set ownership on {body.symbol}")
    return doc


@api_router.put("/stocks/{stock_id}")
async def update_stock(stock_id: str, body: StockIn, user: CurrentUser):
    st = await db.stocks.find_one({"id": stock_id, "deleted_at": None}, {"_id": 0})
    if not st:
        raise HTTPException(status_code=404, detail="Not found")
    ws = await require_perm(body.workspace_id, user, "edit")
    ownership = validate_ownership(ws, body.ownership)
    await db.stocks.update_one({"id": stock_id}, {"$set": {**body.dict(), "ownership": ownership}})
    doc = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
    doc["invested"] = round(doc["quantity"] * doc["avg_price"], 2)
    doc["current_value"] = round(doc["quantity"] * doc["current_price"], 2)
    doc["pnl"] = round(doc["current_value"] - doc["invested"], 2)
    attach_my_share(doc, doc["current_value"], my_member_id(ws, user["user_id"]))
    return doc


@api_router.delete("/stocks/{stock_id}")
async def delete_stock(stock_id: str, user: CurrentUser):
    s = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    await require_perm(s["workspace_id"], user, "delete")
    await db.stocks.update_one({"id": stock_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}
