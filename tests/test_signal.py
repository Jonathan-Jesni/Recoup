from recoup.generator import generate
from recoup.schemas import CheckoutEvent
from recoup.signal import classify


def ev(**kw) -> CheckoutEvent:
    base = dict(checkout_id="c1", order_id="o1", amount_paise=10000,
                method="card", payment_attempted=True,
                failed_at="2026-08-30T09:00:00+00:00")
    base.update(kw)
    return CheckoutEvent(**base)


def test_silent_abandonment_wins_even_with_no_error():
    assert classify(ev(payment_attempted=False)) == "silent_abandonment"


def test_issuer_insufficient_funds_before_generic_decline():
    assert classify(ev(error_source="issuer", error_reason="insufficient_funds")) == "insufficient_funds"
    assert classify(ev(error_source="issuer", error_reason="wallet_insufficient_balance")) == "insufficient_funds"
    assert classify(ev(error_source="issuer", error_reason="card_declined")) == "card_declined"


def test_customer_auth_failures():
    assert classify(ev(error_source="customer", error_reason="authentication_timeout")) == "auth_timeout"
    assert classify(ev(error_source="customer", error_reason="otp_expired")) == "auth_timeout"


def test_gateway_and_network_drop():
    assert classify(ev(error_source="gateway", error_reason="gateway_technical_error")) == "gateway_drop"
    assert classify(ev(error_source="network", error_reason="network_error")) == "gateway_drop"


def test_unknown_is_unclassified_never_guessed():
    assert classify(ev(error_source="unknown", error_reason="unknown_error")) == "unclassified"


def test_whole_batch_classifies_without_error():
    counts: dict[str, int] = {}
    for e in generate(100):
        t = classify(e)
        counts[t] = counts.get(t, 0) + 1
    assert counts.get("unclassified", 0) > 0          # junk lands honestly
    assert counts["silent_abandonment"] > counts["gateway_drop"]  # skew holds
