"""FinPlanner API — app entrypoint.

Endpoints live in routes/ (registered on the shared api_router in router.py).
`db`, `new_id` and `now_utc` are re-exported for tests and seed scripts.
"""
import asyncio
import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import client, db  # noqa: F401
from utils import new_id, now_utc  # noqa: F401
from fx import refresh_rates
from router import api_router
import routes  # noqa: F401  side-effect import: registers all endpoints

app = FastAPI()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("apple_sub", unique=True, sparse=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.workspaces.create_index("members.user_id")
    await db.transactions.create_index([("workspace_id", 1), ("date", -1)])
    logger.info("Indexes ready")
    asyncio.create_task(refresh_rates())


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
