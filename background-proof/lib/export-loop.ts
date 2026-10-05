import type { Garden } from "./garden";
import { drawGarden, loadArt } from "./render-garden";
import { encodeLoop } from "./gif-codec";
export async function exportLoop(garden: Garden | null, progress: (percent: number) => void) {
  const art = await loadArt(); const snapshot = Date.now();
  for (const [width, height] of [[800, 320], [640, 256], [480, 192]]) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("This browser can't create a loop.");
    const result = await encodeLoop(width, height, frame => { drawGarden(ctx, width, height, garden, snapshot, art, false, frame / 60 * Math.PI * 2); return ctx.getImageData(0, 0, width, height).data; }, progress, () => new Promise(resolve => setTimeout(resolve, 0)));
    if (result.bytes.byteLength < 2_000_000) return { ...result, file: new File([result.bytes], "stillwild-living-loop.gif", { type: "image/gif" }) };
  }
  throw new Error("Couldn't make a loop smaller than 2 MB. Try a still wallpaper instead.");
}
