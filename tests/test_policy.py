from datetime import datetime, timedelta, timezone

from recoup.policy import evaluate

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)


def gate(**kw):
    base = dict(amount_paise=10000, action_id="retry_same_cooldown",
                attempts_so_far=0, last_attempt_at=None, now=NOW)
    base.update(kw)
    return evaluate(**base)


def test_below_minimum_blocked_always():
    r = gate(amount_paise=4999)
    assert not r.allowed and r.reason == "below_minimum"
    assert gate(amount_paise=5000).allowed  # boundary: exactly ₹50 allowed


def test_max_two_attempts_then_stop():
    assert gate(attempts_so_far=1).allowed
    r = gate(attempts_so_far=2)
    assert not r.allowed and r.reason == "escalate_and_stop"


def test_cooldown_thirty_minutes():
    r = gate(last_attempt_at=NOW - timedelta(minutes=29))
    assert not r.allowed and r.reason == "cooldown_active"
    assert gate(last_attempt_at=NOW - timedelta(minutes=30)).allowed


def test_invalid_action_rejected_before_anything_else():
    r = gate(action_id="refund_everything", amount_paise=1)
    assert not r.allowed and r.reason == "invalid_action"


def test_escalation_allowed_even_after_attempts_exhausted():
    r = gate(action_id="escalate_human", attempts_so_far=2)
    assert r.allowed


def test_escalation_still_blocked_below_minimum():
    r = gate(action_id="escalate_human", amount_paise=100)
    assert not r.allowed and r.reason == "below_minimum"
