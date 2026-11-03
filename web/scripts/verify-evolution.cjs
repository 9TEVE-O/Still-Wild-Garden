const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const dir = path.resolve('.sites-runtime/verification');
fs.mkdirSync(dir, { recursive: true });
const databasePath = path.join(dir, `evolution-${Date.now()}.sqlite`);
let sql = new DatabaseSync(databasePath);

for (const migration of ['drizzle/0000_superb_krista_starr.sql', 'drizzle/0001_dew_persistent_hour.sql']) {
  sql.exec(fs.readFileSync(migration, 'utf8'));
}

function prepared(query) {
  return {
    bind(...params) {
      return {
        async first() { return sql.prepare(query).get(...params) ?? null; },
        async all() { return { results: sql.prepare(query).all(...params) }; },
        async run() {
          const result = sql.prepare(query).run(...params);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
}

const env = {
  DB: {
    prepare: prepared,
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  },
};

function load(file, imports) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected dependency ${name} in ${file}`);
      return imports[name];
    },
    Date,
    Response,
    Request,
    URL,
    console,
  });
  return exports;
}

const types = load('lib/evolution/types.ts', {});
const advance = load('lib/evolution/advance.ts', { '@/lib/evolution/types': types });
const evolution = load('db/evolution.ts', {
  'cloudflare:workers': { env },
  '@/lib/evolution/types': types,
  '@/lib/evolution/advance': advance,
});
const snapshotRoute = load('app/api/garden/snapshot/route.ts', { '@/db/evolution': evolution });

(async () => {
  const before = await (await snapshotRoute.GET()).json();
  assert.equal(before.snapshot, null, 'read-only snapshot must not create the proof garden');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM gardens').get().n, 0, 'legacy origin table changed');

  const tickId = 400000;
  const environment = {
    tickId,
    precipitationMm: 0,
    temperatureC: 30,
    provider: 'verification-fixture',
    sourceStatus: 'simulated',
  };
  const applied = await evolution.runEvolutionTick(environment, tickId * 3_600_000 + 1000);
  assert.equal(applied.applied, true);
  assert.equal(applied.events.length, 1);
  assert.equal(applied.events[0].type, 'keeper.watered');
  assert.match(applied.events[0].payload.reason, /below the 25% watering threshold/);
  assert.equal(applied.snapshot.garden.revision, 1);
  assert.equal(applied.snapshot.garden.lastTickId, tickId);
  assert.equal(applied.snapshot.garden.plants[0].lastWateredTick, tickId);
  assert.equal(applied.snapshot.garden.keepers[0].lastActionTick, tickId);

  const duplicate = await evolution.runEvolutionTick(environment, tickId * 3_600_000 + 2000);
  assert.equal(duplicate.applied, false, 'same hourly tick must be idempotent');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM garden_events').get().n, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM applied_ticks').get().n, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM background_runs').get().n, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM evolution_gardens').get().n, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM gardens').get().n, 0, 'proof touched legacy garden state');

  const revisionBeforeRead = sql.prepare('SELECT revision FROM evolution_gardens WHERE garden_id = ?').get(types.PROOF_GARDEN_ID).revision;
  await snapshotRoute.GET();
  await snapshotRoute.GET();
  const revisionAfterRead = sql.prepare('SELECT revision FROM evolution_gardens WHERE garden_id = ?').get(types.PROOF_GARDEN_ID).revision;
  assert.equal(revisionAfterRead, revisionBeforeRead, 'snapshot reads advanced the garden');

  sql.close();
  sql = new DatabaseSync(databasePath);
  const afterReopen = await (await snapshotRoute.GET()).json();
  assert.equal(afterReopen.snapshot.garden.revision, 1, 'state did not survive database reopen');
  assert.equal(afterReopen.snapshot.events.length, 1, 'event did not survive database reopen');
  assert.equal(afterReopen.snapshot.events[0].type, 'keeper.watered');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM gardens').get().n, 0, 'legacy garden changed after reopen');

  // Overlapping-tick race: a concurrent winner advances the garden between this run's read and its
  // batch. The losing run carries a different, newer tick id, so its own inserts never key-collide;
  // the regression is that it used to still persist an applied tick, a committed run record, an
  // environment interval and a watering event although the garden state never advanced to its tick.
  const raceTickId = tickId + 1;
  const countOf = (table) => sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const tables = ['garden_events', 'applied_ticks', 'background_runs', 'environment_intervals'];
  const countsBefore = Object.fromEntries(tables.map((t) => [t, countOf(t)]));
  const realBatch = env.DB.batch;
  env.DB.batch = async (statements) => {
    env.DB.batch = realBatch; // one-shot: only the racing run sees the injected concurrent winner
    sql.prepare('UPDATE evolution_gardens SET revision = revision + 1, last_tick_id = ? WHERE garden_id = ?')
      .run(9_999_999, types.PROOF_GARDEN_ID);
    return realBatch(statements);
  };
  const raced = await evolution.runEvolutionTick({ ...environment, tickId: raceTickId }, raceTickId * 3_600_000 + 1000);
  assert.equal(raced.applied, false, 'a losing overlapping tick must not report applied');
  assert.equal(raced.reason, 'concurrent_or_duplicate_tick', 'a losing overlapping tick must be reported as such');
  const countsAfter = Object.fromEntries(tables.map((t) => [t, countOf(t)]));
  assert.deepEqual(countsAfter, countsBefore, 'a losing overlapping tick must persist no rows');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM applied_ticks WHERE tick_id = ?').get(raceTickId).n, 0, 'no orphan applied tick');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM background_runs WHERE tick_id = ?').get(raceTickId).n, 0, 'no orphan run record');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM garden_events WHERE tick_id = ?').get(raceTickId).n, 0, 'no orphan event');

  // Same-tick overlap with divergent inputs: a winner and a loser read the same prior state and apply
  // the SAME tick, but with different precipitation, so they compute different events. event_id is
  // derived from the tick, not the weather, so the loser's extra event would NOT key-collide with the
  // winner's — the updated_at stamp in committedGuard is what keeps the loser's row out. Only the
  // winner's event set (here empty: the winner's precipitation waters nothing) may persist for the tick.
  const sameTick = tickId + 100_000;
  const priorRevision = JSON.parse(
    sql.prepare('SELECT state_json FROM evolution_gardens WHERE garden_id = ?').get(types.PROOF_GARDEN_ID).state_json,
  ).revision;
  const winnerRevision = priorRevision + 1;
  const winnerNow = sameTick * 3_600_000 + 500;
  const loserNow = sameTick * 3_600_000 + 1500;
  const realBatchSameTick = env.DB.batch;
  env.DB.batch = async (statements) => {
    env.DB.batch = realBatchSameTick; // one-shot: commit the winner's same-tick, no-event outcome before the loser's batch
    sql.prepare('UPDATE evolution_gardens SET revision = ?, last_tick_id = ?, updated_at = ? WHERE garden_id = ?')
      .run(winnerRevision, sameTick, winnerNow, types.PROOF_GARDEN_ID);
    return realBatchSameTick(statements);
  };
  // The loser runs precipitation 0, which waters the dry plant, so it computes a keeper.watered event
  // the winner did not. Its event id differs from (here, the absence of) the winner's, so only the
  // updated_at guard keeps it from persisting against the winner's committed state.
  const racedSameTick = await evolution.runEvolutionTick({ ...environment, tickId: sameTick, precipitationMm: 0 }, loserNow);
  assert.equal(racedSameTick.applied, false, 'a same-tick loser must not report applied');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM garden_events WHERE tick_id = ?').get(sameTick).n, 0, 'a same-tick loser must not persist an event the winner did not');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM applied_ticks WHERE tick_id = ?').get(sameTick).n, 0, 'a same-tick loser must not persist an applied tick');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM background_runs WHERE tick_id = ?').get(sameTick).n, 0, 'a same-tick loser must not persist a run record');

  const evidence = {
    status: 'PASS',
    scope: 'Local SQLite-backed D1 adapter. Proves deterministic Dew consequence, persistence, duplicate-tick idempotency and read-only return. Does not prove deployed hourly scheduling or a real one-hour absence.',
    gardenId: types.PROOF_GARDEN_ID,
    tickId,
    dewEvent: afterReopen.snapshot.events[0],
    revision: afterReopen.snapshot.garden.revision,
    legacyGardenRows: 0,
    duplicateTickRejected: true,
    readOnlyReturn: true,
    survivesConnectionReopen: true,
  };
  fs.writeFileSync('project_docs/dew-persistent-hour-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
  sql.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
