
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
