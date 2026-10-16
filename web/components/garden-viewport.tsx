"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Garden } from "@/lib/garden";
import { GardenCanvas } from "@/components/garden-canvas";
import {
  clampCamera, panCamera, zoomCamera, INITIAL_CAMERA, MAX_CAMERA_ZOOM,
  type CameraPoint, type CameraSize, type CameraView,
} from "@/lib/garden-camera";

type Pinch = { distance: number; scale: number; anchor: CameraPoint; world: CameraPoint };
function distance(a: CameraPoint, b: CameraPoint) { return Math.hypot(a.x - b.x, a.y - b.y); }
function midpoint(a: CameraPoint, b: CameraPoint): CameraPoint { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

// View coordinates are ephemeral. Neither gestures nor a ResizeObserver write world state.
export function GardenViewport({ garden, now }: { garden: Garden | null; now: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, CameraPoint>());
  const pinch = useRef<Pinch | null>(null);
  const current = useRef<CameraView>(INITIAL_CAMERA);
  const [view, setView] = useState<CameraView>(INITIAL_CAMERA);

  const size = useCallback((): CameraSize => {
    const el = viewport.current;
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
  }, []);

  const commit = useCallback((next: CameraView) => {
    const value = clampCamera(next, size());
    current.current = value;
    setView(value);
  }, [size]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const resize = new ResizeObserver(() => commit(current.current));
    resize.observe(el);
    const clearPointers = () => { pointers.current.clear(); pinch.current = null; };
    const visibility = () => { if (document.hidden) clearPointers(); };
    window.addEventListener("blur", clearPointers);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      resize.disconnect();
      window.removeEventListener("blur", clearPointers);
      document.removeEventListener("visibilitychange", visibility);
      clearPointers();
    };
  }, [commit]);

  function zoom(nextScale: number) {
    commit(zoomCamera(current.current, nextScale, { x: 0, y: 0 }, size()));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Ignore a third pointer rather than disrupting an established two-finger pinch.
    if (pointers.current.size >= 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      const centre = midpoint(a, b);
      const anchor = { x: centre.x - rect.left - rect.width / 2, y: centre.y - rect.top - rect.height / 2 };
      const old = current.current;
      pinch.current = {
        distance: Math.max(distance(a, b), 1),
        scale: old.scale,
        anchor,
        world: { x: (anchor.x - old.x) / old.scale, y: (anchor.y - old.y) / old.scale },
      };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);
    if (pointers.current.size === 1 && current.current.scale > 1) {
      commit(panCamera(current.current, point.x - previous.x, point.y - previous.y, size()));
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const rect = e.currentTarget.getBoundingClientRect();
      const centre = midpoint(a, b);
      const anchor = { x: centre.x - rect.left - rect.width / 2, y: centre.y - rect.top - rect.height / 2 };
      const gesture = pinch.current;
      const scale = Math.min(MAX_CAMERA_ZOOM, Math.max(1, gesture.scale * distance(a, b) / gesture.distance));
      commit(clampCamera({
        scale,
        x: anchor.x - gesture.world.x * scale,
        y: anchor.y - gesture.world.y * scale,
      }, size()));
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom(current.current.scale + .25); }
    else if (e.key === "-") { e.preventDefault(); zoom(current.current.scale - .25); }
    else if (e.key === "0") { e.preventDefault(); commit(INITIAL_CAMERA); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && current.current.scale > 1) {
      e.preventDefault();
      commit(panCamera(current.current, e.key === "ArrowRight" ? -32 : e.key === "ArrowLeft" ? 32 : 0, e.key === "ArrowDown" ? -32 : e.key === "ArrowUp" ? 32 : 0, size()));
    }
  }

  return <>
    <p id="garden-camera-help" className="sr-only">Pinch with two fingers to zoom. Drag to explore while zoomed. The zoom buttons work without touch gestures. When the garden is focused, use the arrow keys to move, plus and minus to zoom, or zero to reset.</p>
    <div
      ref={viewport} className="garden-viewport" role="region" tabIndex={0}
      aria-label="Explore the living garden" aria-describedby="garden-camera-help"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} onKeyDown={onKeyDown}
    >
      <div className="garden-view" style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
        <GardenCanvas garden={garden} now={now} />
      </div>
    </div>
    <div className="garden-view-controls chrome" role="group" aria-label="Garden zoom controls">
      <button type="button" className="view-button" aria-label="Zoom in to garden" title="Zoom in" disabled={view.scale >= MAX_CAMERA_ZOOM} onClick={() => zoom(current.current.scale + .35)}><Plus size={18} /></button>
      <button type="button" className="view-button" aria-label="Zoom out of garden" title="Zoom out" disabled={view.scale <= 1} onClick={() => zoom(current.current.scale - .35)}><Minus size={18} /></button>
      <button type="button" className="view-button" aria-label="Reset garden view" title="Reset view" disabled={view.scale === 1 && view.x === 0 && view.y === 0} onClick={() => commit(INITIAL_CAMERA)}><RotateCcw size={15} /></button>
    </div>
  </>;
}
