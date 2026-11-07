import { gardenAt, random, type Garden, type Growth } from "./garden";
export type GardenArt = { island: HTMLImageElement; sapling: HTMLImageElement };
export function drawGarden(ctx: CanvasRenderingContext2D, width: number, height: number, garden: Garden | null, now: number, art: GardenArt, reduced = false, loopPhase?: number, savedGrowth?: Growth) {
  const growth = savedGrowth ?? gardenAt(garden, now);
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
  if (garden && growth.plants > 1 && art.sapling.complete && art.sapling.naturalWidth) {
    const max = Math.min(growth.plants - 1, 45);
    for (let i = 0; i < max; i++) {
      const plantId = Math.max(0, growth.plants - 46) + i;
      const a = random(seed, plantId + 200) * Math.PI * 2;
      const r = Math.sqrt(random(seed, plantId + 400)) * .32;
      const px = x + w * (.49 + Math.cos(a) * r);
      const py = y + h * (.49 + Math.sin(a) * r * .53);
      const sz = w * (.035 + random(seed, plantId + 500) * .026);
      ctx.save(); ctx.globalAlpha = .85; ctx.drawImage(art.sapling, px - sz / 2, py - sz * .83, sz, sz); ctx.restore();
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
export async function loadArt(): Promise<GardenArt> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  const [island, sapling] = await Promise.all([load("/art/island.png"), load("/art/sapling.png")]);
  return { island, sapling };
}
