from stillwild.db import Repository
from stillwild.domain import GardenEvent
from stillwild.engine import GardenEngine


def _seed_scored_recommendations(repo: Repository, engine: GardenEngine, count: int) -> list[str]:
    """Ingest ``count`` events and resolve each recommendation, returning ids oldest-first.

    created_at is overwritten with a strictly increasing, lexically sortable timestamp so the
    recency window is deterministic regardless of wall-clock precision.
    """
    recommendation_ids: list[str] = []
    for index in range(count):
        result = engine.ingest(
            GardenEvent(
                type="plant.observation",
                zone_id="north-bed",
                source="human",
                payload={"condition": "dry", "n": index},
            )
        )
        recommendation_ids.append(result["recommendation_id"])

    with repo.connection() as conn:
        for index, recommendation_id in enumerate(recommendation_ids):
            conn.execute(
                "UPDATE recommendations SET created_at = ? WHERE id = ?",
                (f"2026-01-01T00:{index:02d}:00+00:00", recommendation_id),
            )

    # Oldest five score 0.0, the most recent twenty score 1.0.
    for index, recommendation_id in enumerate(recommendation_ids):
        utility = 0.0 if index < count - 20 else 1.0
        repo.add_outcome(recommendation_id, "useful", utility, f"evaluation {index}")

    return recommendation_ids


def test_agent_scores_honours_recency_window(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)
    _seed_scored_recommendations(repo, engine, count=25)

    windowed = repo.agent_scores(limit_per_agent=20)
    full = repo.agent_scores(limit_per_agent=100)

    assert windowed, "expected at least one scored agent"
    by_agent_full = {row["agent"]: row for row in full}

    for row in windowed:
        agent = row["agent"]
        # The window never counts more than its bound, and here every agent ran on all 25 events.
        assert row["n"] == 20, f"{agent} should be scored over its most recent 20 recommendations"
        # The most recent 20 all scored 1.0, so the windowed mean ignores the older 0.0 outcomes.
        assert row["avg_score"] == 1.0
        # Without the window the older low-utility outcomes drag the mean down to (20*1 + 5*0)/25.
        assert by_agent_full[agent]["n"] == 25
        assert abs(by_agent_full[agent]["avg_score"] - 0.8) < 1e-9


def test_agent_scores_default_window_is_bounded(tmp_path):
    repo = Repository(str(tmp_path / "garden.db"))
    engine = GardenEngine(repo)
    _seed_scored_recommendations(repo, engine, count=25)

    for row in repo.agent_scores():
        assert row["n"] <= 20, "the default window must bound each agent to 20 recommendations"
