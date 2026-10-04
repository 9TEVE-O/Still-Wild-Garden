"""The Wild: a seeded, persistent ecosystem for Stillwild's agents to live in.

Real outcomes take seasons to arrive. The Wild gives the agents a garden that keeps
changing on its own: weather and seasons, soil water, plants that germinate, compete,
flower, set seed, spread and die back, wildlife that follows the flowers and berries,
and fungi after autumn rain. Its readings flow through the normal engine, and the
simulation later judges the agents' recommendations against what actually happened,
so outcome scores and evolution candidates accumulate from evidence.

A simulated garden is never a real one. Every event it emits carries
``"simulated": true`` and the source ``wild-sim``, and it refuses to run against a
database that already holds real observations.
"""

from __future__ import annotations

import math
import random
import sqlite3
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

from .db import Repository
from .domain import GardenEvent
from .engine import GardenEngine

WORLD = "wild"
SOURCE = "wild-sim"
LEASE = "wild-sim"
START_DATE = date(2027, 3, 1)
IRRIGATE_HORIZON_DAYS = 3
INSPECT_HORIZON_DAYS = 10
JOURNAL_LIMIT = 200
HISTORY_LIMIT = 600
LEASE_TTL_SECONDS = 120
LOST_LEASE_MESSAGE = "another process took over the Wild; this advance stopped without saving"
STALE_WORLD_MESSAGE = "the Wild changed since this advance began; it stopped without saving"
REAL_GARDEN_MESSAGE = (
    "this database holds real garden observations; run the Wild against a dedicated "
    "simulated-garden database"
)


class RealGardenError(RuntimeError):
    """Raised instead of mixing simulated life into a garden with real observations."""


class WildBusyError(RuntimeError):
    """Raised when another process is already advancing the simulation."""


@dataclass(frozen=True)
class Species:
    name: str
    common: str
    form: str  # grass | forb | climber | shrub | tree
    life: str  # annual | biennial | perennial
    light: float  # relative light needed for full growth
    wet: tuple[float, float]  # preferred soil moisture percent
    drought: float  # drought tolerance 0-1
    growth: float  # maximum relative cover growth per day
    max_cover: float
    shade: float  # canopy shade cast per unit cover
    germinate: tuple[int, ...]
    flowers: tuple[int, ...]
    fruits: tuple[int, ...]
    dormant: tuple[int, ...]
    maturity: int  # days before first flowering
    seed_rate: float
    dispersal: str  # wind | bird | local
    nectar: float
    berries: bool
    colour: str

    @property
    def woody(self) -> bool:
        """Return whether this species is a shrub, tree or climber in the canopy model."""
        return self.form in {"shrub", "tree", "climber"}


SPECIES: dict[str, Species] = {
    s.name: s
    for s in (
        Species("meadow-grass", "Meadow grass", "grass", "perennial", 0.4, (15, 45), 0.6,
                0.035, 0.55, 0.0, (3, 4, 9, 10), (6, 7), (7, 8), (12, 1), 60, 25, "wind",
                0.02, False, "#cdbb7a"),
        Species("red-clover", "Red clover", "forb", "perennial", 0.5, (18, 42), 0.5, 0.03,
                0.3, 0.0, (3, 4, 5, 9), (5, 6, 7, 8, 9), (8, 9, 10), (12, 1, 2), 60, 30,
                "local", 0.9, False, "#c2457a"),
        Species("oxeye-daisy", "Oxeye daisy", "forb", "perennial", 0.6, (12, 38), 0.7,
                0.028, 0.25, 0.0, (3, 4, 9), (5, 6, 7, 8), (8, 9), (12, 1, 2), 60, 40, "wind",
                0.6, False, "#f5f1df"),
        Species("yarrow", "Yarrow", "forb", "perennial", 0.55, (8, 35), 0.85, 0.024, 0.22,
                0.0, (4, 5, 9), (6, 7, 8, 9), (9, 10), (12, 1, 2), 60, 30, "wind", 0.5, False,
                "#eadfcf"),
        Species("common-poppy", "Common poppy", "forb", "annual", 0.7, (12, 35), 0.6, 0.05,
                0.22, 0.0, (3, 4, 10), (6, 7, 8), (8, 9), (), 50, 60, "local", 0.4, False,
                "#d7362b"),
        Species("foxglove", "Foxglove", "forb", "biennial", 0.25, (20, 45), 0.4, 0.022,
                0.18, 0.0, (4, 5, 9), (6, 7), (8, 9), (12, 1, 2), 300, 50, "wind", 0.8, False,
                "#a65fb0"),
        Species("teasel", "Wild teasel", "forb", "biennial", 0.6, (15, 40), 0.65, 0.02, 0.14,
                0.0, (3, 4, 9), (7, 8), (9, 10, 11), (12, 1, 2), 300, 35, "local", 0.6, False,
                "#9a7fc2"),
        Species("nettle", "Stinging nettle", "forb", "perennial", 0.3, (28, 55), 0.3, 0.04,
                0.4, 0.0, (4, 5), (6, 7, 8, 9), (8, 9, 10), (12, 1, 2), 60, 30, "wind", 0.1,
                False, "#93a77f"),
        Species("purple-loosestrife", "Purple loosestrife", "forb", "perennial", 0.6,
                (35, 60), 0.2, 0.03, 0.3, 0.0, (4, 5), (7, 8, 9), (9, 10), (11, 12, 1, 2, 3),
                60, 40, "wind", 0.8, False, "#b0479a"),
        Species("wood-anemone", "Wood anemone", "forb", "perennial", 0.1, (20, 45), 0.3,
                0.02, 0.3, 0.0, (3,), (3, 4), (5,), (6, 7, 8, 9, 10, 11, 12, 1), 60, 15,
                "local", 0.3, False, "#f4eff6"),
        Species("ivy", "Ivy", "climber", "perennial", 0.15, (15, 45), 0.6, 0.015, 0.3, 0.2,
                (4, 5), (9, 10, 11), (12, 1, 2, 3), (), 365, 20, "bird", 0.7, True,
                "#c4cf6a"),
        Species("bramble", "Bramble", "shrub", "perennial", 0.35, (15, 45), 0.6, 0.025, 0.35,
                0.25, (4, 5), (6, 7), (8, 9), (), 365, 25, "bird", 0.7, True, "#f0d6de"),
        Species("hawthorn", "Hawthorn", "shrub", "perennial", 0.4, (15, 45), 0.6, 0.008, 0.4,
                0.5, (3, 4), (5,), (9, 10, 11), (), 1500, 15, "bird", 0.6, True, "#f6f1ea"),
        Species("oak", "English oak", "tree", "perennial", 0.45, (15, 45), 0.6, 0.004, 0.5,
                0.7, (4, 5), (5,), (10,), (), 3000, 4, "bird", 0.1, False, "#b9a46a"),
    )
}


@dataclass(frozen=True)
class Zone:
    id: str
    name: str
    light: float
    water_table: float
    neighbours: tuple[str, ...]


ZONES: tuple[Zone, ...] = (
    Zone("hedgerow", "Hedgerow", 0.6, 0.15, ("north-bed", "south-meadow", "woodland-edge")),
    Zone("north-bed", "North bed", 0.55, 0.1, ("hedgerow", "south-meadow")),
    Zone("woodland-edge", "Woodland edge", 0.4, 0.2, ("hedgerow", "pond-edge")),
    Zone("south-meadow", "South meadow", 0.95, 0.05, ("north-bed", "hedgerow", "pond-edge")),
    Zone("pond-edge", "Pond edge", 0.8, 0.45, ("south-meadow", "woodland-edge")),
)
ZONE_BY_ID = {zone.id: zone for zone in ZONES}


@dataclass(frozen=True)
class Taxon:
    name: str
    common: str
    group: str  # insect | bird | amphibian | mammal
    months: tuple[int, ...]
    min_temp: float
    abundance: float
    needs: str
    zones: tuple[str, ...] = ()


ALL_YEAR = tuple(range(1, 13))
WILDLIFE: tuple[Taxon, ...] = (
    Taxon("bombus-terrestris", "Buff-tailed bumblebee", "insect", tuple(range(3, 11)), 8, 25,
          "nectar"),
    Taxon("apis-mellifera", "Honeybee", "insect", tuple(range(4, 10)), 12, 20, "nectar"),
    Taxon("episyrphus-balteatus", "Marmalade hoverfly", "insect", tuple(range(4, 11)), 10, 18,
          "nectar"),
    Taxon("aglais-io", "Peacock butterfly", "insect", tuple(range(4, 10)), 13, 6,
          "nectar+nettle"),
    Taxon("polyommatus-icarus", "Common blue butterfly", "insect", tuple(range(5, 10)), 14, 6,
          "nectar+clover"),
    Taxon("colletes-hederae", "Ivy bee", "insect", (9, 10, 11), 11, 30, "ivy"),
    Taxon("carduelis-carduelis", "Goldfinch", "bird", ALL_YEAR, -5, 8, "seeds"),
    Taxon("turdus-merula", "Blackbird", "bird", ALL_YEAR, -5, 6, "berries"),
    Taxon("turdus-philomelos", "Song thrush", "bird", ALL_YEAR, -5, 3, "thrush"),
    Taxon("troglodytes-troglodytes", "Wren", "bird", ALL_YEAR, -5, 2, "hedge"),
    Taxon("garrulus-glandarius", "Jay", "bird", (9, 10, 11), -5, 4, "acorns"),
    Taxon("rana-temporaria", "Common frog", "amphibian", tuple(range(3, 11)), 6, 3, "pond",
          ("pond-edge",)),
    Taxon("aeshna-cyanea", "Southern hawker dragonfly", "insect", (7, 8, 9), 16, 2, "pond",
          ("pond-edge",)),
    Taxon("erinaceus-europaeus", "Hedgehog", "mammal", tuple(range(4, 11)), 8, 0.8, "cover",
          ("woodland-edge", "hedgerow", "north-bed")),
)
TAXON_BY_NAME = {taxon.name: taxon for taxon in WILDLIFE}


@dataclass(frozen=True)
class Fungus:
    name: str
    common: str
    months: tuple[int, ...]
    host: str  # grass | wood | oak


FUNGI: tuple[Fungus, ...] = (
    Fungus("marasmius-oreades", "Fairy ring champignon", (6, 7, 8, 9, 10), "grass"),
    Fungus("coprinus-comatus", "Shaggy inkcap", (9, 10, 11), "grass"),
    Fungus("trametes-versicolor", "Turkeytail", ALL_YEAR, "wood"),
    Fungus("amanita-muscaria", "Fly agaric", (8, 9, 10, 11), "oak"),
)
FUNGUS_BY_NAME = {fungus.name: fungus for fungus in FUNGI}

WET_DAY_PROBABILITY = {1: 0.55, 2: 0.5, 3: 0.48, 4: 0.45, 5: 0.42, 6: 0.38, 7: 0.36,
                       8: 0.4, 9: 0.45, 10: 0.52, 11: 0.56, 12: 0.56}

INITIAL_PLANTS: dict[str, dict[str, tuple[float, int]]] = {
    "hedgerow": {"hawthorn": (0.22, 3000), "bramble": (0.08, 800), "ivy": (0.06, 900),
                 "meadow-grass": (0.1, 400)},
    "north-bed": {"meadow-grass": (0.2, 400), "red-clover": (0.06, 400),
                  "oxeye-daisy": (0.03, 400)},
    "woodland-edge": {"oak": (0.14, 6000), "wood-anemone": (0.05, 900), "ivy": (0.05, 900),
                      "nettle": (0.03, 400)},
    "south-meadow": {"meadow-grass": (0.4, 400), "yarrow": (0.02, 400)},
    "pond-edge": {"nettle": (0.08, 400), "meadow-grass": (0.12, 400)},
}
INITIAL_SEEDBANK = {"north-bed": {"common-poppy": 60.0}}


def _clamp(value: float, low: float, high: float) -> float:
    """Bound a value to the inclusive interval from low to high."""
    return max(low, min(high, value))


def _poisson(rng: random.Random, lam: float) -> int:
    """Draw a nonnegative count, using a Gaussian approximation for rates above 30."""
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, round(rng.gauss(lam, math.sqrt(lam))))
    limit = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def _season(month: int) -> str:
    """Map a calendar month to its northern-hemisphere meteorological season."""
    return {12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring",
            6: "summer", 7: "summer", 8: "summer"}.get(month, "autumn")


def _mean_temp(day: date) -> float:
    """Return the seasonal mean temperature in Celsius for a simulated date."""
    doy = day.timetuple().tm_yday
    return 10.5 - 6.5 * math.cos(2 * math.pi * (doy - 20) / 365.25)


def _draw_weather(rng: random.Random, day: date, wet_today: bool) -> dict[str, Any]:
    """Sample wet/dry persistence, rainfall and an imperfect forecast for the given day."""
    p_wet = WET_DAY_PROBABILITY[day.month] + (0.18 if wet_today else -0.12)
    wet = rng.random() < p_wet
    rain = 0.0
    if wet:
        mean = 6.5 if day.month in (10, 11, 12, 1) else 4.5
        rain = rng.expovariate(1 / mean) * (3 if rng.random() < 0.05 else 1)
    rain = round(rain, 1)
    # Forecasts are usually right, but not always: agents must live with uncertainty.
    if rng.random() < 0.8:
        forecast = rain * rng.uniform(0.6, 1.4)
    elif rain > 0:
        forecast = rng.uniform(0, 1.5)
    else:
        forecast = rng.uniform(1, 6)
    return {"wet": wet, "rain_mm": rain, "forecast_rain_mm_24h": round(forecast, 1)}


def _stress_line(sp: Species) -> float:
    """Return the soil moisture threshold for drought stress, accounting for plant form."""
    line = sp.wet[0] * (1 - 0.6 * sp.drought)
    return line * 0.6 if sp.form in {"shrub", "tree"} else line


def _moisture_fit(sp: Species, moisture: float) -> float:
    """Return a growth suitability factor from zero to one for the species and moisture."""
    low, high = sp.wet
    if moisture < low:
        return max(0.0, 1 - (low - moisture) / (low * (0.5 + sp.drought)))
    if moisture > high:
        return max(0.0, 1 - (moisture - high) / 20)
    return 1.0


class Wild:
    def __init__(self, repo: Repository, engine: GardenEngine, seed: int = 7):
        """Bind the repository, engine and seed used when creating a simulated world."""
        self.repo = repo
        self.engine = engine
        self.seed = seed

    # ------------------------------------------------------------------ public API

    def advance(self, days: int = 1) -> dict[str, Any]:
        """Advance at least one simulated day and return growth, outcome and journal summaries.

        Create the world if absent and commit each day atomically under a renewed lease.
        Raise ValueError for nonpositive days, RealGardenError for real observations,
        or WildBusyError if the lease cannot be acquired or renewed."""
        if days < 1:
            raise ValueError("days must be at least 1")
        holder = f"wild:{uuid4()}"
        # The lease is short and renewed inside every day's transaction, so a killed process
        # does not stall the garden for long and a process that lost the lease cannot commit.
        if not self.repo.try_acquire_lease(LEASE, holder, ttl_seconds=LEASE_TTL_SECONDS):
            raise WildBusyError("another process is already advancing the Wild")
        try:
            # Once a world exists the engine refuses real observations, so checking here and
            # claiming atomically below keeps real and simulated evidence apart.
            if self.repo.has_real_observations():
                raise RealGardenError(REAL_GARDEN_MESSAGE)
            state = self.repo.load_world(WORLD)
            events = outcomes = 0
            if state is None:
                state = self._new_world()
                with self.repo.transaction() as conn:
                    self._renew(holder, conn)
                    if not self.repo.claim_world(WORLD, state, connection=conn):
                        raise RealGardenError(REAL_GARDEN_MESSAGE)
                    events += self._ingest_all(state, self._initial_survey(state), conn)
                    self._save(state, conn)
            first_day = state["day"]
            evolution: list[dict[str, Any]] = []
            for _ in range(days):
                day_events = self._step(state)
                # A day's events, judgements and world state commit together: a crash rolls the
                # whole day back, so resuming never duplicates observations.
                with self.repo.transaction() as conn:
                    self._renew(holder, conn)
                    events += self._ingest_all(state, day_events, conn)
                    resolved = self._judge(state, conn)
                    self._save(state, conn)
                outcomes += resolved
                if resolved:
                    created = self._evolve(state)
                    if created:
                        with self.repo.transaction() as conn:
                            self._renew(holder, conn)
                            self._save(state, conn)
                    evolution.extend(created)
            new_notes = [note for note in state["journal"] if note["day"] > first_day]
            return {
                "days": days,
                "day": state["day"],
                "date": self._date(state).isoformat(),
                "season": _season(self._date(state).month),
                "events": events,
                "outcomes_recorded": outcomes,
                "evolution_candidates": evolution,
                "metrics": self._metrics(state),
                "journal": new_notes[-30:],
            }
        finally:
            self.repo.release_lease(LEASE, holder)

    def snapshot(self) -> dict[str, Any] | None:
        """Return a dashboard snapshot of persisted world state, or None before creation."""
        state = self.repo.load_world(WORLD)
        if state is None:
            return None
        today = self._date(state)
        zones = []
        for zone in ZONES:
            zs = state["zones"][zone.id]
            _, woody_canopy = self._canopy(zs)
            zones.append({
                "id": zone.id,
                "name": zone.name,
                "light": zone.light,
                "moisture": round(zs["moisture"], 1),
                "canopy": round(woody_canopy, 3),
                "seedbank_species": sorted(zs["seedbank"]),
                "plants": [
                    {
                        "species": name,
                        "common": SPECIES[name].common,
                        "form": SPECIES[name].form,
                        "colour": SPECIES[name].colour,
                        "cover": round(pop["cover"], 4),
                        "health": round(pop["health"], 3),
                        "stage": pop["stage"],
                        "age_days": pop["age"],
                    }
                    for name, pop in sorted(
                        zs["plants"].items(), key=lambda item: -item[1]["cover"]
                    )
                ],
            })
        judgements = state["judgements"]
        latest = self.repo.recent_events(1)
        return {
            "simulated": True,
            "seed": state["seed"],
            "day": state["day"],
            "date": today.isoformat(),
            "season": _season(today.month),
            "weather": state["weather"],
            "zones": zones,
            "sightings": state["sightings"],
            "fungi_recent": state["fungi_recent"][-12:],
            "wildlife": {
                name: {
                    "common": TAXON_BY_NAME[name].common,
                    "group": TAXON_BY_NAME[name].group,
                    "first_day": rec["first_day"],
                    "last_day": rec["last_day"],
                    "total": rec["total"],
                }
                for name, rec in sorted(state["wildlife"].items())
            },
            "metrics": self._metrics(state),
            "history": state["history"],
            "journal": list(reversed(state["journal"][-40:])),
            "judgements": {
                "pending": len(judgements["pending"]),
                "resolved": judgements["resolved"],
                "mean_utility": (
                    round(judgements["utility_sum"] / judgements["resolved"], 3)
                    if judgements["resolved"]
                    else None
                ),
                "by_kind": judgements["by_kind"],
            },
            "agent_scores": self.repo.agent_scores(),
            "council": self._council_digest(),
            "evolution_candidates": [
                {"agent": item["agent"], "evidence_problem": item["evidence_problem"],
                 "status": item["status"]}
                for item in self.repo.list_evolution_candidates(6)
            ],
            "latest_seq": latest[-1]["seq"] if latest else 0,
        }

    def _council_digest(self, window: int = 200) -> dict[str, Any]:
        # Most council decisions are quiet watching; surface the ones that asked for attention.
        """Summarize recent decision counts and notable recommendations with their outcomes."""
        recent = self.repo.list_recommendations(window)
        counts: dict[str, int] = {}
        for rec in recent:
            counts[rec["decision"]] = counts.get(rec["decision"], 0) + 1
        notable = [
            rec for rec in recent if rec["decision"] in {"PROPOSE", "INVESTIGATE", "DEFER"}
        ][:8]
        outcomes = self.repo.outcomes_for([rec["id"] for rec in notable])
        return {
            "window": len(recent),
            "counts": counts,
            "notable": [
                {
                    "decision": rec["decision"],
                    "summary": rec["summary"],
                    "zone_id": rec["zone_id"],
                    "status": rec["status"],
                    "proposed_action": rec["proposed_action"],
                    "outcome": outcomes.get(rec["id"]),
                }
                for rec in notable
            ],
        }

    # ------------------------------------------------------------------ world setup

    def _new_world(self) -> dict[str, Any]:
        """Build the seeded initial world state and baseline history without persisting it."""
        rng = random.Random(f"{self.seed}:genesis")
        zones: dict[str, Any] = {}
        for zone in ZONES:
            plants = {
                name: {"cover": cover, "health": 0.9, "stage": "vegetative", "age": age,
                       "flowered_day": None, "stressed": False, "declining": False}
                for name, (cover, age) in INITIAL_PLANTS[zone.id].items()
            }
            zones[zone.id] = {
                "moisture": 46.0 if zone.id == "pond-edge" else 38.0,
                "damage_total": 0.0,
                "plants": plants,
                "seedbank": dict(INITIAL_SEEDBANK.get(zone.id, {})),
                "fungi_last": {},
            }
        state: dict[str, Any] = {
            "version": 1,
            "revision": 0,
            "seed": self.seed,
            "day": 0,
            "start": START_DATE.isoformat(),
            "weather": {"temp_c": round(_mean_temp(START_DATE), 1), "rain_mm": 0.0,
                        "wet": False, "forecast_rain_mm_24h": 0.0, "sky": "cloud"},
            "tomorrow": _draw_weather(rng, START_DATE + timedelta(days=1), False),
            "rain_total": 0.0,
            "recent_rain": [0.0, 0.0, 0.0],
            "zones": zones,
            "wildlife": {},
            "sightings": [],
            "fungi_recent": [],
            "seen": {
                "plants": sorted({n for plants in INITIAL_PLANTS.values() for n in plants}),
                "fungi": [],
            },
            "bloom_year": {},
            "history": [],
            "journal": [],
            "judgements": {"pending": [], "resolved": 0, "utility_sum": 0.0, "by_kind": {}},
            "evolution_seen": [],
        }
        self._note(state, "genesis", "A garden was left to grow wild: grass, clover and daisies "
                   "in the north bed, an old oak at the woodland edge, hawthorn in the hedge.")
        state["history"].append(self._history_point(state))
        return state

    def _initial_survey(self, state: dict[str, Any]) -> list[GardenEvent]:
        """Create baseline simulated plant observations for every initial population."""
        return [
            self._event(state, "plant.observation", zone_id, {
                "species": name, "common": SPECIES[name].common, "condition": "stable",
                "cover": round(pop["cover"], 4), "survey": "baseline",
            })
            for zone_id, zs in state["zones"].items()
            for name, pop in sorted(zs["plants"].items())
        ]

    # ------------------------------------------------------------------ one simulated day

    def _step(self, state: dict[str, Any]) -> list[GardenEvent]:
        """Mutate the world through one seeded day and return its unpersisted observations."""
        state["day"] += 1
        today = self._date(state)
        rng = random.Random(f"{state['seed']}:{state['day']}")
        month = today.month

        weather = state["tomorrow"]
        temp = _mean_temp(today) + rng.gauss(0, 2.5) + (1.5 if not weather["wet"] else -0.5)
        rain = weather["rain_mm"]
        state["tomorrow"] = _draw_weather(rng, today + timedelta(days=1), weather["wet"])
        state["weather"] = {
            "temp_c": round(temp, 1),
            "rain_mm": rain,
            "wet": weather["wet"],
            "forecast_rain_mm_24h": state["tomorrow"]["forecast_rain_mm_24h"],
            "sky": "rain" if rain >= 0.5 else ("cloud" if weather["wet"] else "sun"),
        }
        state["rain_total"] = round(state["rain_total"] + rain, 1)
        state["recent_rain"] = (state["recent_rain"] + [rain])[-3:]

        sensor_events: list[GardenEvent] = [
            self._event(state, "sensor.temperature", None, {"celsius": round(temp, 1)})
        ]
        if rain >= 0.2:
            sensor_events.append(self._event(state, "weather.rain", None, {"mm": rain}))

        bio_events: list[GardenEvent] = []
        for zone in ZONES:
            zs = state["zones"][zone.id]
            self._update_moisture(zone, zs, temp, rain)
            bio_events.extend(self._update_plants(state, rng, zone, zs, temp, month))
            sensor_events.append(self._event(state, "sensor.soil_moisture", zone.id, {
                "percent": round(zs["moisture"], 1),
                "forecast_rain_mm_24h": state["tomorrow"]["forecast_rain_mm_24h"],
            }))
        self._disperse_seeds(state, rng)
        for zone in ZONES:
            bio_events.extend(self._germinate(state, rng, zone, temp, month))
        self._colonise(state, rng)
        bio_events.extend(self._wildlife(state, rng, temp, rain, month))
        bio_events.extend(self._fungi(state, rng, month))

        if state["day"] % 7 == 0:
            state["history"].append(self._history_point(state))
            state["history"] = state["history"][-HISTORY_LIMIT:]
        return sensor_events + bio_events

    def _update_moisture(self, zone: Zone, zs: dict[str, Any], temp: float, rain: float) -> None:
        """Update zone soil water for rain, evapotranspiration, drainage and groundwater."""
        _, woody_canopy = self._canopy(zs)
        cover = min(1.0, sum(pop["cover"] for pop in zs["plants"].values()))
        moisture = zs["moisture"]
        # Evapotranspiration slows as the soil dries and plants close their stomata.
        et = (
            0.16 * max(temp, 0.0)
            * (0.35 + 0.65 * zone.light)
            * (0.7 + 0.5 * cover)
            * (1 - 0.4 * woody_canopy)
            * min(1.0, moisture / 25)
        )
        infiltration = rain * 1.1 * (1 - 0.25 * woody_canopy)
        drainage = 0.2 * max(0.0, moisture - 42)
        recharge = zone.water_table * 0.12 * (30 + 30 * zone.water_table - moisture)
        zs["moisture"] = _clamp(moisture + infiltration - et - drainage + recharge, 3.0, 58.0)

    def _canopy(self, zs: dict[str, Any]) -> tuple[float, float]:
        """Return the capped tree and total woody shade fractions for a zone."""
        tree = sum(
            pop["cover"] * SPECIES[name].shade
            for name, pop in zs["plants"].items()
            if SPECIES[name].form == "tree"
        )
        woody = sum(
            pop["cover"] * SPECIES[name].shade
            for name, pop in zs["plants"].items()
            if SPECIES[name].woody
        )
        return min(0.85, tree), min(0.9, woody)

    def _update_plants(
        self,
        state: dict[str, Any],
        rng: random.Random,
        zone: Zone,
        zs: dict[str, Any],
        temp: float,
        month: int,
    ) -> list[GardenEvent]:
        """Age and grow zone populations, returning observations of life stages and health changes."""
        events: list[GardenEvent] = []
        day = state["day"]
        year = self._date(state).year
        moisture = zs["moisture"]
        tree_canopy, woody_canopy = self._canopy(zs)
        herb_total = sum(p["cover"] for n, p in zs["plants"].items() if not SPECIES[n].woody)
        woody_total = sum(p["cover"] for n, p in zs["plants"].items() if SPECIES[n].woody)
        temp_fit = _clamp((temp - 5) / 10, 0.0, 1.0)

        for name in sorted(zs["plants"]):
            sp = SPECIES[name]
            pop = zs["plants"][name]
            pop["age"] += 1
            dormant = month in sp.dormant

            if sp.form == "tree":
                light_here = zone.light
            elif sp.woody:
                light_here = zone.light * (1 - tree_canopy)
            else:
                light_here = zone.light * (1 - woody_canopy)
            light_fit = min(1.0, light_here / sp.light)

            stress_line = _stress_line(sp)
            if not dormant and temp > 8 and moisture < stress_line:
                damage = (stress_line - moisture) / stress_line * 0.09 * (1 - 0.5 * sp.drought)
                pop["health"] = max(0.0, pop["health"] - damage)
                zs["damage_total"] = round(zs["damage_total"] + damage, 4)
            elif moisture > sp.wet[1] + 12:
                pop["health"] = max(0.0, pop["health"] - 0.004)
            else:
                pop["health"] = min(1.0, pop["health"] + 0.03 * (1 - pop["health"]))

            if not dormant and temp_fit > 0:
                if sp.woody:
                    free = max(0.0, 0.9 - woody_total)
                else:
                    free = max(0.0, 1.0 - herb_total)
                rate = sp.growth * light_fit * _moisture_fit(sp, moisture) * temp_fit
                rate *= pop["health"]
                gain = rate * pop["cover"] * (1 - pop["cover"] / sp.max_cover)
                room = _clamp(free / 0.15, 0.0, 1.0)
                if pop["cover"] < 0.05:
                    room = max(room, 0.3)  # small populations exploit gaps in the sward
                pop["cover"] += gain * room
            pop["cover"] *= 0.9995
            if pop["health"] < 0.3:
                pop["cover"] *= 1 - (0.3 - pop["health"]) * 0.15

            previous = pop["stage"]
            recently_flowered = (
                pop["flowered_day"] is not None and day - pop["flowered_day"] <= 220
            )
            if dormant:
                stage = "dormant"
            elif pop["age"] < 21:
                stage = "seedling"
            elif (
                month in sp.flowers
                and pop["cover"] >= 0.004
                and pop["health"] > 0.35
                and pop["age"] >= sp.maturity
            ):
                stage = "flowering"
                pop["flowered_day"] = day
            elif month in sp.fruits and recently_flowered:
                stage = "fruiting"
            else:
                stage = "vegetative"
            pop["stage"] = stage

            payload = {"species": name, "common": sp.common, "cover": round(pop["cover"], 4)}
            if stage == "flowering" and previous != "flowering":
                events.append(self._event(state, "plant.observation", zone.id,
                                          {**payload, "condition": "flowering"}))
                if state["bloom_year"].get(name) != year:
                    state["bloom_year"][name] = year
                    self._note(state, "bloom",
                               f"{sp.common} is flowering in the {zone.name.lower()}.")
            elif stage == "fruiting" and previous != "fruiting":
                events.append(self._event(state, "plant.observation", zone.id,
                                          {**payload, "condition": "fruiting"}))
                if sp.berries and state["bloom_year"].get(f"{name}:fruit") != year:
                    state["bloom_year"][f"{name}:fruit"] = year
                    self._note(state, "fruit", f"{sp.common} berries are ripening in the "
                               f"{zone.name.lower()}.")

            if pop["health"] < 0.55 and not pop["stressed"] and moisture < stress_line:
                pop["stressed"] = True
                events.append(self._event(state, "plant.observation", zone.id, {
                    **payload, "condition": "wilting", "soil_moisture_percent": round(moisture, 1),
                }))
                self._note(state, "stress", f"{sp.common} is wilting in the {zone.name.lower()} "
                           f"as the soil dries to {moisture:.0f}%.")
            if pop["health"] < 0.3 and not pop["declining"]:
                pop["declining"] = True
                events.append(self._event(state, "plant.observation", zone.id,
                                          {**payload, "condition": "declining"}))
            if pop["stressed"] and pop["health"] > 0.8:
                pop["stressed"] = pop["declining"] = False
                events.append(self._event(state, "plant.observation", zone.id,
                                          {**payload, "condition": "stable"}))
                self._note(state, "recovery", f"{sp.common} recovered in the "
                           f"{zone.name.lower()} without intervention.")

            reason = None
            if sp.life == "annual" and month == 11 and pop["age"] > 60:
                reason = "set seed and died back, as annuals do"
            elif (
                sp.life == "biennial"
                and pop["flowered_day"] is not None
                and month not in sp.fruits
                and day - pop["flowered_day"] > 120
            ):
                reason = "completed its two-year life after seeding"
            elif pop["health"] < 0.08 or pop["cover"] < 0.0008:
                reason = "faded out of the zone"
            if reason:
                del zs["plants"][name]
                events.append(self._event(state, "plant.observation", zone.id,
                                          {**payload, "condition": "died back", "reason": reason}))
                if reason == "faded out of the zone":
                    self._note(state, "loss", f"{sp.common} {reason}: "
                               f"{zone.name.lower()}.")
        return events

    def _disperse_seeds(self, state: dict[str, Any], rng: random.Random) -> None:
        """Distribute seeds from fruiting plants and decay each zone seed bank in place."""
        zone_ids = [zone.id for zone in ZONES]
        for zone in ZONES:
            zs = state["zones"][zone.id]
            for name in sorted(zs["plants"]):
                pop = zs["plants"][name]
                if pop["stage"] != "fruiting":
                    continue
                sp = SPECIES[name]
                seeds = pop["cover"] * sp.seed_rate * pop["health"]
                home = 0.85 if sp.dispersal == "local" else 0.6
                self._add_seeds(zs, name, seeds * home)
                if sp.dispersal == "bird":
                    target = rng.choice(zone_ids)
                else:
                    target = rng.choice(zone.neighbours)
                self._add_seeds(state["zones"][target], name, seeds * (1 - home))
        for zone in ZONES:
            bank = state["zones"][zone.id]["seedbank"]
            for name in sorted(bank):
                bank[name] *= 0.996
                if bank[name] < 0.5:
                    del bank[name]

    @staticmethod
    def _add_seeds(zs: dict[str, Any], name: str, amount: float) -> None:
        """Add a positive seed amount to a zone, capping the species bank at 600."""
        if amount <= 0:
            return
        zs["seedbank"][name] = min(600.0, zs["seedbank"].get(name, 0.0) + amount)

    def _germinate(
        self, state: dict[str, Any], rng: random.Random, zone: Zone, temp: float, month: int
    ) -> list[GardenEvent]:
        """Recruit plants from a zone seed bank and return observations of new populations."""
        events: list[GardenEvent] = []
        zs = state["zones"][zone.id]
        moisture = zs["moisture"]
        herb_total = sum(p["cover"] for n, p in zs["plants"].items() if not SPECIES[n].woody)
        for name in sorted(zs["seedbank"]):
            sp = SPECIES[name]
            seeds = zs["seedbank"][name]
            if month not in sp.germinate or temp <= 5:
                continue
            if not sp.wet[0] * 0.7 <= moisture <= sp.wet[1] + 8:
                continue
            pop = zs["plants"].get(name)
            if pop is None:
                if rng.random() >= min(0.6, seeds / 150) * 0.12:
                    continue
                zs["plants"][name] = {"cover": 0.003, "health": 0.85, "stage": "seedling",
                                      "age": 0, "flowered_day": None, "stressed": False,
                                      "declining": False}
                zs["seedbank"][name] = seeds * 0.7
                events.append(self._event(state, "plant.observation", zone.id, {
                    "species": name, "common": sp.common, "condition": "germinating",
                    "cover": 0.003,
                }))
                if name not in state["seen"]["plants"]:
                    state["seen"]["plants"].append(name)
                    self._note(state, "arrival", f"First {sp.common.lower()} seedlings ever seen "
                               f"in the garden, in the {zone.name.lower()}.")
            elif not sp.woody:
                room = _clamp((1.0 - herb_total) / 0.15, 0.0, 1.0)
                pop["cover"] += min(0.003, seeds * 0.00002) * room
                zs["seedbank"][name] = seeds * 0.98
        return events

    def _colonise(self, state: dict[str, Any], rng: random.Random) -> None:
        """Occasionally add seeds from outside the garden and journal their arrival."""
        if rng.random() >= 0.035:
            return
        names = sorted(SPECIES)
        weights = [{"wind": 3.0, "bird": 2.0, "local": 0.5}[SPECIES[n].dispersal] for n in names]
        name = rng.choices(names, weights=weights)[0]
        zone = rng.choice(ZONES)
        self._add_seeds(state["zones"][zone.id], name, rng.uniform(20, 60))
        carrier = {"wind": "on the wind", "bird": "with the birds", "local": "in a clod of soil"}
        self._note(state, "seed-rain", f"Unseen: seeds of {SPECIES[name].common.lower()} arrived "
                   f"in the {zone.name.lower()} {carrier[SPECIES[name].dispersal]}.")

    def _zone_resources(self, zs: dict[str, Any]) -> dict[str, float]:
        """Calculate wildlife food and cover supplies from plant cover and life stages."""
        res = {"nectar": 0.0, "ivy": 0.0, "seeds": 0.0, "berries": 0.0, "acorns": 0.0,
               "woody": 0.0, "herb": 0.0}
        for name, pop in zs["plants"].items():
            sp = SPECIES[name]
            if sp.woody:
                res["woody"] += pop["cover"]
            else:
                res["herb"] += pop["cover"]
            if pop["stage"] == "flowering":
                if name == "ivy":
                    res["ivy"] += pop["cover"] * sp.nectar
                else:
                    res["nectar"] += pop["cover"] * sp.nectar
            if pop["stage"] == "fruiting":
                if sp.berries:
                    res["berries"] += pop["cover"]
                elif name == "oak":
                    res["acorns"] += pop["cover"]
                elif sp.form == "forb":
                    res["seeds"] += pop["cover"] * (3 if name == "teasel" else 0.5)
        return res

    def _wildlife(
        self, state: dict[str, Any], rng: random.Random, temp: float, rain: float, month: int
    ) -> list[GardenEvent]:
        """Update wildlife sightings and return first-zone records and weekly survey events."""
        events: list[GardenEvent] = []
        day = state["day"]
        garden_cover: dict[str, float] = {}
        for zs in state["zones"].values():
            for name, pop in zs["plants"].items():
                garden_cover[name] = garden_cover.get(name, 0.0) + pop["cover"]
        nettle_host = min(1.0, garden_cover.get("nettle", 0.0) / 0.05)
        clover_host = min(1.0, garden_cover.get("red-clover", 0.0) / 0.05)

        sightings = []
        for zone in ZONES:
            zs = state["zones"][zone.id]
            res = self._zone_resources(zs)
            moisture = zs["moisture"]
            supply = {
                "nectar": res["nectar"],
                "nectar+nettle": res["nectar"] * nettle_host,
                "nectar+clover": res["nectar"] * clover_host * (zone.light > 0.7),
                "ivy": res["ivy"],
                "seeds": res["seeds"],
                "berries": res["berries"] + 0.05 * res["woody"],
                "thrush": (res["berries"] + 0.2 * res["woody"]) * (moisture > 28),
                "hedge": res["woody"],
                "acorns": res["acorns"],
                "pond": max(0.0, (moisture - 30) / 30) * min(1.0, res["herb"] + res["woody"]),
                "cover": min(1.0, res["woody"] + 0.5 * res["herb"]),
            }
            for taxon in WILDLIFE:
                if month not in taxon.months or temp < taxon.min_temp:
                    continue
                if taxon.zones and zone.id not in taxon.zones:
                    continue
                warmth = min(1.0, (temp - taxon.min_temp + 2) / 8)
                wet_penalty = 0.35 if taxon.group == "insect" and rain > 4 else 1.0
                lam = min(40.0, taxon.abundance * supply[taxon.needs] * warmth * wet_penalty)
                count = _poisson(rng, lam)
                if count:
                    sightings.append((taxon, zone, count))

        state["sightings"] = []
        for taxon, zone, count in sightings:
            record = state["wildlife"].get(taxon.name)
            first_in_garden = record is None
            if record is None:
                record = {"first_day": day, "last_day": day, "total": 0, "zones": {},
                          "week": 0, "week_zones": {}}
                state["wildlife"][taxon.name] = record
            first_in_zone = zone.id not in record["zones"]
            record["zones"].setdefault(zone.id, day)
            record["total"] += count
            record["last_day"] = day
            record["week"] += count
            record["week_zones"][zone.id] = record["week_zones"].get(zone.id, 0) + count
            state["sightings"].append({"taxon": taxon.name, "common": taxon.common,
                                       "group": taxon.group, "zone": zone.id, "count": count})
            if first_in_zone:
                events.append(self._event(state, "wildlife.observation", zone.id, {
                    "taxon": taxon.name, "common": taxon.common, "group": taxon.group,
                    "count": count, "first_record_in_zone": True,
                    "first_record_in_garden": first_in_garden,
                }))
            if first_in_garden:
                self._note(state, "wildlife", f"First {taxon.common.lower()} recorded in the "
                           f"garden, in the {zone.name.lower()}.")

        if day % 7 == 0:
            for name in sorted(state["wildlife"]):
                record = state["wildlife"][name]
                if record["week"] <= 0:
                    continue
                busiest = max(sorted(record["week_zones"]), key=record["week_zones"].get)
                taxon = TAXON_BY_NAME[name]
                events.append(self._event(state, "wildlife.observation", busiest, {
                    "taxon": name, "common": taxon.common, "group": taxon.group,
                    "count": record["week"], "survey": "weekly",
                }))
                record["week"] = 0
                record["week_zones"] = {}
        return events

    def _fungi(self, state: dict[str, Any], rng: random.Random, month: int) -> list[GardenEvent]:
        """Record seasonal fruiting where rain, moisture and hosts permit, returning observations."""
        events: list[GardenEvent] = []
        if sum(state["recent_rain"]) < 6:
            return events
        day = state["day"]
        for zone in ZONES:
            zs = state["zones"][zone.id]
            if zs["moisture"] <= 28:
                continue
            plants = zs["plants"]
            grass = plants.get("meadow-grass", {}).get("cover", 0.0)
            woody = sum(p["cover"] for n, p in plants.items() if SPECIES[n].form != "climber"
                        and SPECIES[n].woody)
            oak = plants.get("oak", {}).get("cover", 0.0)
            hosts = {"grass": grass > 0.2, "wood": woody > 0.1, "oak": oak > 0.04}
            for fungus in FUNGI:
                if month not in fungus.months or not hosts[fungus.host]:
                    continue
                last = zs["fungi_last"].get(fungus.name)
                if last is not None and day - last < 21:
                    continue
                if rng.random() >= 0.3:
                    continue
                zs["fungi_last"][fungus.name] = day
                state["fungi_recent"] = (state["fungi_recent"] + [
                    {"species": fungus.name, "common": fungus.common, "zone": zone.id, "day": day}
                ])[-24:]
                events.append(self._event(state, "fungi.observation", zone.id, {
                    "species": fungus.name, "common": fungus.common, "host": fungus.host,
                }))
                if fungus.name not in state["seen"]["fungi"]:
                    state["seen"]["fungi"].append(fungus.name)
                    self._note(state, "fungi", f"{fungus.common} fruited in the "
                               f"{zone.name.lower()} after rain.")
        return events

    # ------------------------------------------------------------------ outcomes and learning

    def _renew(self, holder: str, conn: sqlite3.Connection) -> None:
        """Renew the simulation lease in the supplied transaction or raise WildBusyError."""
        if not self.repo.try_acquire_lease(LEASE, holder, LEASE_TTL_SECONDS, connection=conn):
            raise WildBusyError(LOST_LEASE_MESSAGE)

    def _save(self, state: dict[str, Any], conn: sqlite3.Connection) -> None:
        # The lease keeps advances from overlapping; the revision is the fence. Even an advance
        # that lost its lease and later re-acquired it cannot commit over newer state.
        expected = state.get("revision", 0)
        state["revision"] = expected + 1
        if not self.repo.save_world_if_revision(WORLD, state, expected, connection=conn):
            raise WildBusyError(STALE_WORLD_MESSAGE)

    def _ingest_all(
        self,
        state: dict[str, Any],
        events: list[GardenEvent],
        conn: sqlite3.Connection | None = None,
    ) -> int:
        """Ingest observations, register advice for judging and return the number processed."""
        for event in events:
            result = self.engine.ingest(event, connection=conn)
            self._register(state, event, result)
        return len(events)

    def _register(self, state: dict[str, Any], event: GardenEvent, result: dict) -> None:
        """Queue irrigation or inspection advice with its due day and relevant baseline evidence."""
        action = result.get("proposed_action") or {}
        pending = state["judgements"]["pending"]
        if result["decision"] == "PROPOSE" and action.get("type") == "irrigate" and event.zone_id:
            zs = state["zones"][event.zone_id]
            pending.append({
                "recommendation_id": result["recommendation_id"],
                "kind": "irrigate",
                "zone": event.zone_id,
                "due": state["day"] + IRRIGATE_HORIZON_DAYS,
                "damage": zs["damage_total"],
                "rain": state["rain_total"],
            })
        elif (
            result["decision"] == "INVESTIGATE"
            and action.get("type") == "inspect"
            and event.type == "plant.observation"
            and event.zone_id
        ):
            pending.append({
                "recommendation_id": result["recommendation_id"],
                "kind": "inspect",
                "zone": event.zone_id,
                "species": event.payload.get("species"),
                "due": state["day"] + INSPECT_HORIZON_DAYS,
            })

    def _verdict(self, state: dict[str, Any], item: dict[str, Any]) -> tuple[str, float]:
        """Return outcome text and utility for advice based on subsequent simulated conditions."""
        zs = state["zones"][item["zone"]]
        if item["kind"] == "irrigate":
            damage = zs["damage_total"] - item["damage"]
            rain = state["rain_total"] - item["rain"]
            horizon = f"within {IRRIGATE_HORIZON_DAYS} days"
            if damage >= 0.03:
                verdict = (
                    f"drought damage followed {horizon} (health loss {damage:.2f}); "
                    "irrigation was justified."
                )
                return f"Simulated ground truth: {verdict}", 0.6
            if rain >= 5:
                verdict = f"{rain:.1f} mm of rain fell {horizon}; irrigation was unnecessary."
                return f"Simulated ground truth: {verdict}", -0.4
            verdict = "plants tolerated the dry spell without measurable damage."
            return f"Simulated ground truth: {verdict}", -0.1
        species = item.get("species") or "plant"
        common = SPECIES[species].common if species in SPECIES else species
        pop = zs["plants"].get(species)
        if pop is None or pop["health"] < 0.3:
            verdict = f"{common} kept declining; an early inspection was warranted."
            return f"Simulated ground truth: {verdict}", 0.5
        if pop["health"] >= 0.7:
            return f"Simulated ground truth: {common} recovered without intervention.", -0.2
        return f"Simulated ground truth: {common} is still stressed.", 0.1

    def _judge(self, state: dict[str, Any], conn: sqlite3.Connection | None = None) -> int:
        """Record due verdicts and update judgement totals, returning the number resolved.

        Use the supplied connection when present and skip missing or already resolved advice."""
        judgements = state["judgements"]
        due = [item for item in judgements["pending"] if item["due"] <= state["day"]]
        judgements["pending"] = [
            item for item in judgements["pending"] if item["due"] > state["day"]
        ]
        resolved = 0
        for item in due:
            outcome, utility = self._verdict(state, item)
            horizon = IRRIGATE_HORIZON_DAYS if item["kind"] == "irrigate" else INSPECT_HORIZON_DAYS
            try:
                self.repo.add_outcome(
                    item["recommendation_id"],
                    outcome,
                    utility,
                    notes=(
                        f"wild-sim ground truth after {horizon} simulated days; "
                        "the recommended action was never executed"
                    ),
                    connection=conn,
                )
            except (KeyError, ValueError):
                continue  # resolved elsewhere, for example by a human reviewer
            resolved += 1
            judgements["resolved"] += 1
            judgements["utility_sum"] = round(judgements["utility_sum"] + utility, 4)
            kind = judgements["by_kind"].setdefault(item["kind"], {"n": 0, "utility_sum": 0.0})
            kind["n"] += 1
            kind["utility_sum"] = round(kind["utility_sum"] + utility, 4)
        return resolved

    def _evolve(self, state: dict[str, Any]) -> list[dict[str, Any]]:
        """Evaluate agent scores and journal and return evolution candidates not previously seen."""
        self.engine.propose_agent_evolution()
        created = []
        for candidate in self.repo.list_evolution_candidates(500):
            if candidate["id"] in state["evolution_seen"]:
                continue
            state["evolution_seen"].append(candidate["id"])
            created.append({"agent": candidate["agent"],
                            "evidence_problem": candidate["evidence_problem"]})
            self._note(state, "evolution", f"Evolution candidate raised for the "
                       f"{candidate['agent']} agent: {candidate['evidence_problem']}")
        return created

    # ------------------------------------------------------------------ helpers

    def _metrics(self, state: dict[str, Any]) -> dict[str, Any]:
        """Summarize plant diversity, recent wildlife, recorded taxa and mean cover."""
        totals: dict[str, float] = {}
        for zs in state["zones"].values():
            for name, pop in zs["plants"].items():
                totals[name] = totals.get(name, 0.0) + pop["cover"]
        total = sum(totals.values())
        shannon = 0.0
        if total > 0:
            for cover in totals.values():
                share = cover / total
                if share > 0:
                    shannon -= share * math.log(share)
        recent = [rec for rec in state["wildlife"].values() if rec["last_day"] >= state["day"] - 30]
        return {
            "plant_species": sum(1 for cover in totals.values() if cover > 0.002),
            "wildlife_taxa_30d": len(recent),
            "taxa_recorded": (
                len(state["seen"]["plants"]) + len(state["wildlife"]) + len(state["seen"]["fungi"])
            ),
            "shannon": round(shannon, 3),
            "mean_cover": round(total / len(ZONES), 3),
        }

    def _history_point(self, state: dict[str, Any]) -> dict[str, Any]:
        """Pair the current simulated day with biodiversity and cover metrics."""
        return {"day": state["day"], **self._metrics(state)}

    def _date(self, state: dict[str, Any]) -> date:
        """Return the simulated date from the world start date and elapsed days."""
        return date.fromisoformat(state["start"]) + timedelta(days=state["day"])

    def _note(self, state: dict[str, Any], kind: str, text: str) -> None:
        """Append a dated journal entry and retain only the configured recent-entry limit."""
        state["journal"].append({
            "day": state["day"],
            "date": self._date(state).isoformat(),
            "kind": kind,
            "text": text,
        })
        state["journal"] = state["journal"][-JOURNAL_LIMIT:]

    def _event(
        self, state: dict[str, Any], event_type: str, zone_id: str | None, payload: dict[str, Any]
    ) -> GardenEvent:
        """Create an observation stamped with the simulation source, flag, day and date."""
        return GardenEvent(
            type=event_type,
            zone_id=zone_id,
            source=SOURCE,
            observed_at=datetime.now(UTC),
            payload={
                **payload,
                "simulated": True,
                "sim_day": state["day"],
                "sim_date": self._date(state).isoformat(),
            },
        )
