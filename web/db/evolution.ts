import { env } from "cloudflare:workers";
import { advanceGarden, createProofGardenState } from "@/lib/evolution/advance";
import {
  PROOF_GARDEN_ID,
  RULES_VERSION,
  type EnvironmentInterval,
  type GardenEvent,
  type GardenState,
} from "@/lib/evolution/types";

type GardenRow = {
  gardenId: string;
  seed: number;
  rulesVersion: number;
  revision: number;
  lastTickId: number | null;
  stateJson: string;
};

type EventRow = {
  eventId: string;
  gardenId: string;
  tickId: number;
  eventType: string;
  keeper: string | null;
  plantId: string | null;
  payloadJson: string;
  createdAt: number;
};

function database(): D1Database {
  if (!env.DB) throw new Error("Garden storage unavailable");
  return env.DB;
}

function parseState(row: GardenRow): GardenState {
  const state = JSON.parse(row.stateJson) as GardenState;
  if (state.gardenId !== row.gardenId || state.rulesVersion !== row.rulesVersion) {
    throw new Error("Evolution garden state identity mismatch");
  }
  return state;
}

export async function getEvolutionSnapshot(gardenId = PROOF_GARDEN_ID) {
  const row = await database()
    .prepare(
      "SELECT garden_id AS gardenId, seed, rules_version AS rulesVersion, revision, last_tick_id AS lastTickId, state_json AS stateJson FROM evolution_gardens WHERE garden_id = ?",
    )
    .bind(gardenId)
    .first<GardenRow>();

  if (!row) return null;

  const eventResult = await database()
    .prepare(
      "SELECT event_id AS eventId, garden_id AS gardenId, tick_id AS tickId, event_type AS eventType, keeper, plant_id AS plantId, payload_json AS payloadJson, created_at AS createdAt FROM garden_events WHERE garden_id = ? ORDER BY tick_id DESC, event_id DESC LIMIT 20",
    )
    .bind(gardenId)
    .all<EventRow>();

  return {
    garden: parseState(row),
    events: (eventResult.results ?? []).map((event) => ({
      id: event.eventId,
      gardenId: event.gardenId,
      tickId: event.tickId,
      type: event.eventType,
      keeper: event.keeper,
      plantId: event.plantId,
      payload: JSON.parse(event.payloadJson),
      createdAt: event.createdAt,
    })),
  };
}

async function ensureProofGarden(now: number): Promise<GardenState> {
  const initial = createProofGardenState();
  await database()
    .prepare(
      "INSERT INTO evolution_gardens (garden_id, seed, rules_version, revision, last_tick_id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?) ON CONFLICT(garden_id) DO NOTHING",
    )
    .bind(
      initial.gardenId,
      initial.seed,
      initial.rulesVersion,
      initial.revision,
      JSON.stringify(initial),
      now,
      now,
    )
    .run();

  const snapshot = await getEvolutionSnapshot(initial.gardenId);
  if (!snapshot) throw new Error("Proof garden was not saved");
  return snapshot.garden;
}

export async function runEvolutionTick(
  environment: EnvironmentInterval,
  now = Date.now(),
) {
  if (!Number.isSafeInteger(environment.tickId) || environment.tickId < 0) {
    throw new Error("Invalid hourly tick id");
  }
  if (!Number.isFinite(environment.precipitationMm) || environment.precipitationMm < 0) {
    throw new Error("Invalid precipitation input");
  }

  const previous = await ensureProofGarden(now);
  const advanced = advanceGarden(previous, environment);
  if (!advanced.applied) {
    return { applied: false, reason: "duplicate_or_old_tick", snapshot: await getEvolutionSnapshot(previous.gardenId) };
  }

  const runId = `${previous.gardenId}:${previous.rulesVersion}:${environment.tickId}:run`;
  const createdAt = environment.tickId * 3_600_000;
  const statements = [
    database()
      .prepare(
        "INSERT INTO environment_intervals (garden_id, rules_version, tick_id, provider, source_status, precipitation_mm, temperature_c, payload_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(garden_id, rules_version, tick_id) DO NOTHING",
      )
      .bind(
        previous.gardenId,
        previous.rulesVersion,
        environment.tickId,
        environment.provider,
        environment.sourceStatus,
        environment.precipitationMm,
        environment.temperatureC,
        JSON.stringify(environment),
        now,
      ),
    database()
      .prepare(
        "UPDATE evolution_gardens SET revision = ?, last_tick_id = ?, state_json = ?, updated_at = ? WHERE garden_id = ? AND revision = ? AND (last_tick_id IS NULL OR last_tick_id < ?)",
      )
      .bind(
        advanced.state.revision,
        environment.tickId,
        JSON.stringify(advanced.state),
        now,
        previous.gardenId,
        previous.revision,
        environment.tickId,
      ),
    ...advanced.events.map((event: GardenEvent) =>
      database()
        .prepare(
          "INSERT INTO garden_events (event_id, garden_id, rules_version, tick_id, event_type, keeper, plant_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING",
        )
        .bind(
          event.id,
          event.gardenId,
          previous.rulesVersion,
          event.tickId,
          event.type,
          event.keeper,
          event.plantId,
          JSON.stringify(event.payload),
          createdAt,
        ),
    ),
    database()
      .prepare(
        "INSERT INTO applied_ticks (garden_id, rules_version, tick_id, state_revision, applied_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(garden_id, rules_version, tick_id) DO NOTHING",
      )
      .bind(previous.gardenId, previous.rulesVersion, environment.tickId, advanced.state.revision, now),
    database()
      .prepare(
        "INSERT INTO background_runs (run_id, garden_id, rules_version, tick_id, status, event_count, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO NOTHING",
      )
      .bind(
        runId,
        previous.gardenId,
        previous.rulesVersion,
        environment.tickId,
        "committed",
        advanced.events.length,
        now,
        now,
      ),
  ];

  const results = await database().batch(statements);
  const stateChanges = Number(results[1]?.meta?.changes ?? 0);
  if (stateChanges !== 1) {
    return { applied: false, reason: "concurrent_or_duplicate_tick", snapshot: await getEvolutionSnapshot(previous.gardenId) };
  }

  return {
    applied: true,
    reason: "committed",
    tickId: environment.tickId,
    events: advanced.events,
    snapshot: await getEvolutionSnapshot(previous.gardenId),
  };
}

export { PROOF_GARDEN_ID, RULES_VERSION };
