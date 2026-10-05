const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const HOUR = 3_600_000;
let clock = Date.UTC(2026, 9, 6, 4, 35);
class ClockDate extends Date { static now() { return clock; } }
const sql = new DatabaseSync(':memory:');
for (const migration of ['drizzle/0000_melodic_lucky_pierre.sql', 'drizzle/0001_scheduler_provenance.sql']) {
  sql.exec(fs.readFileSync(migration, 'utf8'));
}
sql.exec('PRAGMA foreign_keys = ON');
let requests = 0;
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
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in imports)) throw new Error('Unexpected import '+name); return imports[name]; },
    crypto: globalThis.crypto, Date: ClockDate, structuredClone, Response, Request, URL, AbortSignal, console,
    fetch: async () => { requests++; return Response.json(fixture()); } });
  return exports;
}
const world = load('lib/world.ts');
const weather = load('lib/weather.ts', { './world': world });
const background = load('db/background.ts', { 'cloudflare:workers': { env: { DB } }, '@/lib/world': world, '@/lib/weather': weather });
const api = load('app/api/background/tick/route.ts', { '@/db/background': background, '@/lib/weather': weather });
const get = (query, ...params) => sql.prepare(query).get(...params);
(async () => {
  // Initialise without claiming scheduler provenance.
  const initialRun = await background.runBackground('manual');
  assert.equal(initialRun.committedTicks, 0);
  clock += HOUR;

  const scheduler = { taskId: 'scheduler-specimen', executionId: 'scheduler-exec-0001', triggeredAt: clock - 1_000 };
  const request = new Request('https://proof.example/api/background/tick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'schedule', scheduler, weather: fixture() }),
  });
  const response = await api.POST(request);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.schedulerExecutionId, scheduler.executionId);
  assert.equal(result.committedTicks, 1);

  const run = get('SELECT * FROM background_runs WHERE scheduler_execution_id = ?', scheduler.executionId);
  assert.ok(run);
  assert.equal(run.scheduler_task_id, scheduler.taskId);
  assert.equal(run.scheduler_triggered_at, scheduler.triggeredAt);
  assert.equal(run.id, result.runId);

  const tick = get('SELECT * FROM applied_ticks WHERE run_id = ?', run.id);
  assert.ok(tick);
  assert.equal(tick.revision, result.revision);
  const event = get('SELECT * FROM garden_events WHERE run_id = ? ORDER BY id LIMIT 1', run.id);
  assert.ok(event);
  assert.equal(event.tick_id, tick.tick_id);
  assert.equal(event.revision, tick.revision);
  assert.equal(get('SELECT revision FROM worlds WHERE id = ?', world.GARDEN_ID).revision, tick.revision);

  // A scheduler receipt can bind to at most one garden run.
  const duplicate = new Request('https://proof.example/api/background/tick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'schedule', scheduler, weather: fixture() }),
  });
  assert.equal((await api.POST(duplicate)).status, 503);
  assert.equal(get('SELECT COUNT(*) AS n FROM background_runs WHERE scheduler_execution_id = ?', scheduler.executionId).n, 1);

  // Scheduler metadata cannot be attached to a manual trigger or widened with arbitrary fields.
  const manual = new Request('https://proof.example/api/background/tick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual', scheduler }),
  });
  assert.equal((await api.POST(manual)).status, 400);
  const malformed = new Request('https://proof.example/api/background/tick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'schedule', scheduler: { ...scheduler, inventedProof: true } }),
  });
  assert.equal((await api.POST(malformed)).status, 400);

  const evidence = {
    status: 'PASS', executedAt: new Date().toISOString(),
    scope: 'Local deterministic provenance specimen: caller-supplied scheduler identity is persisted and joins one API request to one garden run, applied tick, revision and event.',
    limitations: [
      'This test does not establish that scheduler-exec-0001 originated from an independent scheduler.',
      'A future acceptance run still requires an independently recorded scheduler receipt/history and separate view-closure evidence.',
      'No hosted Site, live D1 database, live scheduler, deployment or 24-hour proof is exercised here.'
    ],
    chain: { schedulerExecutionId: scheduler.executionId, gardenRunId: run.id, tickId: tick.tick_id, revision: tick.revision, eventId: event.id },
    checks: ['scheduler metadata validated', 'execution ID persisted uniquely', 'execution ID joins to garden run', 'run joins to applied tick', 'tick revision matches world revision', 'event carries direct run ID', 'duplicate execution ID rejected']
  };
  fs.writeFileSync('project_docs/scheduler-provenance-test-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  sql.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
