"""Outcome simulation under the stated model in config/recovery_model.json.

Key property: the RNG is seeded per (checkout_id, attempt_no), NOT from a
global sequence. Agent and baseline policies therefore see identical "luck"
on every checkout — the comparison is paired, and the delta between the two
policies is attributable to decisions, not noise.
"""
from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

_CONFIG = Path(__file__).resolve().parent.parent / "config" / "recovery_model.json"


def load_model(path: Path = _CONFIG) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _draw(seed: int, checkout_id: str, attempt_no: int) -> float:
    key = f"{seed}:{checkout_id}:{attempt_no}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(key).digest()[:8], "big")).random()


def simulate(
    *, checkout_id: str, failure_type: str, action_id: str, attempt_no: int,
    model: dict | None = None,
) -> dict:
    """Return {recovered: bool, p: float, draw: float}. Deterministic for a
    given (seed, checkout_id, attempt_no)."""
    m = model or load_model()
    p = m["conversion"].get(failure_type, {}).get(action_id, 0.0)
    if attempt_no >= 2:
        p *= m["second_attempt_decay"]
    draw = _draw(m["seed"], checkout_id, attempt_no)
    return {"recovered": draw < p, "p": round(p, 4), "draw": round(draw, 6),
            "simulated": True}
