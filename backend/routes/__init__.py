"""Route modules — importing this package registers every endpoint on api_router."""
from . import (  # noqa: F401
    accounts,
    auth,
    budgets,
    cards,
    categories,
    dashboard,
    extras,
    investments,
    recurring,
    transactions,
    workspaces,
)
