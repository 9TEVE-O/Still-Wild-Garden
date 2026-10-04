from __future__ import annotations

import logging
import time
from uuid import uuid4

from .config import settings
from .db import Repository
from .engine import GardenEngine
from .wild import RealGardenError, Wild, WildBusyError

log = logging.getLogger(__name__)


def work_forever() -> None:
    repo = Repository(settings.db_path)
    engine = GardenEngine(repo, automation_authority=settings.automation_authority)
    wild = Wild(repo, engine, seed=settings.wild_seed) if settings.wild_sim else None
    lease_ttl = max(settings.tick_seconds * 2, 60)
    lease_holder = f"{settings.worker_id}:{uuid4()}"

    while True:
        acquired = repo.try_acquire_lease(
            name="background-tick",
            holder=lease_holder,
            ttl_seconds=lease_ttl,
        )
        if acquired:
            engine.tick(source=settings.worker_id)
            if wild is not None:
                wild = _grow_wild(wild)
        time.sleep(settings.tick_seconds)


def _grow_wild(wild: Wild) -> Wild | None:
    try:
        wild.advance(settings.wild_days_per_tick)
    except WildBusyError:
        log.info("The Wild is already being advanced elsewhere; skipping this tick.")
    except RealGardenError as exc:
        log.warning("The Wild simulation stopped: %s", exc)
        return None
    return wild


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    work_forever()


if __name__ == "__main__":
    run()
