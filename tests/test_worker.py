import logging
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from stillwild import worker
from stillwild.background import run_due
from stillwild.config import Settings
from stillwild.db import Repository
from stillwild.engine import GardenEngine
from stillwild.realworld import WeatherUnavailableError


def test_restarted_worker_reuses_slot_and_keeps_source_label(tmp_path, monkeypatch):
    config = replace(Settings(), db_path=str(tmp_path / 'worker.db'), wild_sim=True)
    clock = datetime(2026, 10, 4, 10, tzinfo=UTC)
    monkeypatch.setattr(worker, 'settings', config)
    monkeypatch.setattr(
        worker, 'run_due',
        lambda repo, engine, settings, trigger: run_due(repo, engine, settings, trigger, clock),
    )

    class StopLoop(Exception):
        pass

    def stop_sleep(_):
        raise StopLoop

    monkeypatch.setattr(worker.time, 'sleep', stop_sleep)
    for _ in range(2):
        with pytest.raises(StopLoop):
            worker.work_forever()
    repo = Repository(config.db_path)
    assert repo.load_world('wild')['day'] == 1
    ticks = [e for e in repo.recent_events() if e['type'] == 'system.tick']
    assert len(ticks) == 1 and ticks[0]['source'] == config.worker_id
    assert {r['status'] for r in repo.list_background_runs()} == {'completed', 'duplicate'}


def test_schedule_conflict_quiesces_worker_without_repeated_receipts(
    tmp_path, monkeypatch, caplog,
):
    database = str(tmp_path / "conflict.db")
    pinned = replace(Settings(), db_path=database, tick_seconds=3600)
    repo = Repository(database)
    run_due(
        repo, GardenEngine(repo), pinned, "initial-worker",
        datetime(2026, 10, 4, 10, tzinfo=UTC),
    )
    runtime = replace(pinned, tick_seconds=300)
    monkeypatch.setattr(worker, "settings", runtime)
    sleeps = []

    class StopQuiescentWorker(Exception):
        pass

    def observe_sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 4:
            raise StopQuiescentWorker

    monkeypatch.setattr(worker.time, "sleep", observe_sleep)
    with caplog.at_level(logging.CRITICAL), pytest.raises(StopQuiescentWorker):
        worker.work_forever()

    runs = Repository(database).list_background_runs(limit=100)
    assert len(sleeps) == 4
    assert sum(run["status"] == "failed" for run in runs) == 1
    assert "quiescent" in caplog.text


def test_worker_weather_runs_only_after_committed_hour_boundaries(caplog):
    hour_end_ms = int(datetime(2026, 10, 5, 6, tzinfo=UTC).timestamp() * 1000)
    receipt = {
        "slots": [
            {"slot_end_ms": hour_end_ms + 5 * 60_000},
            {"slot_end_ms": hour_end_ms},
        ]
    }

    class Weather:
        def __init__(self):
            self.calls = []

        def collect_weather(self, garden_id, *, now):
            self.calls.append((garden_id, now))
            raise WeatherUnavailableError("provider unavailable")

    weather = Weather()

    with caplog.at_level(logging.WARNING):
        worker._collect_due_weather(weather, "darwin-test", receipt)

    assert weather.calls == [
        ("darwin-test", datetime(2026, 10, 5, 6, tzinfo=UTC))
    ]
    assert "provider unavailable" in caplog.text


def test_worker_collects_weather_after_run_due_and_keeps_committed_slot(
    tmp_path, monkeypatch, caplog,
):
    config = replace(
        Settings(),
        db_path=str(tmp_path / "weather-worker.db"),
        weather_collect=True,
        real_garden_id="darwin-test",
    )
    monkeypatch.setattr(worker, "settings", config)
    committed = False
    hour_end_ms = int(datetime(2026, 10, 5, 6, tzinfo=UTC).timestamp() * 1000)
    receipt = {"slots": [{"slot_end_ms": hour_end_ms}]}

    def run_due(*args, **kwargs):
        nonlocal committed
        assert kwargs["trigger"] == config.worker_id
        committed = True
        return receipt

    class Weather:
        def __init__(self, *args, **kwargs):
            pass

        def collect_weather(self, garden_id, *, now):
            assert committed
            assert garden_id == "darwin-test"
            raise WeatherUnavailableError("provider unavailable")

    class StopLoop(Exception):
        pass

    def stop_sleep(_):
        raise StopLoop

    monkeypatch.setattr(worker, "run_due", run_due)
    monkeypatch.setattr(worker, "RealWorldService", Weather)
    monkeypatch.setattr(worker.time, "sleep", stop_sleep)

    with caplog.at_level(logging.WARNING), pytest.raises(StopLoop):
        worker.work_forever()

    assert committed
    assert "provider unavailable" in caplog.text
