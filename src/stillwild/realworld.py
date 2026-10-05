from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from .db import Repository
from .domain import GardenEvent, utcnow
from .engine import GardenEngine

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

REALWORLD_SCHEMA = """
CREATE TABLE IF NOT EXISTS real_gardens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    timezone TEXT NOT NULL,
    climate TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS garden_zones (
    id TEXT PRIMARY KEY,
    garden_id TEXT NOT NULL,
    name TEXT NOT NULL,
    exposure_json TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(garden_id) REFERENCES real_gardens(id)
);
CREATE INDEX IF NOT EXISTS idx_garden_zones_garden ON garden_zones(garden_id, id);

CREATE TABLE IF NOT EXISTS organisms (
    id TEXT PRIMARY KEY,
    garden_id TEXT NOT NULL,
    zone_id TEXT,
    kind TEXT NOT NULL,
    common_name TEXT NOT NULL,
    scientific_name TEXT,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(garden_id) REFERENCES real_gardens(id),
    FOREIGN KEY(zone_id) REFERENCES garden_zones(id)
);
CREATE INDEX IF NOT EXISTS idx_organisms_garden ON organisms(garden_id, zone_id, kind);

CREATE TABLE IF NOT EXISTS sensors (
    id TEXT PRIMARY KEY,
    garden_id TEXT NOT NULL,
    zone_id TEXT,
    kind TEXT NOT NULL,
    unit TEXT NOT NULL,
    source TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(garden_id) REFERENCES real_gardens(id),
    FOREIGN KEY(zone_id) REFERENCES garden_zones(id)
);
CREATE INDEX IF NOT EXISTS idx_sensors_garden ON sensors(garden_id, zone_id, kind);

CREATE TABLE IF NOT EXISTS environment_intervals (
    id TEXT PRIMARY KEY,
    garden_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    valid_start_utc TEXT NOT NULL,
    valid_end_utc TEXT NOT NULL,
    fetched_at_utc TEXT NOT NULL,
    source_status TEXT NOT NULL,
    values_json TEXT NOT NULL,
    units_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(garden_id) REFERENCES real_gardens(id),
    UNIQUE(garden_id, provider, valid_end_utc, revision)
);
CREATE INDEX IF NOT EXISTS idx_environment_garden_end
ON environment_intervals(garden_id, valid_end_utc DESC, revision DESC);
"""


class RealWorldError(RuntimeError):
    pass


class RecordExistsError(RealWorldError):
    pass


class RecordNotFoundError(RealWorldError):
    pass


class RealWorldConflictError(RealWorldError):
    pass


class WeatherUnavailableError(RealWorldError):
    pass


class RealGardenInput(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timezone: str = Field(default="Australia/Darwin", min_length=1, max_length=80)
    climate: str | None = Field(default=None, max_length=120)


class ZoneInput(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    garden_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    exposure: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=1000)


class OrganismInput(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    garden_id: str = Field(min_length=1, max_length=64)
    zone_id: str | None = Field(default=None, max_length=64)
    kind: Literal["plant", "animal", "fungus", "other"]
    common_name: str = Field(min_length=1, max_length=160)
    scientific_name: str | None = Field(default=None, max_length=200)
    status: str = Field(default="present", min_length=1, max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SensorInput(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    garden_id: str = Field(min_length=1, max_length=64)
    zone_id: str | None = Field(default=None, max_length=64)
    kind: Literal["soil_moisture", "temperature", "humidity", "light", "rain_gauge", "other"]
    unit: str = Field(min_length=1, max_length=40)
    source: str = Field(min_length=1, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_semantic_unit(self) -> SensorInput:
        normal = self.unit.strip().lower()
        expected = {
            "soil_moisture": {"%", "percent"},
            "temperature": {"c", "°c", "celsius"},
            "humidity": {"%", "percent"},
            "light": {"lux"},
            "rain_gauge": {"mm"},
        }
        allowed = expected.get(self.kind)
        if allowed is not None and normal not in allowed:
            raise ValueError(f"{self.kind} sensor unit must be one of {sorted(allowed)}")
        return self


class SensorReadingInput(BaseModel):
    sensor_id: str = Field(min_length=1, max_length=64)
    observed_at: datetime = Field(default_factory=utcnow)
    value: float = Field(allow_inf_nan=False)
    forecast_rain_mm_24h: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RealWorldStore:
    def __init__(self, repo: Repository):
        self.repo = repo
        with self.repo.connection() as conn:
            conn.executescript(REALWORLD_SCHEMA)

    def assert_real_database(self, connection: sqlite3.Connection | None = None) -> None:
        if self.repo.has_world(connection=connection):
            raise RealWorldConflictError(
                "This database contains The Wild simulation; use a separate database for real evidence."
            )

    def create_garden(self, item: RealGardenInput) -> dict[str, Any]:
        with self.repo.transaction() as conn:
            self.assert_real_database(connection=conn)
            try:
                conn.execute(
                    """
                    INSERT INTO real_gardens(id,name,latitude,longitude,timezone,climate,created_at)
                    VALUES (?,?,?,?,?,?,?)
                    """,
                    (
                        item.id,
                        item.name,
                        item.latitude,
                        item.longitude,
                        item.timezone,
                        item.climate,
                        _now(),
                    ),
                )
            except Exception as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise RecordExistsError(f"garden '{item.id}' already exists") from exc
                raise
        return self.get_garden(item.id)

    def get_garden(self, garden_id: str) -> dict[str, Any]:
        with self.repo.connection() as conn:
            row = conn.execute("SELECT * FROM real_gardens WHERE id = ?", (garden_id,)).fetchone()
        if row is None:
            raise RecordNotFoundError(f"garden '{garden_id}' was not found")
        return dict(row)

    def list_gardens(self) -> list[dict[str, Any]]:
        with self.repo.connection() as conn:
            rows = conn.execute("SELECT * FROM real_gardens ORDER BY created_at, id").fetchall()
        return [dict(row) for row in rows]

    def create_zone(self, item: ZoneInput) -> dict[str, Any]:
        self.get_garden(item.garden_id)
        with self.repo.transaction() as conn:
            self.assert_real_database(connection=conn)
            try:
                conn.execute(
                    """
                    INSERT INTO garden_zones(id,garden_id,name,exposure_json,notes,created_at)
                    VALUES (?,?,?,?,?,?)
                    """,
                    (item.id, item.garden_id, item.name, _json(item.exposure), item.notes, _now()),
                )
            except Exception as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise RecordExistsError(f"zone '{item.id}' already exists") from exc
                raise
        return self._get_zone(item.id)

    def list_zones(self, garden_id: str) -> list[dict[str, Any]]:
        self.get_garden(garden_id)
        with self.repo.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM garden_zones WHERE garden_id = ? ORDER BY id", (garden_id,)
            ).fetchall()
        return [self._zone(row) for row in rows]

    def create_organism(self, item: OrganismInput) -> dict[str, Any]:
        self.get_garden(item.garden_id)
        if item.zone_id is not None:
            self._assert_zone_belongs(item.zone_id, item.garden_id)
        with self.repo.transaction() as conn:
            self.assert_real_database(connection=conn)
            try:
                conn.execute(
                    """
                    INSERT INTO organisms(
                        id,garden_id,zone_id,kind,common_name,scientific_name,status,metadata_json,created_at
                    ) VALUES (?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        item.id,
                        item.garden_id,
                        item.zone_id,
                        item.kind,
                        item.common_name,
                        item.scientific_name,
                        item.status,
                        _json(item.metadata),
                        _now(),
                    ),
                )
            except Exception as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise RecordExistsError(f"organism '{item.id}' already exists") from exc
                raise
        return self._get_organism(item.id)

    def list_organisms(self, garden_id: str) -> list[dict[str, Any]]:
        self.get_garden(garden_id)
        with self.repo.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM organisms WHERE garden_id = ? ORDER BY zone_id, id", (garden_id,)
            ).fetchall()
        return [self._organism(row) for row in rows]

    def create_sensor(self, item: SensorInput) -> dict[str, Any]:
        self.get_garden(item.garden_id)
        if item.zone_id is not None:
            self._assert_zone_belongs(item.zone_id, item.garden_id)
        with self.repo.transaction() as conn:
            self.assert_real_database(connection=conn)
            try:
                conn.execute(
                    """
                    INSERT INTO sensors(
                        id,garden_id,zone_id,kind,unit,source,active,metadata_json,created_at
                    ) VALUES (?,?,?,?,?,?,1,?,?)
                    """,
                    (
                        item.id,
                        item.garden_id,
                        item.zone_id,
                        item.kind,
                        item.unit,
                        item.source,
                        _json(item.metadata),
                        _now(),
                    ),
                )
            except Exception as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise RecordExistsError(f"sensor '{item.id}' already exists") from exc
                raise
        return self.get_sensor(item.id)

    def get_sensor(self, sensor_id: str) -> dict[str, Any]:
        with self.repo.connection() as conn:
            row = conn.execute("SELECT * FROM sensors WHERE id = ?", (sensor_id,)).fetchone()
        if row is None:
            raise RecordNotFoundError(f"sensor '{sensor_id}' was not found")
        return self._sensor(row)

    def list_sensors(self, garden_id: str) -> list[dict[str, Any]]:
        self.get_garden(garden_id)
        with self.repo.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM sensors WHERE garden_id = ? ORDER BY zone_id, id", (garden_id,)
            ).fetchall()
        return [self._sensor(row) for row in rows]

    def record_environment_interval(
        self,
        *,
        garden_id: str,
        provider: str,
        model: str,
        valid_start_utc: datetime,
        valid_end_utc: datetime,
        fetched_at_utc: datetime,
        source_status: str,
        values: dict[str, Any],
        units: dict[str, Any],
        connection: sqlite3.Connection | None = None,
    ) -> tuple[dict[str, Any], bool]:
        if connection is None:
            with self.repo.transaction() as conn:
                return self.record_environment_interval(
                    garden_id=garden_id,
                    provider=provider,
                    model=model,
                    valid_start_utc=valid_start_utc,
                    valid_end_utc=valid_end_utc,
                    fetched_at_utc=fetched_at_utc,
                    source_status=source_status,
                    values=values,
                    units=units,
                    connection=conn,
                )
        if not connection.in_transaction:
            raise ValueError("environment interval writes require an active repository transaction")
        self.assert_real_database(connection=connection)
        garden = connection.execute(
            "SELECT 1 FROM real_gardens WHERE id = ?", (garden_id,)
        ).fetchone()
        if garden is None:
            raise RecordNotFoundError(f"garden '{garden_id}' was not found")
        values_json = _json(values)
        units_json = _json(units)
        row = connection.execute(
            """
            SELECT * FROM environment_intervals
            WHERE garden_id = ? AND provider = ? AND valid_end_utc = ?
            ORDER BY revision DESC LIMIT 1
            """,
            (garden_id, provider, valid_end_utc.isoformat()),
        ).fetchone()
        if (
            row is not None
            and row["values_json"] == values_json
            and row["units_json"] == units_json
            and row["source_status"] == source_status
        ):
            return self._environment(row), False
        revision = int(row["revision"]) + 1 if row is not None else 1
        interval_id = str(uuid4())
        connection.execute(
            """
            INSERT INTO environment_intervals(
                id,garden_id,provider,model,valid_start_utc,valid_end_utc,fetched_at_utc,
                source_status,values_json,units_json,revision,created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                interval_id,
                garden_id,
                provider,
                model,
                valid_start_utc.isoformat(),
                valid_end_utc.isoformat(),
                fetched_at_utc.isoformat(),
                source_status,
                values_json,
                units_json,
                revision,
                _now(),
            ),
        )
        saved = connection.execute(
            "SELECT * FROM environment_intervals WHERE id = ?", (interval_id,)
        ).fetchone()
        assert saved is not None
        return self._environment(saved), True

    def list_environment(self, garden_id: str, limit: int = 48) -> list[dict[str, Any]]:
        self.get_garden(garden_id)
        with self.repo.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM environment_intervals
                WHERE garden_id = ?
                ORDER BY valid_end_utc DESC, revision DESC LIMIT ?
                """,
                (garden_id, min(limit, 500)),
            ).fetchall()
        return [self._environment(row) for row in rows]

    def _get_zone(self, zone_id: str) -> dict[str, Any]:
        with self.repo.connection() as conn:
            row = conn.execute("SELECT * FROM garden_zones WHERE id = ?", (zone_id,)).fetchone()
        if row is None:
            raise RecordNotFoundError(f"zone '{zone_id}' was not found")
        return self._zone(row)

    def _assert_zone_belongs(self, zone_id: str, garden_id: str) -> None:
        zone = self._get_zone(zone_id)
        if zone["garden_id"] != garden_id:
            raise RealWorldConflictError(
                f"zone '{zone_id}' does not belong to garden '{garden_id}'"
            )

    def _get_organism(self, organism_id: str) -> dict[str, Any]:
        with self.repo.connection() as conn:
            row = conn.execute("SELECT * FROM organisms WHERE id = ?", (organism_id,)).fetchone()
        if row is None:
            raise RecordNotFoundError(f"organism '{organism_id}' was not found")
        return self._organism(row)

    @staticmethod
    def _zone(row: Any) -> dict[str, Any]:
        item = dict(row)
        item["exposure"] = json.loads(item.pop("exposure_json"))
        return item

    @staticmethod
    def _organism(row: Any) -> dict[str, Any]:
        item = dict(row)
        item["metadata"] = json.loads(item.pop("metadata_json"))
        return item

    @staticmethod
    def _sensor(row: Any) -> dict[str, Any]:
        item = dict(row)
        item["active"] = bool(item["active"])
        item["metadata"] = json.loads(item.pop("metadata_json"))
        return item

    @staticmethod
    def _environment(row: Any) -> dict[str, Any]:
        item = dict(row)
        item["values"] = json.loads(item.pop("values_json"))
        item["units"] = json.loads(item.pop("units_json"))
        return item


FetchJSON = Callable[[str, float], dict[str, Any]]


class RealWorldService:
    def __init__(
        self,
        repo: Repository,
        engine: GardenEngine,
        *,
        weather_timeout_seconds: float = 10.0,
        fetch_json: FetchJSON | None = None,
    ):
        self.repo = repo
        self.engine = engine
        self.store = RealWorldStore(repo)
        self.weather_timeout_seconds = weather_timeout_seconds
        self.fetch_json = fetch_json or _fetch_json

    def ingest_sensor(self, reading: SensorReadingInput) -> dict[str, Any]:
        sensor = self.store.get_sensor(reading.sensor_id)
        if not sensor["active"]:
            raise RealWorldConflictError(f"sensor '{reading.sensor_id}' is inactive")
        event_type, semantic = _sensor_event(sensor["kind"])
        payload: dict[str, Any] = {
            "garden_id": sensor["garden_id"],
            "sensor_id": sensor["id"],
            "measurement": sensor["kind"],
            "unit": sensor["unit"],
            "value": reading.value,
            "metadata": reading.metadata,
        }
        payload[semantic] = reading.value
        if reading.forecast_rain_mm_24h is not None:
            payload["forecast_rain_mm_24h"] = reading.forecast_rain_mm_24h
        event = GardenEvent(
            type=event_type,
            zone_id=sensor["zone_id"],
            source=sensor["source"],
            observed_at=reading.observed_at,
            payload=payload,
        )
        result = self.engine.ingest(event)
        return {"sensor": sensor, "event": self.repo.get_event(event.id), "decision": result}

    def collect_weather(self, garden_id: str, *, now: datetime | None = None) -> dict[str, Any]:
        garden = self.store.get_garden(garden_id)
        fetched_at = (now or datetime.now(UTC)).astimezone(UTC)
        tick_end = fetched_at.replace(minute=0, second=0, microsecond=0)
        tick_start = tick_end - timedelta(hours=1)
        params = {
            "latitude": garden["latitude"],
            "longitude": garden["longitude"],
            "hourly": "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m",
            "daily": "sunrise,sunset",
            "timezone": "GMT",
            "timeformat": "unixtime",
            "past_days": 1,
            "forecast_days": 2,
        }
        data = self.fetch_json(
            f"{OPEN_METEO_URL}?{urlencode(params)}", self.weather_timeout_seconds
        )
        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        target = int(tick_end.timestamp())
        try:
            index = times.index(target)
        except ValueError as exc:
            raise WeatherUnavailableError(
                f"Open-Meteo response did not contain completed UTC hour {tick_end.isoformat()}"
            ) from exc

        values = {
            key: _at(hourly, key, index)
            for key in (
                "temperature_2m",
                "relative_humidity_2m",
                "precipitation",
                "cloud_cover",
                "wind_speed_10m",
            )
        }
        sunrise, sunset = _sun_times(data.get("daily") or {}, tick_end)
        values["sunrise_utc"] = sunrise
        values["sunset_utc"] = sunset
        units = dict(data.get("hourly_units") or {})
        units.update({"sunrise_utc": "iso8601 UTC", "sunset_utc": "iso8601 UTC"})
        decision = None
        with self.repo.transaction() as conn:
            interval, created = self.store.record_environment_interval(
                garden_id=garden_id,
                provider="open-meteo",
                model="auto",
                valid_start_utc=tick_start,
                valid_end_utc=tick_end,
                fetched_at_utc=fetched_at,
                source_status="forecast",
                values=values,
                units=units,
                connection=conn,
            )
            if created:
                event = GardenEvent(
                    type="weather.interval",
                    source="open-meteo",
                    observed_at=tick_end,
                    payload={
                        "garden_id": garden_id,
                        "environment_interval_id": interval["id"],
                        "provider": interval["provider"],
                        "model": interval["model"],
                        "revision": interval["revision"],
                        "valid_start_utc": interval["valid_start_utc"],
                        "valid_end_utc": interval["valid_end_utc"],
                        "fetched_at_utc": interval["fetched_at_utc"],
                        "source_status": interval["source_status"],
                        "values": values,
                        "units": units,
                    },
                )
                decision = self.engine.ingest(event, connection=conn)
        return {"created": created, "interval": interval, "decision": decision}


def build_realworld_router(service: RealWorldService) -> APIRouter:
    router = APIRouter(prefix="/real", tags=["real-world"])

    @router.post("/gardens", status_code=201)
    def create_garden(item: RealGardenInput) -> dict[str, Any]:
        return _api_call(lambda: service.store.create_garden(item))

    @router.get("/gardens")
    def list_gardens() -> list[dict[str, Any]]:
        return service.store.list_gardens()

    @router.get("/gardens/{garden_id}")
    def get_garden(garden_id: str) -> dict[str, Any]:
        return _api_call(lambda: service.store.get_garden(garden_id))

    @router.post("/zones", status_code=201)
    def create_zone(item: ZoneInput) -> dict[str, Any]:
        return _api_call(lambda: service.store.create_zone(item))

    @router.get("/gardens/{garden_id}/zones")
    def list_zones(garden_id: str) -> list[dict[str, Any]]:
        return _api_call(lambda: service.store.list_zones(garden_id))

    @router.post("/organisms", status_code=201)
    def create_organism(item: OrganismInput) -> dict[str, Any]:
        return _api_call(lambda: service.store.create_organism(item))

    @router.get("/gardens/{garden_id}/organisms")
    def list_organisms(garden_id: str) -> list[dict[str, Any]]:
        return _api_call(lambda: service.store.list_organisms(garden_id))

    @router.post("/sensors", status_code=201)
    def create_sensor(item: SensorInput) -> dict[str, Any]:
        return _api_call(lambda: service.store.create_sensor(item))

    @router.get("/gardens/{garden_id}/sensors")
    def list_sensors(garden_id: str) -> list[dict[str, Any]]:
        return _api_call(lambda: service.store.list_sensors(garden_id))

    @router.post("/sensor-readings", status_code=201)
    def sensor_reading(item: SensorReadingInput) -> dict[str, Any]:
        return _api_call(lambda: service.ingest_sensor(item))

    @router.post("/gardens/{garden_id}/weather/collect")
    def collect_weather(garden_id: str) -> dict[str, Any]:
        return _api_call(lambda: service.collect_weather(garden_id))

    @router.get("/gardens/{garden_id}/environment")
    def environment(
        garden_id: str,
        limit: int = Query(default=48, ge=1, le=500),
    ) -> list[dict[str, Any]]:
        return _api_call(lambda: service.store.list_environment(garden_id, limit=limit))

    return router


def _api_call(call: Callable[[], Any]) -> Any:
    try:
        return call()
    except RecordNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RecordExistsError, RealWorldConflictError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WeatherUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _sensor_event(kind: str) -> tuple[str, str]:
    return {
        "soil_moisture": ("sensor.soil_moisture", "percent"),
        "temperature": ("sensor.temperature", "celsius"),
        "humidity": ("sensor.humidity", "percent"),
        "light": ("sensor.light", "lux"),
        "rain_gauge": ("weather.rain", "mm"),
        "other": ("sensor.other", "value"),
    }[kind]


def _fetch_json(url: str, timeout: float) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": "Stillwild-Garden/0.1"})  # noqa: S310
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed HTTPS provider
            payload = response.read().decode("utf-8")
    except (OSError, URLError) as exc:
        raise WeatherUnavailableError(f"Open-Meteo request failed: {exc}") from exc
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise WeatherUnavailableError("Open-Meteo returned invalid JSON") from exc
    if not isinstance(data, dict) or data.get("error"):
        reason = data.get("reason") if isinstance(data, dict) else None
        raise WeatherUnavailableError(f"Open-Meteo returned an error: {reason or 'unknown error'}")
    return data


def _sun_times(daily: dict[str, Any], tick_end: datetime) -> tuple[str | None, str | None]:
    times = daily.get("time") or []
    sunrise = daily.get("sunrise") or []
    sunset = daily.get("sunset") or []
    for index, raw in enumerate(times):
        if datetime.fromtimestamp(int(raw), UTC).date() == tick_end.date():
            return _epoch_iso(_safe_index(sunrise, index)), _epoch_iso(_safe_index(sunset, index))
    return None, None


def _at(container: dict[str, Any], key: str, index: int) -> Any:
    values = container.get(key) or []
    value = _safe_index(values, index)
    if value is None:
        raise WeatherUnavailableError(f"Open-Meteo response omitted '{key}' for the target hour")
    return value


def _safe_index(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _epoch_iso(value: Any) -> str | None:
    return datetime.fromtimestamp(int(value), UTC).isoformat() if value is not None else None


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _now() -> str:
    return datetime.now(UTC).isoformat()
