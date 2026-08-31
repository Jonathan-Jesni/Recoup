from recoup.outcome import simulate


def test_deterministic_across_calls():
    a = simulate(checkout_id="chk_1", failure_type="card_declined",
                 action_id="retry_alternate_instrument", attempt_no=1)
    b = simulate(checkout_id="chk_1", failure_type="card_declined",
                 action_id="retry_alternate_instrument", attempt_no=1)
    assert a == b


def test_paired_draws_identical_across_policies():
    # Same checkout+attempt -> same draw, regardless of which action a policy
    # picked. This is what makes agent-vs-baseline a paired comparison.
    a = simulate(checkout_id="chk_9", failure_type="auth_timeout",
                 action_id="retry_same_cooldown", attempt_no=1)
    b = simulate(checkout_id="chk_9", failure_type="auth_timeout",
                 action_id="recovery_nudge", attempt_no=1)
    assert a["draw"] == b["draw"]


def test_second_attempt_decays():
    p1 = simulate(checkout_id="c", failure_type="card_declined",
                  action_id="offer_emi", attempt_no=1)["p"]
    p2 = simulate(checkout_id="c", failure_type="card_declined",
                  action_id="offer_emi", attempt_no=2)["p"]
    assert p2 < p1


def test_unknown_pair_never_recovers():
    r = simulate(checkout_id="c", failure_type="unclassified",
                 action_id="escalate_human", attempt_no=1)
    assert r["p"] == 0.0 and not r["recovered"]
