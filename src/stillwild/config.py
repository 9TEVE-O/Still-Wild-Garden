
from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    db_path: str = os.getenv("STILLWILD_DB_PATH", "./stillwild.db")
    tick_seconds: int = int(os.getenv("STILLWILD_TICK_SECONDS", "300"))
    sse_poll_seconds: float = float(os.getenv("STILLWILD_SSE_POLL_SECONDS", "2"))
    automation_authority: bool = _bool("STILLWILD_AUTOMATION_AUTHORITY", False)
    worker_id: str = os.getenv("STILLWILD_WORKER_ID", "worker-1")
    wild_sim: bool = _bool("STILLWILD_WILD_SIM", False)
    wild_seed: int = int(os.getenv("STILLWILD_WILD_SEED", "7"))
    wild_days_per_tick: int = int(os.getenv("STILLWILD_WILD_DAYS_PER_TICK", "1"))


settings = Settings()
