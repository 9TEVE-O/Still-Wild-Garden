// Checks the five-stage growth layer against the version 1 rules it builds on.
// Pure checks always run. Canvas checks run when @napi-rs/canvas is available (installed, or via
// CODEX_PRIMARY_RUNTIME_NODE_MODULES as for the other renderer checks) and are reported otherwise.
// Writes renders only to .sites-runtime/verification/. Pass --record to also write project_docs/growth-evidence.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');

const dir = path.resolve('.sites-runtime/verification'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');
for (const name of ['garden', 'growth-atlas', 'growth', 'render-garden', 'render-world', 'gif-codec']) {
  const out = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  fs.writeFileSync(path.join(dir, name + '.js'), out.outputText);
}
const { gardenAt } = require(path.join(dir, 'garden.js'));
const atlas = require(path.join(dir, 'growth-atlas.js'));
const { plantsAt, spotOrder, stageForAge, sownAtHours, STAGE_START_DAYS } = require(path.join(dir, 'growth.js'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const HOUR = 3600000, DAY = 86400000;
const now = 1790000000000;
const seeds = [0, 1287346, 4288523180, 4294967295, 12947];
const ages = [0, 10 * 60000, HOUR, 4 * HOUR, DAY, 7 * DAY, 40 * DAY, 120 * DAY, 400 * DAY, 2000 * DAY];
const STAGES = ['mound', 'sprout', 'sapling', 'shrub', 'flowering'];

// 1. The atlas index belongs to the committed atlas, and every sprite lies inside it.
const atlasFile = 'public/art/growth/stillwild-growth-atlas.png';
assert.equal(sha(atlasFile), atlas.GROWTH_ATLAS_SHA256, 'Regenerate lib/growth-atlas.ts with design-assets/growth/build_atlas.py');
const png = fs.readFileSync(atlasFile);
const atlasW = png.readUInt32BE(16), atlasH = png.readUInt32BE(20);
let spriteCount = 0;
for (const [group, cells] of Object.entries(atlas.GROWTH_SPRITES)) {
  assert.ok(cells.length > 0, group);
  for (const [x, y, w, h, bx, by] of cells) {
    spriteCount++;
    assert.ok(x >= 0 && y >= 0 && x + w <= atlasW && y + h <= atlasH, `${group} inside atlas`);
    assert.ok(bx >= 0 && bx < w && by >= 0 && by <= h, `${group} base point inside its sprite`);
  }
}
for (const stage of STAGES) assert.ok(Object.keys(atlas.GROWTH_SPRITES).some(k => k.startsWith(stage + ':')), stage);

// 2. Planting spots are on the island and keep clear of the baked first sprout.
const [mx, my] = atlas.FIRST_SPROUT;
for (const [x, y] of atlas.GROWTH_SPOTS) {
  assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
  assert.ok(Math.hypot((x - mx) * 1536, (y - my) * 1024 * 1.9) > 95, 'first sprout stays clear');
}
for (const seed of seeds) {
  const order = spotOrder(seed);
  assert.deepEqual([...order].sort((a, b) => a - b), atlas.GROWTH_SPOTS.map((_, i) => i), 'order is a permutation of the spots');
}

// 3. Counts follow the version 1 rule exactly; stages never go backwards; output is deterministic.
assert.equal(stageForAge(0), 'mound'); assert.equal(stageForAge(STAGE_START_DAYS.sprout), 'sprout');
assert.equal(stageForAge(STAGE_START_DAYS.flowering - 1e-9), 'shrub'); assert.equal(stageForAge(1e6), 'flowering');
for (let k = 1; k < 300; k++) {
  const garden = { seed: 1, bornAt: now, version: 1 };
  // Visibility always uses the v1 count itself; sownAtHours only dates each plant. Allow one second for float rounding at the exact boundary.
  assert.ok(gardenAt(garden, now + Math.ceil(sownAtHours(k) * HOUR) + 1000).plants - 1 >= k, `plant ${k} exists from its sowing hour`);
  assert.ok(gardenAt(garden, now + Math.floor(sownAtHours(k) * HOUR) - 1000).plants - 1 < k, `plant ${k} is absent before its sowing hour`);
}
for (const seed of seeds) {
  const garden = { seed, bornAt: now, version: 1 };
  const seen = new Map();
  for (const age of ages) {
    const plants = plantsAt(garden, now + age);
    assert.equal(plants.length, Math.min(Math.max(0, gardenAt(garden, now + age).plants - 1), atlas.GROWTH_SPOTS.length));
    assert.deepEqual(plants, plantsAt({ ...garden }, now + age), 'deterministic');
    assert.equal(new Set(plants.map(p => p.spot)).size, plants.length, 'one plant per spot');
    for (const p of plants) {
      const before = seen.get(p.k);
      if (before) { assert.equal(before.spot, p.spot, 'a plant keeps its spot'); assert.ok(STAGES.indexOf(p.stage) >= STAGES.indexOf(before.stage), 'stages never go backwards'); }
      seen.set(p.k, p);
    }
  }
  assert.deepEqual(plantsAt(garden, now - DAY), [], 'a clock before planting shows no extra plants');
}
assert.deepEqual(plantsAt(null, now), []);
const census = days => { const c = Object.fromEntries(STAGES.map(s => [s, 0])); for (const p of plantsAt({ seed: 4288523180, bornAt: now, version: 1 }, now + days * DAY)) c[p.stage]++; return c; };
const day7 = census(7), day40 = census(40), day400 = census(400);
assert.equal(day7.sapling + day7.shrub + day7.flowering, 0, 'day 7 is mounds and sprouts');
assert.ok(day40.shrub > 0 && day40.flowering === 0, 'day 40 has shrubs and no flowers');
assert.equal(day400.flowering, atlas.GROWTH_SPOTS.length, 'day 400 is fully grown and flowering');

// 4. The version 1 renderer, growth rule and art that gifts and the Android companion bundle are unchanged.
const provenance = JSON.parse(fs.readFileSync('android/app/src/main/assets/provenance.json', 'utf8'));
for (const [file, digest] of Object.entries(provenance.sources)) assert.equal(sha(file), digest, `${file} unchanged for Android`);

const evidence = {
  status: 'PASS', checkedAt: new Date().toISOString(),
  atlas: { file: atlasFile, sha256: atlas.GROWTH_ATLAS_SHA256, width: atlasW, height: atlasH, sprites: spriteCount },
  spots: atlas.GROWTH_SPOTS.length, seeds: seeds.length, ages: ages.length,
  stageCensus: { day7, day40, day400 },
  version1Unchanged: Object.keys(provenance.sources),
  canvas: 'NOT_EXECUTED: @napi-rs/canvas unavailable',
};

function loadCanvas() {
  try { return require('@napi-rs/canvas'); } catch {}
  if (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) {
    try { return require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '@napi-rs/canvas')); } catch {}
  }
  return null;
}

(async () => {
  const canvasLib = loadCanvas();
  if (canvasLib) {
    const { createCanvas, loadImage } = canvasLib;
    const { drawGarden } = require(path.join(dir, 'render-garden.js'));
    const { drawWorld } = require(path.join(dir, 'render-world.js'));
    const { encodeLoop } = require(path.join(dir, 'gif-codec.js'));
    const island = await loadImage('public/art/island.png');
    const art1 = { island, sapling: await loadImage('public/art/sapling.png') };
    const art2 = { island, growth: await loadImage(atlasFile) };
    // 5. With no extra plants, the new renderer draws exactly what version 1 draws.
    for (const garden of [null, { seed: 1287346, bornAt: now - 10 * 60000, version: 1 }]) {
      const a = createCanvas(800, 520), b = createCanvas(800, 520);
      drawGarden(a.getContext('2d'), 800, 520, garden, now, art1, false, 1.3);
      drawWorld(b.getContext('2d'), 800, 520, garden, now, art2, false, 1.3);
      assert.ok(Buffer.from(a.getContext('2d').getImageData(0, 0, 800, 520).data).equals(Buffer.from(b.getContext('2d').getImageData(0, 0, 800, 520).data)), 'pixel parity without extra plants');
    }
    // 6. Three ages at phone presentation size (390 x 844 points at 3x), drawn by the live renderer.
    const renders = {};
    for (const days of [7, 40, 400]) {
      const c = createCanvas(390 * 3, 844 * 3), ctx = c.getContext('2d'); ctx.setTransform(3, 0, 0, 3, 0, 0);
      drawWorld(ctx, 390, 844, { seed: 4288523180, bornAt: now - days * DAY, version: 1 }, now, art2, false, 0);
      const file = path.join(dir, `growth-day${String(days).padStart(3, '0')}-phone.png`);
      fs.writeFileSync(file, c.toBuffer('image/png'));
      renders[days] = path.relative(process.cwd(), file);
    }
    // 7. The GIF export still meets its loop and size contract with a full-grown garden.
    const width = 800, height = 320, gc = createCanvas(width, height), gctx = gc.getContext('2d');
    const garden = { seed: 4288523180, bornAt: now - 400 * DAY, version: 1 };
    const frame = i => { drawWorld(gctx, width, height, garden, now, art2, false, i / 60 * 2 * Math.PI); return gctx.getImageData(0, 0, width, height).data; };
    assert.ok(Buffer.from(frame(0)).equals(Buffer.from(frame(60))), 'loop closes at its periodic endpoint');
    const loop = await encodeLoop(width, height, frame);
    assert.ok(loop.bytes.length < 2000000, 'GIF under 2,000,000 bytes');
    fs.writeFileSync(path.join(dir, 'growth-day400-loop.gif'), loop.bytes);
    evidence.canvas = { status: 'PASS', parityWithoutExtraPlants: true, phoneRenders: renders, day400LoopBytes: loop.bytes.length,
      note: 'Node canvas, not a browser or phone; renders are for the blind ordering test, not its result.' };
  }
  if (process.argv.includes('--record')) fs.writeFileSync('project_docs/growth-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
})().catch(e => { console.error(e); process.exitCode = 1; });
