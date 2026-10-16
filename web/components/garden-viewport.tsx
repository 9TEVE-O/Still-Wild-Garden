"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Garden } from "@/lib/garden";
import { GardenCanvas } from "@/components/garden-canvas";

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
type Pinch = { distance: number; scale: number; x: number; y: number; anchorX: number; anchorY: number };
const MAX_ZOOM = 2.8;
const initialView: View = { scale: 1, x: 0, y: 0 };

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function midpoint(a: Point, b: Point): Point { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

// Camera coordinates are view-only. No world seed, terrain position or persisted event is changed.
export function GardenViewport({ garden, now }: { garden: Garden | null; now: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const current = useRef<View>(initialView);
  const [view, setView] = useState<View>(initialView);

  function commit(scale: number, x: number, y: number) {
    const el = viewport.current;
    if (!el) return;
    const s = Math.min(MAX_ZOOM, Math.max(1, scale));
    const boundX = (s - 1) * el.clientWidth / 2;
    const boundY = (s - 1) * el.clientHeight / 2;
    const next = { scale: s, x: Math.max(-boundX, Math.min(boundX, x)), y: Math.max(-boundY, Math.min(boundY, y)) };
    current.current = next;
    setView(next);
  }

  function adjustZoom(nextScale: number) {
    const base = current.current;
    if (nextScale <= 1) { commit(1, 0, 0); return; }
    const ratio = nextScale / base.scale;
    commit(nextScale, base.x * ratio, base.y * ratio);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const center = midpoint(a, b);
      const rect = e.currentTarget.getBoundingClientRect();
      const old = current.current;
      pinch.current = {
        distance: Math.max(distance(a, b), 1),
        scale: old.scale, x: old.x, y: old.y,
        anchorX: (center.x - rect.left - rect.width / 2 - old.x) / old.scale,
        anchorY: (center.y - rect.top - rect.height / 2 - old.y) / old.scale,
      };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const oldPoint = pointers.current.get(e.pointerId);
    if (!oldPoint) return;
    const nextPoint = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, nextPoint);
    if (pointers.current.size === 1 && current.current.scale > 1) {
      commit(current.current.scale, current.current.x + nextPoint.x - oldPoint.x, current.current.y + nextPoint.y - oldPoint.y);
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const center = midpoint(a, b);
      const rect = e.currentTarget.getBoundingClientRect();
      const origin = pinch.current;
      const scale = Math.min(MAX_ZOOM, Math.max(1, origin.scale * distance(a, b) / origin.distance));
      commit(scale, center.x - rect.left - rect.width / 2 - origin.anchorX * scale, center.y - rect.top - rect.height / 2 - origin.anchorY * scale);
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); adjustZoom(current.current.scale + .25); }
    else if (e.key === "-") { e.preventDefault(); adjustZoom(current.current.scale - .25); }
    else if (e.key === "0") { e.preventDefault(); commit(1, 0, 0); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && current.current.scale > 1) {
      e.preventDefault();
      const { scale, x, y } = current.current;
      commit(scale, x + (e.key === "ArrowRight" ? -32 : e.key === "ArrowLeft" ? 32 : 0), y + (e.key === "ArrowDown" ? -32 : e.key === "ArrowUp" ? 32 : 0));
    }
  }

  return <>
    <div
      ref={viewport} className="garden-viewport" role="region" tabIndex={0}
      aria-label="Explore the garden. Pinch to zoom, drag to move when zoomed, or use the zoom buttons and arrow keys."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} onKeyDown={onKeyDown}
    >
      <div className="garden-view" style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
        <GardenCanvas garden={garden} now={now} />
      </div>
    </div>
    <div className="garden-view-controls chrome" role="group" aria-label="Garden zoom controls">
      <button className="view-button" aria-label="Zoom in to garden" title="Zoom in" disabled={view.scale >= MAX_ZOOM} onClick={() => adjustZoom(current.current.scale + .35)}><Plus size={18} /></button>
      <button className="view-button" aria-label="Zoom out of garden" title="Zoom out" disabled={view.scale <= 1} onClick={() => adjustZoom(current.current.scale - .35)}><Minus size={18} /></button>
      <button className="view-button" aria-label="Reset garden view" title="Reset view" disabled={view.scale === 1 && view.x === 0 && view.y === 0} onClick={() => commit(1, 0, 0)}><RotateCcw size={15} /></button>
    </div>
  </>;
}
