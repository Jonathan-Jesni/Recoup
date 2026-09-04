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


def test_real_razorpay_vocabulary():
    """Payloads copied verbatim from live Razorpay test-mode payment.failed
    entities. Our rules were authored against error_source='issuer'; Razorpay
    emits 'bank', and both netbanking declines below originally fell through to
    'unclassified'. Pinned here so the regression cannot come back."""
    # pay_TXvWGSg2w9DAFa / pay_TXvVkgUdnW8UVI -- netbanking, bank-sourced
    assert classify(ev(method="netbanking", error_source="bank",
                       error_reason="payment_failed",
                       error_code="BAD_REQUEST_ERROR")) == "card_declined"
    # pay_TXvOhqxDyvhD6g / pay_TXvWtgm1fm0osE -- card, gateway-sourced
    assert classify(ev(method="card", error_source="gateway",
                       error_reason="payment_failed",
                       error_code="BAD_REQUEST_ERROR")) == "gateway_drop"
    # bank + insufficient funds must beat the generic bank decline rule
    assert classify(ev(error_source="bank",
                       error_reason="insufficient_funds")) == "insufficient_funds"


def test_undocumented_razorpay_sources_stay_unclassified():
    """Razorpay documents 'business' and 'internal' as error_source values. We
    have never received either, so no rule guesses at them -- they must land in
    the exception list rather than be silently mapped."""
    assert classify(ev(error_source="business", error_reason="payment_failed")) == "unclassified"
    assert classify(ev(error_source="internal", error_reason="payment_failed")) == "unclassified"


def test_whole_batch_classifies_without_error():
    counts: dict[str, int] = {}
    for e in generate(100):
        t = classify(e)
        counts[t] = counts.get(t, 0) + 1
    assert counts.get("unclassified", 0) > 0          # junk lands honestly
    assert counts["silent_abandonment"] > counts["gateway_drop"]  # skew holds
