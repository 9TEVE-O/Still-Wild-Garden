from __future__ import annotations

import logging
import time

from .background import ScheduleConflict, run_due
from .config import settings
from .db import Repository
from .engine import GardenEngine

log = logging.getLogger(__name__)


def work_forever() -> None:
    """Run due UTC slots without viewers; cron uses the same transaction and slot identity."""
    repo = Repository(settings.db_path)
    engine = GardenEngine(repo, automation_authority=settings.automation_authority)
    while True:
        try:
            run_due(repo, engine, settings, trigger=settings.worker_id)
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


def run() -> None:
    """Configure worker logging and enter the background tick loop."""
    logging.basicConfig(level=logging.INFO)
    work_forever()


if __name__ == "__main__":
    run()
