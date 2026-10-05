from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Event
from time import sleep

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
    assert service.store.list_organisms("darwin-test")[0]["id"] == "lemon-1"
    assert sensor["zone_id"] == "north-bed"
    assert result["decision"]["decision"] == "PROPOSE"
    events = repo.list_events()
    assert len(events) == 1
    assert events[0]["type"] == "sensor.soil_moisture"
    assert events[0]["payload"]["garden_id"] == "darwin-test"
    assert events[0]["payload"]["sensor_id"] == "soil-1"
    assert events[0]["payload"]["percent"] == 14
    assert repo.claim_world("wild", {"revision": 0}) is False


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


def test_registry_write_and_world_claim_cannot_commit_together(tmp_path, monkeypatch):
    repo, service = _service(tmp_path)
    guard_passed = Event()
    finish_write = Event()
    original_guard = service.store.assert_real_database

    def pause_after_guard(connection=None):
        assert connection is not None and connection.in_transaction
        original_guard(connection=connection)
        guard_passed.set()
        assert finish_write.wait(timeout=5)

    monkeypatch.setattr(service.store, "assert_real_database", pause_after_guard)
    item = RealGardenInput(
        id="darwin-test",
        name="Darwin test garden",
        latitude=-12.4634,
        longitude=130.8456,
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        write = executor.submit(service.store.create_garden, item)
        assert guard_passed.wait(timeout=5)

        claim_started = Event()

        def claim_world():
            claim_started.set()
            return repo.claim_world("wild", {"revision": 0})

        claim = executor.submit(claim_world)
        try:
            assert claim_started.wait(timeout=5)
            sleep(0.05)
            assert not claim.done()
        finally:
            finish_write.set()

        assert write.result(timeout=5)["id"] == "darwin-test"
        assert claim.result(timeout=5) is False

    assert repo.has_world() is False


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


def test_weather_archive_and_event_rollback_then_retry_and_revise(tmp_path, monkeypatch):
    now = datetime(2026, 10, 5, 5, 31, tzinfo=UTC)
    tick_end = now.replace(minute=0, second=0, microsecond=0)
    midnight = tick_end.replace(hour=0)
    provider_data = {
        "temperature_2m": [29.1],
        "relative_humidity_2m": [68],
        "precipitation": [0.4],
        "cloud_cover": [37],
        "wind_speed_10m": [12.5],
    }

    def fake_fetch(url, timeout):
        return {
            "hourly": {"time": [int(tick_end.timestamp())], **provider_data},
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
    original_ingest = service.engine.ingest

    def fail_ingest(event, connection=None):
        assert event.type == "weather.interval"
        assert connection is not None and connection.in_transaction
        raise RuntimeError("ledger unavailable")

    monkeypatch.setattr(service.engine, "ingest", fail_ingest)
    with pytest.raises(RuntimeError, match="ledger unavailable"):
        service.collect_weather("darwin-test", now=now)

    assert service.store.list_environment("darwin-test") == []
    assert repo.list_events() == []

    monkeypatch.setattr(service.engine, "ingest", original_ingest)
    first = service.collect_weather("darwin-test", now=now)
    repeated = service.collect_weather("darwin-test", now=now)
    assert first["created"] is True
    assert first["interval"]["revision"] == 1
    assert repeated["created"] is False
    assert len(service.store.list_environment("darwin-test")) == 1
    assert len(repo.list_events()) == 1

    provider_data["temperature_2m"] = [30.2]
    revised = service.collect_weather("darwin-test", now=now)
    events = repo.list_events()
    assert revised["created"] is True
    assert revised["interval"]["revision"] == 2
    assert len(service.store.list_environment("darwin-test")) == 2
    assert [event["type"] for event in events] == ["weather.interval", "weather.interval"]
    assert [event["payload"]["revision"] for event in events] == [1, 2]
    assert [
        event["payload"]["environment_interval_id"] for event in events
    ] == [row["id"] for row in reversed(service.store.list_environment("darwin-test"))]


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
