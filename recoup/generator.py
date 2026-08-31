"""Generate the synthetic 100-checkout batch, seeded and skewed.

Distribution is deliberately NOT uniform: card declines and silent
abandonment dominate, matching how checkout failures actually skew.
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone

from recoup.schemas import CheckoutEvent

SEED = 20260831

# (weight, template) — first match on realism, not neatness.
PROFILES = [
    # ~32% silent abandonment: checkout opened, no attempt
    (32, dict(payment_attempted=False, error_source=None, error_code=None,
              error_reason=None, error_description=None)),
    # ~28% card declined by issuer
    (28, dict(payment_attempted=True, method="card", error_source="issuer",
              error_code="BAD_REQUEST_ERROR", error_reason="card_declined",
              error_description="Card declined by issuing bank")),
    # ~14% OTP / 3DS timeout or cancel
    (9, dict(payment_attempted=True, error_source="customer",
             error_code="BAD_REQUEST_ERROR", error_reason="authentication_timeout",
             error_description="Customer did not complete 3DS authentication")),
    (5, dict(payment_attempted=True, error_source="customer",
             error_code="BAD_REQUEST_ERROR", error_reason="otp_expired",
             error_description="OTP expired before submission")),
    # ~12% insufficient funds / wallet balance
    (8, dict(payment_attempted=True, method="card", error_source="issuer",
             error_code="BAD_REQUEST_ERROR", error_reason="insufficient_funds",
             error_description="Insufficient funds in account")),
    (4, dict(payment_attempted=True, method="wallet", error_source="issuer",
             error_code="BAD_REQUEST_ERROR", error_reason="wallet_insufficient_balance",
             error_description="Wallet balance too low")),
    # ~11% gateway / network drop
    (7, dict(payment_attempted=True, error_source="gateway",
             error_code="GATEWAY_ERROR", error_reason="gateway_technical_error",
             error_description="Gateway did not respond")),
    (4, dict(payment_attempted=True, error_source="network",
             error_code="SERVER_ERROR", error_reason="network_error",
             error_description="Connection dropped mid-transaction")),
    # ~3% junk that must land in the exception list, honestly
    (3, dict(payment_attempted=True, error_source="unknown",
             error_code="SERVER_ERROR", error_reason="unknown_error",
             error_description="Unrecognised failure")),
]

METHODS = ["card", "upi", "netbanking", "wallet", "emi"]
METHOD_WEIGHTS = [30, 45, 10, 10, 5]  # UPI-heavy, like Indian checkout traffic

# Amounts in paise: mostly small tickets, a fat tail of big ones.
AMOUNT_BUCKETS = [
    (35, (9900, 79900)),        # ₹99–₹799
    (30, (80000, 299900)),      # ₹800–₹2,999
    (20, (300000, 999900)),     # ₹3,000–₹9,999
    (10, (1000000, 4999900)),   # ₹10,000–₹49,999
    (5,  (2000, 4900)),         # under ₹50 — must be blocked by policy gate
]


def generate(n: int = 100, seed: int = SEED) -> list[CheckoutEvent]:
    rng = random.Random(seed)
    base = datetime(2026, 8, 30, 9, 0, tzinfo=timezone.utc)
    weights = [w for w, _ in PROFILES]
    templates = [t for _, t in PROFILES]
    events = []
    for i in range(n):
        t = dict(rng.choices(templates, weights=weights, k=1)[0])
        bucket = rng.choices([b for _, b in AMOUNT_BUCKETS],
                             weights=[w for w, _ in AMOUNT_BUCKETS], k=1)[0]
        method = t.pop("method", None) or rng.choices(METHODS, METHOD_WEIGHTS, k=1)[0]
        events.append(CheckoutEvent(
            checkout_id=f"chk_{seed % 10000}{i:04d}",
            order_id=f"order_recoup_{i:04d}",
            amount_paise=rng.randrange(bucket[0], bucket[1], 100),
            method=method,
            customer_retry_count=rng.choices([0, 1, 2], [70, 22, 8], k=1)[0],
            failed_at=(base + timedelta(minutes=rng.randrange(0, 60 * 20))).isoformat(),
            customer_segment=rng.choices(["new", "returning"], [55, 45], k=1)[0],
            **t,
        ))
    return events


def main(out: str = "data/events.json", n: int = 100) -> None:
    events = generate(n)
    with open(out, "w", encoding="utf-8") as f:
        json.dump([e.model_dump() for e in events], f, indent=2)
    print(f"wrote {len(events)} events -> {out}")


if __name__ == "__main__":
    main()
