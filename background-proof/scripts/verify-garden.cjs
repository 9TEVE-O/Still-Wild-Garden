const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require('typescript');
const { createCanvas, loadImage } = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '@napi-rs/canvas'));
const { GifReader } = require('omggif');
const dir = path.resolve('.sites-runtime/verification'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');
for (const name of ['garden', 'render-garden', 'gif-codec', 'seed-runtime']) {
  const out = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  fs.writeFileSync(path.join(dir, name + '.js'), out.outputText);
}
const { gardenAt } = require(path.join(dir, 'garden.js'));
const { drawGarden } = require(path.join(dir, 'render-garden.js'));
const { encodeLoop } = require(path.join(dir, 'gif-codec.js'));
const { seedRuntime } = require(path.join(dir, 'seed-runtime.js'));
const now = 1780000000000;
const planted = { seed: 1287346, bornAt: now, version: 1 };
assert.equal(gardenAt(planted, now).plants, 1);
assert.equal(gardenAt(planted, now).agents, 1);
assert.equal(gardenAt(planted, now + 180000).agents, 3);
assert.equal(gardenAt(planted, now - 10000).age, 0);
assert.deepEqual(gardenAt(planted, now + 86400000), gardenAt({ ...planted }, now + 86400000));
assert.ok(gardenAt(planted, now + 86400000).plants > 1);
new vm.Script(`(${seedRuntime.toString()})`);
assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(seedRuntime.toString()));
(async () => {
  const art = { island: await loadImage('public/art/island.png'), sapling: await loadImage('public/art/sapling.png') };
  const width = 800, height = 320, canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  const garden = { ...planted, bornAt: now - 14 * 86400000 };
  const get = i => { drawGarden(ctx, width, height, garden, now, art, false, i / 60 * 2 * Math.PI); return ctx.getImageData(0, 0, width, height).data; };
  const zero = get(0); const boundary = get(60);
  assert.deepEqual(Buffer.from(zero), Buffer.from(boundary), 'Loop closes at the exact periodic endpoint');
  let rawChangedMax = 0, prev = zero;
  for (let i = 1; i < 60; i++) { const frame = get(i); let changed = 0; for (let p = 0; p < frame.length; p += 4) if (frame[p] !== prev[p] || frame[p + 1] !== prev[p + 1] || frame[p + 2] !== prev[p + 2]) changed++; rawChangedMax = Math.max(rawChangedMax, changed / (width * height)); prev = frame; }
  assert.ok(rawChangedMax < .05, 'At least 95% of pixels stay unchanged between frames');
  const result = await encodeLoop(width, height, get);
  assert.ok(result.bytes.length < 2000000, 'Measured encoded byte budget');
  const reader = new GifReader(result.bytes);
  assert.equal(reader.numFrames(), 60); assert.equal(reader.width, width); assert.equal(reader.height, height);
  const out = new Uint8Array(width * height * 4); let firstDecoded;
  for (let i = 0; i < 60; i++) { const info = reader.frameInfo(i); assert.equal(info.delay, 10); assert.equal(info.disposal, 1); assert.ok(info.width <= width && info.height <= height); reader.decodeAndBlitFrameRGBA(i, out); if (i === 0) firstDecoded = out.slice(); }
  assert.notDeepEqual(out, firstDecoded, 'The export contains real motion');
  reader.decodeAndBlitFrameRGBA(0, out);
  assert.deepEqual(out, firstDecoded, 'Opaque frame zero resets correctly after the final delta');
  fs.writeFileSync(path.join(dir, 'measured-loop.gif'), result.bytes);
  drawGarden(ctx, width, height, garden, now, art, false, 0);
  fs.writeFileSync(path.join(dir, 'garden-frame.png'), canvas.toBuffer('image/png'));
  const evidence = { status: 'PASS', width, height, frames: 60, durationMs: 6000, bytes: result.bytes.length, maxChangedPixelFraction: rawChangedMax, maxChangedIndexedFraction: result.maxChangedFraction, exactPeriodicBoundary: true, decodedFrames: 60, decodedLoopReset: true, growthFixtures: 'passed', offlineRuntimeSyntax: 'passed', note: 'Actual shared renderer and encoder executed with a Node canvas; not a browser or phone-device test.' };
  fs.writeFileSync('project_docs/loop-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
})().catch(e => { console.error(e); process.exitCode = 1; });
