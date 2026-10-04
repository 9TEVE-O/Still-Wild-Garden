
import os
import tempfile

os.environ["STILLWILD_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "api.db")

from fastapi.testclient import TestClient  # noqa: E402

from stillwild.api import app  # noqa: E402


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_event_ingest_and_state():
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
