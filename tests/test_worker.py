from types import SimpleNamespace

import pytest

from stillwild import worker


def test_worker_uses_unique_lease_token_and_keeps_source_label(monkeypatch):
    """Verify worker runs use distinct lease holders while retaining the configured event source."""
    holders = []
    sources = []

    class FakeRepository:
        def __init__(self, path):
            pass

        def try_acquire_lease(self, name, holder, ttl_seconds):
            holders.append(holder)
            return True

    class FakeEngine:
        def __init__(self, repo, automation_authority):
            pass

        def tick(self, source):
            sources.append(source)

    class StopLoop(Exception):
        pass

    def stop_sleep(_):
        raise StopLoop

    monkeypatch.setattr(worker, "Repository", FakeRepository)
    monkeypatch.setattr(worker, "GardenEngine", FakeEngine)
    monkeypatch.setattr(
        worker,
        "settings",
        SimpleNamespace(
            db_path="unused",
            automation_authority=False,
            tick_seconds=1,
            worker_id="worker-1",
            wild_sim=False,
        ),
    )
    monkeypatch.setattr(worker.time, "sleep", stop_sleep)

    for _ in range(2):
        with pytest.raises(StopLoop):
            worker.work_forever()

    assert len(set(holders)) == 2
    assert all(holder.startswith("worker-1:") for holder in holders)
    assert sources == ["worker-1", "worker-1"]
