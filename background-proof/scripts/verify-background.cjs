const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
process.chdir(`${__dirname}/..`); // Source, migrations and evidence paths are app-relative from any working directory.
const HOUR = 3_600_000;
let clock = Date.UTC(2026, 9, 14, 4, 35);
class ClockDate extends Date { static now() { return clock; } }
const sql = new DatabaseSync(':memory:');
for (const migration of ['drizzle/0000_melodic_lucky_pierre.sql', 'drizzle/0001_scheduler_provenance.sql', 'drizzle/0002_view_closure_gate.sql']) {
  sql.exec(fs.readFileSync(migration, 'utf8'));
}
sql.exec('PRAGMA foreign_keys = ON');
let requests = 0, outage = false;
const fixture = () => {
  const time = [Math.floor(clock / HOUR) * 3600 - 3600, Math.floor(clock / HOUR) * 3600, Math.floor(clock / HOUR) * 3600 + 3600];
  return { utc_offset_seconds: 0, hourly_units: { temperature_2m: '°C', precipitation: 'mm', cloud_cover: '%', wind_speed_10m: 'km/h' },
    hourly: { time, temperature_2m: [28, 29, 30], precipitation: [1, 2, 50], cloud_cover: [30, 40, 50], wind_speed_10m: [5, 7, 9], is_day: [1, 1, 1] },
    daily: { time: [Math.floor(time[0] / 86400) * 86400], sunrise: [time[0]-3600], sunset: [time[0]+3600] } };
};
function statement(query, params=[]) {
  return { query, params,
    bind(...values) { return statement(query, values); },
    async first() { return sql.prepare(query).get(...params) ?? null; },
    async run() { const r = sql.prepare(query).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
    async all() { return { results: sql.prepare(query).all(...params) }; },
  };
}
const DB = { prepare: statement, async batch(statements) {
  sql.exec('BEGIN IMMEDIATE');
  try { const results = statements.map(s => {
    const p = sql.prepare(s.query);
    if (/^\s*(SELECT|PRAGMA)/i.test(s.query)) return { success: true, results: p.all(...s.params), meta: { changes: 0 } };
    const r = p.run(...s.params); return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }); sql.exec('COMMIT'); return results; }
  catch (e) { sql.exec('ROLLBACK'); throw e; }
} };
const normal = x => JSON.parse(JSON.stringify(x));
// Worker log lines the source emits through console.info, kept so the tests can check the audit trail.
const infoLog = [];
const workerConsole = { log: console.log, warn: console.warn, error: console.error,
  info: (...args) => { infoLog.push(String(args[0])); console.info(...args); } };
const refusals = () => infoLog.filter(line => line.includes('"stillwild_snapshot_refused"')).map(line => JSON.parse(line));
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in imports)) throw new Error('Unexpected import '+name); return imports[name]; },
    crypto: globalThis.crypto, Date: ClockDate, structuredClone, Response, Request, URL, AbortSignal, console: workerConsole,
    fetch: async () => { requests++; if (outage) throw new Error('Fixture weather outage'); return Response.json(fixture()); } });
  return exports;
}
const world = load('lib/world.ts');
const weather = load('lib/weather.ts', { './world': world });
const background = load('db/background.ts', { 'cloudflare:workers': { env: { DB } }, '@/lib/world': world, '@/lib/weather': weather });
const api = load('app/api/background/tick/route.ts', { '@/db/background': background, '@/lib/weather': weather });
const viewApi = load('app/api/snapshot/route.ts', { '@/db/background': background });
const evidenceApi = load('app/api/evidence/route.ts', { '@/db/background': background });
const sessionApi = load('app/api/view/session/route.ts', { '@/db/background': background });
const startApi = load('app/api/proof/start/route.ts', { '@/db/background': background });
const get = (query, ...params) => sql.prepare(query).get(...params);
const postJson = (url, body) => new Request('https://proof.example' + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const viewEvent = (sessionId, event) => postJson('/api/view/session', { sessionId, event });
const snapshotRequest = sessionId => new Request('https://proof.example/api/snapshot', { headers: sessionId ? { 'X-Stillwild-View-Session': sessionId } : {} });
(async () => {
  const empty = await background.snapshot(); assert.equal(empty.world, null); assert.equal(requests,0);
  const start = await background.runBackground('manual'); assert.equal(start.committedTicks, 0);
  const initial = normal(await background.getWorld()); assert.equal(initial.revision,0);
  assert.equal(get('SELECT COUNT(*) AS n FROM worlds').n,1);
  const baseline = get('SELECT * FROM proof_baseline');
  const originalCheckpoint = { id: 'absence-check-001', garden_id: world.GARDEN_ID, started_at: 1791098871364,
    revision: initial.revision, state: JSON.stringify(initial.state) };
  sql.prepare('INSERT INTO proof_baseline (id, garden_id, started_at, revision, state) VALUES (?, ?, ?, ?, ?)')
    .run(originalCheckpoint.id, originalCheckpoint.garden_id, originalCheckpoint.started_at, originalCheckpoint.revision, originalCheckpoint.state);
  // Parse source semantics: end-keyed preceding-hour rainfall, future rows excluded, UTC/units enforced.
  const parsed = weather.parseForecast(fixture(),clock); assert.equal(parsed.length,2);
  assert.equal(parsed[1].precipitationMm,2); assert.equal(parsed[1].validStart,parsed[1].validEnd-HOUR);
  assert.throws(() => weather.parseForecast({...fixture(),utc_offset_seconds:34200},clock));
  assert.throws(() => weather.parseForecast({...fixture(),hourly_units:{}},clock));
  assert.equal(weather.missingInput(initial.lastTick+1,clock).precipitationMm,0);
  clock += HOUR;
  const [runA,runB] = await Promise.all([background.runBackground('schedule'),background.runBackground('schedule')]);
  assert.equal(runA.committedTicks+runB.committedTicks,1);
  const after = normal(await background.getWorld()); assert.equal(after.revision,1);
  assert.equal(after.state.water,30); // 20 baseline + 2 mm x 3 + Dew's spring collection of 4.
  assert.equal(get('SELECT COUNT(*) AS n FROM applied_ticks').n,1);
  assert.equal(get("SELECT COUNT(*) AS n FROM garden_events WHERE type='rain-collected'").n,1);
  const retry = await background.runBackground('schedule'); assert.equal(retry.committedTicks,0);
  assert.deepEqual(normal(await background.getWorld()),after);
  // Two stale computations, including the original run ID, cannot repeat the committed consequences.
  const pinned = JSON.parse(sql.prepare('SELECT values_json FROM environment_samples WHERE id=(SELECT input_id FROM applied_ticks LIMIT 1)').get().values_json);
  const tickRun = get('SELECT run_id FROM applied_ticks').run_id;
  assert.equal(await background.commitTick(initial,initial.lastTick+1,pinned,tickRun,clock),false);
  assert.deepEqual(normal(await background.getWorld()),after);
  // A read does not fetch weather, create a world, change a task, revision, run or event.
  const changes = get('SELECT total_changes() AS n').n; const beforeRequests = requests;
  const snapshot = await (await evidenceApi.GET()).json();
  assert.equal(get('SELECT total_changes() AS n').n,changes); assert.equal(requests,beforeRequests);
  assert.equal(snapshot.world.revision,1); assert.equal(snapshot.proof.allViewsClosedConfirmed,false);
  // Failed event writes roll back the whole tick, including the tick key and state.
  clock += HOUR;
  sql.exec("CREATE TRIGGER refuse_event BEFORE INSERT ON garden_events BEGIN SELECT RAISE(ABORT,'Injected persistence failure'); END");
  await assert.rejects(() => background.runBackground('schedule'),/Injected persistence failure/);
  assert.equal((await background.getWorld()).revision,1);
  assert.equal(get('SELECT COUNT(*) AS n FROM applied_ticks').n,1);
  sql.exec('DROP TRIGGER refuse_event');
  const repaired = await background.runBackground('schedule'); assert.equal(repaired.committedTicks,1);
  assert.equal((await background.getWorld()).state.plants,2);
  // Bounded recovery during an outage applies missing slots as simulated, never today's rain backwards.
  outage = true; clock += 30 * HOUR;
  const recovery = await background.runBackground('schedule'); assert.equal(recovery.committedTicks,24); assert.equal(recovery.remainingTicks,6);
  const latest = await background.getWorld(); assert.equal(latest.state.environment.sourceStatus,'simulated');
  assert.equal(latest.state.environment.precipitationMm,0); assert.ok(latest.state.plants>=2);
  const finish = await background.runBackground('schedule'); assert.equal(finish.committedTicks,6); assert.equal(finish.remainingTicks,0);
  assert.equal(get('SELECT COUNT(*) AS n FROM applied_ticks').n,32);
  assert.equal((await background.getWorld()).seed,initial.seed); assert.equal((await background.getWorld()).bornAt,initial.bornAt);
  assert.deepEqual(get('SELECT * FROM proof_baseline WHERE id = ?', 'absence-001'),baseline);
  assert.deepEqual(normal(get('SELECT * FROM proof_baseline WHERE id = ?', 'absence-check-001')),normal(originalCheckpoint));
  const invalid = new Request('https://proof.example/api/background/tick',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"trigger":"schedule","gardenId":"origin"}'});
  assert.equal((await api.POST(invalid)).status,400);
  const noScheduler = new Request('https://proof.example/api/background/tick',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"trigger":"schedule"}'});
  assert.equal((await api.POST(noScheduler)).status,400);
  const activeView = await background.recordViewSession('8c2bfc62-737d-4a5b-9c53-96b3b20d188f','open');
  // GET /api/snapshot writes nothing, does not depend on the view log, and serves garden data only to an open
  // recorded session; the page records its read first.
  const beforeSnapshot = get('SELECT total_changes() AS n').n; const refusedBefore = refusals().length;
  assert.equal((await viewApi.GET(snapshotRequest(activeView.sessionId))).status,200);
  assert.equal((await viewApi.GET(snapshotRequest('x'.repeat(5000)))).status,400);
  assert.equal((await viewApi.GET(snapshotRequest(null))).status,400);
  const unknownRead = await viewApi.GET(snapshotRequest('5b1f0c2e-8d3a-4e6b-9f7c-2a1b3c4d5e6f'));
  assert.equal(unknownRead.status,409); assert.equal((await unknownRead.json()).world,undefined);
  assert.equal(get('SELECT total_changes() AS n').n,beforeSnapshot);
  // Every refusal leaves a bounded Worker log record with its reason; a malformed header is never logged.
  assert.deepEqual(refusals().slice(refusedBefore).map(r => r.reason),['malformed-session','missing-session','unknown-session']);
  assert.ok(!infoLog.some(line => line.includes('xxxxxxxx')));
  sql.exec("CREATE TRIGGER refuse_view_log BEFORE INSERT ON view_events BEGIN SELECT RAISE(ABORT,'View log unavailable'); END");
  assert.equal((await viewApi.GET(snapshotRequest(activeView.sessionId))).status,200);
  assert.equal((await sessionApi.POST(viewEvent(activeView.sessionId,'read'))).status,503); // an unrecorded read is refused, so the page does not read
  sql.exec('DROP TRIGGER refuse_view_log');
  assert.equal((await sessionApi.POST(viewEvent(activeView.sessionId,'read'))).status,200);
  assert.equal(get("SELECT COUNT(*) AS n FROM view_events WHERE session_id = ? AND event_type = 'snapshot_read'",activeView.sessionId).n,1);
  // Every session without a recorded close blocks the checkpoint, however old its last heartbeat.
  await assert.rejects(() => background.startAbsenceCheck(true), /Close all garden views/);
  clock += 10 * 60_000;
  assert.equal((await startApi.POST(postJson('/api/proof/start',{ allViewsClosedAttested: true }))).status,409);
  const blocked = (await (await evidenceApi.GET()).json()).proof;
  assert.equal(blocked.baseline,null); assert.equal(blocked.checkpointId,'absence-check-002');
  assert.deepEqual(blocked.unclosedViewSessions.sessions.map(s => s.id),[activeView.sessionId]);
  // The original checkpoint stays reported on its own, separate from the second-window checkpoint.
  assert.equal(blocked.originalCheckpoint.id,'absence-check-001'); assert.equal(blocked.originalCheckpoint.startedAt,originalCheckpoint.started_at);
  assert.equal(blocked.originalCheckpoint.earliestCheckAt,originalCheckpoint.started_at + 24 * HOUR);
  // A close that overtakes its pending open leaves the session closed; the late open is refused.
  const raced = '0d4a2a3e-5c1f-4b7e-9a51-1f2d3c4b5a69';
  assert.equal((await sessionApi.POST(viewEvent(raced,'close'))).status,200);
  assert.equal((await sessionApi.POST(viewEvent(raced,'open'))).status,409);
  assert.notEqual(get('SELECT closed_at FROM view_sessions WHERE id = ?',raced).closed_at,null);
  await background.recordViewSession(activeView.sessionId,'close');
  // A closed session gets no garden data, whether it closed normally or its close overtook its open.
  const beforeClosedReads = get('SELECT total_changes() AS n').n; const closedRefusedBefore = refusals().length;
  assert.equal((await viewApi.GET(snapshotRequest(activeView.sessionId))).status,409);
  assert.equal((await viewApi.GET(snapshotRequest(raced))).status,409);
  assert.equal(get('SELECT total_changes() AS n').n,beforeClosedReads);
  assert.deepEqual(refusals().slice(closedRefusedBefore).map(r => r.reason),['closed-session','closed-session']);
  // A view opened after the pre-checks but before the checkpoint transaction still blocks the checkpoint.
  const racing = 'f3b8c1d2-7a6e-4f5d-8c9b-0a1b2c3d4e5f'; const realBatch = DB.batch;
  DB.batch = async statements => {
    if (statements.some(s => /INSERT INTO proof_baseline/.test(s.query))) { DB.batch = realBatch; await background.recordViewSession(racing,'open'); }
    return realBatch(statements);
  };
  await assert.rejects(() => background.startAbsenceCheck(true), /Close all garden views/);
  DB.batch = realBatch;
  assert.equal(get('SELECT COUNT(*) AS n FROM proof_baseline WHERE id = ?','absence-check-002').n,0);
  await background.recordViewSession(racing,'close');
  clock += 1; // Keep the pre-checkpoint close events strictly before the immutable boundary.
  const beforeStart = normal(await background.getWorld()); const proof = await background.startAbsenceCheck(true); const proofRetry = await background.startAbsenceCheck(true);
  assert.deepEqual(normal(proof),normal(proofRetry)); assert.deepEqual(normal(await background.getWorld()),beforeStart);
  assert.equal(proof.baseline.startedAt,clock);
  assert.equal(proof.baseline.id,'absence-check-002');
  assert.equal(proof.viewCoverage.instrumentationComplete,true); assert.equal(proof.viewCoverage.activeSessionsAtStart,0);
  assert.equal(proof.originalCheckpoint.startedAt,originalCheckpoint.started_at);
  const beforeRead = get('SELECT total_changes() AS n').n;
  const startEvidence = await (await evidenceApi.GET()).json();
  assert.equal(get('SELECT total_changes() AS n').n,beforeRead);
  assert.equal(startEvidence.proof.allViewsClosedConfirmed,false);
  const checkpoint = get('SELECT * FROM proof_baseline WHERE id = ?', 'absence-check-002');
  assert.deepEqual(normal(get('SELECT * FROM proof_baseline WHERE id = ?', 'absence-check-001')),normal(originalCheckpoint));
  const beforeRelayRequests = requests; outage = true; clock += HOUR;
  const relayed = await background.runBackground('schedule',clock,fixture());
  assert.equal(relayed.weatherStatus,'relayed-modelled'); assert.equal(relayed.committedTicks,1); assert.equal(requests,beforeRelayRequests);
  assert.equal((await background.getWorld()).state.environment.transport,'scheduler-relay');
  const badWeather = new Request('https://proof.example/api/background/tick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trigger:'schedule',scheduler:{taskId:'fixture',executionId:'bad-weather',triggeredAt:clock-1},weather:{utc_offset_seconds:34200}})});
  assert.equal((await api.POST(badWeather)).status,400);
  clock = checkpoint.started_at + 24 * HOUR;
  const returnReadChanges = get('SELECT total_changes() AS n').n;
  const firstReturn = await (await evidenceApi.GET()).json();
  assert.equal(get('SELECT total_changes() AS n').n,returnReadChanges);
  assert.equal(firstReturn.proof.allViewsClosedConfirmed,true);
  assert.equal(firstReturn.proof.status,'VIEW_CLOSURE_PASS_PENDING_SCHEDULE_CORROBORATION');
  // The owner's first page visit after the deadline: a session opened at baseline+24h is outside the window.
  const firstVisit = '2e7d4c1a-6b5f-4a3e-8d2c-1f0e9d8c7b6a';
  assert.equal((await viewApi.GET(snapshotRequest(firstVisit))).status,409); // no data before the page opens its session
  assert.equal((await sessionApi.POST(viewEvent(firstVisit,'open'))).status,200);
  assert.equal((await sessionApi.POST(viewEvent(firstVisit,'read'))).status,200);
  const readView = await viewApi.GET(snapshotRequest(firstVisit));
  assert.equal(readView.status,200); assert.equal((await readView.json()).proof.allViewsClosedConfirmed,true);
  assert.equal((await sessionApi.POST(viewEvent(firstVisit,'close'))).status,200);
  assert.equal((await background.snapshot()).proof.allViewsClosedConfirmed,true);
  // A tab that outlived its recorded close and wakes inside the window is still counted.
  clock = checkpoint.started_at + 6 * HOUR;
  assert.equal((await sessionApi.POST(viewEvent(activeView.sessionId,'heartbeat'))).status,409);
  clock = checkpoint.started_at + 24 * HOUR;
  const zombie = (await background.snapshot()).proof;
  assert.equal(zombie.viewCoverage.heartbeatEvents,1); assert.equal(zombie.viewCoverage.openEvents,0);
  assert.equal(zombie.allViewsClosedConfirmed,false); assert.equal(zombie.viewCoverage.sessionsOverlappingWindow,1); // The rejected heartbeat still updates last_seen_at and must count as overlap.
  clock = checkpoint.started_at + 7 * HOUR; // the same tab closing again inside the window leaves a last-seen trace
  assert.equal((await sessionApi.POST(viewEvent(activeView.sessionId,'close'))).status,200);
  clock = checkpoint.started_at + 24 * HOUR;
  assert.equal((await background.snapshot()).proof.viewCoverage.sessionsOverlappingWindow,1);
  clock = checkpoint.started_at + HOUR;
  const lateView = await background.recordViewSession('454c7ac2-c49d-40f9-9f4a-3385839485f1','open');
  clock = checkpoint.started_at + 24 * HOUR;
  const late = (await background.snapshot()).proof;
  assert.equal(late.viewCoverage.openEvents,1); assert.equal(late.viewCoverage.sessionsOverlappingWindow,2); assert.equal(late.allViewsClosedConfirmed,false);
  clock += 1;
  await background.recordViewSession(lateView.sessionId,'close');
  const wrongMedia = new Request('https://proof.example/api/background/tick',{method:'POST',body:'{}'}); assert.equal((await api.POST(wrongMedia)).status,415);
  const dbCheck = get('PRAGMA foreign_key_check'); assert.equal(dbCheck,undefined);
  const evidence = { status:'PASS', executedAt:new Date().toISOString(), scope:'Actual simulation, weather parser, database queries and API routes with SQLite transactional D1 adapter and controlled clock/weather; not deployed Cloudflare or 24-hour proof.',
    checks:['snapshot never advances state','UTC preceding-hour rainfall','future weather excluded','input units validated','overlapping runs commit once','duplicate same-run tick no-op','atomic rollback on persistence failure','keeper planting changes saved world','outage uses labelled zero-rain fallback','24-tick bounded recovery makes net progress','original baselines remain immutable','scheduled delivery requires scheduler provenance','snapshot GET is read-only and independent of the view log','snapshot GET serves only open recorded view sessions','every refused snapshot read is logged with its reason and no raw header','unrecorded view read is refused','view sessions block checkpoint while active','stale unclosed view session blocks checkpoint','view opened during checkpoint transaction blocks checkpoint','close before open leaves session closed','checkpoint requires owner view-closure attestation','new immutable checkpoint and view gate','original and active checkpoints reported separately','24-hour read-only first return preserves closure proof','in-window activity from a closed tab invalidates closure proof','view opened during window invalidates closure proof'], ticks:32 };
  fs.writeFileSync('project_docs/background-test-evidence.json',JSON.stringify(evidence,null,2)+'\n'); console.log(JSON.stringify(evidence));
  sql.close();
})().catch(e => { console.error(e);process.exitCode=1; });
