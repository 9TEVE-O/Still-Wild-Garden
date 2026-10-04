
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from .config import settings
from .db import Repository
from .domain import ExperimentInput, GardenEvent, OutcomeInput, StateSnapshot
from .engine import GardenEngine

repo = Repository(settings.db_path)
engine = GardenEngine(repo, automation_authority=settings.automation_authority)

app = FastAPI(
    title="Stillwild Garden",
    version="0.1.0",
    description="Persistent ecological garden state, agents, experiments, memory and SSE events.",
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "automation_authority": settings.automation_authority,
        "db_path": settings.db_path,
    }


@app.post("/events", status_code=201)
def ingest_event(event: GardenEvent) -> dict:
    return engine.ingest(event)


@app.get("/events")
def list_events(
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[dict]:
    return repo.list_events(after=after, limit=limit)


@app.get("/state", response_model=StateSnapshot)
def state() -> StateSnapshot:
    return StateSnapshot(
        recent_events=repo.recent_events(50),
        memories=repo.list_memories(100),
        recommendations=repo.list_recommendations(50),
        experiments=repo.list_experiments(50),
        evolution_candidates=repo.list_evolution_candidates(50),
    )


@app.post("/experiments", status_code=201)
def create_experiment(experiment: ExperimentInput) -> dict:
    experiment_id = repo.add_experiment(experiment)
    return {"id": experiment_id, "status": "active"}


@app.post("/outcomes", status_code=201)
def record_outcome(outcome: OutcomeInput) -> dict:
    try:
        outcome_id = repo.add_outcome(
            recommendation_id=outcome.recommendation_id,
            outcome=outcome.outcome,
            utility_score=outcome.utility_score,
            notes=outcome.notes,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="recommendation not found") from exc
    candidates = engine.propose_agent_evolution()
    return {"id": outcome_id, "evolution_candidates_created": candidates}


@app.post("/tasks/tick")
def tick() -> dict:
    # Suitable for an external cron/scheduler in environments where long-running
    # worker processes are unavailable.
    return engine.tick(source="api-cron")


@app.get("/stream")
async def stream(
    after: int = Query(default=0, ge=0),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    cursor = after
    if last_event_id:
        try:
            cursor = max(cursor, int(last_event_id))
        except ValueError:
            pass

    async def generate() -> AsyncIterator[str]:
        nonlocal cursor
        quiet_cycles = 0
        while True:
            items = await asyncio.to_thread(repo.list_events, after=cursor, limit=200)
            if items:
                quiet_cycles = 0
                for item in items:
                    cursor = int(item["seq"])
                    payload = json.dumps(item, separators=(",", ":"), sort_keys=True)
                    yield f"id: {cursor}\nevent: garden_event\ndata: {payload}\n\n"
            else:
                quiet_cycles += 1
                if quiet_cycles >= max(1, int(15 / settings.sse_poll_seconds)):
                    quiet_cycles = 0
                    yield ": keepalive\n\n"
            await asyncio.sleep(settings.sse_poll_seconds)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def run() -> None:
    import uvicorn

    uvicorn.run("stillwild.api:app", host="0.0.0.0", port=8000, reload=False)
