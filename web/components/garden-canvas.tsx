"use client";
import { forwardRef, useEffect, useRef, useState, useImperativeHandle } from "react";
import type { Garden } from "@/lib/garden";
import { drawGarden, loadArt } from "@/lib/render-garden";
export const GardenCanvas = forwardRef<HTMLCanvasElement, { garden: Garden | null; now: number }>(function GardenCanvas({ garden, now }, forwarded) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ garden, offset: now - Date.now() });
  state.current = { garden, offset: now - Date.now() };
  const [error, setError] = useState(false);
  useImperativeHandle(forwarded, () => ref.current!, []);
  useEffect(() => {
    let dead = false, frame = 0, previous = 0;
    const el = ref.current; if (!el) return;
    const context = el.getContext("2d"); if (!context) { setError(true); return; }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => { const r = el.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2); el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    void loadArt().then(art => {
      if (dead) return;
      const paint = (time: number) => {
        if (dead) return;
        if (!document.hidden && (time - previous > (reduce.matches ? 1000 : 33))) {
          previous = time;
          drawGarden(context, el.clientWidth, el.clientHeight, state.current.garden, Date.now() + state.current.offset, art, reduce.matches);
        }
        frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
    }).catch(() => setError(true));
    return () => { dead = true; cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <><canvas ref={ref} className="garden-canvas" role="img" aria-label={garden ? "Your growing pixel garden, with tiny keepers tending an emerald floating island" : "A preview of the tiny emerald world your seed can become"} />{error && <p className="art-error" role="alert">The garden view couldn’t load. Refresh to try again.</p>}</>;
});
