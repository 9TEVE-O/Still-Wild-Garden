import { quantize } from "gifenc";
import { GifWriter } from "omggif";

export type FrameSource = (index: number) => Uint8ClampedArray;
// One fixed palette, a stable RGB555 mapping, and transparent subrectangles.
// The first opaque frame also resets the canvas cleanly at each loop boundary.
export async function encodeLoop(width: number, height: number, frameSource: FrameSource, progress: (n: number) => void = () => {}, yieldFrame: () => Promise<void> = () => Promise.resolve()) {
  const count = 60;
  const first = frameSource(0);
  const colors = quantize(first, 124, { format: "rgb565" }).slice(0, 124);
  colors.push([228, 239, 183], [160, 232, 224], [192, 218, 168]);
  while (colors.length < 127) colors.push(colors[colors.length - 1]);
  const palette = colors.map(([r, g, b]) => (r << 16) | (g << 8) | b);
  palette.push(0);
  const lut = new Uint8Array(32768);
  for (let key = 0; key < lut.length; key++) {
    const r = ((key >> 10) & 31) * 8 + 4, g = ((key >> 5) & 31) * 8 + 4, b = (key & 31) * 8 + 4;
    let distance = Infinity, best = 0;
    for (let c = 0; c < 127; c++) { const color = colors[c]; const d = 2 * (r - color[0]) ** 2 + 3 * (g - color[1]) ** 2 + (b - color[2]) ** 2; if (d < distance) { distance = d; best = c; } }
    lut[key] = best;
  }
  const buffer: number[] = [];
  const writer = new GifWriter(buffer, width, height, { loop: 0, palette });
  let previous: Uint8Array | null = null;
  let maxChangedFraction = 0;
  for (let frame = 0; frame < count; frame++) {
    const rgba = frame === 0 ? first : frameSource(frame);
    const indexed = new Uint8Array(width * height);
    let minX = width, minY = height, maxX = -1, maxY = -1, changed = 0;
    for (let i = 0; i < indexed.length; i++) {
      const j = i * 4;
      indexed[i] = lut[((rgba[j] >> 3) << 10) | ((rgba[j + 1] >> 3) << 5) | (rgba[j + 2] >> 3)];
      if (previous && indexed[i] !== previous[i]) { const x = i % width, y = Math.floor(i / width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); changed++; }
    }
    if (!previous) writer.addFrame(0, 0, width, height, indexed, { delay: 10, disposal: 1 });
    else {
      maxChangedFraction = Math.max(maxChangedFraction, changed / indexed.length);
      if (maxX < 0) writer.addFrame(0, 0, 1, 1, new Uint8Array([127]), { delay: 10, disposal: 1, transparent: 127 });
      else {
        const w = maxX - minX + 1, h = maxY - minY + 1;
        const rect = new Uint8Array(w * h).fill(127);
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const i = y * width + x; if (indexed[i] !== previous[i]) rect[(y - minY) * w + x - minX] = indexed[i]; }
        writer.addFrame(minX, minY, w, h, rect, { delay: 10, disposal: 1, transparent: 127 });
      }
    }
    previous = indexed;
    progress(Math.round((frame + 1) / count * 100));
    if (frame % 3 === 0) await yieldFrame();
  }
  const length = writer.end();
  return { bytes: new Uint8Array(buffer.slice(0, length)), width, height, frames: count, durationMs: 6000, colors: 128, maxChangedFraction };
}
