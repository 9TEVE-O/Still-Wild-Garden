import { env } from "cloudflare:workers";
import { advance, GARDEN_ID, HOUR, initialState, MAX_CATCH_UP, ORIGINAL_PROOF_ID, PROOF_ID, RULES_VERSION, VIEW_PROTOCOL_VERSION, type Environment, type World } from "@/lib/world";
import { archivedInput, collectWeather, missingInput, parseForecast } from "@/lib/weather";
type Row = Omit<World, "state"> & { state: string };
export type SchedulerExecution = { taskId: string; executionId: string; triggeredAt: number };
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
    ...result.events.map(e => db().prepare(`INSERT INTO garden_events (id, garden_id, tick_id, rules_version, revision, run_id, type, keeper, payload, committed_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ownedTick} AND EXISTS (SELECT 1 FROM worlds WHERE id = ? AND revision = ?)`)
      .bind(`${GARDEN_ID}:${RULES_VERSION}:${tickId}:${e.type}`, GARDEN_ID, tickId, RULES_VERSION, revision, runId, e.type, e.keeper, JSON.stringify(e), committedAt, ...key, GARDEN_ID, world.revision)),
    db().prepare(`UPDATE worlds SET state = ?, revision = ?, last_tick = ?, updated_at = ? WHERE id = ? AND revision = ? AND last_tick = ? AND ${ownedTick}`)
      .bind(JSON.stringify(result.state), revision, tickId, committedAt, GARDEN_ID, world.revision, world.lastTick, ...key),
  ];
  const committed = await db().batch(batch);
  return committed[0].meta.changes === 1;
}
export async function runBackground(trigger: "manual" | "schedule", now = Date.now(), relay?: unknown, scheduler?: SchedulerExecution) {
  const runId = crypto.randomUUID(); const slot = Math.floor(now / HOUR);
  let count = 0; let weatherStatus = "unavailable";
  await db().prepare("INSERT INTO background_runs (id, trigger, slot, started_at, status, scheduler_task_id, scheduler_execution_id, scheduler_triggered_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)")
    .bind(runId, trigger, slot, now, scheduler?.taskId ?? null, scheduler?.executionId ?? null, scheduler?.triggeredAt ?? null).run();
  console.info(JSON.stringify({ event: "stillwild_run_started", runId, callerDeclaredTrigger: trigger, callerDeclaredSchedulerExecutionId: scheduler?.executionId ?? null, slot, at: now }));
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
    const evidence = { runId, trigger, schedulerExecutionId: scheduler?.executionId ?? null, slot, status: "succeeded", committedTicks: count, weatherStatus, revision: world?.revision, remainingTicks: Math.max(0, slot - (world?.lastTick ?? slot)) };
    console.info(JSON.stringify({ event: "stillwild_run_finished", ...evidence, at: end })); return evidence;
  } catch (error) {
    await db().prepare("UPDATE background_runs SET finished_at = ?, status = 'failed', committed_ticks = ?, weather_status = ?, error = ? WHERE id = ?")
      .bind(Date.now(), count, weatherStatus, error instanceof Error ? error.message.slice(0,300) : "Unknown error", runId).run();
    throw error;
  }
}
const VIEW_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isViewSessionId = (value: unknown): value is string => typeof value === "string" && VIEW_SESSION_ID.test(value);
type ViewGateRow = { startedAt: number; ownerAttestedAt: number | null; activeSessionsAtStart: number | null; protocolVersion: string | null;
  openEvents: number; snapshotEvents: number; heartbeatEvents: number; closeEvents: number; sessionsOverlappingWindow: number };
export async function snapshot(logView = false, sessionId: string | null = null) {
  const now = Date.now();
  // Read-only: one batch gives state, history and proof evidence from a consistent transaction. It never writes;
  // the page records each view through POST /api/view/session before it reads.
  const records = await db().batch([
    db().prepare(worldQuery).bind(GARDEN_ID),
    db().prepare("SELECT id, tick_id AS tickId, revision, run_id AS runId, type, keeper, payload, committed_at AS committedAt FROM garden_events WHERE garden_id = ? ORDER BY revision DESC, id LIMIT 30").bind(GARDEN_ID),
    db().prepare("SELECT id, trigger, slot, started_at AS startedAt, finished_at AS finishedAt, status, committed_ticks AS committedTicks, weather_status AS weatherStatus, scheduler_task_id AS schedulerTaskId, scheduler_execution_id AS schedulerExecutionId, scheduler_triggered_at AS schedulerTriggeredAt FROM background_runs ORDER BY started_at DESC LIMIT 30"),
    db().prepare("SELECT id, started_at AS startedAt, revision, state FROM proof_baseline WHERE id = ?").bind(PROOF_ID),
    db().prepare("SELECT COUNT(*) AS n FROM applied_ticks WHERE garden_id = ?").bind(GARDEN_ID),
    db().prepare("SELECT scheduler_execution_id AS executionId FROM background_runs WHERE scheduler_execution_id IS NOT NULL AND scheduler_triggered_at >= ? ORDER BY scheduler_triggered_at")
      .bind(now - 8 * 24 * HOUR),
    db().prepare("SELECT tick_id AS tickId, revision, run_id AS runId, input_id AS inputId, committed_at AS committedAt FROM applied_ticks WHERE garden_id = ? ORDER BY revision DESC LIMIT 30")
      .bind(GARDEN_ID),
    // Any recorded view activity inside the window, and any session not closed before the start, counts against closure.
    db().prepare(`SELECT b.started_at AS startedAt, g.owner_attested_at AS ownerAttestedAt,
        g.active_sessions_at_start AS activeSessionsAtStart, g.protocol_version AS protocolVersion,
        (SELECT COUNT(*) FROM view_events v WHERE v.occurred_at >= b.started_at AND v.occurred_at < b.started_at + ? AND v.event_type = 'open') AS openEvents,
        (SELECT COUNT(*) FROM view_events v WHERE v.occurred_at >= b.started_at AND v.occurred_at < b.started_at + ? AND v.event_type = 'snapshot_read') AS snapshotEvents,
        (SELECT COUNT(*) FROM view_events v WHERE v.occurred_at >= b.started_at AND v.occurred_at < b.started_at + ? AND v.event_type = 'heartbeat') AS heartbeatEvents,
        (SELECT COUNT(*) FROM view_events v WHERE v.occurred_at >= b.started_at AND v.occurred_at < b.started_at + ? AND v.event_type = 'close') AS closeEvents,
        (SELECT COUNT(*) FROM view_sessions s WHERE s.opened_at < b.started_at + ? AND (s.closed_at IS NULL OR s.closed_at >= b.started_at
          OR (s.last_seen_at >= b.started_at AND s.last_seen_at < b.started_at + ?))) AS sessionsOverlappingWindow
      FROM proof_baseline b LEFT JOIN proof_view_gate g ON g.checkpoint_id = b.id WHERE b.id = ?`)
      .bind(24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR, PROOF_ID),
    db().prepare("SELECT id, started_at AS startedAt, revision FROM proof_baseline WHERE id = ?").bind(ORIGINAL_PROOF_ID),
    db().prepare("SELECT id, opened_at AS openedAt, last_seen_at AS lastSeenAt FROM view_sessions WHERE closed_at IS NULL ORDER BY opened_at LIMIT 50"),
    db().prepare("SELECT COUNT(*) AS n FROM view_sessions WHERE closed_at IS NULL"),
  ]);
  const row = records[0].results[0] as unknown as Row | undefined;
  const world = row ? { ...row, state: JSON.parse(row.state) } : null;
  const baseline = records[3].results[0] as { id: string; startedAt: number; revision: number; state: string } | undefined;
  if (logView) console.info(JSON.stringify({ event: "stillwild_snapshot_view", at: now, sessionId, revision: world?.revision ?? null }));
  const eventRows = records[1].results as { id: string; tickId: number; revision: number; runId: string | null; type: string; keeper: string; payload: string; committedAt: number }[];
  const viewGate = records[7].results[0] as ViewGateRow | undefined;
  const original = records[8].results[0] as { id: string; startedAt: number; revision: number } | undefined;
  const unclosedSessions = records[9].results as { id: string; openedAt: number; lastSeenAt: number }[];
  const unclosedCount = (records[10].results[0] as { n: number } | undefined)?.n ?? 0;
  const hasCompleteViewGate = Boolean(viewGate?.ownerAttestedAt && viewGate.activeSessionsAtStart === 0 && viewGate.protocolVersion === VIEW_PROTOCOL_VERSION);
  const viewWindowElapsed = Boolean(baseline && now >= baseline.startedAt + 24 * HOUR);
  const noViewActivity = Boolean(viewGate && viewGate.openEvents === 0 && viewGate.snapshotEvents === 0 && viewGate.heartbeatEvents === 0
    && viewGate.closeEvents === 0 && viewGate.sessionsOverlappingWindow === 0);
  const allViewsClosedConfirmed = viewWindowElapsed && hasCompleteViewGate && noViewActivity;
  return { world, events: eventRows.map(r => ({ ...r, payload: JSON.parse(r.payload) })),
    runs: records[2].results, usedSchedulerExecutionIds: (records[5].results as { executionId: string }[]).map(r => r.executionId),
    appliedTicks: records[6].results,
    serverNow: now, completedTicks: (records[4].results[0] as { n: number } | undefined)?.n ?? 0,
    proof: { checkpointId: PROOF_ID, baseline: baseline ? { ...baseline, state: JSON.parse(baseline.state) } : null,
      earliestCheckAt: baseline ? baseline.startedAt + 24 * HOUR : null, independentScheduleLogsRequired: true,
      originalCheckpoint: original ? { ...original, earliestCheckAt: original.startedAt + 24 * HOUR } : null,
      viewCoverage: viewGate ? { protocolVersion: viewGate.protocolVersion, ownerAttestedAt: viewGate.ownerAttestedAt,
        activeSessionsAtStart: viewGate.activeSessionsAtStart, openEvents: viewGate.openEvents, snapshotEvents: viewGate.snapshotEvents,
        heartbeatEvents: viewGate.heartbeatEvents, closeEvents: viewGate.closeEvents, sessionsOverlappingWindow: viewGate.sessionsOverlappingWindow,
        windowElapsed: viewWindowElapsed, instrumentationComplete: hasCompleteViewGate } : null,
      unclosedViewSessions: { count: unclosedCount, sessions: unclosedSessions },
      allViewsClosedConfirmed, status: allViewsClosedConfirmed ? "VIEW_CLOSURE_PASS_PENDING_SCHEDULE_CORROBORATION" : "PENDING_24_HOUR_ABSENCE_CHECK" } };
}
export class ViewClosureRequiredError extends Error {}
export async function startAbsenceCheck(allViewsClosedAttested: boolean) {
  if (allViewsClosedAttested !== true) throw new ViewClosureRequiredError("Owner view-closure attestation is required");
  const now = Date.now();
  const existing = await db().prepare("SELECT id FROM proof_baseline WHERE id = ?").bind(PROOF_ID).first<{ id: string }>();
  if (existing) {
    const gate = await db().prepare("SELECT checkpoint_id FROM proof_view_gate WHERE checkpoint_id = ?").bind(PROOF_ID).first<{ checkpointId: string }>();
    if (!gate) throw new Error("Checkpoint exists without its immutable view gate; refusing to backfill it");
    return (await snapshot()).proof;
  }
  const world = await getWorld();
  if (!world) throw new Error("Initialise the garden before starting its absence check");
  // The closure check, the immutable checkpoint and its gate commit in one transaction. Every session without a recorded
  // close blocks it, however old its last heartbeat: a silent tab may be suspended, not closed. The gate stores the count
  // measured inside that transaction. Existing proof IDs are never overwritten.
  await db().batch([
    db().prepare("INSERT INTO proof_baseline (id, garden_id, started_at, revision, state) SELECT ?, id, ?, revision, state FROM worlds WHERE id = ? AND NOT EXISTS (SELECT 1 FROM view_sessions WHERE closed_at IS NULL) ON CONFLICT(id) DO NOTHING")
      .bind(PROOF_ID, now, GARDEN_ID),
    db().prepare("INSERT INTO proof_view_gate (checkpoint_id, owner_attested_at, active_sessions_at_start, protocol_version) SELECT ?, ?, (SELECT COUNT(*) FROM view_sessions WHERE closed_at IS NULL), ? WHERE EXISTS (SELECT 1 FROM proof_baseline WHERE id = ? AND started_at = ?) ON CONFLICT(checkpoint_id) DO NOTHING")
      .bind(PROOF_ID, now, VIEW_PROTOCOL_VERSION, PROOF_ID, now),
  ]);
  const evidence = await snapshot();
  // With the garden present, the conditional insert only skips the checkpoint when a session was unclosed at commit.
  if (!evidence.proof.baseline)
    throw new ViewClosureRequiredError(`Close all garden views before starting the absence check: a view session without a recorded close blocked it (${evidence.proof.unclosedViewSessions.count} unclosed now)`);
  if (!evidence.proof.viewCoverage?.instrumentationComplete) throw new Error("Checkpoint and view gate were not created together");
  console.info(JSON.stringify({ event: "stillwild_absence_baseline", startedAt: evidence.proof.baseline.startedAt, revision: evidence.proof.baseline.revision }));
  return evidence.proof;
}

export type ViewSessionEvent = "open" | "heartbeat" | "read" | "close";
export async function recordViewSession(sessionId: string, event: ViewSessionEvent) {
  const now = Date.now();
  if (event === "open") {
    // The open attempt is recorded once per session. A close that overtook this open has already closed the session, so it stays closed.
    await db().batch([
      db().prepare("INSERT INTO view_sessions (id, opened_at, last_seen_at, closed_at) VALUES (?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING").bind(sessionId, now, now),
      db().prepare("INSERT INTO view_events (id, session_id, event_type, occurred_at) VALUES (?, ?, 'open', ?) ON CONFLICT(id) DO NOTHING")
        .bind(`view:${sessionId}:open`, sessionId, now),
    ]);
    const row = await db().prepare("SELECT closed_at AS closedAt FROM view_sessions WHERE id = ?").bind(sessionId).first<{ closedAt: number | null }>();
    if (!row || row.closedAt !== null) throw new ViewClosureRequiredError("View session could not be opened");
    return { sessionId, event, at: now };
  }
  if (event === "close") {
    // A close that arrives before its open (a keepalive close racing a pending open) records a closed session.
    await db().batch([
      db().prepare("INSERT INTO view_sessions (id, opened_at, last_seen_at, closed_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET closed_at = COALESCE(view_sessions.closed_at, excluded.closed_at), last_seen_at = excluded.last_seen_at")
        .bind(sessionId, now, now, now),
      db().prepare("INSERT INTO view_events (id, session_id, event_type, occurred_at) VALUES (?, ?, 'close', ?) ON CONFLICT(id) DO NOTHING")
        .bind(`view:${sessionId}:close`, sessionId, now),
    ]);
    return { sessionId, event, at: now };
  }
  // Heartbeats and reads are recorded before the session is checked, so a tab that outlives its recorded close
  // still appears in the window evidence. A read is only allowed to proceed on an open session.
  const [, seen] = await db().batch([
    db().prepare("INSERT INTO view_events (id, session_id, event_type, occurred_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), sessionId, event === "read" ? "snapshot_read" : "heartbeat", now),
    db().prepare("UPDATE view_sessions SET last_seen_at = ? WHERE id = ? AND closed_at IS NULL").bind(now, sessionId),
  ]);
  if (seen.meta.changes !== 1) throw new ViewClosureRequiredError("View session is not active");
  return { sessionId, event, at: now };
}
