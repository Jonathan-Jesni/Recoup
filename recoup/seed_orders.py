"""Make the INPUT real: seed every synthetic checkout as a real Razorpay
test-mode Order, and merge genuinely failed test payments as observed events.

Usage (needs RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env):

  python -m recoup.seed_orders orders     # POST /v1/orders x100, writes razorpay_order_id back
  python -m recoup.seed_orders failures   # GET /v1/payments, merges status=failed as source=observed

Honesty rules baked in:
- Orders are real objects; the failure ANNOTATION on synthetic events stays
  synthetic and is labelled source="synthetic".
- Observed events keep Razorpay's own error_source/error_reason/error_code
  verbatim. If Signal's rules do not recognise a real value the event lands in
  'unclassified' -- extend config/failure_types.json, never massage the data.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
EVENTS = Path(__file__).resolve().parent.parent / "data" / "events.json"


def _client():
    import razorpay
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"],
                                 os.environ["RAZORPAY_KEY_SECRET"]))


def _with_retry(fn, *, max_retries: int = 6, base_delay: float = 2.0):
    """Retry on Razorpay's test-mode rate limit ('Too many requests') with
    exponential backoff. Any other error propagates immediately."""
    import razorpay
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except razorpay.errors.BadRequestError as e:
            if "Too many requests" not in str(e) or attempt == max_retries:
                raise
            wait = base_delay * (2 ** attempt)
            print(f"  rate limited, waiting {wait:.0f}s (attempt {attempt + 1}/{max_retries})...")
            time.sleep(wait)


def seed_orders(path: Path = EVENTS, delay_s: float = 0.6) -> None:
    """delay_s throttles calls to stay under test-mode rate limits; retries
    with backoff on 429s rather than aborting the whole batch."""
    client = _client()
    events = json.loads(path.read_text(encoding="utf-8"))
    created = 0
    for ev in events:
        if ev.get("razorpay_order_id"):
            continue
        order = _with_retry(lambda: client.order.create({
            "amount": ev["amount_paise"],
            "currency": ev["currency"],
            "receipt": ev["checkout_id"],
            "notes": {"recoup": "seeded-checkout", "checkout_id": ev["checkout_id"]},
        }))
        ev["razorpay_order_id"] = order["id"]
        created += 1
        print(f"{ev['checkout_id']} -> {order['id']}")
        path.write_text(json.dumps(events, indent=2), encoding="utf-8")  # save as we go
        time.sleep(delay_s)
    print(f"created {created} real test-mode orders; wrote back to {path}")


def merge_failures(path: Path = EVENTS, count: int = 100) -> None:
    """Pull real failed payments from test mode and append as observed events.
    Razorpay payment entities carry error_code, error_description, error_source,
    error_step, error_reason -- mapped verbatim."""
    client = _client()
    events = json.loads(path.read_text(encoding="utf-8"))
    known = {e.get("razorpay_payment_id") for e in events}
    payments = client.payment.all({"count": count}).get("items", [])
    added = 0
    for p in payments:
        if p.get("status") != "failed" or p["id"] in known:
            continue
        events.append({
            "checkout_id": f"obs_{p['id']}",
            "order_id": p.get("order_id") or f"order_{p['id']}",
            "razorpay_order_id": p.get("order_id"),
            "razorpay_payment_id": p["id"],
            "amount_paise": p["amount"],
            "currency": p.get("currency", "INR"),
            "method": p.get("method", "card"),
            "payment_attempted": True,
            "error_source": p.get("error_source"),
            "error_code": p.get("error_code"),
            "error_reason": p.get("error_reason"),
            "error_description": p.get("error_description"),
            "customer_retry_count": 0,
            "failed_at": datetime.fromtimestamp(p["created_at"], tz=timezone.utc).isoformat(),
            "customer_segment": "new",
            "source": "observed",
        })
        added += 1
        print(f"observed failure {p['id']}: {p.get('error_source')}/{p.get('error_reason')}")
    path.write_text(json.dumps(events, indent=2), encoding="utf-8")
    print(f"merged {added} observed failures -> {path}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"orders": seed_orders, "failures": merge_failures}.get(cmd, lambda: print(__doc__))()
