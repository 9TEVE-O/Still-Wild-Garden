
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .db import Repository
from .domain import AgentOutput, GardenEvent


class Agent(Protocol):
    name: str

    def handles(self, event: GardenEvent) -> bool: ...

    def run(self, event: GardenEvent, repo: Repository) -> AgentOutput: ...


@dataclass
class ObserverAgent:
    name: str = "observer"

    def handles(self, event: GardenEvent) -> bool:
        return True

    def run(self, event: GardenEvent, repo: Repository) -> AgentOutput:
        material = event.type != "system.tick"
        return AgentOutput(
            agent=self.name,
            decision="WATCH" if material else "NO_ACTION",
            summary=(
                f"Recorded {event.type} for {event.zone_id or 'whole garden'}."
                if material
                else "Periodic tick received; no environmental change is implied."
            ),
            confidence=0.95,
            evidence_event_ids=[event.id],
        )


@dataclass
class WaterAgent:
    name: str = "water"

    def handles(self, event: GardenEvent) -> bool:
        return event.type in {"sensor.soil_moisture", "weather.forecast", "weather.rain"}

    def run(self, event: GardenEvent, repo: Repository) -> AgentOutput:
        if event.type == "sensor.soil_moisture":
            value = event.payload.get("percent")
            rain = event.payload.get("forecast_rain_mm_24h")
            if not isinstance(value, (int, float)):
                return AgentOutput(
                    agent=self.name,
                    decision="INVESTIGATE",
                    summary="Soil-moisture event lacks a numeric percent value.",
                    confidence=0.98,
                    evidence_event_ids=[event.id],
                    unknowns=["soil moisture percent"],
                )
            if value < 20 and isinstance(rain, (int, float)) and rain < 2:
                return AgentOutput(
                    agent=self.name,
                    decision="PROPOSE",
                    summary=f"Soil moisture is low at {value:.1f}% and little rain is forecast.",
                    confidence=0.78,
                    evidence_event_ids=[event.id],
                    proposed_action={
                        "type": "irrigate",
                        "zone_id": event.zone_id,
                        "mode": "bounded",
                        "reason": "low measured soil moisture",
                    },
                )
            if value < 25:
                return AgentOutput(
                    agent=self.name,
                    decision="WATCH",
                    summary=f"Soil moisture is low at {value:.1f}%; observe before watering.",
                    confidence=0.72,
                    evidence_event_ids=[event.id],
                    unknowns=(
                        ["24h rainfall forecast"] if not isinstance(rain, (int, float)) else []
                    ),
                )
            return AgentOutput(
                agent=self.name,
                decision="NO_ACTION",
                summary=f"Soil moisture is currently sufficient at {value:.1f}%.",
                confidence=0.84,
                evidence_event_ids=[event.id],
            )

        return AgentOutput(
            agent=self.name,
            decision="WATCH",
            summary="Weather evidence recorded for the next watering decision.",
            confidence=0.7,
            evidence_event_ids=[event.id],
        )


@dataclass
class PlantAgent:
    name: str = "plant"

    def handles(self, event: GardenEvent) -> bool:
        return event.type == "plant.observation"

    def run(self, event: GardenEvent, repo: Repository) -> AgentOutput:
        """Classify plant condition and propose inspection when stress warrants diagnosis."""
        condition = str(event.payload.get("condition", "unknown")).lower()
        if condition in {"declining", "stressed", "wilting", "yellowing"}:
            return AgentOutput(
                agent=self.name,
                decision="INVESTIGATE",
                summary=f"Plant condition '{condition}' warrants diagnosis before intervention.",
                confidence=0.7,
                evidence_event_ids=[event.id],
                unknowns=["cause of observed plant stress"],
                proposed_action={
                    "type": "inspect",
                    "zone_id": event.zone_id,
                    "checks": ["soil moisture", "sun exposure", "pests", "recent disturbance"],
                },
            )
        if condition in {"thriving", "stable", "flowering", "fruiting", "seeding", "dormant"}:
            return AgentOutput(
                agent=self.name,
                decision="NO_ACTION",
                summary=f"Plant is reported as {condition}; no intervention is justified.",
                confidence=0.86,
                evidence_event_ids=[event.id],
            )
        if condition in {"germinating", "establishing", "died back"}:
            return AgentOutput(
                agent=self.name,
                decision="WATCH",
                summary=f"Plant is {condition}, a natural life-cycle stage; keep observing.",
                confidence=0.75,
                evidence_event_ids=[event.id],
            )
        return AgentOutput(
            agent=self.name,
            decision="WATCH",
            summary="Plant observation stored, but condition is not yet classifiable.",
            confidence=0.55,
            evidence_event_ids=[event.id],
            unknowns=["standardised plant condition"],
        )


@dataclass
class EcologistAgent:
    name: str = "ecologist"

    def handles(self, event: GardenEvent) -> bool:
        return event.type in {"wildlife.observation", "plant.observation", "fungi.observation"}

    def run(self, event: GardenEvent, repo: Repository) -> AgentOutput:
        if event.type == "wildlife.observation":
            taxon = event.payload.get("taxon") or event.payload.get("species") or "wildlife"
            return AgentOutput(
                agent=self.name,
                decision="WATCH",
                summary=f"Recorded ecological presence: {taxon}. Preserve context before intervening.",
                confidence=0.8,
                evidence_event_ids=[event.id],
            )
        return AgentOutput(
            agent=self.name,
            decision="WATCH",
            summary="Biological observation may contribute to an ecological pattern over time.",
            confidence=0.65,
            evidence_event_ids=[event.id],
        )


@dataclass
class MicroclimateAgent:
    name: str = "microclimate"

    def handles(self, event: GardenEvent) -> bool:
        return event.type in {
            "sensor.temperature",
            "sensor.humidity",
            "sensor.light",
            "sensor.soil_moisture",
        }

    def run(self, event: GardenEvent, repo: Repository) -> AgentOutput:
        return AgentOutput(
            agent=self.name,
            decision="WATCH",
            summary=(
                "Environmental measurement added to the zone history. "
                "A microclimate rule requires repeated evidence."
            ),
            confidence=0.82,
            evidence_event_ids=[event.id],
        )


@dataclass
class WildnessAgent:
    name: str = "wildness"

    def handles(self, event: GardenEvent) -> bool:
        return event.type != "system.tick"

    def review(self, outputs: list[AgentOutput]) -> AgentOutput:
        proposed = [item for item in outputs if item.decision == "PROPOSE"]
        if not proposed:
            return AgentOutput(
                agent=self.name,
                decision="ALLOW",
                summary="No intervention proposal requires a wildness veto.",
                confidence=0.9,
                evidence_event_ids=list(
                    dict.fromkeys(e for item in outputs for e in item.evidence_event_ids)
                ),
            )
        strongest = max(proposed, key=lambda item: item.confidence)
        if strongest.confidence < 0.75:
            return AgentOutput(
                agent=self.name,
                decision="DEFER",
                summary="Intervention confidence is too low; more observation is preferable.",
                confidence=0.88,
                evidence_event_ids=strongest.evidence_event_ids,
            )
        return AgentOutput(
            agent=self.name,
            decision="ALLOW",
            summary="The proposed intervention is bounded and sufficiently evidenced for review.",
            confidence=0.8,
            evidence_event_ids=strongest.evidence_event_ids,
        )


class CouncilAgent:
    name = "council"

    def decide(
        self,
        event: GardenEvent,
        outputs: list[AgentOutput],
        wildness: AgentOutput,
        automation_authority: bool,
    ) -> AgentOutput:
        evidence = list(dict.fromkeys(e for item in outputs for e in item.evidence_event_ids))
        proposals = [item for item in outputs if item.decision == "PROPOSE"]
        investigations = [item for item in outputs if item.decision == "INVESTIGATE"]

        if wildness.decision == "DEFER":
            return AgentOutput(
                agent=self.name,
                decision="DEFER",
                summary="Council deferred intervention because evidence is not yet strong enough.",
                confidence=wildness.confidence,
                evidence_event_ids=evidence,
            )

        if investigations and not proposals:
            top = max(investigations, key=lambda item: item.confidence)
            return AgentOutput(
                agent=self.name,
                decision="INVESTIGATE",
                summary=top.summary,
                confidence=top.confidence,
                evidence_event_ids=evidence,
                proposed_action=top.proposed_action,
                unknowns=top.unknowns,
            )

        if proposals:
            top = max(proposals, key=lambda item: item.confidence)
            if automation_authority:
                return AgentOutput(
                    agent=self.name,
                    decision="PROPOSE",
                    summary=(
                        "Council approves this bounded action for an authorised actuator; "
                        "execution still requires actuator telemetry."
                    ),
                    confidence=top.confidence,
                    evidence_event_ids=evidence,
                    proposed_action={**(top.proposed_action or {}), "authority": "automated"},
                )
            return AgentOutput(
                agent=self.name,
                decision="PROPOSE",
                summary=(
                    "Council recommends a human-reviewed action. "
                    "Automatic execution authority is disabled."
                ),
                confidence=top.confidence,
                evidence_event_ids=evidence,
                proposed_action={**(top.proposed_action or {}), "authority": "human_review"},
            )

        watches = [item for item in outputs if item.decision == "WATCH"]
        if watches:
            return AgentOutput(
                agent=self.name,
                decision="WATCH",
                summary="Continue observation; no intervention is justified by current evidence.",
                confidence=max(item.confidence for item in watches),
                evidence_event_ids=evidence,
            )

        return AgentOutput(
            agent=self.name,
            decision="NO_ACTION",
            summary="Garden state recorded. No action is required.",
            confidence=0.9,
            evidence_event_ids=evidence or [event.id],
        )


def default_agents() -> list[Agent]:
    return [
        ObserverAgent(),
        WaterAgent(),
        PlantAgent(),
        EcologistAgent(),
        MicroclimateAgent(),
    ]
