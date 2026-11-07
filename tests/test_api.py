
from conftest import OPERATOR_HEADERS
from fastapi.testclient import TestClient

from stillwild import api
from stillwild.db import Repository
from stillwild.engine import GardenEngine


def make_client(tmp_path) -> TestClient:
    api.repo = Repository(str(tmp_path / "api.db"))
    api.engine = GardenEngine(api.repo, automation_authority=False)
    return TestClient(api.app, headers=OPERATOR_HEADERS)


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


def test_duplicate_event_returns_conflict(tmp_path):
    client = make_client(tmp_path)
    event = {"id": "same-event", "type": "wildlife.observation"}
    assert client.post("/events", json=event).status_code == 201
    assert client.post("/events", json=event).status_code == 409


def test_processing_integrity_failure_is_not_a_conflict(tmp_path, monkeypatch):
    import sqlite3

    make_client(tmp_path)

    def fail(*args, **kwargs):
        raise sqlite3.IntegrityError("UNIQUE constraint failed: events.id")

    monkeypatch.setattr(api.engine, "process", fail)
    with TestClient(api.app, headers=OPERATOR_HEADERS, raise_server_exceptions=False) as client:
        assert client.post("/events", json={"type": "wildlife.observation"}).status_code == 500
    assert api.repo.list_events() == []
