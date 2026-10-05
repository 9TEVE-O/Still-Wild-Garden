export const HOUR = 3_600_000;
export const RULES_VERSION = 2;
export const GARDEN_ID = "darwin-proof-001";
export const PROOF_ID = "absence-check-001";
export const MAX_CATCH_UP = 6;
export type Environment = {
  id: string; city: "darwin"; provider: "open-meteo:best_match" | "stillwild:fallback";
  validStart: number; validEnd: number; fetchedAt: number; sourceStatus: "modelled" | "stale" | "simulated";
  transport: "worker-fetch" | "scheduler-relay" | "fallback";
  temperatureC: number; precipitationMm: number; cloudPercent: number; windKmh: number;
  isDay: boolean; sunrise: number | null; sunset: number | null;
  units: { temperature: "°C"; precipitation: "mm"; cloud: "%"; wind: "km/h" };
};
export type Keeper = { task: string; completed: number };
export type WorldState = {
  plants: number; habitat: number; water: number; soilMoisture: number;
  keepers: { Pip: Keeper; Dew: Keeper; Moss: Keeper }; environment: Environment | null;
};
export type Consequence = { type: string; keeper: "Pip" | "Dew" | "Moss"; text: string; change: Record<string, number> };
export type World = { id: string; seed: number; bornAt: number; rulesVersion: number; climate: string;
  state: WorldState; revision: number; lastTick: number; updatedAt: number };
export function initialState(): WorldState {
  return { plants: 1, habitat: 4, water: 20, soilMoisture: 50,
    keepers: { Pip: { task: "find-space", completed: 0 }, Dew: { task: "collect", completed: 0 }, Moss: { task: "observe", completed: 0 } }, environment: null };
}
export function advance(state: WorldState, tickId: number, input: Environment) {
  if (!Number.isSafeInteger(tickId) || input.validEnd !== tickId * HOUR || input.validStart !== input.validEnd - HOUR) throw new Error("Invalid UTC interval");
  const next = structuredClone(state); const events: Consequence[] = [];
  const emit = (type: string, keeper: Consequence["keeper"], text: string, change: Record<string, number>) => events.push({ type, keeper, text, change });
  const beforeRain = next.water; next.water = Math.min(100, next.water + input.precipitationMm * 3);
  if (next.water > beforeRain) emit("rain-collected", "Dew", "Rain found its way into the water store.", { water: next.water - beforeRain });
  const dew = next.keepers.Dew;
  if (dew.task === "collect") {
    const amount = Math.min(4, 100 - next.water); next.water += amount; dew.task = "carry";
    emit("spring-water-collected", "Dew", "Dew collected a little water from the spring.", { water: amount });
  } else if (dew.task === "carry") dew.task = "water-roots";
  else {
    const amount = Math.min(3, next.water); next.water -= amount;
    const before = next.soilMoisture; next.soilMoisture = Math.min(100, before + amount * 3);
    dew.task = "collect"; dew.completed++;
    emit("roots-watered", "Dew", "Dew brought water to the roots.", { water: -amount, soilMoisture: next.soilMoisture - before });
  }
  const moss = next.keepers.Moss;
  if (moss.task === "observe") moss.task = "make-space";
  else if (moss.task === "make-space") { next.habitat++; moss.completed++; moss.task = "rest"; emit("habitat-made", "Moss", "Moss made a quiet place for another seed.", { habitat: 1 }); }
  else moss.task = "observe";
  const pip = next.keepers.Pip;
  if (pip.task === "find-space") pip.task = "sow";
  else if (pip.task === "sow" && next.plants < next.habitat) { next.plants++; pip.completed++; pip.task = "rest"; emit("seed-planted", "Pip", "Pip planted a new seed.", { plants: 1 }); }
  else pip.task = "find-space";
  // Creative world units, not horticultural calibration. No plants die from absence.
  next.soilMoisture = Math.max(15, next.soilMoisture - (input.isDay ? 1 : 0.25));
  next.water = Math.round(next.water * 1000) / 1000; next.soilMoisture = Math.round(next.soilMoisture * 1000) / 1000;
  next.environment = input;
  return { state: next, events };
}
