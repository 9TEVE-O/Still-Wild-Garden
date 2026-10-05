from datetime import UTC, datetime

import pytest

from stillwild.db import Repository
from stillwild.engine import GardenEngine
from stillwild.realworld import (
    OrganismInput,
    RealGardenInput,
    RealWorldConflictError,
    RealWorldService,
    SensorInput,
    SensorReadingInput,
    WeatherUnavailableError,
    ZoneInput,
)


def _service(tmp_path, fetch_json=None):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)
    return repo, RealWorldService(repo, engine, fetch_json=fetch_json)


def _register(service):
    service.store.create_garden(
        RealGardenInput(
            id="darwin-test",
            name="Darwin test garden",
            latitude=-12.4634,
            longitude=130.8456,
            climate="tropical savanna",
        )
    )
    service.store.create_zone(
        ZoneInput(
            id="north-bed",
            garden_id="darwin-test",
            name="North bed",
            exposure={"sun": "morning", "wind": "open"},
        )
    )


def test_real_registry_and_sensor_reading_feed_event_ledger(tmp_path):
    repo, service = _service(tmp_path)
    _register(service)
    organism = service.store.create_organism(
        OrganismInput(
            id="lemon-1",
            garden_id="darwin-test",
            zone_id="north-bed",
            kind="plant",
            common_name="Lemon",
            scientific_name="Citrus limon",
        )
    )
    sensor = service.store.create_sensor(
        SensorInput(
            id="soil-1",
            garden_id="darwin-test",
            zone_id="north-bed",
            kind="soil_moisture",
            unit="%",
            source="soil-probe-01",
        )
    )

    result = service.ingest_sensor(
        SensorReadingInput(sensor_id="soil-1", value=14, forecast_rain_mm_24h=0)
    )

    assert organism["scientific_name"] == "Citrus limon"
    assert sensor["zone_id"] == "north-bed"
    assert result["decision"]["decision"] == "PROPOSE"
    events = repo.list_events()
    assert len(events) == 1
    assert events[0]["type"] == "sensor.soil_moisture"
    assert events[0]["payload"]["garden_id"] == "darwin-test"
    assert events[0]["payload"]["sensor_id"] == "soil-1"
    assert events[0]["payload"]["percent"] == 14


def test_weather_collection_records_provenance_and_is_idempotent(tmp_path):
    now = datetime(2026, 10, 5, 5, 31, tzinfo=UTC)
    tick_end = now.replace(minute=0, second=0, microsecond=0)
    midnight = tick_end.replace(hour=0)

    def fake_fetch(url, timeout):
        assert "timezone=GMT" in url
        assert "timeformat=unixtime" in url
        assert timeout > 0
        return {
            "hourly": {
                "time": [int(tick_end.timestamp())],
                "temperature_2m": [29.1],
                "relative_humidity_2m": [68],
                "precipitation": [0.4],
                "cloud_cover": [37],
                "wind_speed_10m": [12.5],
            },
            "hourly_units": {
                "temperature_2m": "°C",
                "relative_humidity_2m": "%",
                "precipitation": "mm",
                "cloud_cover": "%",
                "wind_speed_10m": "km/h",
            },
            "daily": {
                "time": [int(midnight.timestamp())],
                "sunrise": [int(midnight.replace(hour=20).timestamp())],
                "sunset": [int(midnight.replace(hour=8).timestamp())],
            },
        }

    repo, service = _service(tmp_path, fetch_json=fake_fetch)
    _register(service)

    first = service.collect_weather("darwin-test", now=now)
    second = service.collect_weather("darwin-test", now=now)

    assert first["created"] is True
    assert second["created"] is False
    assert first["interval"]["provider"] == "open-meteo"
    assert first["interval"]["valid_end_utc"] == tick_end.isoformat()
    assert first["interval"]["values"]["precipitation"] == 0.4
    assert len(service.store.list_environment("darwin-test")) == 1
    assert [event["type"] for event in repo.list_events()] == ["weather.interval"]


def test_realworld_refuses_simulation_database(tmp_path):
    repo, service = _service(tmp_path)
    repo.save_world("wild", {"revision": 0})

    with pytest.raises(RealWorldConflictError, match="separate database"):
        service.store.create_garden(
            RealGardenInput(
                id="darwin-test",
                name="Darwin test garden",
                latitude=-12.4634,
                longitude=130.8456,
            )
        )


def test_weather_collection_requires_completed_target_hour(tmp_path):
    now = datetime(2026, 10, 5, 5, 31, tzinfo=UTC)
    future = now.replace(minute=0, second=0, microsecond=0).timestamp() + 3600

    def fake_fetch(url, timeout):
        return {
            "hourly": {
                "time": [int(future)],
                "temperature_2m": [29],
                "relative_humidity_2m": [70],
                "precipitation": [0],
                "cloud_cover": [20],
                "wind_speed_10m": [10],
            },
            "hourly_units": {},
            "daily": {"time": [], "sunrise": [], "sunset": []},
        }

    _, service = _service(tmp_path, fetch_json=fake_fetch)
    _register(service)

    with pytest.raises(WeatherUnavailableError, match="completed UTC hour"):
        service.collect_weather("darwin-test", now=now)
