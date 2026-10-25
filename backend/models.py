from typing import List, Literal, Optional

from pydantic import BaseModel


class SessionIn(BaseModel):
    session_id: str


class AppleAuthIn(BaseModel):
    identity_token: str
    name: Optional[str] = None
    email: Optional[str] = None


class CountryIn(BaseModel):
    country: str
    base_currency: str


class WorkspaceIn(BaseModel):
    name: str
    base_currency: str = "INR"


class MemberIn(BaseModel):
    name: str
    email: Optional[str] = None


class InviteIn(BaseModel):
    email: str


class JoinIn(BaseModel):
    code: str


class PermissionIn(BaseModel):
    permission: Literal["full", "edit", "view"]


class AccountIn(BaseModel):
    workspace_id: str
    name: str
    type: Literal["bank", "cash", "credit_card", "loan", "overdraft"]
    currency: str = "INR"
    opening_balance: float = 0.0
    # credit card
    credit_limit: Optional[float] = None
    statement_day: Optional[int] = None
    due_day: Optional[int] = None
    # loan
    lender_name: Optional[str] = None
    interest_rate: Optional[float] = None   # % per annum
    tenure_months: Optional[int] = None
    emi_amount: Optional[float] = None
    # overdraft
    overdraft_limit: Optional[float] = None


class CategoryIn(BaseModel):
    workspace_id: str
    name: str
    kind: Literal["expense", "income"] = "expense"
    parent_id: Optional[str] = None
    icon: str = "Tag"
    color: str = "#E55934"


class SplitIn(BaseModel):
    member_id: str
    share_amount: float


class TransactionIn(BaseModel):
    workspace_id: str
    type: Literal["expense", "income", "transfer"]
    account_id: str
    to_account_id: Optional[str] = None
    category_id: Optional[str] = None
    amount: float
    currency: str = "INR"
    date: str
    note: Optional[str] = ""
    payer_member_id: Optional[str] = None
    splits: List[SplitIn] = []
    is_refund: bool = False


class BudgetIn(BaseModel):
    workspace_id: str
    category_id: str
    amount: float


class RecurringIn(BaseModel):
    workspace_id: str
    type: Literal["expense", "income"]
    account_id: str
    category_id: Optional[str] = None
    amount: float
    currency: str = "INR"
    note: Optional[str] = ""
    frequency: Literal["daily", "weekly", "monthly"]
    next_date: str


class OwnershipIn(BaseModel):
    member_id: str
    percent: float


class FDIn(BaseModel):
    workspace_id: str
    name: str
    principal: float
    rate: float
    currency: str = "INR"
    start_date: str
    maturity_date: str
    ownership: List[OwnershipIn] = []


class StockIn(BaseModel):
    workspace_id: str
    symbol: str
    name: str
    quantity: float
    avg_price: float
    current_price: float
    currency: str = "INR"
    ownership: List[OwnershipIn] = []


class CardPaymentIn(BaseModel):
    workspace_id: str
    account_id: str
    amount: float
    date: str
    from_account_id: Optional[str] = None


class CsvImportIn(BaseModel):
    workspace_id: str
    account_id: str
    rows: List[dict]


class BillScanIn(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
