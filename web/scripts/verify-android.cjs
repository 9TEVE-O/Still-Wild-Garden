const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const { createCanvas, loadImage } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '@napi-rs/canvas'));
const compile = (file, dependencies = {}) => {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'require', js)(exports, name => dependencies[name]); return exports;
};
const growth = compile('lib/garden.ts');
const { drawGarden } = compile('lib/render-garden.ts', { './garden': growth });
const { companionRecord, companionFile } = compile('lib/companion.ts');
const parent = Object.freeze({ seed: 4294967295, bornAt: 1790290000123, version: 1 });
assert.deepEqual(companionRecord(parent).garden, parent);
assert.deepEqual(Object.keys(companionRecord(parent)), ['format', 'formatVersion', 'garden']);
assert.throws(() => companionRecord({ ...parent, seed: -1 }));
assert.throws(() => companionRecord({ ...parent, version: 2 }));
assert.throws(() => companionRecord({ ...parent, bornAt: NaN }));
const assets = 'android/app/src/main/assets/';
const provenance = JSON.parse(fs.readFileSync(assets + 'provenance.json', 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
for (const [name, sha] of Object.entries(provenance.sources)) assert.equal(hash(fs.readFileSync(name)), sha, 'Regenerate scene after source changes');
const html = fs.readFileSync(assets + 'garden.html', 'utf8');
assert.equal(hash(html), provenance.htmlSha256);
assert.ok(html.includes("connect-src 'none'"));
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(js));
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert.ok(!/android.permission.(INTERNET|READ_EXTERNAL_STORAGE|QUERY_ALL_PACKAGES|BIND_ACCESSIBILITY_SERVICE)/.test(manifest));
assert.ok(manifest.includes('android:exported="false"'));
(async () => {
  const file = companionFile(parent);
  assert.deepEqual(JSON.parse(await file.text()).garden, parent);
  assert.ok(file.size < 4096);
  // This exact browser export is consumed by the Java test too.
  fs.mkdirSync('android/app/src/test/resources', { recursive: true });
  fs.writeFileSync('android/app/src/test/resources/web-export.json', await file.text());
  const art = {};
  for (const name of ['island', 'sapling']) art[name] = await loadImage(html.match(new RegExp('id="' + name + '" src="([^"]+)"'))[1]);
  let now = parent.bornAt;
  const canvas = createCanvas(400, 260); canvas.clientWidth = 400; canvas.clientHeight = 260;
  const labels = { day: { textContent: '' }, detail: { textContent: '' }, ...art };
  let frame;
  const window = {};
  const context = vm.createContext({ window, document: { hidden: false, querySelector: () => canvas, getElementById: id => labels[id] },
    requestAnimationFrame: fn => { frame = fn; }, matchMedia: () => ({ matches: false }), devicePixelRatio: 1,
    Date: class extends Date { static now() { return now; } } });
  vm.runInContext(js, context);
  window.stillwildSetGarden(parent);
  const reference = createCanvas(400, 260);
  for (const age of [0, 90000, 180000, 2 * 86400000, 90 * 86400000]) {
    now = parent.bornAt + age; window.stillwildPause(false); frame(1000 + age);
    drawGarden(reference.getContext('2d'), 400, 260, parent, now, art, false);
    assert.deepEqual(canvas.toBuffer('image/png'), reference.toBuffer('image/png'), 'Companion and site render the same garden at each age');
    assert.equal(labels.day.textContent, `Day ${growth.gardenAt(parent, now).day}. Still becoming.`);
  }
  const before = canvas.toBuffer('image/png'); window.stillwildPause(true); now += 86400000; frame(1e12);
  assert.deepEqual(canvas.toBuffer('image/png'), before, 'Paused view does no rendering');
  window.stillwildPause(false); frame(1e12 + 1000);
  assert.notDeepEqual(canvas.toBuffer('image/png'), before, 'Resume reconstructs elapsed growth');
  const evidence = { status: 'PASS', sameGardenExportBytes: file.size, sceneBytes: Buffer.byteLength(html), growthAndPixelParityAges: 5,
    boundedImportFormat: 'Java unit tests run separately', pauseResume: 'PASS', embeddedArt: 2, internetPermission: false,
    scope: 'Node VM with actual generated JS and Node canvas; not Android WebView or physical-device execution', provenance };
  fs.writeFileSync('project_docs/android-scene-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ ...evidence, provenance: 'source hashes saved in evidence' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
