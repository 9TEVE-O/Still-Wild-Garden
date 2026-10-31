// Isolated source-bound regression gate for the private keeper ledger.
// Reads only local source. No network, scheduler, credential, database or live Site access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const pagePath = path.resolve(__dirname, '../app/page.tsx');
const source = fs.readFileSync(pagePath, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const events = [
  { payload: { keeper: 'Dew', type: 'rain-collected', text: 'Ambient rainfall' } },
  { payload: { keeper: 'Pip', type: 'seed-planted', text: 'Pip sowed' } },
  { payload: { keeper: 'Dew', type: 'roots-watered', text: 'Dew watered roots' } },
  { payload: { keeper: 'Moss', type: 'habitat-made', text: 'Moss made habitat' } },
];
const keepers = { Pip: { completed: 2 }, Dew: { completed: 0 }, Moss: { completed: 7 } };
function verify(code) {
  const lookup = code.match(/const lastEvent = data\?\.events\.find\((event => [^\n]+)\);/g);
  assert.equal(lookup?.length, 1, 'exactly one keeper event selector must be present');
  const expression = lookup[0].match(/\.find\((event => [^\n]+)\);$/)[1];
  const counter = code.match(/\{(world\?\.state\.keepers\[keeper\.id\]\.completed \?\? "…")\}/g);
  assert.equal(counter?.length, 1, 'counter must use each keeper committed completion value');
  const countExpression = counter[0].slice(1, -1);
  const selected = {};
  const values = {};
  for (const id of ['Pip', 'Dew', 'Moss']) {
    const keeper = { id };
    const pred = vm.runInNewContext('(' + expression + ')', { keeper });
    selected[id] = events.find(event => pred(event))?.payload.text;
    values[id] = vm.runInNewContext(countExpression, { keeper, world: { state: { keepers } } });
  }
  assert.deepEqual(selected, {
    Pip: 'Pip sowed', Dew: 'Dew watered roots', Moss: 'Moss made habitat',
  }, 'only keeper-performed actions should be shown');
  assert.deepEqual(values, { Pip: 2, Dew: 0, Moss: 7 }, 'saved completion counters must remain keeper-specific');
  const empty = vm.runInNewContext(countExpression, { keeper: { id: 'Dew' }, world: null });
  assert.equal(empty, '…', 'an empty world must not be invented');
  assert.ok(code.includes('not proof of a completed 24-hour absence test'), 'absence disclaimer must remain visible');
}
verify(source);
const mutations = [
  ['M01-cross-keeper-count', 'world?.state.keepers[keeper.id].completed', 'world?.state.plants'],
  ['M02-wrong-keeper-event', 'event.payload.keeper === keeper.id', 'event.payload.keeper !== keeper.id'],
  ['M03-rain-misattribution', 'event.payload.type !== "rain-collected"', 'event.payload.type === "rain-collected"'],
];
for (const [id, anchor, replacement] of mutations) {
  assert.equal(source.split(anchor).length, 2, id + ': source anchor must be unique');
  const mutant = source.replace(anchor, replacement);
  assert.notEqual(mutant, source);
  let killed = false;
  try { verify(mutant); } catch (e) { if (e.code === 'ERR_ASSERTION') killed = true; else throw e; }
  assert.ok(killed, id + ': intentional defect escaped verification');
}
const receipt = {
  schema: 'stillwild.keeper-logic-gate/1', pageSha256: sourceHash,
  status: 'PASS', fixtureChecks: 4, mutationsDetected: mutations.map(m => m[0]),
  scope: 'local source expression checks with synthetic events; no visual or provider verification',
  exclusions: ['physical rendering', 'deployed source', 'live D1', 'privacy boundary', 'production release'],
};
const out = process.argv.find(x => x.startsWith('--output='));
if (out) fs.writeFileSync(path.resolve(process.cwd(), out.slice(9)), JSON.stringify(receipt, null, 2) + '\n');
console.log('KEEPER_LOGIC_GATE_PASS 4 fixture checks; 3/3 mutants killed; sha256=' + sourceHash);
