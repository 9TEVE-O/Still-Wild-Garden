const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const HOUR = 3_600_000;
let clock = Date.UTC(2026, 9, 4, 4, 35);
class ClockDate extends Date { static now() { return clock; } }
const sql = new DatabaseSync(':memory:');
for (const migration of ['drizzle/0000_melodic_lucky_pierre.sql', 'drizzle/0001_scheduler_provenance.sql']) {
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
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in imports)) throw new Error('Unexpected import '+name); return imports[name]; },
    crypto: globalThis.crypto, Date: ClockDate, structuredClone, Response, Request, URL, AbortSignal, console,
    fetch: async () => { requests++; if (outage) throw new Error('Fixture weather outage'); return Response.json(fixture()); } });
  return exports;
}
const world = load('lib/world.ts');
const weather = load('lib/weather.ts', { './world': world });
const background = load('db/background.ts', { 'cloudflare:workers': { env: { DB } }, '@/lib/world': world, '@/lib/weather': weather });
const api = load('app/api/background/tick/route.ts', { '@/db/background': background, '@/lib/weather': weather });
const viewApi = load('app/api/snapshot/route.ts', { '@/db/background': background });
const get = query => sql.prepare(query).get();
(async () => {
  const empty = await background.snapshot(); assert.equal(empty.world, null); assert.equal(requests,0);
  const start = await background.runBackground('manual'); assert.equal(start.committedTicks, 0);
  const initial = normal(await background.getWorld()); assert.equal(initial.revision,0);
  assert.equal(get('SELECT COUNT(*) AS n FROM worlds').n,1);
  const baseline = get('SELECT * FROM proof_baseline');
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
  const snapshot = await (await viewApi.GET()).json();
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
  outage = true; clock += 10 * HOUR;
  const recovery = await background.runBackground('schedule'); assert.equal(recovery.committedTicks,6); assert.equal(recovery.remainingTicks,4);
  const latest = await background.getWorld(); assert.equal(latest.state.environment.sourceStatus,'simulated');
  assert.equal(latest.state.environment.precipitationMm,0); assert.ok(latest.state.plants>=2);
  const finish = await background.runBackground('schedule'); assert.equal(finish.committedTicks,4); assert.equal(finish.remainingTicks,0);
  assert.equal(get('SELECT COUNT(*) AS n FROM applied_ticks').n,12);
  assert.equal((await background.getWorld()).seed,initial.seed); assert.equal((await background.getWorld()).bornAt,initial.bornAt);
  assert.deepEqual(get('SELECT * FROM proof_baseline'),baseline);
  const invalid = new Request('https://proof.example/api/background/tick',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"trigger":"schedule","gardenId":"origin"}'});
  assert.equal((await api.POST(invalid)).status,400);
  const beforeStart = normal(await background.getWorld()); const proof = await background.startAbsenceCheck(); const proofRetry = await background.startAbsenceCheck();
  assert.deepEqual(normal(proof),normal(proofRetry)); assert.deepEqual(normal(await background.getWorld()),beforeStart);
  assert.equal(proof.baseline.startedAt,clock);
  const beforeRelayRequests = requests; outage = true; clock += HOUR;
  const relayed = await background.runBackground('schedule',clock,fixture());
  assert.equal(relayed.weatherStatus,'relayed-modelled'); assert.equal(relayed.committedTicks,1); assert.equal(requests,beforeRelayRequests);
  assert.equal((await background.getWorld()).state.environment.transport,'scheduler-relay');
  const badWeather = new Request('https://proof.example/api/background/tick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trigger:'schedule',weather:{utc_offset_seconds:34200}})});
  assert.equal((await api.POST(badWeather)).status,400);
  const wrongMedia = new Request('https://proof.example/api/background/tick',{method:'POST',body:'{}'}); assert.equal((await api.POST(wrongMedia)).status,415);
  const dbCheck = get('PRAGMA foreign_key_check'); assert.equal(dbCheck,undefined);
  const evidence = { status:'PASS', executedAt:new Date().toISOString(), scope:'Actual simulation, weather parser, database queries and API routes with SQLite transactional D1 adapter and controlled clock/weather; not deployed Cloudflare or 24-hour proof.',
    checks:['snapshot never advances state','UTC preceding-hour rainfall','future weather excluded','input units validated','overlapping runs commit once','duplicate same-run tick no-op','atomic rollback on persistence failure','keeper planting changes saved world','outage uses labelled zero-rain fallback','bounded six-hour recovery','immutable seed and baseline','unsupported mutation rejected','validated scheduler weather relay','invalid relay payload rejected','immutable explicit proof start without garden reset'], ticks:13 };
  fs.writeFileSync('project_docs/background-test-evidence.json',JSON.stringify(evidence,null,2)+'\n'); console.log(JSON.stringify(evidence));
  sql.close();
})().catch(e => { console.error(e);process.exitCode=1; });
