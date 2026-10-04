
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(UTC)


class GardenEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str
    zone_id: str | None = None
    source: str = "unknown"
    observed_at: datetime = Field(default_factory=utcnow)
    payload: dict[str, Any] = Field(default_factory=dict)


Decision = Literal["NO_ACTION", "WATCH", "INVESTIGATE", "PROPOSE", "DEFER", "ALLOW"]


class AgentOutput(BaseModel):
    agent: str
    decision: Decision
    summary: str
    confidence: float = Field(ge=0, le=1)
    evidence_event_ids: list[str] = Field(default_factory=list)
    proposed_action: dict[str, Any] | None = None
    unknowns: list[str] = Field(default_factory=list)


class Recommendation(BaseModel):
    id: str
    event_id: str
    zone_id: str | None
    decision: str
    summary: str
    confidence: float
    proposed_action: dict[str, Any] | None
    created_at: datetime


class OutcomeInput(BaseModel):
    recommendation_id: str
    outcome: str
    utility_score: float = Field(ge=-1, le=1)
    notes: str | None = None


class ExperimentInput(BaseModel):
    question: str
    hypothesis: str
    zone_id: str | None = None
    change: str
    measurement: str
    observation_period: str
    success_condition: str
    stop_condition: str


class StateSnapshot(BaseModel):
    recent_events: list[dict[str, Any]]
    memories: list[dict[str, Any]]
    recommendations: list[dict[str, Any]]
    experiments: list[dict[str, Any]]
    evolution_candidates: list[dict[str, Any]]
