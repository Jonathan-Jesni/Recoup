"""Fireworks LLM client with disk cache, token accounting, and honest failure.

- OpenAI-compatible client pointed at Fireworks.
- Every response (and its token usage) cached to runs/<run_id>/llm_cache/
  <input-hash>.json, so re-running a batch is free, offline, and reports the
  SAME inference cost as the original run.
- No API key -> raises LLMUnavailable; Diagnosis catches it and takes the
  deterministic fallback path, recorded as llm_fallback in the ledger.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1"


class LLMUnavailable(Exception):
    pass


class LLMClient:
    def __init__(self, cache_dir: str | Path, model: str | None = None):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.model = model or os.environ.get(
            "FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p3-70b-instruct")
        self._client = None
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.calls = 0
        self.cache_hits = 0

    # -- cost model: assumptions, env-overridable, reported as assumptions ----
    @property
    def usd_per_m_tokens(self) -> float:
        return float(os.environ.get("FIREWORKS_USD_PER_M_TOKENS", "0.90"))

    @property
    def usd_inr(self) -> float:
        return float(os.environ.get("USD_INR", "88"))

    def cost_inr(self) -> float:
        total = self.prompt_tokens + self.completion_tokens
        return round(total / 1_000_000 * self.usd_per_m_tokens * self.usd_inr, 4)

    def usage(self) -> dict:
        return {
            "model": self.model,
            "calls": self.calls,
            "cache_hits": self.cache_hits,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "cost_inr": self.cost_inr(),
            "assumed_usd_per_m_tokens": self.usd_per_m_tokens,
            "assumed_usd_inr": self.usd_inr,
        }

    # -- calls ---------------------------------------------------------------
    def _cache_path(self, system: str, user: str, attempt: int) -> Path:
        h = hashlib.sha256(f"{self.model}|{system}|{user}|{attempt}".encode()).hexdigest()[:24]
        return self.cache_dir / f"{h}.json"

    def _account(self, usage: dict) -> None:
        self.prompt_tokens += int(usage.get("prompt_tokens", 0))
        self.completion_tokens += int(usage.get("completion_tokens", 0))

    def complete_json(self, system: str, user: str, attempt: int = 0) -> str:
        """Return raw model text (expected JSON). Cached by input hash;
        `attempt` is part of the key so validation retries re-prompt fresh."""
        cache = self._cache_path(system, user, attempt)
        if cache.exists():
            entry = json.loads(cache.read_text(encoding="utf-8"))
            self.cache_hits += 1
            self._account(entry.get("usage", {}))
            return entry["text"]

        key = os.environ.get("FIREWORKS_API_KEY")
        if not key:
            raise LLMUnavailable("FIREWORKS_API_KEY not set")
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(base_url=FIREWORKS_BASE_URL, api_key=key)
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                temperature=0.2,
                max_tokens=600,
                response_format={"type": "json_object"},
            )
        except Exception as e:  # network/auth/model errors all become fallback
            raise LLMUnavailable(str(e)) from e
        self.calls += 1
        text = resp.choices[0].message.content or ""
        usage = {"prompt_tokens": getattr(resp.usage, "prompt_tokens", 0) or 0,
                 "completion_tokens": getattr(resp.usage, "completion_tokens", 0) or 0}
        self._account(usage)
        cache.write_text(json.dumps({"model": self.model, "system": system,
                                     "user": user, "attempt": attempt,
                                     "text": text, "usage": usage},
                                    ensure_ascii=False), encoding="utf-8")
        return text
