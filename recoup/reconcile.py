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


def poll_until_paid(plink_id: str, timeout_s: int = 600, interval_s: int = 5) -> dict:
    import razorpay
    client = razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"],
                                   os.environ["RAZORPAY_KEY_SECRET"]))
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        link = client.payment_link.fetch(plink_id)
        print(f"  {plink_id}: {link['status']}")
        if link["status"] == "paid":
            return {"observed": True, "status": "paid", "response": link}
        time.sleep(interval_s)
    return {"observed": False, "status": "timeout", "response": None}
