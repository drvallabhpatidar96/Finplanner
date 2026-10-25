import logging
import os
import uuid

from fastapi import HTTPException

from db import db
from fx import CURRENCIES, LIVE_RATES, RATES_META
from models import BillScanIn
from router import api_router
from security import CurrentUser, require_workspace
from utils import now_utc

logger = logging.getLogger(__name__)


@api_router.get("/meta/currencies")
async def currencies():
    return {"currencies": CURRENCIES, "rates": LIVE_RATES, "source": RATES_META["source"], "updated_at": RATES_META["updated_at"]}


@api_router.get("/audit-log")
async def audit_log(workspace_id: str, user: CurrentUser):
    await require_workspace(workspace_id, user)
    return await db.audit_logs.find({"workspace_id": workspace_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.post("/bill-scan")
async def bill_scan(body: BillScanIn, user: CurrentUser):
    if not user.get("premium"):
        raise HTTPException(status_code=403, detail="Bill Scan is a Premium feature")
    import json
    import base64
    import tempfile
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType

    system = (
        "You are a receipt and bill extraction engine. Extract structured data from the "
        "bill/invoice image or PDF. Respond ONLY with minified JSON, no prose, no code fences. "
        "Schema: {\"merchant\": string, \"date\": \"YYYY-MM-DD\", \"currency\": string (ISO code, "
        "guess from symbols, default INR), \"total\": number, \"tax\": number, "
        "\"items\": [{\"name\": string, \"amount\": number}]}. "
        "Use 0 for unknown numbers and \"\" for unknown strings. Do not invent line items."
    )
    chat = LlmChat(
        api_key=os.environ.get("EMERGENT_LLM_KEY", ""),
        session_id=f"billscan_{user['user_id']}_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")

    tmp_path = None
    try:
        raw = body.image_base64
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        if body.mime_type == "application/pdf":
            data = base64.b64decode(raw)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as f:
                f.write(data)
                tmp_path = f.name
            file_content = FileContentWithMimeType(file_path=tmp_path, mime_type="application/pdf")
            msg = UserMessage(text="Extract the bill data as JSON.", file_contents=[file_content])
        else:
            img = ImageContent(image_base64=raw)
            msg = UserMessage(text="Extract the bill data as JSON.", file_contents=[img])

        text = await chat.send_message(msg)
    except Exception as e:
        logger.exception("bill scan failed")
        raise HTTPException(status_code=502, detail=f"Could not read the bill: {e}")
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)  # never persist the image/pdf
            except Exception:
                pass

    cleaned = str(text).strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        start = cleaned.index("{")
        end = cleaned.rindex("}") + 1
        parsed = json.loads(cleaned[start:end])
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse the bill. Try a clearer photo.")

    parsed.setdefault("merchant", "")
    parsed.setdefault("date", now_utc().date().isoformat())
    parsed.setdefault("currency", "INR")
    parsed.setdefault("total", 0)
    parsed.setdefault("tax", 0)
    parsed.setdefault("items", [])
    return parsed


@api_router.get("/export")
async def export_data(workspace_id: str, user: CurrentUser):
    ws = await require_workspace(workspace_id, user)
    return {
        "workspace": ws,
        "accounts": await db.accounts.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(1000),
        "categories": await db.categories.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(1000),
        "transactions": await db.transactions.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(100000),
        "budgets": await db.budgets.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(1000),
        "fixed_deposits": await db.fixed_deposits.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(1000),
        "stocks": await db.stocks.find({"workspace_id": workspace_id, "deleted_at": None}, {"_id": 0}).to_list(1000),
        "exported_at": now_utc().isoformat(),
    }
