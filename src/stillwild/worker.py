from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

from .background import ScheduleConflict, run_due
from .config import settings
from .db import Repository
from .engine import GardenEngine
from .realworld import RealWorldError, RealWorldService

log = logging.getLogger(__name__)


def work_forever() -> None:
    """Run due UTC slots without viewers; cron uses the same transaction and slot identity."""
    repo = Repository(settings.db_path)
    engine = GardenEngine(repo, automation_authority=settings.automation_authority)
    realworld = (
        RealWorldService(repo, engine, weather_timeout_seconds=settings.weather_timeout_seconds)
        if settings.weather_collect
        else None
    )
    while True:
        try:
            receipt = run_due(repo, engine, settings, trigger=settings.worker_id)
            if realworld is not None and settings.real_garden_id:
                _collect_due_weather(realworld, settings.real_garden_id, receipt)
        except ScheduleConflict as exc:
            log.critical(
                "Background worker is quiescent until an operator resolves the pinned "
                "schedule conflict and restarts it: %s",
                exc,
            )
            while True:
                time.sleep(settings.tick_seconds)
        except Exception:
            log.exception("Background work failed; uncommitted slots will be retried.")
        time.sleep(settings.tick_seconds)


def _collect_due_weather(
    realworld: RealWorldService, garden_id: str, receipt: dict
) -> None:
    """Collect model weather after committed hourly UTC slots, outside the slot transaction."""
    for slot in receipt.get("slots", []):
        slot_end_ms = int(slot["slot_end_ms"])
        if slot_end_ms % 3_600_000:
            continue
        try:
            result = realworld.collect_weather(
                garden_id, now=datetime.fromtimestamp(slot_end_ms / 1000, UTC)
            )
        except RealWorldError as exc:
            log.warning("Real-world weather collection failed: %s", exc)
            continue
        if result["created"]:
            interval = result["interval"]
            log.info(
                "Recorded %s weather interval ending %s for %s.",
                interval["provider"],
                interval["valid_end_utc"],
                garden_id,
            )


def run() -> None:
    """Configure worker logging and enter the background tick loop."""
    logging.basicConfig(level=logging.INFO)
    work_forever()


if __name__ == "__main__":
    run()
