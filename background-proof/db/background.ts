import { env } from "cloudflare:workers";
import { advance, GARDEN_ID, HOUR, initialState, MAX_CATCH_UP, PROOF_ID, RULES_VERSION, type Environment, type World } from "@/lib/world";
import { archivedInput, collectWeather, missingInput, parseForecast } from "@/lib/weather";
type Row = Omit<World, "state"> & { state: string };
function db() { if (!env.DB) throw new Error("Proof storage unavailable"); return env.DB; }
const worldQuery = "SELECT id, seed, born_at AS bornAt, rules_version AS rulesVersion, climate, state, revision, last_tick AS lastTick, updated_at AS updatedAt FROM worlds WHERE id = ?";
export async function getWorld(): Promise<World | null> {
  const row = await db().prepare(worldQuery).bind(GARDEN_ID).first<Row>();
  return row ? { ...row, state: JSON.parse(row.state) } : null;
}
async function initialise(now: number) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  await db().batch([
    db().prepare("INSERT INTO worlds (id, seed, born_at, rules_version, climate, state, revision, last_tick, updated_at) VALUES (?, ?, ?, ?, 'darwin', ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(GARDEN_ID, seed, now, RULES_VERSION, JSON.stringify(initialState()), Math.floor(now / HOUR), now),
    db().prepare("INSERT INTO proof_baseline (id, garden_id, started_at, revision, state) SELECT 'absence-001', id, born_at, revision, state FROM worlds WHERE id = ? ON CONFLICT(id) DO NOTHING").bind(GARDEN_ID),
  ]);
}
async function saveInput(input: Environment) {
  await db().prepare("INSERT INTO environment_samples (id, city, provider, valid_start, valid_end, fetched_at, source_status, values_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(input.id, input.city, input.provider, input.validStart, input.validEnd, input.fetchedAt, input.sourceStatus, JSON.stringify(input)).run();
}
export async function commitTick(world: World, tickId: number, input: Environment, runId: string, committedAt: number): Promise<boolean> {
  if (world.rulesVersion !== RULES_VERSION || tickId !== world.lastTick + 1 || input.validEnd > committedAt) throw new Error("Tick is out of order or incomplete");
  const result = advance(world.state, tickId, input); const revision = world.revision + 1;
  const ownedTick = "EXISTS (SELECT 1 FROM applied_ticks WHERE garden_id = ? AND rules_version = ? AND tick_id = ? AND run_id = ?)";
  const key = [GARDEN_ID, RULES_VERSION, tickId, runId];
  const batch = [
    db().prepare("INSERT INTO applied_ticks (garden_id, rules_version, tick_id, input_id, run_id, revision, committed_at) SELECT id, ?, ?, ?, ?, ?, ? FROM worlds WHERE id = ? AND revision = ? AND last_tick = ? AND rules_version = ?")
      .bind(RULES_VERSION, tickId, input.id, runId, revision, committedAt, GARDEN_ID, world.revision, world.lastTick, RULES_VERSION),
    ...result.events.map(e => db().prepare(`INSERT INTO garden_events (id, garden_id, tick_id, rules_version, revision, type, keeper, payload, committed_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ownedTick} AND EXISTS (SELECT 1 FROM worlds WHERE id = ? AND revision = ?)`)
      .bind(`${GARDEN_ID}:${RULES_VERSION}:${tickId}:${e.type}`, GARDEN_ID, tickId, RULES_VERSION, revision, e.type, e.keeper, JSON.stringify(e), committedAt, ...key, GARDEN_ID, world.revision)),
    db().prepare(`UPDATE worlds SET state = ?, revision = ?, last_tick = ?, updated_at = ? WHERE id = ? AND revision = ? AND last_tick = ? AND ${ownedTick}`)
      .bind(JSON.stringify(result.state), revision, tickId, committedAt, GARDEN_ID, world.revision, world.lastTick, ...key),
  ];
  const committed = await db().batch(batch);
  return committed[0].meta.changes === 1;
}
export async function runBackground(trigger: "manual" | "schedule", now = Date.now(), relay?: unknown) {
  const runId = crypto.randomUUID(); const slot = Math.floor(now / HOUR);
  let count = 0; let weatherStatus = "unavailable";
  await db().prepare("INSERT INTO background_runs (id, trigger, slot, started_at, status) VALUES (?, ?, ?, ?, 'running')").bind(runId, trigger, slot, now).run();
  console.info(JSON.stringify({ event: "stillwild_run_started", runId, callerDeclaredTrigger: trigger, slot, at: now }));
  try {
    await initialise(now);
    const fetched: Environment[] = [];
    try {
      fetched.push(...(relay === undefined ? await collectWeather(now) : parseForecast(relay, now, "scheduler-relay")));
      if (!fetched.length) throw new Error("No complete weather intervals");
      weatherStatus = relay === undefined ? "modelled" : "relayed-modelled";
      const world = await getWorld(); if (!world) throw new Error("World missing");
      const needed = fetched.filter(i => i.validEnd === slot * HOUR || (i.validEnd > world.lastTick * HOUR && i.validEnd <= (world.lastTick + MAX_CATCH_UP) * HOUR));
      await db().batch(needed.map(i => db().prepare("INSERT INTO environment_samples (id, city, provider, valid_start, valid_end, fetched_at, source_status, values_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(i.id, i.city, i.provider, i.validStart, i.validEnd, i.fetchedAt, i.sourceStatus, JSON.stringify(i))));
    } catch (error) { fetched.length = 0; weatherStatus = "unavailable"; console.warn("Stillwild weather unavailable", error instanceof Error ? error.message : "unknown"); }
    for (let n = 0; n < MAX_CATCH_UP; n++) {
      const world = await getWorld(); if (!world) throw new Error("World missing");
      if (world.lastTick >= slot) break;
      const tick = world.lastTick + 1; let input = fetched.find(i => i.validEnd === tick * HOUR);
      if (!input) {
        const stored = await db().prepare("SELECT values_json AS valuesJson FROM environment_samples WHERE city = 'darwin' AND valid_end = ? AND source_status != 'simulated' ORDER BY fetched_at DESC LIMIT 1").bind(tick * HOUR).first<{ valuesJson: string }>();
        input = stored ? archivedInput(JSON.parse(stored.valuesJson), now) : missingInput(tick, now);
        if (input.sourceStatus === "stale") input = { ...input, id: `${input.id}:stale` };
        await saveInput(input);
      }
      if (await commitTick(world, tick, input, runId, Date.now())) count++;
    }
    const end = Date.now();
    await db().prepare("UPDATE background_runs SET finished_at = ?, status = 'succeeded', committed_ticks = ?, weather_status = ? WHERE id = ?").bind(end, count, weatherStatus, runId).run();
    const world = await getWorld();
    const evidence = { runId, trigger, slot, status: "succeeded", committedTicks: count, weatherStatus, revision: world?.revision, remainingTicks: Math.max(0, slot - (world?.lastTick ?? slot)) };
    console.info(JSON.stringify({ event: "stillwild_run_finished", ...evidence, at: end })); return evidence;
  } catch (error) {
    await db().prepare("UPDATE background_runs SET finished_at = ?, status = 'failed', committed_ticks = ?, weather_status = ?, error = ? WHERE id = ?")
      .bind(Date.now(), count, weatherStatus, error instanceof Error ? error.message.slice(0,300) : "Unknown error", runId).run();
    throw error;
  }
}
export async function snapshot(logView = false) {
  const now = Date.now();
  // Read-only batch gives a state and its history from a consistent database transaction.
  const records = await db().batch([
    db().prepare(worldQuery).bind(GARDEN_ID),
    db().prepare("SELECT id, tick_id AS tickId, revision, type, keeper, payload, committed_at AS committedAt FROM garden_events WHERE garden_id = ? ORDER BY revision DESC, id LIMIT 30").bind(GARDEN_ID),
    db().prepare("SELECT id, trigger, slot, started_at AS startedAt, finished_at AS finishedAt, status, committed_ticks AS committedTicks, weather_status AS weatherStatus FROM background_runs ORDER BY started_at DESC LIMIT 30"),
    db().prepare("SELECT started_at AS startedAt, revision, state FROM proof_baseline WHERE id = ?").bind(PROOF_ID),
    db().prepare("SELECT COUNT(*) AS n FROM applied_ticks WHERE garden_id = ?").bind(GARDEN_ID),
  ]);
  const row = records[0].results[0] as unknown as Row | undefined;
  const world = row ? { ...row, state: JSON.parse(row.state) } : null;
  const baseline = records[3].results[0] as { startedAt: number; revision: number; state: string } | undefined;
  if (logView) console.info(JSON.stringify({ event: "stillwild_snapshot_view", at: now, revision: world?.revision ?? null }));
  const eventRows = records[1].results as { id: string; tickId: number; revision: number; type: string; keeper: string; payload: string; committedAt: number }[];
  return { world, events: eventRows.map(r => ({ ...r, payload: JSON.parse(r.payload) })),
    runs: records[2].results, serverNow: now, completedTicks: (records[4].results[0] as { n: number } | undefined)?.n ?? 0,
    proof: { status: "PENDING_24_HOUR_ABSENCE_CHECK", baseline: baseline ? { ...baseline, state: JSON.parse(baseline.state) } : null,
      earliestCheckAt: baseline ? baseline.startedAt + 24 * HOUR : null, independentScheduleLogsRequired: true, allViewsClosedConfirmed: false } };
}
export async function startAbsenceCheck() {
  const now = Date.now();
  // An immutable test checkpoint, separate from garden creation. Retrying cannot restart its clock.
  await db().prepare("INSERT INTO proof_baseline (id, garden_id, started_at, revision, state) SELECT ?, id, ?, revision, state FROM worlds WHERE id = ? ON CONFLICT(id) DO NOTHING").bind(PROOF_ID, now, GARDEN_ID).run();
  const evidence = await snapshot();
  if (!evidence.proof.baseline) throw new Error("Initialise the garden before starting its absence check");
  console.info(JSON.stringify({ event: "stillwild_absence_baseline", startedAt: evidence.proof.baseline.startedAt, revision: evidence.proof.baseline.revision }));
  return evidence.proof;
}
