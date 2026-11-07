import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const gardens = sqliteTable("gardens", {
  id: text("id").primaryKey(),
  seed: integer("seed").notNull(),
  bornAt: integer("born_at").notNull(),
  version: integer("version").notNull().default(1),
});

// Dew persistent-hour proof tables (migration 0001_dew_persistent_hour). The evolution runtime path
// in db/evolution.ts executes raw SQL against these tables; modelling them here keeps the Drizzle
// schema, journal and snapshot consistent so drizzle-kit treats them as managed rather than drift.
export const evolutionGardens = sqliteTable("evolution_gardens", {
  gardenId: text("garden_id").primaryKey(),
  seed: integer("seed").notNull(),
  rulesVersion: integer("rules_version").notNull(),
  revision: integer("revision").notNull().default(0),
  lastTickId: integer("last_tick_id"),
  stateJson: text("state_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const environmentIntervals = sqliteTable(
  "environment_intervals",
  {
    gardenId: text("garden_id").notNull(),
    rulesVersion: integer("rules_version").notNull(),
    tickId: integer("tick_id").notNull(),
    provider: text("provider").notNull(),
    sourceStatus: text("source_status").notNull(),
    precipitationMm: real("precipitation_mm").notNull(),
    temperatureC: real("temperature_c"),
    payloadJson: text("payload_json").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.gardenId, table.rulesVersion, table.tickId] }),
  ],
);

export const appliedTicks = sqliteTable(
  "applied_ticks",
  {
    gardenId: text("garden_id").notNull(),
    rulesVersion: integer("rules_version").notNull(),
    tickId: integer("tick_id").notNull(),
    stateRevision: integer("state_revision").notNull(),
    appliedAt: integer("applied_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.gardenId, table.rulesVersion, table.tickId] }),
  ],
);

export const gardenEvents = sqliteTable(
  "garden_events",
  {
    eventId: text("event_id").primaryKey(),
    gardenId: text("garden_id").notNull(),
    rulesVersion: integer("rules_version").notNull(),
    tickId: integer("tick_id").notNull(),
    eventType: text("event_type").notNull(),
    keeper: text("keeper"),
    plantId: text("plant_id"),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("garden_events_garden_tick_idx").on(table.gardenId, table.tickId),
  ],
);

export const backgroundRuns = sqliteTable("background_runs", {
  runId: text("run_id").primaryKey(),
  gardenId: text("garden_id").notNull(),
  rulesVersion: integer("rules_version").notNull(),
  tickId: integer("tick_id").notNull(),
  status: text("status").notNull(),
  eventCount: integer("event_count").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at").notNull(),
});
