from __future__ import annotations

import logging
import time
from uuid import uuid4

from .config import settings
from .db import Repository
from .engine import GardenEngine
from .realworld import RealWorldError, RealWorldService
from .wild import RealGardenError, Wild, WildBusyError

log = logging.getLogger(__name__)


def work_forever() -> None:
    """Run periodic engine ticks and optional real-weather or simulation work."""
    repo = Repository(settings.db_path)
    engine = GardenEngine(repo, automation_authority=settings.automation_authority)
    wild = Wild(repo, engine, seed=settings.wild_seed) if settings.wild_sim else None
    weather_collect = getattr(settings, "weather_collect", False)
    real_garden_id = getattr(settings, "real_garden_id", None)
    realworld = (
        RealWorldService(
            repo,
            engine,
            weather_timeout_seconds=getattr(settings, "weather_timeout_seconds", 10.0),
        )
        if weather_collect and real_garden_id
        else None
    )
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
            if realworld is not None and real_garden_id is not None:
                _collect_weather(realworld, real_garden_id)
            if wild is not None:
                wild = _grow_wild(wild)
        time.sleep(settings.tick_seconds)


def _collect_weather(realworld: RealWorldService, garden_id: str) -> None:
    """Collect the latest completed weather interval without stopping the worker on feed failure."""
    try:
        result = realworld.collect_weather(garden_id)
    except RealWorldError as exc:
        log.warning("Real-world weather collection skipped: %s", exc)
        return
    if result["created"]:
        interval = result["interval"]
        log.info(
            "Recorded %s weather interval ending %s for %s.",
            interval["provider"],
            interval["valid_end_utc"],
            garden_id,
        )


def _grow_wild(wild: Wild) -> Wild | None:
    """Advance the Wild, retaining it when busy and returning None for a real garden."""
    try:
        wild.advance(settings.wild_days_per_tick)
    except WildBusyError:
        log.info("The Wild is already being advanced elsewhere; skipping this tick.")
    except RealGardenError as exc:
        log.warning("The Wild simulation stopped: %s", exc)
        return None
    return wild


def run() -> None:
    """Configure worker logging and enter the background tick loop."""
    logging.basicConfig(level=logging.INFO)
    work_forever()


if __name__ == "__main__":
    run()
