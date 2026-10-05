import type { Garden } from "./garden";
import { drawGarden, loadArt } from "./render-garden";
import { seedRuntime } from "./seed-runtime";
export function saveFile(file: File) {
  const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function dataUrl(path: string) {
  const response = await fetch(path); if (!response.ok) throw new Error("Artwork unavailable");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); });
}
export async function makeGift(parent: Garden): Promise<File> {
  const values = new Uint32Array(1); crypto.getRandomValues(values);
  const gift = { version: 1, seed: values[0], bornAt: Date.now(), parentSeed: parent.seed, parentBornAt: parent.bornAt };
  const [island, sapling] = await Promise.all([dataUrl("/art/island.png"), dataUrl("/art/sapling.png")]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'"><title>A little Stillwild, for you</title><style>*{box-sizing:border-box}body{margin:0;background:#0a120e;color:#e8ecdc;font-family:Arial,sans-serif;overflow:hidden}canvas{width:100vw;height:100svh;display:block}header{position:fixed;top:6vh;left:7vw;pointer-events:none}h1{font:40px/1.1 Georgia,serif;font-weight:400;letter-spacing:-1px;margin:14px 0}small{font:11px monospace;letter-spacing:1px;color:#b2c2a7}p{font-size:14px;line-height:1.7;color:#bdcdb3}footer{position:fixed;bottom:4vh;left:5vw;right:5vw;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap}button{font:14px Arial;color:#e5ecd9;padding:12px 17px;background:#263c2acc;backdrop-filter:blur(18px);border:1px solid #d0e4c53b;border-radius:12px;cursor:pointer}button:focus-visible{outline:2px solid #e4ecc7;outline-offset:4px}#message{display:block;position:fixed;bottom:90px;left:20px;right:20px;text-align:center;font-size:12px;color:#b7c6aa}.quiet header{display:none}#footnote{font-size:11px;color:#a6b69e;max-width:440px;text-align:center} @media(max-width:600px){h1{font-size:32px}header{top:5vh}#footnote{font-size:10px}}</style></head><body><header><small>STILLWILD / A SEED, GIVEN</small><h1>A little world.<br>All yours.</h1><p id="age">One seed. All the time in the world.</p></header><canvas id="world" aria-label="Your personal growing pixel garden"></canvas><p id="message" role="status"></p><footer><button id="watch">Just watch</button><button id="wallpaper">Save wallpaper</button><button id="give">Give a seed</button><span id="footnote">This file is your garden. Keep it to keep your seed. Growth catches up when opened. Open in a browser that runs local HTML; some phones only show a preview.</span></footer><script type="application/json" id="stillwild-seed">${JSON.stringify(gift)}</script><script>(${seedRuntime.toString()})(${JSON.stringify({ island, sapling })});</script></body></html>`;
  return new File([html], `stillwild-seed-${values[0].toString(16)}.html`, { type: "text/html" });
}
export async function wallpaper(garden: Garden | null): Promise<File> {
  const art = await loadArt(); const canvas = document.createElement("canvas");
  const ratio = Math.min(2.4, Math.max(1.2, window.screen.height / window.screen.width));
  canvas.width = 1440; canvas.height = Math.round(1440 * ratio);
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
  drawGarden(ctx, canvas.width, canvas.height, garden, Date.now(), art, true);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Export failed")), "image/png"));
  return new File([blob], "stillwild-wallpaper.png", { type: "image/png" });
}
