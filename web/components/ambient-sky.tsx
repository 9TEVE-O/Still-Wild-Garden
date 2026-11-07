"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative ambient layer (candidate, presentation-only).
 *
 * A transparent overlay drawn on its own canvas above the garden view and behind the page chrome.
 * It adds twinkling stars in the sky, a faint water shimmer low in the scene, and a few drifting
 * fireflies. It is purely observational: it reads no garden, writes no persistent state, and never
 * touches lib/render-world.ts or the frozen version 1 renderer, so the Observation Invariant and the
 * renderer pixel-parity / provenance checks are unaffected. Honours prefers-reduced-motion by
 * painting a single still frame, and pauses while the tab is hidden.
 */

const STAR_COUNT = 54;
const FIREFLY_COUNT = 7;

// A small deterministic hash so the field is stable across frames without storing per-item arrays up front.
function rand(n: number): number {
  let x = Math.imul(n + 1, 0x9e3779b9) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x21f0aaad); x ^= x >>> 15; x = Math.imul(x, 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

export function AmbientSky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let dead = false, frame = 0, previous = 0;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      el.width = Math.round(el.clientWidth * dpr);
      el.height = Math.round(el.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const draw = (t: number) => {
      const w = el.clientWidth, h = el.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Stars — concentrated toward the top of the sky, twinkling on their own slow phases.
      for (let i = 0; i < STAR_COUNT; i++) {
        const sx = rand(i * 2) * w;
        const bias = rand(i * 2 + 1);
        const sy = bias * bias * h * 0.72;          // denser up high, sparse over the island
        const base = 0.18 + rand(i + 300) * 0.35;
        const tw = reduce.matches ? 1 : 0.55 + 0.45 * Math.sin(t / 1000 * (0.5 + rand(i + 50) * 0.9) + i);
        const alpha = base * tw;
        if (alpha <= 0.02) continue;
        const big = i % 9 === 0;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillStyle = i % 5 === 0 ? "#dfefc6" : i % 3 === 0 ? "#bfe4e0" : "#eef3df";
        const s = big ? 2 : 1;
        ctx.fillRect(Math.round(sx), Math.round(sy), s, s);
        if (big) {                                   // a soft cross glint on the brightest stars
          ctx.globalAlpha = Math.min(1, alpha) * 0.5;
          ctx.fillRect(Math.round(sx) - 1, Math.round(sy), 1, 1);
          ctx.fillRect(Math.round(sx) + s, Math.round(sy), 1, 1);
          ctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 1);
          ctx.fillRect(Math.round(sx), Math.round(sy) + s, 1, 1);
        }
      }

      // Water shimmer — faint glints low-centre, suggesting a little trickle of light on water.
      for (let i = 0; i < 6; i++) {
        const p = reduce.matches ? (i / 6) : ((t / 4200 + i / 6) % 1);
        const gx = w * (0.4 + i * 0.03) + Math.sin(t / 1500 + i) * 6;
        const gy = h * (0.74 + (i % 3) * 0.045);
        ctx.globalAlpha = (reduce.matches ? 0.18 : Math.sin(p * Math.PI) * 0.3);
        ctx.fillStyle = "#cdeee6";
        ctx.fillRect(Math.round(gx), Math.round(gy), 2, 1);
      }

      // Fireflies — a few warm drifting points of life across the mid scene.
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const seedA = rand(i + 700), seedB = rand(i + 900);
        const phase = reduce.matches ? i : t / 1000;
        const fx = w * (0.14 + seedA * 0.72) + Math.sin(phase * (0.22 + seedA * 0.25) + i) * w * 0.05;
        const fy = h * (0.42 + seedB * 0.34) + Math.cos(phase * (0.18 + seedB * 0.3) + i * 1.7) * h * 0.05;
        const glow = reduce.matches ? 0.5 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(phase * 1.6 + i * 2.1));
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.shadowColor = "#f3e9a8";
        ctx.shadowBlur = 9;
        ctx.fillStyle = "#f6edb0";
        ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    const paint = (time: number) => {
      if (dead) return;
      if (!document.hidden && (reduce.matches || time - previous > 33)) {
        previous = time;
        draw(time);
      }
      // Under reduced motion, paint one frame then idle.
      if (reduce.matches) { if (!(previous > 0)) draw(time); return; }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);

    const onVisibility = () => { if (!document.hidden && !reduce.matches) { frame = requestAnimationFrame(paint); } };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="ambient-sky" aria-hidden="true" />;
}
