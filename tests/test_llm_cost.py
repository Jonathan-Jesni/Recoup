"""The cost model must be right for someone who clones and runs with no .env.

The headline number inference_cost_per_100_inr_recovered is computed from these
rates. A fresh clone has no environment, so the defaults ARE the published
figure for anyone reproducing the run — they must match the default model.
"""
import os
from unittest import mock

from recoup.llm import LLMClient

# glm-5p2 serverless, per 1M tokens, from the Fireworks pricing table.
GLM_5P2_INPUT = 1.40
GLM_5P2_OUTPUT = 4.40


def _clean_client(tmp_path):
    keys = ["FIREWORKS_USD_PER_M_INPUT", "FIREWORKS_USD_PER_M_OUTPUT",
            "USD_INR", "FIREWORKS_MODEL"]
    env = {k: v for k, v in os.environ.items() if k not in keys}
    with mock.patch.dict(os.environ, env, clear=True):
        return LLMClient(tmp_path), LLMClient(tmp_path).model


def test_default_rates_match_default_model(tmp_path):
    client, model = _clean_client(tmp_path)
    assert "glm-5p2" in model, "default model changed — update the rates below too"
    assert client.usd_per_m_input == GLM_5P2_INPUT
    assert client.usd_per_m_output == GLM_5P2_OUTPUT


def test_cost_reproduces_the_committed_batch(tmp_path):
    """The exact token counts from runs/agent-final must yield the published
    Rs 32.7188 with no environment set."""
    client, _ = _clean_client(tmp_path)
    client.prompt_tokens = 91190
    client.completion_tokens = 55486
    assert client.cost_inr() == 32.7188


def test_env_still_overrides(tmp_path):
    with mock.patch.dict(os.environ, {"FIREWORKS_USD_PER_M_INPUT": "9.99"}):
        assert LLMClient(tmp_path).usd_per_m_input == 9.99
