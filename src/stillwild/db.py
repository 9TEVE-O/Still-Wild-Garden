from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from .domain import AgentOutput, ExperimentInput, GardenEvent

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    zone_id TEXT,
    source TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_type_seq ON events(type, seq);
CREATE INDEX IF NOT EXISTS idx_events_zone_seq ON events(zone_id, seq);

CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    decision TEXT NOT NULL,
    summary TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL,
    proposed_action_json TEXT,
    unknowns_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_event ON agent_runs(event_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent);

CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    zone_id TEXT,
    decision TEXT NOT NULL,
    summary TEXT NOT NULL,
    confidence REAL NOT NULL,
    proposed_action_json TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status, created_at);

CREATE TABLE IF NOT EXISTS outcomes (
    id TEXT PRIMARY KEY,
    recommendation_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    utility_score REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(recommendation_id) REFERENCES recommendations(id)
);

CREATE TABLE IF NOT EXISTS memories (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence_count INTEGER NOT NULL,
    evidence_json TEXT NOT NULL,
    status TEXT NOT NULL,
    last_verified TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    zone_id TEXT,
    question TEXT NOT NULL,
    hypothesis TEXT NOT NULL,
    change_text TEXT NOT NULL,
    measurement TEXT NOT NULL,
    observation_period TEXT NOT NULL,
    success_condition TEXT NOT NULL,
    stop_condition TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolution_candidates (
    id TEXT PRIMARY KEY,
    agent TEXT NOT NULL,
    current_rule TEXT NOT NULL,
    evidence_problem TEXT NOT NULL,
    proposed_rule TEXT NOT NULL,
    expected_improvement TEXT NOT NULL,
    risk TEXT NOT NULL,
    test_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leases (
    name TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worlds (
    name TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

# Memories keep a full evidence tally but only the most recent evidence ids, so a
# long-lived garden does not rewrite an ever-growing list on every observation.
MAX_MEMORY_EVIDENCE_IDS = 50


def _now() -> str:
    return datetime.now(UTC).isoformat()


class Repository:
    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        self.init()

    @contextmanager
    def connection(
        self, existing: sqlite3.Connection | None = None
    ) -> Iterator[sqlite3.Connection]:
        if existing is not None:
            yield existing
            return
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            yield conn
            conn.commit()
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            yield conn

    def init(self) -> None:
        with self.connection() as conn:
            conn.executescript(SCHEMA)

    def add_event(self, event: GardenEvent, connection: sqlite3.Connection | None = None) -> int:
        with self.connection(connection) as conn:
            cur = conn.execute(
                """
                INSERT INTO events(id, type, zone_id, source, observed_at, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.id,
                    event.type,
                    event.zone_id,
                    event.source,
                    event.observed_at.isoformat(),
                    json.dumps(event.payload, separators=(",", ":"), sort_keys=True),
                    _now(),
                ),
            )
            return int(cur.lastrowid)

    def get_event(self, event_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
            return self._event(row) if row else None

    def list_events(self, after: int = 0, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM events WHERE seq > ? ORDER BY seq ASC LIMIT ?",
                (after, min(limit, 1000)),
            ).fetchall()
            return [self._event(row) for row in rows]

    def recent_events(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM events ORDER BY seq DESC LIMIT ?", (min(limit, 500),)
            ).fetchall()
            return [self._event(row) for row in reversed(rows)]

    def latest_event_for_zone(self, zone_id: str | None, event_type: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            if zone_id is None:
                row = conn.execute(
                    "SELECT * FROM events WHERE type = ? ORDER BY seq DESC LIMIT 1",
                    (event_type,),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT * FROM events
                    WHERE type = ? AND zone_id = ?
                    ORDER BY seq DESC LIMIT 1
                    """,
                    (event_type, zone_id),
                ).fetchone()
            return self._event(row) if row else None

    def add_agent_run(
        self,
        event_id: str,
        output: AgentOutput,
        connection: sqlite3.Connection | None = None,
    ) -> str:
        run_id = str(uuid4())
        with self.connection(connection) as conn:
            conn.execute(
                """
                INSERT INTO agent_runs(
                    id,event_id,agent,decision,summary,confidence,evidence_json,
                    proposed_action_json,unknowns_json,created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    run_id,
                    event_id,
                    output.agent,
                    output.decision,
                    output.summary,
                    output.confidence,
                    json.dumps(output.evidence_event_ids),
                    json.dumps(output.proposed_action) if output.proposed_action else None,
                    json.dumps(output.unknowns),
                    _now(),
                ),
            )
        return run_id

    def add_recommendation(
        self,
        event: GardenEvent,
        decision: str,
        summary: str,
        confidence: float,
        proposed_action: dict[str, Any] | None,
        connection: sqlite3.Connection | None = None,
    ) -> str:
        rec_id = str(uuid4())
        with self.connection(connection) as conn:
            conn.execute(
                """
                INSERT INTO recommendations(
                    id,event_id,zone_id,decision,summary,confidence,proposed_action_json,created_at
                ) VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    rec_id,
                    event.id,
                    event.zone_id,
                    decision,
                    summary,
                    confidence,
                    json.dumps(proposed_action) if proposed_action else None,
                    _now(),
                ),
            )
        return rec_id

    def list_recommendations(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM recommendations ORDER BY created_at DESC LIMIT ?",
                (min(limit, 500),),
            ).fetchall()
            return [self._recommendation(row) for row in rows]

    def add_outcome(
        self,
        recommendation_id: str,
        outcome: str,
        utility_score: float,
        notes: str | None,
        connection: sqlite3.Connection | None = None,
    ) -> str:
        """Resolve a recommendation and return its outcome ID, optionally in a shared transaction.

        Raise KeyError for a missing recommendation or ValueError if already resolved."""
        outcome_id = str(uuid4())
        with self.connection(connection) as conn:
            if not conn.in_transaction:
                conn.execute("BEGIN IMMEDIATE")
            recommendation = conn.execute(
                "SELECT status FROM recommendations WHERE id = ?", (recommendation_id,)
            ).fetchone()
            if not recommendation:
                raise KeyError(recommendation_id)
            if recommendation["status"] == "resolved":
                raise ValueError("recommendation already resolved")
            conn.execute(
                """
                INSERT INTO outcomes(id,recommendation_id,outcome,utility_score,notes,created_at)
                VALUES (?,?,?,?,?,?)
                """,
                (outcome_id, recommendation_id, outcome, utility_score, notes, _now()),
            )
            conn.execute(
                "UPDATE recommendations SET status = 'resolved' WHERE id = ?",
                (recommendation_id,),
            )
        return outcome_id

    def outcomes_for(self, recommendation_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Return recorded outcomes and utility scores keyed by the requested recommendation IDs."""
        if not recommendation_ids:
            return {}
        marks = ",".join("?" for _ in recommendation_ids)
        with self.connection() as conn:
            rows = conn.execute(
                f"""
                SELECT recommendation_id, outcome, utility_score FROM outcomes
                WHERE recommendation_id IN ({marks})
                """,
                recommendation_ids,
            ).fetchall()
            return {
                row["recommendation_id"]: {
                    "outcome": row["outcome"],
                    "utility_score": row["utility_score"],
                }
                for row in rows
            }

    def agent_scores(self, limit_per_agent: int = 20) -> list[dict[str, Any]]:
        # Outcomes belong to council recommendations. Attribution uses the agent runs that
        # contributed to the same triggering event; this intentionally measures usefulness,
        # not causal credit.
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT agent, COUNT(*) AS n, AVG(utility_score) AS avg_score
                FROM (
                    SELECT ar.agent AS agent, r.id AS recommendation_id,
                           AVG(o.utility_score) AS utility_score
                    FROM outcomes o
                    JOIN recommendations r ON r.id = o.recommendation_id
                    JOIN agent_runs ar ON ar.event_id = r.event_id
                    WHERE ar.agent != 'council'
                    GROUP BY ar.agent, r.id
                ) AS recommendation_scores
                GROUP BY agent
                ORDER BY n DESC
                """
            ).fetchall()
            return [
                {"agent": row["agent"], "n": row["n"], "avg_score": row["avg_score"]}
                for row in rows
            ]

    def upsert_memory(
        self,
        key: str,
        value: dict[str, Any],
        confidence: float,
        evidence_ids: list[str],
        status: str = "observation",
        connection: sqlite3.Connection | None = None,
    ) -> None:
        """Update a memory, retaining its evidence tally and the most recent evidence IDs.

        Only IDs absent from the retained window increase an existing tally.
        Join the supplied connection when provided."""
        with self.connection(connection) as conn:
            if not conn.in_transaction:
                conn.execute("BEGIN IMMEDIATE")
            existing = conn.execute(
                "SELECT evidence_count,evidence_json FROM memories WHERE key = ?", (key,)
            ).fetchone()
            evidence = list(dict.fromkeys(evidence_ids))
            count = len(evidence)
            if existing:
                old = json.loads(existing["evidence_json"])
                added = [item for item in evidence if item not in old]
                evidence = list(dict.fromkeys(old + evidence))
                count = max(int(existing["evidence_count"]) + len(added), len(evidence))
            evidence = evidence[-MAX_MEMORY_EVIDENCE_IDS:]
            conn.execute(
                """
                INSERT INTO memories(key,value_json,confidence,evidence_count,evidence_json,status,last_verified)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json=excluded.value_json,
                    confidence=excluded.confidence,
                    evidence_count=excluded.evidence_count,
                    evidence_json=excluded.evidence_json,
                    status=excluded.status,
                    last_verified=excluded.last_verified
                """,
                (
                    key,
                    json.dumps(value, separators=(",", ":"), sort_keys=True),
                    confidence,
                    count,
                    json.dumps(evidence),
                    status,
                    _now(),
                ),
            )

    def list_memories(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM memories ORDER BY last_verified DESC LIMIT ?", (min(limit, 500),)
            ).fetchall()
            return [
                {
                    "key": row["key"],
                    "value": json.loads(row["value_json"]),
                    "confidence": row["confidence"],
                    "evidence_count": row["evidence_count"],
                    "evidence_event_ids": json.loads(row["evidence_json"]),
                    "status": row["status"],
                    "last_verified": row["last_verified"],
                }
                for row in rows
            ]

    def add_experiment(self, exp: ExperimentInput) -> str:
        exp_id = str(uuid4())
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO experiments(
                    id,zone_id,question,hypothesis,change_text,measurement,observation_period,
                    success_condition,stop_condition,created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    exp_id,
                    exp.zone_id,
                    exp.question,
                    exp.hypothesis,
                    exp.change,
                    exp.measurement,
                    exp.observation_period,
                    exp.success_condition,
                    exp.stop_condition,
                    _now(),
                ),
            )
        return exp_id

    def list_experiments(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM experiments ORDER BY created_at DESC LIMIT ?", (min(limit, 500),)
            ).fetchall()
            return [dict(row) for row in rows]

    def add_evolution_candidate(
        self,
        agent: str,
        current_rule: str,
        evidence_problem: str,
        proposed_rule: str,
        expected_improvement: str,
        risk: str,
        test_method: str,
    ) -> str:
        candidate_id = str(uuid4())
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            duplicate = conn.execute(
                """
                SELECT id FROM evolution_candidates
                WHERE agent = ? AND proposed_rule = ? AND status = 'candidate'
                LIMIT 1
                """,
                (agent, proposed_rule),
            ).fetchone()
            if duplicate:
                return str(duplicate["id"])
            conn.execute(
                """
                INSERT INTO evolution_candidates(
                    id,agent,current_rule,evidence_problem,proposed_rule,
                    expected_improvement,risk,test_method,created_at
                ) VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (
                    candidate_id,
                    agent,
                    current_rule,
                    evidence_problem,
                    proposed_rule,
                    expected_improvement,
                    risk,
                    test_method,
                    _now(),
                ),
            )
        return candidate_id

    def list_evolution_candidates(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM evolution_candidates
                ORDER BY created_at DESC LIMIT ?
                """,
                (min(limit, 500),),
            ).fetchall()
            return [dict(row) for row in rows]

    def try_acquire_lease(
        self,
        name: str,
        holder: str,
        ttl_seconds: int,
        connection: sqlite3.Connection | None = None,
    ) -> bool:
        """Acquire or renew a lease unless another holder has an unexpired claim.

        Return whether acquisition succeeded, optionally using the supplied connection."""
        now = datetime.now(UTC)
        expires = now + timedelta(seconds=ttl_seconds)
        with self.connection(connection) as conn:
            if not conn.in_transaction:
                conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT holder,expires_at FROM leases WHERE name = ?", (name,)
            ).fetchone()
            if row:
                expiry = datetime.fromisoformat(row["expires_at"])
                if expiry > now and row["holder"] != holder:
                    return False
            conn.execute(
                """
                INSERT INTO leases(name,holder,expires_at) VALUES (?,?,?)
                ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
                """,
                (name, holder, expires.isoformat()),
            )
            return True

    def release_lease(self, name: str, holder: str) -> None:
        """Delete a lease only if it still belongs to the specified holder."""
        with self.connection() as conn:
            conn.execute("DELETE FROM leases WHERE name = ? AND holder = ?", (name, holder))

    def has_real_observations(self, connection: sqlite3.Connection | None = None) -> bool:
        # Anything other than periodic ticks and events whose payload says "simulated": true
        # is treated as a real-world observation.
        """Return whether any non-tick event lacks a literal JSON true simulation flag."""
        with self.connection(connection) as conn:
            row = conn.execute(
                """
                SELECT 1 FROM events
                WHERE type != 'system.tick'
                  AND COALESCE(json_type(payload_json, '$.simulated'), '') != 'true'
                LIMIT 1
                """
            ).fetchone()
            return row is not None

    def has_world(self, connection: sqlite3.Connection | None = None) -> bool:
        """Return whether any simulated world exists, optionally within a shared transaction."""
        with self.connection(connection) as conn:
            return conn.execute("SELECT 1 FROM worlds LIMIT 1").fetchone() is not None

    def claim_world(
        self, name: str, state: dict[str, Any], connection: sqlite3.Connection | None = None
    ) -> bool:
        # Claiming happens under the same write lock as event ingestion, so a real
        # observation and a new simulated garden can never both land in one database.
        """Create a world if absent under a write lock, refusing real observations.

        Return False for a real garden; otherwise preserve any existing world and return True.
        Join the supplied connection when provided."""
        with self.connection(connection) as conn:
            if not conn.in_transaction:
                conn.execute("BEGIN IMMEDIATE")
            if self.has_real_observations(connection=conn):
                return False
            conn.execute(
                "INSERT OR IGNORE INTO worlds(name,state_json,updated_at) VALUES (?,?,?)",
                (name, json.dumps(state, separators=(",", ":")), _now()),
            )
            return True

    def load_world(self, name: str) -> dict[str, Any] | None:
        """Return the decoded state of a named world, or None if it does not exist."""
        with self.connection() as conn:
            row = conn.execute(
                "SELECT state_json FROM worlds WHERE name = ?", (name,)
            ).fetchone()
            return json.loads(row["state_json"]) if row else None

    def save_world_if_revision(
        self,
        name: str,
        state: dict[str, Any],
        expected_revision: int,
        connection: sqlite3.Connection | None = None,
    ) -> bool:
        # A fencing check: the save only lands if nobody else has saved the world since the
        # caller loaded it, so a stale writer can never overwrite newer state.
        with self.connection(connection) as conn:
            cur = conn.execute(
                """
                UPDATE worlds SET state_json = ?, updated_at = ?
                WHERE name = ? AND COALESCE(json_extract(state_json, '$.revision'), 0) = ?
                """,
                (json.dumps(state, separators=(",", ":")), _now(), name, expected_revision),
            )
            return cur.rowcount == 1

    def save_world(
        self, name: str, state: dict[str, Any], connection: sqlite3.Connection | None = None
    ) -> None:
        """Insert or replace a named world state, optionally within a shared transaction."""
        with self.connection(connection) as conn:
            conn.execute(
                """
                INSERT INTO worlds(name,state_json,updated_at) VALUES (?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    state_json=excluded.state_json,
                    updated_at=excluded.updated_at
                """,
                (name, json.dumps(state, separators=(",", ":")), _now()),
            )

    @staticmethod
    def _event(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "seq": row["seq"],
            "id": row["id"],
            "type": row["type"],
            "zone_id": row["zone_id"],
            "source": row["source"],
            "observed_at": row["observed_at"],
            "payload": json.loads(row["payload_json"]),
            "created_at": row["created_at"],
        }

    @staticmethod
    def _recommendation(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "event_id": row["event_id"],
            "zone_id": row["zone_id"],
            "decision": row["decision"],
            "summary": row["summary"],
            "confidence": row["confidence"],
            "proposed_action": (
                json.loads(row["proposed_action_json"]) if row["proposed_action_json"] else None
            ),
            "status": row["status"],
            "created_at": row["created_at"],
        }
