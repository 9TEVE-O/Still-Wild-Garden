"""Retry-safe scheduled evaluation for the experimental backend, never the live pixel garden."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from .config import Settings
from .db import Repository, _now
from .engine import GardenEngine
from .wild import RealGardenError, Wild

log = logging.getLogger(__name__)
SCHEDULE = "background-v1"


class ScheduleConflict(ValueError):
    """The persisted schedule cannot silently change interval or simulation rules."""


def run_due(
    repo: Repository, engine: GardenEngine, config: Settings,
    trigger: str, now: datetime | None = None,
) -> dict:
    """Commit due UTC slots in a bounded transaction, shared by cron and the worker.

    The first call establishes a baseline and processes only the current completed slot.
    Later calls catch up at most catch_up_limit slots. Reads never call this function.
    A killed process can leave a 'started' attempt, but no partly committed slot.
    """
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        raise ValueError("the scheduler clock must be timezone-aware")
    interval_ms = config.tick_seconds * 1000
    through_ms = int(now.timestamp()) // config.tick_seconds * interval_ms
    config_json = json.dumps({
        "tick_seconds": config.tick_seconds,
        "wild_sim": config.wild_sim,
        "wild_seed": config.wild_seed,
        "wild_days_per_tick": config.wild_days_per_tick,
        "automation_authority": engine.automation_authority,
        "rules_version": 1,
    }, sort_keys=True, separators=(",", ":"))
    run_id = repo.start_background_run(SCHEDULE, through_ms, trigger)
    try:
        with repo.transaction() as conn:
            conn.execute(
                """INSERT OR IGNORE INTO background_schedules
                (name,config_json,last_slot_end_ms) VALUES (?,?,?)""",
                (SCHEDULE, config_json, through_ms - interval_ms),
            )
            schedule = conn.execute(
                "SELECT * FROM background_schedules WHERE name=?", (SCHEDULE,),
            ).fetchone()
            if schedule["config_json"] != config_json:
                raise ScheduleConflict(
                    "the stored background schedule has different settings; use a separate "
                    "test database instead of silently changing its interval or rules"
                )
            last_ms = schedule["last_slot_end_ms"]
            slots = []
            for _ in range(config.catch_up_limit):
                slot_ms = last_ms + interval_ms
                if slot_ms > through_ms:
                    break
                result = engine.tick(source=trigger, connection=conn)
                if config.wild_sim:
                    try:
                        grown = Wild(repo, engine, seed=config.wild_seed).advance(
                            config.wild_days_per_tick, connection=conn,
                        )
                        result["wild"] = {
                            key: grown[key] for key in ("day", "revision", "date", "events")
                        }
                    except RealGardenError as exc:
                        # A receipt for evaluation is not a receipt for garden growth.
                        result["wild"] = {"skipped": str(exc)}
                conn.execute(
                    """INSERT INTO background_ticks
                    (schedule_name,slot_end_ms,run_id,result_json,committed_at)
                    VALUES (?,?,?,?,?)""",
                    (SCHEDULE, slot_ms, run_id, json.dumps(result), _now()),
                )
                last_ms = slot_ms
                slots.append({"slot_end_ms": slot_ms, "result": result})
            conn.execute(
                "UPDATE background_schedules SET last_slot_end_ms=? WHERE name=?",
                (last_ms, SCHEDULE),
            )
            latest = conn.execute(
                """SELECT * FROM background_ticks WHERE schedule_name=?
                ORDER BY slot_end_ms DESC LIMIT 1""", (SCHEDULE,),
            ).fetchone()
            status = "completed" if slots else "duplicate"
            receipt = {
                **json.loads(latest["result_json"]),
                "run_id": run_id,
                "schedule": SCHEDULE,
                "status": status,
                "committed_slots": len(slots),
                "last_slot_end_ms": last_ms,
                "backlog_slots": max(0, (through_ms - last_ms) // interval_ms),
                "duplicate_of": latest["run_id"] if not slots else None,
                "slots": slots,
            }
            repo.finish_background_run(run_id, status, receipt, connection=conn)
    except Exception as exc:
        # Failure evidence lives outside the rolled-back slot transaction.
        repo.finish_background_run(run_id, "failed", error=f"{type(exc).__name__}: {exc}"[:500])
        log.error("background_run_failed run_id=%s error_type=%s", run_id, type(exc).__name__)
        raise
    log.info("background_run %s", json.dumps({
        key: receipt[key] for key in (
            "run_id", "status", "committed_slots", "last_slot_end_ms", "backlog_slots", "wild",
        ) if key in receipt
    }, sort_keys=True))
    return receipt
