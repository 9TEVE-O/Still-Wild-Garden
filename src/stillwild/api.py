from __future__ import annotations

import asyncio
import json
import secrets
from collections.abc import AsyncIterator
from importlib import resources
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .background import ScheduleConflict, ensure_schedule_compatible, run_due
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

operator_bearer = HTTPBearer(auto_error=False, scheme_name="OperatorToken")
task_bearer = HTTPBearer(auto_error=False, scheme_name="TaskToken")


def _check_token(
    credentials: HTTPAuthorizationCredentials | None, expected: str, scope: str,
) -> None:
    """Authenticate one role after confirming its credential is configured."""
    if len(expected) < 32:
        raise HTTPException(
            status_code=503,
            detail=f"{scope} authentication requires a configured token of at least 32 characters.",
        )
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode("utf-8"), expected.encode("utf-8"),
    ):
        raise HTTPException(
            status_code=401, detail="Invalid or missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_write_tokens() -> None:
    """Disable all HTTP mutations unless both distinct service keys are configured."""
    if (
        len(settings.task_token) < 32
        or len(settings.operator_token) < 32
        or settings.task_token == settings.operator_token
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "API writes require distinct configured task and operator tokens "
                "of at least 32 characters."
            ),
        )


def require_operator(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(operator_bearer)],
) -> None:
    """Require the operator credential without imposing the HTTP-write configuration gate."""
    _check_token(credentials, settings.operator_token, "Operator")


def require_task(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(task_bearer)],
) -> None:
    """Require the scheduler credential without granting operator authority."""
    _check_token(credentials, settings.task_token, "Scheduled")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "automation_authority": settings.automation_authority,
        "db_path": settings.db_path,
    }


@app.post(
    "/events", status_code=201,
    dependencies=[Depends(require_write_tokens), Depends(require_operator)],
)
def ingest_event(event: GardenEvent) -> dict:
    # Events from the public API are always real observations. Only the in-process Wild may
    # mark an event as simulated, so clients cannot disguise real evidence as simulated.
    """Ingest a public observation, rejecting simulation markers and simulated gardens."""
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


@app.post(
    "/experiments", status_code=201,
    dependencies=[Depends(require_write_tokens), Depends(require_operator)],
)
def create_experiment(experiment: ExperimentInput) -> dict:
    experiment_id = repo.add_experiment(experiment)
    return {"id": experiment_id, "status": "active"}


@app.post(
    "/outcomes", status_code=201,
    dependencies=[Depends(require_write_tokens), Depends(require_operator)],
)
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


@app.post(
    "/tasks/tick", dependencies=[Depends(require_write_tokens), Depends(require_task)],
)
def tick() -> dict:
    """Commit due UTC slots; a retry reports the prior result without extra progression."""
    try:
        return run_due(repo, engine, settings, trigger="api-cron")
    except (ScheduleConflict, WildBusyError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/tasks/runs", dependencies=[Depends(require_operator)])
def background_runs(limit: int = Query(default=50, ge=1, le=100)) -> list[dict]:
    """Read attempted and committed background execution separately."""
    return repo.list_background_runs(limit)


@app.get("/wild")
def wild_state() -> dict:
    """Return the persisted simulation snapshot, or raise HTTP 404 if none exists."""
    snapshot = Wild(repo, engine, seed=settings.wild_seed).snapshot()
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="No simulated garden exists yet. Enable STILLWILD_WILD_SIM on a dedicated "
            "database and advance it.",
        )
    return snapshot


@app.post(
    "/wild/advance", dependencies=[Depends(require_write_tokens), Depends(require_operator)],
)
def wild_advance(days: int = Query(default=1, ge=1, le=730)) -> dict:
    """Advance the enabled simulation, reporting disabled or conflicting state via HTTP."""
    try:
        ensure_schedule_compatible(repo, engine, settings)
    except ScheduleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
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
    """Serve the packaged HTML dashboard for the experimental backend garden."""
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
