import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(), seed: integer("seed").notNull(), bornAt: integer("born_at").notNull(),
  rulesVersion: integer("rules_version").notNull(), climate: text("climate").notNull(), state: text("state").notNull(),
  revision: integer("revision").notNull(), lastTick: integer("last_tick").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const environmentSamples = sqliteTable("environment_samples", {
  id: text("id").primaryKey(), city: text("city").notNull(), provider: text("provider").notNull(),
  validStart: integer("valid_start").notNull(), validEnd: integer("valid_end").notNull(), fetchedAt: integer("fetched_at").notNull(),
  sourceStatus: text("source_status").notNull(), values: text("values_json").notNull(),
}, t => [index("idx_environment_city_end_fetch").on(t.city, t.validEnd, t.fetchedAt)]);
export const backgroundRuns = sqliteTable("background_runs", {
  id: text("id").primaryKey(), trigger: text("trigger").notNull(), slot: integer("slot").notNull(), startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"), status: text("status").notNull(), committedTicks: integer("committed_ticks").notNull().default(0),
  weatherStatus: text("weather_status"), error: text("error"),
}, t => [index("idx_runs_started_at").on(t.startedAt)]);
export const appliedTicks = sqliteTable("applied_ticks", {
  gardenId: text("garden_id").notNull().references(() => worlds.id), rulesVersion: integer("rules_version").notNull(), tickId: integer("tick_id").notNull(),
  inputId: text("input_id").notNull().references(() => environmentSamples.id), runId: text("run_id").notNull().references(() => backgroundRuns.id),
  revision: integer("revision").notNull(), committedAt: integer("committed_at").notNull(),
}, (t) => [primaryKey({ columns: [t.gardenId, t.rulesVersion, t.tickId] })]);
export const gardenEvents = sqliteTable("garden_events", {
  id: text("id").primaryKey(), gardenId: text("garden_id").notNull().references(() => worlds.id), tickId: integer("tick_id").notNull(),
  rulesVersion: integer("rules_version").notNull(), revision: integer("revision").notNull(), type: text("type").notNull(),
  keeper: text("keeper").notNull(), payload: text("payload").notNull(), committedAt: integer("committed_at").notNull(),
}, t => [index("idx_events_garden_revision").on(t.gardenId, t.revision)]);
export const proofBaseline = sqliteTable("proof_baseline", {
  id: text("id").primaryKey(), gardenId: text("garden_id").notNull().references(() => worlds.id),
  startedAt: integer("started_at").notNull(), revision: integer("revision").notNull(), state: text("state").notNull(),
});
