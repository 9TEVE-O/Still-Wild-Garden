import { gardenAt, type Garden } from "../lib/garden";
import { drawGarden } from "../lib/render-garden";

declare global {
  interface Window { stillwildSetGarden: (garden: Garden) => void; stillwildPause: (paused: boolean) => void }
}
const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const title = document.getElementById("day")!;
const detail = document.getElementById("detail")!;
const island = document.getElementById("island") as HTMLImageElement;
const sapling = document.getElementById("sapling") as HTMLImageElement;
let garden: Garden | null = null, paused = false, last = 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
window.stillwildSetGarden = value => { garden = value; last = 0; };
window.stillwildPause = value => { paused = value; last = 0; };
function frame(time: number) {
  requestAnimationFrame(frame);
  if (paused || document.hidden || !garden || time - last < (reduced.matches ? 1000 : 100)) return;
  last = time;
  const width = Math.max(1, Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2)));
  const height = Math.max(1, Math.round(canvas.clientHeight * Math.min(devicePixelRatio, 2)));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const now = Date.now();
  const growth = gardenAt(garden, now);
  drawGarden(ctx, width, height, garden, now, { island, sapling }, reduced.matches);
  title.textContent = `Day ${growth.day}. Still becoming.`;
  detail.textContent = `${growth.plants} seeds · ${growth.agents} keepers`;
}
requestAnimationFrame(frame);
