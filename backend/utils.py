import uuid
from datetime import datetime, timezone


def now_utc():
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def month_bounds():
    today = now_utc().date()
    return today.replace(day=1).isoformat(), today.isoformat()
