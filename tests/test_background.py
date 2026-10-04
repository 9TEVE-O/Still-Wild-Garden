from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from conftest import OPERATOR_HEADERS, OPERATOR_TOKEN, TASK_HEADERS
from fastapi.testclient import TestClient

from stillwild import api
from stillwild.background import ScheduleConflict, run_due
from stillwild.config import Settings
from stillwild.db import Repository
from stillwild.engine import GardenEngine
from stillwild.wild import LEASE, Wild, WildBusyError

BASELINE = datetime(2026, 10, 4, 10, tzinfo=UTC)


def setup_garden(tmp_path, **changes):
    repo = Repository(str(tmp_path / "isolated-background.db"))
    engine = GardenEngine(repo)
    config = replace(Settings(), tick_seconds=3600, wild_sim=True, **changes)
    return repo, engine, config


def table_counts(repo):
    with repo.connection() as conn:
        return {name: conn.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
                for name in ("worlds", "events", "outcomes", "recommendations",
                             "background_ticks", "evolution_candidates")}


def test_cron_and_worker_share_one_committed_slot(tmp_path):
    repo, engine, config = setup_garden(tmp_path)
    first = run_due(repo, engine, config, "worker-1", BASELINE)
    counts = table_counts(repo)
    duplicate = run_due(repo, engine, config, "api-cron", BASELINE + timedelta(minutes=2))
    assert first["committed_slots"] == 1
    assert duplicate["committed_slots"] == 0
    assert duplicate["duplicate_of"] == first["run_id"]
    assert table_counts(repo) == counts
    assert repo.load_world("wild")["day"] == 1
    assert {r["status"] for r in repo.list_background_runs()} == {"completed", "duplicate"}


def test_concurrent_schedulers_do_not_duplicate_growth(tmp_path):
    repo, engine, config = setup_garden(tmp_path)
    barrier = Barrier(4)

    def call(index):
        barrier.wait()
        return run_due(repo, engine, config, f"worker-{index}", BASELINE)

    with ThreadPoolExecutor(max_workers=4) as pool:
        receipts = list(pool.map(call, range(4)))
    assert sum(r["committed_slots"] for r in receipts) == 1
    assert repo.load_world("wild")["day"] == 1
    assert table_counts(repo)["background_ticks"] == 1
    assert len([e for e in repo.recent_events() if e["type"] == "system.tick"]) == 1


def test_restart_catches_up_in_bounded_batches(tmp_path):
    repo, engine, config = setup_garden(tmp_path, catch_up_limit=2)
    run_due(repo, engine, config, "worker", BASELINE)
    origin = repo.load_world("wild")
    repo = Repository(repo.path)  # A fresh process uses the existing cursor.
    engine = GardenEngine(repo)
    later = BASELINE + timedelta(hours=5)
    batches = [run_due(repo, engine, config, "restarted-worker", later) for _ in range(3)]
    assert [b["committed_slots"] for b in batches] == [2, 2, 1]
    assert [b["backlog_slots"] for b in batches] == [3, 1, 0]
    world = repo.load_world("wild")
    assert world["day"] == 6
    assert world["seed"] == origin["seed"] and world["start"] == origin["start"]


def test_exception_rolls_back_the_whole_batch_and_retry_resumes(tmp_path, monkeypatch):
    repo, engine, config = setup_garden(tmp_path, wild_days_per_tick=2)
    step = Wild._step

    def fail_on_second_day(self, state):
        if state["day"] == 1:
            raise RuntimeError("injected interruption")
        return step(self, state)

    monkeypatch.setattr(Wild, "_step", fail_on_second_day)
    with pytest.raises(RuntimeError, match="injected"):
        run_due(repo, engine, config, "worker", BASELINE)
    assert not any(table_counts(repo).values())
    assert repo.list_background_runs()[0]["status"] == "failed"
    monkeypatch.setattr(Wild, "_step", step)
    receipt = run_due(repo, engine, config, "worker", BASELINE)
    assert receipt["wild"]["day"] == 2
    assert table_counts(repo)["background_ticks"] == 1


def test_process_exit_leaves_started_attempt_but_no_committed_progress(tmp_path, monkeypatch):
    repo, engine, config = setup_garden(tmp_path)
    step = Wild._step

    def terminate(self, state):
        raise SystemExit("injected process exit")

    monkeypatch.setattr(Wild, "_step", terminate)
    with pytest.raises(SystemExit):
        run_due(repo, engine, config, "worker", BASELINE)
    assert not any(table_counts(repo).values())
    assert repo.list_background_runs()[0]["status"] == "started"
    monkeypatch.setattr(Wild, "_step", step)
    assert run_due(repo, engine, config, "worker", BASELINE)["wild"]["day"] == 1


def test_receipt_failure_cannot_leave_unrecorded_growth(tmp_path, monkeypatch):
    repo, engine, config = setup_garden(tmp_path)
    finish = repo.finish_background_run

    def interrupted_finish(*args, **kwargs):
        if kwargs.get("connection") is not None:
            raise RuntimeError("receipt unavailable")
        return finish(*args, **kwargs)

    monkeypatch.setattr(repo, "finish_background_run", interrupted_finish)
    with pytest.raises(RuntimeError, match="receipt unavailable"):
        run_due(repo, engine, config, "worker", BASELINE)
    assert not any(table_counts(repo).values())
    assert repo.list_background_runs()[0]["status"] == "failed"


def test_manual_advance_lease_blocks_schedule_without_partial_tick(tmp_path):
    repo, engine, config = setup_garden(tmp_path)
    assert repo.try_acquire_lease(LEASE, "manual-holder", 60)
    with pytest.raises(WildBusyError):
        run_due(repo, engine, config, "worker", BASELINE)
    assert not any(table_counts(repo).values())
    repo.release_lease(LEASE, "manual-holder")
    assert run_due(repo, engine, config, "worker", BASELINE)["wild"]["day"] == 1


def test_schedule_settings_cannot_silently_change(tmp_path):
    repo, engine, config = setup_garden(tmp_path)
    run_due(repo, engine, config, "worker", BASELINE)
    before = repo.load_world("wild")
    with pytest.raises(ScheduleConflict):
        run_due(repo, engine, replace(config, tick_seconds=300), "worker", BASELINE)
    assert repo.load_world("wild") == before
    assert repo.list_background_runs()[0]["status"] == "failed"


def test_scheduled_days_can_judge_advice_in_the_same_transaction(tmp_path):
    repo, engine, config = setup_garden(tmp_path, wild_days_per_tick=7)
    run_due(repo, engine, config, "worker", BASELINE)
    # Give the judge a known pending drought recommendation, rather than depending
    # on whether the seeded spring happens to become dry enough to produce advice.
    wild = Wild(repo, engine, seed=config.wild_seed)
    state = repo.load_world("wild")
    event = wild._event(state, "sensor.soil_moisture", "south-meadow",
                        {"percent": 9.0, "forecast_rain_mm_24h": 0.0})
    with repo.transaction() as conn:
        advice = engine.ingest(event, connection=conn)
        assert advice["decision"] == "PROPOSE"
        wild._register(state, event, advice)
        wild._save(state, conn)
    receipt = run_due(repo, engine, config, "worker", BASELINE + timedelta(hours=6))
    assert receipt["wild"]["day"] == 49
    assert advice["recommendation_id"] in repo.outcomes_for([advice["recommendation_id"]])


def test_reads_do_not_create_progress_or_receipts(tmp_path, monkeypatch):
    repo, engine, config = setup_garden(tmp_path)
    receipt = run_due(repo, engine, config, "worker", BASELINE)
    monkeypatch.setattr(api, "repo", repo)
    monkeypatch.setattr(api, "engine", engine)
    client = TestClient(api.app)
    before = table_counts(repo), repo.load_world("wild"), repo.list_background_runs()
    for path in ("/health", "/garden", "/wild", "/state", "/events"):
        assert client.get(path).status_code == 200
    runs = client.get("/tasks/runs", headers=OPERATOR_HEADERS)
    assert runs.status_code == 200 and runs.json()[0]["id"] == receipt["run_id"]
    assert (table_counts(repo), repo.load_world("wild"), repo.list_background_runs()) == before


@pytest.mark.parametrize("path", [
    "/events", "/experiments", "/outcomes", "/wild/advance", "/tasks/tick",
])
def test_anonymous_mutations_are_rejected_without_progress(tmp_path, monkeypatch, path):
    repo, engine, _ = setup_garden(tmp_path)
    monkeypatch.setattr(api, "repo", repo)
    monkeypatch.setattr(api, "engine", engine)
    client = TestClient(api.app)
    response = client.post(path, json={})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert not any(table_counts(repo).values())
    assert repo.list_background_runs() == []


def test_scheduler_key_has_no_operator_authority(tmp_path, monkeypatch):
    repo, engine, _ = setup_garden(tmp_path)
    monkeypatch.setattr(api, "repo", repo)
    monkeypatch.setattr(api, "engine", engine)
    client = TestClient(api.app, headers=TASK_HEADERS)
    for path in ("/events", "/experiments", "/outcomes", "/wild/advance"):
        assert client.post(path, json={}).status_code == 401
    assert client.get("/tasks/runs").status_code == 401
    assert client.post("/tasks/tick", headers=OPERATOR_HEADERS).status_code == 401
    assert not any(table_counts(repo).values())


@pytest.mark.parametrize("tokens", [
    {"operator_token": "", "task_token": ""},
    {"operator_token": "short", "task_token": "short-too"},
    {"operator_token": OPERATOR_TOKEN, "task_token": OPERATOR_TOKEN},
])
def test_unconfigured_or_shared_credentials_disable_writes(tmp_path, monkeypatch, tokens):
    repo, engine, _ = setup_garden(tmp_path)
    monkeypatch.setattr(api, "repo", repo)
    monkeypatch.setattr(api, "engine", engine)
    monkeypatch.setattr(api, "settings", replace(api.settings, **tokens))
    client = TestClient(api.app, headers=OPERATOR_HEADERS)
    assert client.post("/wild/advance").status_code == 503
    assert client.post("/tasks/tick").status_code == 503
    assert not any(table_counts(repo).values())


@pytest.mark.parametrize("changes", [
    {"tick_seconds": 0}, {"tick_seconds": 86401}, {"sse_poll_seconds": 0},
    {"catch_up_limit": 0}, {"catch_up_limit": 25}, {"wild_days_per_tick": 8},
])
def test_invalid_schedule_configuration_is_rejected(changes):
    with pytest.raises(ValueError):
        replace(Settings(), **changes)
