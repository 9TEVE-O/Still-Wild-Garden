
from __future__ import annotations

import math
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
    catch_up_limit: int = int(os.getenv("STILLWILD_CATCH_UP_LIMIT", "6"))
    task_token: str = os.getenv("STILLWILD_TASK_TOKEN", "").strip()
    operator_token: str = os.getenv("STILLWILD_OPERATOR_TOKEN", "").strip()
    weather_collect: bool = _bool("STILLWILD_WEATHER_COLLECT", False)
    real_garden_id: str | None = os.getenv("STILLWILD_REAL_GARDEN_ID") or None
    weather_timeout_seconds: float = float(os.getenv("STILLWILD_WEATHER_TIMEOUT_SECONDS", "10"))

    def __post_init__(self) -> None:
        """Validate the configured schedule and stream timing ranges."""
        if not 1 <= self.tick_seconds <= 86400:
            raise ValueError("STILLWILD_TICK_SECONDS must be between 1 and 86400")
        if not math.isfinite(self.sse_poll_seconds) or self.sse_poll_seconds <= 0:
            raise ValueError("STILLWILD_SSE_POLL_SECONDS must be finite and positive")
        if not 1 <= self.catch_up_limit <= 24:
            raise ValueError("STILLWILD_CATCH_UP_LIMIT must be between 1 and 24")
        if not 1 <= self.wild_days_per_tick <= 7:
            raise ValueError("STILLWILD_WILD_DAYS_PER_TICK must be between 1 and 7")
        if not math.isfinite(self.weather_timeout_seconds) or self.weather_timeout_seconds <= 0:
            raise ValueError("STILLWILD_WEATHER_TIMEOUT_SECONDS must be finite and positive")
        if self.weather_collect and not self.real_garden_id:
            raise ValueError(
                "STILLWILD_REAL_GARDEN_ID is required when STILLWILD_WEATHER_COLLECT is enabled"
            )


settings = Settings()
