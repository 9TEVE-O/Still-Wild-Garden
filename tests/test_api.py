
from fastapi.testclient import TestClient

import stillwild.api as api
from stillwild.db import Repository
from stillwild.engine import GardenEngine


def make_client(tmp_path) -> TestClient:
    api.repo = Repository(str(tmp_path / "api.db"))
    api.engine = GardenEngine(api.repo, automation_authority=False)
    return TestClient(api.app)


def test_health(tmp_path):
    client = make_client(tmp_path)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_event_ingest_and_state(tmp_path):
    client = make_client(tmp_path)
    response = client.post(
        "/events",
        json={
            "type": "wildlife.observation",
            "zone_id": "pond",
            "source": "human",
            "payload": {"taxon": "dragonfly"},
        },
    )
    assert response.status_code == 201
    event_id = response.json()["event_id"]

    state = client.get("/state")
    assert state.status_code == 200
    body = state.json()
    assert any(item["id"] == event_id for item in body["recent_events"])
