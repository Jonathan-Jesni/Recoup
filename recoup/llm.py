"""Fireworks LLM client with disk cache and honest failure accounting.

- OpenAI-compatible client pointed at Fireworks.
- Every response cached to runs/<run_id>/llm_cache/<input-hash>.json so
  re-running a batch is free and demos never depend on the network.
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

    def _cache_path(self, system: str, user: str, attempt: int) -> Path:
        h = hashlib.sha256(f"{self.model}|{system}|{user}|{attempt}".encode()).hexdigest()[:24]
        return self.cache_dir / f"{h}.json"

    def complete_json(self, system: str, user: str, attempt: int = 0) -> str:
        """Return the raw model text (expected to be JSON). Cached by input hash;
        `attempt` is part of the key so validation retries re-prompt fresh."""
        cache = self._cache_path(system, user, attempt)
        if cache.exists():
            return json.loads(cache.read_text(encoding="utf-8"))["text"]

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
        text = resp.choices[0].message.content or ""
        cache.write_text(json.dumps({"model": self.model, "system": system,
                                     "user": user, "attempt": attempt, "text": text},
                                    ensure_ascii=False), encoding="utf-8")
        return text
