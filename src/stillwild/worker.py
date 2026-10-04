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
        except ScheduleConflict:
            raise  # Requires an explicit configuration decision, not an endless retry loop.
        except Exception:
            log.exception("Background work failed; uncommitted slots will be retried.")
        time.sleep(settings.tick_seconds)


def run() -> None:
    """Configure worker logging and enter the background tick loop."""
    logging.basicConfig(level=logging.INFO)
    work_forever()


if __name__ == "__main__":
    run()
