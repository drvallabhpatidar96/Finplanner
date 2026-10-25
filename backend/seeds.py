from db import db
from utils import new_id, now_utc

DEFAULT_CATEGORIES = [
    ("Food & Dining", "expense", "ForkKnife", "#E55934"),
    ("Groceries", "expense", "ShoppingCart", "#66BB6A"),
    ("Transport", "expense", "Car", "#FFA726"),
    ("Shopping", "expense", "Bag", "#D87D4A"),
    ("Bills & Utilities", "expense", "Lightning", "#8D6E63"),
    ("Rent", "expense", "House", "#E57373"),
    ("Health", "expense", "Heartbeat", "#66BB6A"),
    ("Entertainment", "expense", "FilmSlate", "#D35400"),
    ("Salary", "income", "Money", "#66BB6A"),
    ("Other Income", "income", "Coins", "#8D6E63"),
]


async def seed_categories(workspace_id: str):
    docs = []
    for name, kind, icon, color in DEFAULT_CATEGORIES:
        docs.append({
            "id": new_id("cat"), "workspace_id": workspace_id, "name": name,
            "kind": kind, "parent_id": None, "icon": icon, "color": color,
            "created_at": now_utc().isoformat(), "deleted_at": None,
        })
    if docs:
        await db.categories.insert_many(docs)
