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
