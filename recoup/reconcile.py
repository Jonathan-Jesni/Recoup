"""Poll a real payment link until paid; record the observed recovery.

This is the showpiece: one link created by the agent, paid by the builder
with a Razorpay test card, observed transitioning to 'paid' via
GET /v1/payment_links/{id}. No webhooks. Result rows carry observed:true —
the only non-simulated recovery in the ledger, and labelled as such.
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv

load_dotenv()


def _client():
    for k in ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"):
        if not os.environ.get(k):
            raise SystemExit(f"{k} not set — put it in .env")
    import razorpay
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"],
                                 os.environ["RAZORPAY_KEY_SECRET"]))


def poll_until_paid(plink_id: str, timeout_s: int = 600, interval_s: int = 5) -> dict:
    """Poll GET /v1/payment_links/{id} until it reports paid. Prints each
    status transition so the demo shows created -> paid happening live."""
    client = _client()
    deadline = time.time() + timeout_s
    last = None
    net_errors = 0
    while time.time() < deadline:
        stamp = time.strftime("%H:%M:%S")
        try:
            link = client.payment_link.fetch(plink_id)
        except Exception as e:  # noqa: BLE001 - DNS/network blips must not end the poll
            net_errors += 1
            print(f"  [{stamp}] network error ({type(e).__name__}), retrying "
                  f"-- {net_errors} so far")
            time.sleep(interval_s)
            continue
        status = link["status"]
        if status != last:
            print(f"  [{stamp}] {plink_id}: {status}"
                  f"{'  <-- OBSERVED RECOVERY' if status == 'paid' else ''}")
            last = status
        else:
            print(f"  [{stamp}] {plink_id}: {status}")
        if status == "paid":
            return {
                "observed": True,
                "status": "paid",
                "plink_id": plink_id,
                "amount_paise": link.get("amount"),
                "amount_paid_paise": link.get("amount_paid"),
                "paid_at": link.get("updated_at"),
                "reference_id": link.get("reference_id"),
                "notes": link.get("notes"),
                "response": link,
            }
        time.sleep(interval_s)
    return {"observed": False, "status": "timeout", "plink_id": plink_id,
            "response": None}
