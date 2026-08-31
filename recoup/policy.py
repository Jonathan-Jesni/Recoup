"""Policy gate: the stopping rules, as pure functions.

This is the scored line. Every rule here is data (config/policy.json)
applied by code — never enforced in a prompt. Sits between Diagnosis and
Executor; nothing reaches Razorpay without passing this gate.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

_CONFIG = Path(__file__).resolve().parent.parent / "config" / "policy.json"
_ACTIONS = Path(__file__).resolve().parent.parent / "config" / "actions.json"


def load_policy(path: Path = _CONFIG) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_action_ids(path: Path = _ACTIONS) -> set[str]:
    with open(path, encoding="utf-8") as f:
        return {a["id"] for a in json.load(f)["actions"]}


@dataclass(frozen=True)
class GateResult:
    allowed: bool
    reason: str  # "ok" | below_minimum | escalate_and_stop | cooldown_active | invalid_action


def evaluate(
    *,
    amount_paise: int,
    action_id: str,
    attempts_so_far: int,
    last_attempt_at: Optional[datetime],
    now: datetime,
    policy: dict | None = None,
    valid_actions: set[str] | None = None,
) -> GateResult:
    """Order matters and is deliberate:
    invalid action first (never trust the LLM), then the money floor,
    then attempt exhaustion, then cooldown."""
    p = policy or load_policy()
    actions = valid_actions or load_action_ids()

    if action_id not in actions:
        return GateResult(False, "invalid_action")
    if amount_paise < p["min_amount_paise"]:
        return GateResult(False, "below_minimum")
    # escalate_human is terminal bookkeeping, not a recovery attempt — it is
    # allowed even at the attempt cap (it IS the stop).
    if action_id == "escalate_human":
        return GateResult(True, "ok")
    if attempts_so_far >= p["max_attempts_per_checkout"]:
        return GateResult(False, "escalate_and_stop")
    if last_attempt_at is not None:
        cooldown = timedelta(minutes=p["cooldown_minutes"])
        if now - last_attempt_at < cooldown:
            return GateResult(False, "cooldown_active")
    return GateResult(True, "ok")
