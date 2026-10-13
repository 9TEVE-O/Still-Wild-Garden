import { gardenAt, random, type Garden } from "./garden";
import { GROWTH_ATLAS_SRC, ISLAND_SOURCE_WIDTH, LOGICAL_PIXEL } from "./growth-atlas";
import { plantsAt } from "./growth";

export type WorldArt = { island: HTMLImageElement; growth: HTMLImageElement };

/**
 * The live view: the version 1 scene with the five-stage growth layer in place of the single sapling sprite.
 *
 * Background, island layout, keepers, motes and stream highlights mirror lib/render-garden.ts exactly.
 * That file stays unchanged because offline gifts and the Android companion bundle it with recorded hashes.
 * scripts/verify-growth.cjs checks that both renderers draw identical pixels when no plants are visible.
 */
export function drawWorld(ctx: CanvasRenderingContext2D, width: number, height: number, garden: Garden | null, now: number, art: WorldArt, reduced = false, loopPhase?: number) {
  const growth = gardenAt(garden, now);
  const seed = garden?.seed ?? 12947;
  const phase = reduced ? 0 : loopPhase ?? ((now % 18000) / 18000 * Math.PI * 2);
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(width * .51, height * .60, 0, width * .5, height * .52, width * .6);
  bg.addColorStop(0, "#173325"); bg.addColorStop(.38, "#102219"); bg.addColorStop(1, "#0a120e");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 75; i++) {
    const x = random(seed, i * 3) * width;
    const y = random(seed, i * 3 + 1) * height;
    const alpha = .10 + random(seed, i * 3 + 2) * .23;
    ctx.fillStyle = `rgba(209,229,183,${alpha})`;
    ctx.fillRect(Math.floor(x), Math.floor(y), i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
  }
  const scale = garden ? Math.min(1, .24 + Math.log1p(growth.age / 60000) * .048) : 1;
  const w = Math.min(width * .96, height * 1.65, 1120) * scale;
  const h = w * 2 / 3;
  const x = (width - w) / 2;
  const y = height * .53 - h * .47;
  ctx.imageSmoothingEnabled = false;
  if (art.island.complete && art.island.naturalWidth) ctx.drawImage(art.island, x, y, w, h);
  if (garden && art.growth.complete && art.growth.naturalWidth) {
    // One sprite pixel matches three pixels of the 1536-wide island original, so plants share its pixel density.
    const unit = w * LOGICAL_PIXEL / ISLAND_SOURCE_WIDTH;
    const deviceScale = typeof ctx.getTransform === "function" ? ctx.getTransform().a || 1 : 1;
    const snap = (v: number) => Math.round(v * deviceScale) / deviceScale;
    for (const plant of plantsAt(garden, now)) {
      const [sx, sy, sw, sh, bx, by] = plant.sprite;
      ctx.drawImage(art.growth, sx, sy, sw, sh, snap(x + plant.x * w - bx * unit), snap(y + plant.y * h - by * unit), snap(sw * unit), snap(sh * unit));
    }
  }
  const agentCount = garden ? growth.agents : 3;
  const colors = ["#e4efb7", "#a0e8e0", "#c0daa8"];
  for (let i = 0; i < agentCount; i++) {
    const a = phase + i * 2.1 + random(seed, 700) * 6;
    const radius = .16 + i * .04;
    const px = Math.round(x + w * (.49 + Math.cos(a) * radius));
    const py = Math.round(y + h * (.48 + Math.sin(a) * radius * .55) - Math.abs(Math.sin(phase * 2 + i)) * 3);
    const size = Math.max(2, Math.min(5, w / 170));
    ctx.save(); ctx.shadowColor = colors[i]; ctx.shadowBlur = 13; ctx.fillStyle = colors[i];
    ctx.fillRect(px, py, size * 2, size * 2); ctx.fillRect(px + size / 2, py - size, size, size);
    ctx.shadowBlur = 0; ctx.fillStyle = "#1d3428"; ctx.fillRect(px + size / 2, py + size / 2, Math.max(1, size / 3), Math.max(1, size / 3));
    ctx.fillRect(px + size * 1.4, py + size / 2, Math.max(1, size / 3), Math.max(1, size / 3)); ctx.restore();
    // Work particles remain within the garden. Blue carries water; green tends; gold sows.
    for (let j = 0; j < 3; j++) { const p = (phase / (Math.PI * 2) + j * .333333 + i) % 1; ctx.globalAlpha = (1 - p) * .6; ctx.fillStyle = colors[i]; ctx.fillRect(px + Math.sin(j + phase) * 10, py - p * 17, 2, 2); }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 8; i++) {
    const a = random(seed, i + 900) * Math.PI * 2;
    const r = .07 + random(seed, i + 950) * .23;
    const px = x + w * (.5 + Math.cos(a) * r);
    const py = y + h * (.42 + Math.sin(a) * r * .55) + Math.sin(phase + i) * 8;
    ctx.globalAlpha = .25 + Math.max(0, Math.sin(phase + i)) * .6;
    ctx.fillStyle = i % 3 === 0 ? "#e5d99a" : "#adc6a1"; ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
  }
  ctx.globalAlpha = 1;
  // A few highlights travel down the fixed stream; the terrain never moves.
  for (let i = 0; i < 5; i++) {
    const p = (phase / (Math.PI * 2) + i / 5) % 1;
    ctx.globalAlpha = Math.sin(p * Math.PI) * .6;
    ctx.fillStyle = "#b8fff0";
    ctx.fillRect(Math.round(x + w * (.64 + p * .015)), Math.round(y + h * (.60 + p * .10)), Math.max(1, w * .003), Math.max(1, w * .0018));
  }
  ctx.globalAlpha = 1;
}

export async function loadWorldArt(): Promise<WorldArt> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  const [island, growth] = await Promise.all([load("/art/island.png"), load(GROWTH_ATLAS_SRC)]);
  return { island, growth };
}
