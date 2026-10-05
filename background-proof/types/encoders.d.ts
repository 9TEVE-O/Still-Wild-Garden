declare module "gifenc" { export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string }): number[][]; }
declare module "omggif" {
  export class GifWriter { constructor(buffer: number[] | Uint8Array, width: number, height: number, options: { loop: number; palette: number[] }); addFrame(x: number, y: number, width: number, height: number, pixels: Uint8Array, options: { delay: number; disposal: number; transparent?: number }): number; end(): number; }
  export class GifReader { constructor(data: Uint8Array); width: number; height: number; numFrames(): number; frameInfo(index: number): { x: number; y: number; width: number; height: number; delay: number; disposal: number }; decodeAndBlitFrameRGBA(index: number, pixels: Uint8Array): void; }
}
