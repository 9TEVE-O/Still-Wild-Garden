from dataclasses import replace
from datetime import UTC, datetime

import pytest

from stillwild import worker
from stillwild.background import run_due
from stillwild.config import Settings
from stillwild.db import Repository


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
