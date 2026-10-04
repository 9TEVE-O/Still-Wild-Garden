from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from importlib import resources

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse

from .config import settings
from .db import Repository
from .domain import ExperimentInput, GardenEvent, OutcomeInput, StateSnapshot
from .engine import GardenEngine, SimulatedGardenError
from .wild import SOURCE as WILD_SOURCE
from .wild import RealGardenError, Wild, WildBusyError

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
    # Events from the public API are always real observations. Only the in-process Wild may
    # mark an event as simulated, so clients cannot disguise real evidence as simulated.
    if "simulated" in event.payload or event.source == WILD_SOURCE:
        raise HTTPException(
            status_code=422,
            detail="The 'simulated' payload flag and the wild-sim source are reserved for the "
            "in-process Wild simulation; events posted here are real observations.",
        )
    try:
        return engine.ingest(event)
    except SimulatedGardenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="recommendation already resolved") from exc
    candidates = engine.propose_agent_evolution()
    return {"id": outcome_id, "evolution_candidates_created": candidates}


@app.post("/tasks/tick")
def tick() -> dict:
    # Suitable for an external cron/scheduler in environments where long-running
    # worker processes are unavailable, so it grows the Wild just as the worker does.
    result = engine.tick(source="api-cron")
    if settings.wild_sim:
        try:
            grown = Wild(repo, engine, seed=settings.wild_seed).advance(settings.wild_days_per_tick)
            result["wild"] = {"day": grown["day"], "date": grown["date"], "events": grown["events"]}
        except (RealGardenError, WildBusyError) as exc:
            result["wild"] = {"skipped": str(exc)}
    return result


@app.get("/wild")
def wild_state() -> dict:
    snapshot = Wild(repo, engine, seed=settings.wild_seed).snapshot()
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="No simulated garden exists yet. Enable STILLWILD_WILD_SIM on a dedicated "
            "database and advance it.",
        )
    return snapshot


@app.post("/wild/advance")
def wild_advance(days: int = Query(default=1, ge=1, le=730)) -> dict:
    if not settings.wild_sim:
        raise HTTPException(
            status_code=403,
            detail="The Wild simulation is disabled. Set STILLWILD_WILD_SIM=true on a dedicated "
            "simulated-garden database.",
        )
    try:
        return Wild(repo, engine, seed=settings.wild_seed).advance(days)
    except RealGardenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WildBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/garden", response_class=HTMLResponse)
def garden_page() -> HTMLResponse:
    page = resources.files("stillwild").joinpath("static/garden.html").read_text("utf-8")
    return HTMLResponse(page)


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
