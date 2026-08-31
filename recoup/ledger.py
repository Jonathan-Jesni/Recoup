"""Ledger agent: append-only SQLite audit log + final numbers.

Every hop of every checkout writes a row. The audit trail IS this table;
the dashboard renders it, nothing reconstructs it after the fact.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    run_id TEXT NOT NULL,
    checkout_id TEXT NOT NULL,
    agent TEXT NOT NULL,          -- signal | diagnosis | policy_gate | executor | outcome | reconcile
    event TEXT NOT NULL,          -- e.g. classified, diagnosed, allowed, denied, executed, recovered
    payload TEXT NOT NULL         -- JSON: full inputs/outputs for this hop, verbatim
);
CREATE INDEX IF NOT EXISTS idx_audit_checkout ON audit_log (run_id, checkout_id, id);
"""


class Ledger:
    def __init__(self, db_path: str | Path, run_id: str):
        self.run_id = run_id
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path))
        self.conn.executescript(SCHEMA)

    def log(self, checkout_id: str, agent: str, event: str, payload: dict) -> None:
        self.conn.execute(
            "INSERT INTO audit_log (ts, run_id, checkout_id, agent, event, payload) VALUES (?,?,?,?,?,?)",
            (time.time(), self.run_id, checkout_id, agent, event,
             json.dumps(payload, ensure_ascii=False, default=str)),
        )
        self.conn.commit()

    def rows(self, checkout_id: str | None = None) -> list[dict]:
        q = "SELECT ts, checkout_id, agent, event, payload FROM audit_log WHERE run_id=?"
        args: list = [self.run_id]
        if checkout_id:
            q += " AND checkout_id=?"
            args.append(checkout_id)
        q += " ORDER BY id"
        return [
            dict(ts=r[0], checkout_id=r[1], agent=r[2], event=r[3], payload=json.loads(r[4]))
            for r in self.conn.execute(q, args)
        ]

    def close(self) -> None:
        self.conn.close()
