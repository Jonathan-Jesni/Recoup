"""Executor agent: fires the chosen action against Razorpay test mode.

Actions 1-4 create a real Payment Link (POST /v1/payment_links) with
action-specific framing; escalate_human writes a record and calls nothing.
Full request and response are returned verbatim for the ledger.

--dry-run fabricates a response shaped like the real one, flagged
dry_run:true, so the pipeline runs offline and demos never need network.
"""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv

from recoup.schemas import CheckoutEvent, Diagnosis

load_dotenv()

NUDGE_HINGLISH = ("Aapka order abhi bhi reserved hai! Payment complete karne ke liye "
                  "yeh link use karein - bas 2 minute lagenge.")

DESCRIPTIONS = {
    "retry_alternate_instrument": "Complete your payment - try UPI or another method",
    "retry_same_cooldown": "Complete your payment - your order is still reserved",
    "recovery_nudge": NUDGE_HINGLISH,
    "offer_emi": "Complete your purchase with easy EMI options",
}


class ExecutionError(Exception):
    pass


def build_request(event: CheckoutEvent, diagnosis: Diagnosis) -> dict:
    """The exact payload sent to Razorpay's Payment Links API."""
    return {
        "amount": event.amount_paise,
        "currency": event.currency,
        "description": DESCRIPTIONS[diagnosis.action_id],
        "reference_id": f"{event.checkout_id}-{int(time.time())}",
        "notes": {
            "recoup_checkout_id": event.checkout_id,
            "recoup_action": diagnosis.action_id,
            "recoup_root_cause": diagnosis.root_cause[:250],
        },
    }


def execute(
    event: CheckoutEvent, diagnosis: Diagnosis, *, dry_run: bool = True,
    force_fail: bool = False,
) -> dict:
    """Returns {status, request, response, dry_run}. Raises ExecutionError on
    API failure (after logging material is captured by the caller)."""
    if diagnosis.action_id == "escalate_human":
        return {"status": "escalated", "request": None, "dry_run": dry_run,
                "response": {"escalation_reason": diagnosis.justification}}

    request = build_request(event, diagnosis)
    if force_fail:
        # Deliberately malformed: negative amount, guaranteed 400.
        request = {**request, "amount": -1}

    if dry_run:
        if force_fail:
            raise ExecutionError("BAD_REQUEST_ERROR: amount must be at least 100 (dry-run replay)")
        return {"status": "link_created", "request": request, "dry_run": True,
                "response": {"id": f"plink_dry_{event.checkout_id}",
                             "short_url": f"https://rzp.io/l/dry-{event.checkout_id}",
                             "status": "created", "amount": request["amount"]}}

    import razorpay
    client = razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"],
                                   os.environ["RAZORPAY_KEY_SECRET"]))
    try:
        response = client.payment_link.create(request)
    except Exception as e:
        raise ExecutionError(str(e)) from e
    return {"status": "link_created", "request": request, "response": response,
            "dry_run": False}
