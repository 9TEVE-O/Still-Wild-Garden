#!/usr/bin/env node
// Test actual view-camera geometry without creating or changing a garden.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/garden-camera.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, module: { exports } }, { filename: "garden-camera.js" });
const { clampCamera, panCamera, zoomCamera, INITIAL_CAMERA, MAX_CAMERA_ZOOM } = exports;
const viewport = { width: 390, height: 844 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

assert.deepEqual({ ...clampCamera({ scale: .3, x: 42, y: -20 }, viewport) }, INITIAL_CAMERA, "1x resets pan");
assert.equal(clampCamera({ scale: 10, x: 0, y: 0 }, viewport).scale, MAX_CAMERA_ZOOM, "zoom cannot exceed maximum");
assert.deepEqual({ ...clampCamera({ scale: NaN, x: Infinity, y: NaN }, viewport) }, INITIAL_CAMERA, "invalid view input is safe");
const edge = clampCamera({ scale: 2, x: 900, y: -900 }, viewport);
near(edge.x, 195); near(edge.y, -422);
const resized = clampCamera(edge, { width: 320, height: 500 });
near(resized.x, 160); near(resized.y, -250);
assert.ok(Math.abs(resized.x) <= (resized.scale - 1) * 160, "rotation/split-screen re-clamps x");
const moved = panCamera({ scale: 1.5, x: 0, y: 0 }, -40, 30, viewport);
near(moved.x, -40); near(moved.y, 30);
const base = { scale: 1.2, x: 18, y: -12 }, anchor = { x: 60, y: -50 };
const zoomed = zoomCamera(base, 1.8, anchor, { width: 900, height: 700 });
near((anchor.x - base.x) / base.scale, (anchor.x - zoomed.x) / zoomed.scale);
near((anchor.y - base.y) / base.scale, (anchor.y - zoomed.y) / zoomed.scale);
assert.deepEqual({ ...zoomCamera(zoomed, 1, anchor, viewport) }, INITIAL_CAMERA, "reset");
console.log("PASS camera geometry: scale clamps, anchor stability, pan, invalid input and resize limits");
