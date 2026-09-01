"""Pydantic schemas shared across the pipeline."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

FailureType = Literal[
    "card_declined",
    "auth_timeout",
    "insufficient_funds",
    "gateway_drop",
    "silent_abandonment",
    "unclassified",
]

ActionId = Literal[
    "retry_alternate_instrument",
    "retry_same_cooldown",
    "recovery_nudge",
    "offer_emi",
    "escalate_human",
]


class CheckoutEvent(BaseModel):
    """One synthetic failed/abandoned checkout, roughly shaped like a
    Razorpay payment entity plus checkout context."""

    checkout_id: str
    order_id: str
    amount_paise: int
    currency: str = "INR"
    method: Literal["card", "upi", "netbanking", "wallet", "emi"]
    payment_attempted: bool
    error_source: Optional[str] = None   # issuer | customer | gateway | network | None
    error_code: Optional[str] = None
    error_reason: Optional[str] = None
    error_description: Optional[str] = None
    customer_retry_count: int = 0        # retries the customer made on their own
    failed_at: str                       # ISO timestamp
    customer_segment: Literal["new", "returning"] = "new"
    source: Literal["synthetic", "observed"] = "synthetic"  # observed = real Razorpay payment.failed
    razorpay_order_id: Optional[str] = None                # real test-mode order id once seeded
    razorpay_payment_id: Optional[str] = None              # only on observed events


class Diagnosis(BaseModel):
    """Strict output contract for the Diagnosis LLM."""

    root_cause: str = Field(min_length=5, max_length=300)
    action_id: ActionId
    justification: str = Field(min_length=10, max_length=500)
    confidence: float = Field(ge=0.0, le=1.0)
