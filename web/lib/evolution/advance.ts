import {
  PROOF_GARDEN_ID,
  RULES_VERSION,
  type AdvanceResult,
  type EnvironmentInterval,
  type GardenState,
  type KeeperState,
} from "@/lib/evolution/types";

const DRY_THRESHOLD = 25;
const DEW_WATER_AMOUNT = 8;
const HOURLY_DRYING = 2;
const MAX_WATER = 100;

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function createProofGardenState(seed = 0x51a11d): GardenState {
  return {
    gardenId: PROOF_GARDEN_ID,
    seed: seed >>> 0,
    rulesVersion: RULES_VERSION,
    revision: 0,
    lastTickId: null,
    waterReserve: 40,
    plants: [
      { id: "plant-001", moisture: 14, growth: 0.12, vitality: 1, lastWateredTick: null },
    ],
    keepers: [
      { id: "dew", state: "idle", abilityLevel: 1, targetId: null, lastActionTick: null },
    ],
  };
}

export function advanceGarden(
  previous: GardenState,
  environment: EnvironmentInterval,
): AdvanceResult {
  if (previous.lastTickId !== null && environment.tickId <= previous.lastTickId) {
    return { state: previous, events: [], applied: false };
  }

  const rainGain = clamp(environment.precipitationMm, 0, 25) * 2;
  let waterReserve = clamp(previous.waterReserve + rainGain, 0, MAX_WATER);
  const plants = previous.plants.map((plant) => ({
    ...plant,
    moisture: clamp(plant.moisture + environment.precipitationMm * 3 - HOURLY_DRYING),
  }));
  const keepers: KeeperState[] = previous.keepers.map((keeper) => ({
    ...keeper,
    state: "idle",
    targetId: null,
  }));
  const dew = keepers.find((keeper) => keeper.id === "dew");
  const target = plants
    .filter((plant) => plant.moisture < DRY_THRESHOLD)
    .sort((a, b) => a.moisture - b.moisture || a.id.localeCompare(b.id))[0];

  const events: AdvanceResult["events"] = [];
  if (dew && dew.abilityLevel >= 1 && target && waterReserve >= DEW_WATER_AMOUNT) {
    const moistureBefore = target.moisture;
    target.moisture = clamp(target.moisture + DEW_WATER_AMOUNT);
    target.lastWateredTick = environment.tickId;
    waterReserve -= DEW_WATER_AMOUNT;
    dew.state = "rest";
    dew.targetId = target.id;
    dew.lastActionTick = environment.tickId;
    events.push({
      id: `${previous.gardenId}:${previous.rulesVersion}:${environment.tickId}:dew:${target.id}`,
      gardenId: previous.gardenId,
      tickId: environment.tickId,
      type: "keeper.watered",
      keeper: "dew",
      plantId: target.id,
      payload: {
        moistureBefore,
        moistureAfter: target.moisture,
        waterUsed: DEW_WATER_AMOUNT,
        precipitationMm: environment.precipitationMm,
        environmentStatus: environment.sourceStatus,
        reason: `Plant moisture ${moistureBefore.toFixed(1)} was below the ${DRY_THRESHOLD}% watering threshold.`,
      },
    });
  }

  return {
    applied: true,
    events,
    state: {
      ...previous,
      revision: previous.revision + 1,
      lastTickId: environment.tickId,
      waterReserve,
      plants,
      keepers,
    },
  };
}
