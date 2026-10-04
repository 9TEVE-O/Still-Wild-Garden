from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from stillwild import api, worker
from stillwild.config import settings
from stillwild.db import Repository
from stillwild.domain import GardenEvent
from stillwild.engine import GardenEngine, SimulatedGardenError, is_real_observation
from stillwild.wild import LEASE, SOURCE, RealGardenError, Wild, WildBusyError


def make_wild(tmp_path, name="wild.db", seed=7):
    repo = Repository(str(tmp_path / name))
    engine = GardenEngine(repo)
    return repo, engine, Wild(repo, engine, seed=seed)


def test_wild_grows_through_spring_with_only_simulated_events(tmp_path):
    repo, _, wild = make_wild(tmp_path)

    summary = wild.advance(100)

    assert summary["day"] == 100
    assert summary["date"] == "2027-06-09"
    assert summary["events"] > 300
    events = repo.list_events(limit=1000)
    assert events
    assert all(event["source"] == SOURCE for event in events)
    assert all(event["payload"]["simulated"] is True for event in events)
    types = {event["type"] for event in events}
    assert {"sensor.soil_moisture", "sensor.temperature", "plant.observation",
            "wildlife.observation"} <= types
    assert not repo.has_real_observations()

    snapshot = wild.snapshot()
    assert snapshot["simulated"] is True
    assert len(snapshot["zones"]) == 5
    assert snapshot["metrics"]["plant_species"] >= 8
    assert snapshot["wildlife"], "spring flowers should have drawn in wildlife"
    assert any(
        plant["stage"] == "flowering" for zone in snapshot["zones"] for plant in zone["plants"]
    )
    assert snapshot["history"] and snapshot["journal"]
    assert any(item["key"].startswith("taxon_record:wildlife:") for item in repo.list_memories())


def test_wild_is_deterministic_however_days_are_batched(tmp_path):
    repo_a, _, wild_a = make_wild(tmp_path, "a.db", seed=3)
    repo_b, _, wild_b = make_wild(tmp_path, "b.db", seed=3)

    wild_a.advance(30)
    for _ in range(3):
        wild_b.advance(10)

    a, b = repo_a.load_world("wild"), repo_b.load_world("wild")
    for key in ("day", "weather", "tomorrow", "zones", "wildlife", "rain_total", "history"):
        assert a[key] == b[key], key


def test_different_seeds_grow_different_gardens(tmp_path):
    repo_a, _, wild_a = make_wild(tmp_path, "a.db", seed=1)
    repo_b, _, wild_b = make_wild(tmp_path, "b.db", seed=2)
    wild_a.advance(20)
    wild_b.advance(20)
    assert repo_a.load_world("wild")["zones"] != repo_b.load_world("wild")["zones"]


def test_wild_refuses_to_mix_with_real_observations(tmp_path):
    repo, engine, wild = make_wild(tmp_path)
    engine.ingest(GardenEvent(type="wildlife.observation", zone_id="pond", source="human",
                              payload={"taxon": "heron"}))

    with pytest.raises(RealGardenError):
        wild.advance(1)

    assert repo.load_world("wild") is None
    assert repo.try_acquire_lease(LEASE, "someone-else", ttl_seconds=60), "lease was released"


def test_periodic_ticks_do_not_count_as_real_observations(tmp_path):
    repo, engine, wild = make_wild(tmp_path)
    engine.tick(source="worker-1")
    wild.advance(1)
    assert repo.load_world("wild")["day"] == 1


def test_wild_will_not_advance_concurrently(tmp_path):
    repo, _, wild = make_wild(tmp_path)
    assert repo.try_acquire_lease(LEASE, "other-process", ttl_seconds=60)
    with pytest.raises(WildBusyError):
        wild.advance(1)


def _dry_reading(wild, state, zone="south-meadow"):
    event = wild._event(state, "sensor.soil_moisture", zone,
                        {"percent": 9.0, "forecast_rain_mm_24h": 0.0})
    result = wild.engine.ingest(event)
    assert result["decision"] == "PROPOSE"
    wild._register(state, event, result)
    return result["recommendation_id"]


def test_irrigation_advice_is_judged_against_simulated_ground_truth(tmp_path):
    repo, _, wild = make_wild(tmp_path)
    state = wild._new_world()
    justified = _dry_reading(wild, state)
    unnecessary = _dry_reading(wild, state, zone="north-bed")

    state["day"] += 3
    state["zones"]["south-meadow"]["damage_total"] += 0.2
    state["rain_total"] += 12.0
    assert wild._judge(state) == 2

    recommendations = {item["id"]: item for item in repo.list_recommendations()}
    assert recommendations[justified]["status"] == "resolved"
    assert recommendations[unnecessary]["status"] == "resolved"
    with repo.connection() as conn:
        rows = dict(conn.execute(
            "SELECT recommendation_id, utility_score FROM outcomes"
        ).fetchall())
    assert rows[justified] == pytest.approx(0.6)
    assert rows[unnecessary] == pytest.approx(-0.4)
    assert state["judgements"]["resolved"] == 2
    assert state["judgements"]["pending"] == []


def test_judging_skips_recommendations_already_resolved_by_a_human(tmp_path):
    repo, _, wild = make_wild(tmp_path)
    state = wild._new_world()
    recommendation_id = _dry_reading(wild, state)
    repo.add_outcome(recommendation_id, "watered by hand", 0.5, "human")

    state["day"] += 3
    assert wild._judge(state) == 0
    assert state["judgements"]["resolved"] == 0


def test_repeated_poor_advice_raises_evolution_candidates(tmp_path):
    _, _, wild = make_wild(tmp_path)
    state = wild._new_world()
    for _ in range(5):
        _dry_reading(wild, state)
    state["day"] += 3
    state["rain_total"] += 20.0  # rain arrived every time: irrigation was never needed

    assert wild._judge(state) == 5
    created = wild._evolve(state)

    agents = {item["agent"] for item in created}
    assert "water" in agents
    assert any(note["kind"] == "evolution" for note in state["journal"])
    assert wild._evolve(state) == [], "already-seen candidates are not journaled twice"


def make_client(tmp_path, monkeypatch, wild_sim):
    api.repo = Repository(str(tmp_path / "api.db"))
    api.engine = GardenEngine(api.repo, automation_authority=False)
    monkeypatch.setattr(api, "settings", replace(settings, wild_sim=wild_sim, wild_seed=7))
    return TestClient(api.app)


def test_wild_api_is_disabled_by_default(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=False)
    assert client.get("/wild").status_code == 404
    assert client.post("/wild/advance?days=5").status_code == 403
    assert api.repo.list_events() == []


def test_wild_api_advances_and_reports_the_garden(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=True)

    grown = client.post("/wild/advance?days=10")
    assert grown.status_code == 200
    assert grown.json()["day"] == 10

    body = client.get("/wild").json()
    assert body["day"] == 10
    assert body["latest_seq"] > 0
    assert {zone["id"] for zone in body["zones"]} == {
        "hedgerow", "north-bed", "woodland-edge", "south-meadow", "pond-edge"
    }
    assert client.post("/wild/advance?days=0").status_code == 422


def test_wild_api_refuses_a_real_garden(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=True)
    client.post("/events", json={"type": "plant.observation", "zone_id": "bed",
                                 "payload": {"condition": "thriving"}})
    response = client.post("/wild/advance?days=1")
    assert response.status_code == 409
    assert "real garden observations" in response.json()["detail"]


def test_garden_page_is_served(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=False)
    response = client.get("/garden")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Stillwild" in response.text and "EventSource" in response.text


def test_worker_stops_simulating_when_garden_is_real(monkeypatch):
    class RealWild:
        def advance(self, days):
            raise RealGardenError("real")

    class BusyWild:
        def advance(self, days):
            raise WildBusyError("busy")

    assert worker._grow_wild(RealWild()) is None
    busy = BusyWild()
    assert worker._grow_wild(busy) is busy


def test_real_observation_cannot_slip_in_while_the_wild_advances(tmp_path):
    repo, engine, wild = make_wild(tmp_path)
    original_step = wild._step
    attempts = []

    def step_with_intruder(state):
        if state["day"] == 2:
            try:
                engine.ingest(GardenEvent(type="plant.observation", zone_id="bed", source="human",
                                          payload={"condition": "thriving"}))
                attempts.append("accepted")
            except SimulatedGardenError:
                attempts.append("rejected")
        return original_step(state)

    wild._step = step_with_intruder
    wild.advance(5)

    assert attempts == ["rejected"]
    assert not repo.has_real_observations()
    engine.tick(source="worker-1")  # periodic ticks remain welcome


def test_world_claim_refuses_a_database_with_real_observations(tmp_path):
    repo, engine, wild = make_wild(tmp_path)
    engine.ingest(GardenEvent(type="sensor.temperature", source="sensor", payload={"celsius": 9}))
    assert repo.claim_world("wild", wild._new_world()) is False
    assert not repo.has_world()


@pytest.mark.parametrize(("flag", "real"), [(True, False), (1, True), ("true", True), (None, True)])
def test_python_and_sql_agree_on_what_is_real(tmp_path, flag, real):
    repo = Repository(str(tmp_path / "garden.db"))
    payload = {} if flag is None else {"simulated": flag}
    event = GardenEvent(type="plant.observation", source="x", payload=payload)
    repo.add_event(event)
    assert is_real_observation(event) is real
    assert repo.has_real_observations() is real


def test_api_rejects_real_observations_in_a_simulated_garden(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=True)
    assert client.post("/wild/advance?days=1").status_code == 200

    response = client.post("/events", json={"type": "wildlife.observation", "zone_id": "pond",
                                            "payload": {"taxon": "heron"}})
    assert response.status_code == 409
    assert "simulated garden" in response.json()["detail"]
    assert not api.repo.has_real_observations()
    assert client.post("/tasks/tick").status_code == 200


@pytest.mark.parametrize(
    ("source", "payload"),
    [("human", {"taxon": "heron", "simulated": True}),
     ("human", {"taxon": "heron", "simulated": False}),
     ("wild-sim", {"taxon": "heron"})],
)
def test_public_events_cannot_claim_to_be_simulated(tmp_path, monkeypatch, source, payload):
    client = make_client(tmp_path, monkeypatch, wild_sim=True)
    assert client.post("/wild/advance?days=1").status_code == 200
    before = len(api.repo.list_events(limit=1000))

    response = client.post("/events", json={"type": "wildlife.observation", "zone_id": "pond",
                                            "source": source, "payload": payload})

    assert response.status_code == 422
    assert "reserved" in response.json()["detail"]
    assert len(api.repo.list_events(limit=1000)) == before


def test_public_simulated_flag_cannot_prepare_a_real_garden_for_the_wild(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=True)
    response = client.post("/events", json={"type": "plant.observation", "zone_id": "bed",
                                            "payload": {"condition": "stable", "simulated": True}})
    assert response.status_code == 422
    assert api.repo.list_events() == []


def test_cron_tick_grows_the_wild_like_the_worker(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=True)
    monkeypatch.setattr(api, "settings", replace(api.settings, wild_days_per_tick=3))

    first = client.post("/tasks/tick").json()
    second = client.post("/tasks/tick").json()

    assert first["wild"]["day"] == 3
    assert second["wild"]["day"] == 6
    assert api.repo.load_world("wild")["day"] == 6


def test_cron_tick_leaves_the_wild_alone_when_disabled_or_real(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, wild_sim=False)
    assert "wild" not in client.post("/tasks/tick").json()
    assert api.repo.load_world("wild") is None

    monkeypatch.setattr(api, "settings", replace(api.settings, wild_sim=True))
    client.post("/events", json={"type": "plant.observation", "zone_id": "bed",
                                 "payload": {"condition": "stable"}})
    response = client.post("/tasks/tick")
    assert response.status_code == 200
    assert "real garden observations" in response.json()["wild"]["skipped"]
    assert api.repo.load_world("wild") is None


def _events_on_day(repo, day):
    return [event for event in repo.list_events(limit=1000)
            if event["payload"].get("sim_day") == day]


def test_an_interrupted_day_rolls_back_and_resumes_without_duplicates(tmp_path):
    repo, engine, wild = make_wild(tmp_path, "interrupted.db")
    reference_repo, _, reference = make_wild(tmp_path, "reference.db")
    reference.advance(3)
    wild.advance(2)

    original_ingest = engine.ingest
    seen = []

    def power_cut(event, *args, **kwargs):
        if event.payload.get("sim_day") == 3:
            seen.append(event.id)
            if len(seen) == 4:
                raise RuntimeError("power cut")
        return original_ingest(event, *args, **kwargs)

    engine.ingest = power_cut
    with pytest.raises(RuntimeError):
        wild.advance(1)
    assert repo.load_world("wild")["day"] == 2
    assert _events_on_day(repo, 3) == []

    engine.ingest = original_ingest
    wild.advance(1)
    assert len(_events_on_day(repo, 3)) == len(_events_on_day(reference_repo, 3))
    assert repo.load_world("wild")["zones"] == reference_repo.load_world("wild")["zones"]
    assert repo.try_acquire_lease(LEASE, "next", ttl_seconds=60), "lease released after failure"


def test_an_advance_that_loses_its_lease_stops_without_saving(tmp_path):
    repo, _, wild = make_wild(tmp_path)
    original_step = wild._step

    def step_while_another_process_takes_over(state):
        if state["day"] == 2:  # about to simulate day 3
            with repo.connection() as conn:
                conn.execute(
                    "UPDATE leases SET holder = 'other', expires_at = '2999-01-01T00:00:00+00:00'"
                )
        return original_step(state)

    wild._step = step_while_another_process_takes_over
    with pytest.raises(WildBusyError, match="took over"):
        wild.advance(5)

    assert repo.load_world("wild")["day"] == 2
    assert _events_on_day(repo, 3) == []


def test_a_stale_advance_cannot_commit_after_its_lease_was_reused(tmp_path):
    repo, engine, stale = make_wild(tmp_path)
    successor = Wild(repo, engine, seed=7)
    original_step = stale._step

    def suspended_past_the_lease(state):
        if state["day"] == 2:
            # The stale advance pauses past its lease; a successor takes over, advances and
            # releases the lease, deleting the only record that ownership changed.
            with repo.connection() as conn:
                conn.execute("UPDATE leases SET expires_at = '2000-01-01T00:00:00+00:00'")
            successor.advance(2)
        return original_step(state)

    stale._step = suspended_past_the_lease
    with pytest.raises(WildBusyError, match="changed since"):
        stale.advance(5)

    world = repo.load_world("wild")
    assert world["day"] == 4, "the successor's progress survives"
    temperatures = [event for event in repo.list_events(limit=1000)
                    if event["type"] == "sensor.temperature"]
    days = [event["payload"]["sim_day"] for event in temperatures]
    assert sorted(days) == [1, 2, 3, 4], "no simulated day was written twice"
