"""Signal agent: deterministic classification of checkout failures.

Deliberately not an LLM. Error-code -> failure-type is a lookup problem;
rules live in config/failure_types.json. First matching rule wins; anything
unmatched is 'unclassified' and goes to the exception list, never guessed.
"""
from __future__ import annotations

import json
from pathlib import Path

from recoup.schemas import CheckoutEvent

_CONFIG = Path(__file__).resolve().parent.parent / "config" / "failure_types.json"


def load_rules(path: Path = _CONFIG) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def classify(event: CheckoutEvent, rules: dict | None = None) -> str:
    cfg = rules or load_rules()
    fields = event.model_dump()
    for rule in cfg["rules"]:
        if all(fields.get(k) == v for k, v in rule["match"].items()):
            return rule["type"]
    return cfg["unmatched"]
