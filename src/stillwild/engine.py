from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from .agents import CouncilAgent, WildnessAgent, default_agents
from .db import Repository
from .domain import AgentOutput, GardenEvent


class GardenEngine:
    def __init__(self, repo: Repository, automation_authority: bool = False):
        self.repo = repo
        self.automation_authority = automation_authority
        self.agents = default_agents()
        self.wildness = WildnessAgent()
        self.council = CouncilAgent()

    def ingest(self, event: GardenEvent) -> dict:
        with self.repo.transaction() as conn:
            seq = self.repo.add_event(event, connection=conn)
            return self.process(event, seq=seq, conn=conn)

    def process(
        self, event: GardenEvent, seq: int | None = None, conn: sqlite3.Connection | None = None
    ) -> dict:
        outputs: list[AgentOutput] = []
        for agent in self.agents:
            if agent.handles(event):
                output = agent.run(event, self.repo)
                self.repo.add_agent_run(event.id, output, connection=conn)
                outputs.append(output)

        wildness = self.wildness.review(outputs)
        self.repo.add_agent_run(event.id, wildness, connection=conn)

        final = self.council.decide(
            event,
            outputs,
            wildness,
            automation_authority=self.automation_authority,
        )
        self.repo.add_agent_run(event.id, final, connection=conn)
        recommendation_id = self.repo.add_recommendation(
            event,
            decision=final.decision,
            summary=final.summary,
            confidence=final.confidence,
            proposed_action=final.proposed_action,
            connection=conn,
        )
        self._learn(event, outputs, final, conn=conn)
        return {
            "event_id": event.id,
            "seq": seq,
            "recommendation_id": recommendation_id,
            "decision": final.decision,
            "summary": final.summary,
            "confidence": final.confidence,
            "proposed_action": final.proposed_action,
            "agents": [item.model_dump() for item in outputs] + [wildness.model_dump()],
        }

    def tick(self, source: str = "worker") -> dict:
        event = GardenEvent(
            type="system.tick",
            source=source,
            observed_at=datetime.now(UTC),
            payload={"purpose": "periodic background evaluation"},
        )
        result = self.ingest(event)
        self.propose_agent_evolution()
        return result

    def propose_agent_evolution(self) -> list[str]:
        created: list[str] = []
        for score in self.repo.agent_scores():
            if score["n"] < 5 or score["avg_score"] is None:
                continue
            if score["avg_score"] < 0.2:
                agent = score["agent"]
                candidate = self.repo.add_evolution_candidate(
                    agent=agent,
                    current_rule="Current deterministic decision thresholds and routing.",
                    evidence_problem=(
                        f"{score['n']} resolved recommendations involving this agent have "
                        f"mean utility {score['avg_score']:.2f}."
                    ),
                    proposed_rule=(
                        "Do not self-modify. Create a candidate threshold/prompt revision and "
                        "replay it against historical events before any promotion."
                    ),
                    expected_improvement="Reduce repeated low-utility recommendations.",
                    risk="Historical outcomes may be sparse or confounded by other agents.",
                    test_method="Offline replay against stored events, then bounded live trial.",
                )
                created.append(candidate)
        return created

    def _learn(
        self,
        event: GardenEvent,
        outputs: list[AgentOutput],
        final: AgentOutput,
        conn: sqlite3.Connection | None = None,
    ) -> None:
        zone = event.zone_id or "garden"
        self.repo.upsert_memory(
            key=f"last_event:{zone}:{event.type}",
            value={
                "event_id": event.id,
                "type": event.type,
                "zone_id": event.zone_id,
                "source": event.source,
                "payload": event.payload,
                "council_decision": final.decision,
            },
            confidence=0.98,
            evidence_ids=[event.id],
            status="observation",
            connection=conn,
        )

        if event.type == "sensor.soil_moisture":
            value = event.payload.get("percent")
            if isinstance(value, (int, float)):
                status = "dry" if value < 25 else "sufficient"
                self.repo.upsert_memory(
                    key=f"soil_moisture_state:{zone}",
                    value={"percent": value, "classification": status},
                    confidence=0.84,
                    evidence_ids=[event.id],
                    status="observation",
                    connection=conn,
                )
