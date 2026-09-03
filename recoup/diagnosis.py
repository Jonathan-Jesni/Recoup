"""Diagnosis agent: the LLM, and the only LLM in the pipeline.

Contract: strict JSON matching schemas.Diagnosis. Validation happens in
code; the action menu is enforced by the type system and re-checked by the
policy gate. Malformed output -> up to 2 fresh retries -> deterministic
fallback action for the failure type, recorded as llm_fallback.
"""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from recoup.llm import LLMClient, LLMUnavailable
from recoup.schemas import CheckoutEvent, Diagnosis

_ACTIONS = Path(__file__).resolve().parent.parent / "config" / "actions.json"

SYSTEM = """You are the Diagnosis agent in a payment-recovery pipeline for an Indian merchant on Razorpay.
Given one failed or abandoned checkout, decide the root cause and pick EXACTLY ONE recovery action from this menu (respond with the id):

- retry_alternate_instrument: payment link steering to a different method (e.g. card failed -> UPI)
- retry_same_cooldown: same method again after a 30-minute cooldown
- recovery_nudge: payment link with a short friendly Hinglish nudge (best for abandonment)
- offer_emi: EMI/instalment-framed link (best for high-value declines or insufficient funds)
- escalate_human: hand to a human with a reason (use when automation is unlikely to help)

Rules you must respect (they are also enforced in code):
- Max 2 recovery attempts per checkout ever. If retry history suggests attempts are exhausted, escalate.
- Consider amount: EMI only makes sense above roughly Rs 3000 (300000 paise).
- A customer who already retried multiple times on the same method should not be asked to retry it again.

previous_attempts lists recovery actions THIS pipeline already fired on this
checkout and their outcome. They did not recover it. Weigh that: repeating an
action that just failed is usually wrong, but not always — if it genuinely
remains the best option for this root cause, keep it and say why in the
justification. Do not switch action merely for novelty.

root_cause must ADD information, not repeat the input. failure_type is already
given to you and was decided deterministically by rule; echoing it back is
useless. Name the likely underlying mechanism instead — what you believe went
wrong on the issuer, customer or gateway side, and why this checkout's specifics
point there. Keep it under 20 words.

Respond with ONLY a JSON object: {"root_cause": str, "action_id": str, "justification": str, "confidence": float 0..1}"""


def _fallbacks() -> dict[str, str]:
    with open(_ACTIONS, encoding="utf-8") as f:
        return json.load(f)["fallback_by_failure_type"]


def _user_prompt(event: CheckoutEvent, failure_type: str, attempts_so_far: int,
                 previous_attempts: list[dict] | None = None) -> str:
    return json.dumps({
        "failure_type": failure_type,
        "amount_paise": event.amount_paise,
        "amount_inr": round(event.amount_paise / 100, 2),
        "method": event.method,
        "payment_attempted": event.payment_attempted,
        "error_reason": event.error_reason,
        "error_description": event.error_description,
        "customer_retry_count": event.customer_retry_count,
        "customer_segment": event.customer_segment,
        "failed_at": event.failed_at,
        "recovery_attempts_so_far": attempts_so_far,
        "previous_attempts": previous_attempts or [],
    })


def diagnose(
    event: CheckoutEvent, failure_type: str, attempts_so_far: int, llm: LLMClient,
    max_retries: int = 2, previous_attempts: list[dict] | None = None,
) -> tuple[Diagnosis, bool]:
    """Returns (diagnosis, used_fallback).

    previous_attempts carries what this pipeline already tried on this checkout
    and how it turned out, so a second diagnosis is informed rather than a
    re-derivation from identical inputs."""
    user = _user_prompt(event, failure_type, attempts_so_far, previous_attempts)
    for attempt in range(max_retries + 1):
        try:
            raw = llm.complete_json(SYSTEM, user, attempt=attempt)
            return Diagnosis.model_validate_json(raw), False
        except (LLMUnavailable, ValidationError, json.JSONDecodeError):
            continue
    action = _fallbacks().get(failure_type, "escalate_human")
    return Diagnosis(
        root_cause=f"LLM unavailable or invalid after {max_retries + 1} tries; "
                   f"deterministic fallback for {failure_type}",
        action_id=action,  # type: ignore[arg-type]
        justification=f"Fallback policy: {failure_type} -> {action} per config/actions.json",
        confidence=0.0,
    ), True
