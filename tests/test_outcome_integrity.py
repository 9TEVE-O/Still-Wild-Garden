import pytest
from conftest import OPERATOR_HEADERS
from fastapi.testclient import TestClient

from stillwild import api
from stillwild.db import Repository
from stillwild.domain import GardenEvent
from stillwild.engine import GardenEngine


def test_recommendation_accepts_only_one_outcome(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)
    result = engine.ingest(
        GardenEvent(
            type="wildlife.observation",
            zone_id="pond",
            source="human",
            payload={"taxon": "dragonfly"},
        )
    )
    recommendation_id = result["recommendation_id"]

    repo.add_outcome(recommendation_id, "useful", 0.8, "first evaluation")

    with pytest.raises(ValueError, match="already resolved"):
        repo.add_outcome(recommendation_id, "duplicate", -1, "retry")

    scores = repo.agent_scores()
    assert scores
    assert all(score["n"] == 1 for score in scores)


def test_duplicate_outcome_returns_http_conflict(tmp_path):
    api.repo = Repository(str(tmp_path / "api.db"))
    api.engine = GardenEngine(api.repo, automation_authority=False)
    client = TestClient(api.app, headers=OPERATOR_HEADERS)

    event = client.post(
        "/events",
        json={
            "type": "plant.observation",
            "zone_id": "north-bed",
            "source": "human",
            "payload": {"condition": "stable"},
        },
    )
    assert event.status_code == 201
    recommendation_id = event.json()["recommendation_id"]
    payload = {
        "recommendation_id": recommendation_id,
        "outcome": "useful",
        "utility_score": 0.5,
        "notes": "observed later",
    }

    first = client.post("/outcomes", json=payload)
    duplicate = client.post("/outcomes", json=payload)

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "recommendation already resolved"
