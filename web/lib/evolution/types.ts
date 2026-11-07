export const PROOF_GARDEN_ID = "proof-darwin-v2";
export const RULES_VERSION = 2;

export type SourceStatus = "fresh" | "stale" | "simulated";

export type EnvironmentInterval = {
  tickId: number;
  precipitationMm: number;
  temperatureC: number | null;
  provider: string;
  sourceStatus: SourceStatus;
};

export type PlantState = {
  id: string;
  moisture: number;
  growth: number;
  vitality: number;
  lastWateredTick: number | null;
};

export type KeeperState = {
  id: "dew";
  state: "idle" | "rest";
  abilityLevel: number;
  targetId: string | null;
  lastActionTick: number | null;
};

export type GardenState = {
  gardenId: string;
  seed: number;
  rulesVersion: number;
  revision: number;
  lastTickId: number | null;
  waterReserve: number;
  plants: PlantState[];
  keepers: KeeperState[];
};

export type GardenEvent = {
  id: string;
  gardenId: string;
  tickId: number;
  type: "keeper.watered";
  keeper: "dew";
  plantId: string;
  payload: {
    moistureBefore: number;
    moistureAfter: number;
    waterUsed: number;
    precipitationMm: number;
    environmentStatus: SourceStatus;
    reason: string;
  };
};

export type AdvanceResult = {
  state: GardenState;
  events: GardenEvent[];
  applied: boolean;
};
