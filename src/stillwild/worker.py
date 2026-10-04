from __future__ import annotations

import time
from uuid import uuid4

from .config import settings
from .db import Repository
from .engine import GardenEngine


def work_forever() -> None:
    repo = Repository(settings.db_path)
    engine = GardenEngine(repo, automation_authority=settings.automation_authority)
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
        time.sleep(settings.tick_seconds)


def run() -> None:
    work_forever()


if __name__ == "__main__":
    run()
