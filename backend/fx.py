import logging

import httpx

from utils import now_utc

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# FX (static, INR base) — planner-grade, best-effort
# --------------------------------------------------------------------------
FX_RATES = {  # fallback: value of 1 unit in INR
    "INR": 1.0, "USD": 83.0, "EUR": 90.0, "GBP": 105.0, "AED": 22.6,
    "SGD": 61.5, "AUD": 54.0, "CAD": 60.5, "JPY": 0.56, "CHF": 94.0,
}
CURRENCIES = list(FX_RATES.keys())
LIVE_RATES = dict(FX_RATES)  # mutated by refresh_rates(); always has safe fallback
RATES_META = {"source": "fallback", "updated_at": None}


async def refresh_rates():
    """Best-effort live rates (INR base) from exchangerate.host; keep fallback on failure."""
    try:
        async with httpx.AsyncClient(timeout=8) as cx:
            r = await cx.get("https://open.er-api.com/v6/latest/INR")
        data = r.json()
        rates = data.get("rates") or {}
        updated = {"INR": 1.0}
        for cur in CURRENCIES:
            if cur == "INR":
                continue
            per_inr = rates.get(cur)
            if per_inr and per_inr > 0:
                updated[cur] = round(1.0 / per_inr, 6)  # INR value of 1 unit of `cur`
        if len(updated) >= 3:
            for k, v in updated.items():
                LIVE_RATES[k] = v
            RATES_META["source"] = "live"
            RATES_META["updated_at"] = now_utc().isoformat()
            logger.info("FX rates refreshed (live)")
    except Exception as e:
        logger.info(f"FX refresh failed, using fallback: {e}")


def convert(amount: float, frm: str, to: str) -> float:
    if frm == to:
        return round(amount, 2)
    inr = amount * LIVE_RATES.get(frm, FX_RATES.get(frm, 1.0))
    return round(inr / LIVE_RATES.get(to, FX_RATES.get(to, 1.0)), 2)
