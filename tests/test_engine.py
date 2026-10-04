import math
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from pydantic import ValidationError

from stillwild.db import Repository
from stillwild.domain import GardenEvent
from stillwild.engine import GardenEngine


def test_low_moisture_creates_human_review_recommendation(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo, automation_authority=False)

    result = engine.ingest(
        GardenEvent(
            type="sensor.soil_moisture",
            zone_id="bed-1",
            source="sensor-a",
            payload={"percent": 14, "forecast_rain_mm_24h": 0},
        )
    )

    assert result["decision"] == "PROPOSE"
    assert result["proposed_action"]["type"] == "irrigate"
    assert result["proposed_action"]["authority"] == "human_review"

    events = repo.list_events()
    assert len(events) == 1
    assert events[0]["zone_id"] == "bed-1"

    memory = repo.list_memories()
    assert any(item["key"] == "soil_moisture_state:bed-1" for item in memory)


def test_unknown_moisture_does_not_invent_value(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)

    result = engine.ingest(
        GardenEvent(
            type="sensor.soil_moisture",
            zone_id="bed-2",
            payload={"sensor_status": "online"},
        )
    )

    assert result["decision"] == "INVESTIGATE"
    assert result["proposed_action"] is None


def test_healthy_plant_does_not_trigger_intervention(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)

    result = engine.ingest(
        GardenEvent(
            type="plant.observation",
            zone_id="orchard",
            source="human",
            payload={"condition": "flowering", "plant_id": "lemon-1"},
        )
    )

    assert result["decision"] in {"WATCH", "NO_ACTION"}
    assert result["proposed_action"] is None


def test_outcomes_can_create_evolution_candidate(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)

    recommendation_ids = []
    for _ in range(5):
        result = engine.ingest(
            GardenEvent(
                type="sensor.soil_moisture",
                zone_id="bed-1",
                payload={"percent": 14, "forecast_rain_mm_24h": 0},
            )
        )
        recommendation_ids.append(result["recommendation_id"])

    for rec_id in recommendation_ids:
        repo.add_outcome(rec_id, "not useful", -0.5, None)

    created = engine.propose_agent_evolution()
    assert created
    candidates = repo.list_evolution_candidates()
    assert any(item["agent"] == "water" for item in candidates)


def test_scores_aggregate_outcomes_across_recommendations(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)
    recommendation_ids = [
        engine.ingest(
            GardenEvent(
                type="sensor.soil_moisture",
                payload={"percent": 14, "forecast_rain_mm_24h": 0},
            )
        )["recommendation_id"]
        for _ in range(5)
    ]

    for recommendation_id, utility_score in zip(
        recommendation_ids, [0.2, 0.4, 0.6, 0.8, 1.0], strict=True
    ):
        repo.add_outcome(recommendation_id, "useful", utility_score, None)

    water_score = next(score for score in repo.agent_scores() if score["agent"] == "water")
    assert water_score["n"] == 5
    assert water_score["avg_score"] == pytest.approx(0.6)


@pytest.mark.parametrize(
    ("payload", "event_type"),
    [
        ({"percent": False}, "sensor.soil_moisture"),
        ({"percent": -1}, "sensor.soil_moisture"),
        ({"percent": 101}, "sensor.soil_moisture"),
        ({"percent": math.nan}, "sensor.soil_moisture"),
        ({"forecast_rain_mm_24h": False}, "sensor.soil_moisture"),
        ({"forecast_rain_mm_24h": -1}, "sensor.soil_moisture"),
        ({"forecast_rain_mm_24h": math.inf}, "sensor.soil_moisture"),
    ],
)
def test_invalid_sensor_readings_are_rejected(payload, event_type):
    with pytest.raises(ValidationError):
        GardenEvent(type=event_type, payload=payload)


def test_missing_and_unknown_sensor_values_remain_extensible():
    missing = GardenEvent(type="sensor.soil_moisture")
    unknown = GardenEvent(type="custom.observation", payload={"percent": False})

    assert missing.payload == {}
    assert unknown.type == "custom.observation"


def test_ingest_rolls_back_event_when_processing_fails(tmp_path, monkeypatch):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)

    def fail_agent_run(*args, **kwargs):
        raise RuntimeError("processing failed")

    monkeypatch.setattr(repo, "add_agent_run", fail_agent_run)

    with pytest.raises(RuntimeError, match="processing failed"):
        engine.ingest(GardenEvent(type="wildlife.observation"))

    assert repo.list_events() == []


def test_connections_enforce_foreign_keys(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))

    with repo.connection() as conn:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO outcomes(id,recommendation_id,outcome,utility_score,created_at)
                VALUES ('outcome', 'missing-recommendation', 'unknown', 0, 'now')
                """
            )


def test_concurrent_memory_updates_preserve_all_evidence(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    barrier = Barrier(2)

    def update_memory(event_id):
        barrier.wait()
        repo.upsert_memory("shared", {"event_id": event_id}, 0.8, [event_id])

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(update_memory, ["event-1", "event-2"]))

    memory = repo.list_memories()[0]
    assert set(memory["evidence_event_ids"]) == {"event-1", "event-2"}
    assert memory["evidence_count"] == 2


def test_concurrent_candidate_checks_create_one_candidate(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    barrier = Barrier(2)

    def add_candidate():
        barrier.wait()
        return repo.add_evolution_candidate(
            agent="water",
            current_rule="current",
            evidence_problem="problem",
            proposed_rule="same",
            expected_improvement="improve",
            risk="risk",
            test_method="test",
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        candidate_ids = list(pool.map(lambda _: add_candidate(), range(2)))

    assert candidate_ids[0] == candidate_ids[1]
    assert len(repo.list_evolution_candidates()) == 1
