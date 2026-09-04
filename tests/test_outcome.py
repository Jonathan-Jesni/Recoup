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


def test_repeating_failed_action_decays_harder_than_switching():
    # Attempt 2 with the SAME action that just failed must be modelled as
    # weaker than attempt 2 with a different action of equal base conversion.
    repeat = simulate(checkout_id="c", failure_type="card_declined",
                      action_id="offer_emi", attempt_no=2,
                      previous_action_id="offer_emi")
    switch = simulate(checkout_id="c", failure_type="card_declined",
                      action_id="offer_emi", attempt_no=2,
                      previous_action_id="retry_alternate_instrument")
    assert repeat["repeated_action"] and not switch["repeated_action"]
    assert repeat["p"] < switch["p"]
    assert repeat["draw"] == switch["draw"]  # pairing survives the change


def test_first_attempt_never_counts_as_repeat():
    r = simulate(checkout_id="c", failure_type="card_declined",
                 action_id="offer_emi", attempt_no=1, previous_action_id="offer_emi")
    assert r["repeated_action"] is False and r["decay_applied"] is None


def test_unknown_pair_never_recovers():
    r = simulate(checkout_id="c", failure_type="unclassified",
                 action_id="escalate_human", attempt_no=1)
    assert r["p"] == 0.0 and not r["recovered"]


def test_ledger_reset_replaces_rows_instead_of_appending(tmp_path):
    """A re-run under the same run_id must not leave two sets of rows.

    run.json is computed in memory so it stays correct, which made this silent:
    the corruption only appeared in the exported audit trail, where every hop
    was rendered twice.
    """
    from recoup.ledger import Ledger

    db = tmp_path / "ledger.db"
    first = Ledger(db, "r1", reset=True)
    first.log("chk_1", "signal", "classified", {"failure_type": "card_declined"})
    first.close()

    second = Ledger(db, "r1", reset=True)
    second.log("chk_1", "signal", "classified", {"failure_type": "card_declined"})
    rows = second.rows()
    second.close()
    assert len(rows) == 1, "writer must replace prior rows for this run_id"

    # a reader must NOT wipe the run it is about to read
    reader = Ledger(db, "r1", reset=False)
    assert len(reader.rows()) == 1
    reader.close()
