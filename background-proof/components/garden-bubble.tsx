"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, AudioLines, Gift, GripHorizontal, Leaf, Minus, VolumeX, X } from "lucide-react";
import { GardenCanvas } from "./garden-canvas";
import { gardenAt, type Garden } from "@/lib/garden";

type Position = { x: number; y: number };
type Props = { garden: Garden | null; now: number; sound: boolean; onSound: () => void; onKeepers: () => void; onGift: () => void; onClose: () => void; onExpand: () => void };
export function GardenBubble({ garden, now, sound, onSound, onKeepers, onGift, onClose, onExpand }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 24, y: 150 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const growth = gardenAt(garden, now);
  function clamp(p: Position) { return { x: Math.max(12, Math.min(innerWidth - 94, p.x)), y: Math.max(88, Math.min(innerHeight - 110, p.y)) }; }
  function remember(p: Position) { try { localStorage.setItem("stillwild-bubble-position", JSON.stringify({ x: p.x / innerWidth, y: p.y / innerHeight })); } catch {} }
  useEffect(() => {
    let initial = { x: innerWidth - 106, y: innerHeight * .45 };
    try { const saved = JSON.parse(localStorage.getItem("stillwild-bubble-position") ?? "null"); if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) initial = { x: saved.x * innerWidth, y: saved.y * innerHeight }; } catch {}
    setPosition(clamp(initial));
    const resize = () => setPosition(p => clamp(p));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const isRight = typeof window !== "undefined" && position.x > innerWidth / 2;
  return <aside className={`bubble-overlay ${open ? "is-open" : ""} ${isRight ? "on-right" : "on-left"}`} style={{ left: position.x, top: position.y }} aria-label="Floating garden">
    {open && <section className="bubble-card" aria-label="Garden modules">
      <div className="bubble-card-header"><div><small>YOUR POCKET GARDEN</small><h2>{garden ? `Day ${growth.day}. Still becoming.` : "A world, waiting."}</h2></div><button className="module-icon" aria-label="Collapse garden modules" onClick={() => setOpen(false)}><Minus size={17} /></button></div>
      <div className="bubble-world"><GardenCanvas garden={garden} now={now} /></div>
      <div className="bubble-modules"><button onClick={onSound} aria-pressed={sound}>{sound ? <AudioLines size={19} /> : <VolumeX size={19} />}<span>Sound</span></button><button onClick={onKeepers}><Leaf size={19} /><span>Keepers</span></button><button onClick={onGift} disabled={!garden}><Gift size={19} /><span>Give</span></button></div>
      <div className="bubble-card-footer"><span>Same garden. A smaller window.</span><button aria-label="Open full garden" onClick={onExpand}><ArrowUpRight size={17} /></button></div>
    </section>}
    <button className="garden-orb" aria-label={open ? "Move garden bubble or collapse its modules" : "Move garden bubble or open its modules"} aria-expanded={open}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y, moved: false }; suppressClick.current = false; }}
      onPointerMove={e => { if (!drag.current) return; const d = drag.current; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.moved = true; suppressClick.current = true; setOpen(false); setPosition(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })); } }}
      onPointerUp={e => { const d = drag.current; drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (d?.moved) { const p = clamp({ x: d.px + e.clientX - d.x < innerWidth / 2 ? 16 : innerWidth - 98, y: d.py + e.clientY - d.y }); setPosition(p); remember(p); } }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setOpen(v => !v); }}
      onKeyDown={e => { const delta: Record<string, Position> = { ArrowLeft: { x: -24, y: 0 }, ArrowRight: { x: 24, y: 0 }, ArrowUp: { x: 0, y: -24 }, ArrowDown: { x: 0, y: 24 } }; if (delta[e.key]) { e.preventDefault(); const p = clamp({ x: position.x + delta[e.key].x, y: position.y + delta[e.key].y }); setPosition(p); remember(p); } if (e.key === "Escape") setOpen(false); }}>
      <span className="orb-shine" /><img src="/art/sapling.png" draggable={false} alt="" /><span className="orb-life" />
    </button>
    <button className="bubble-dismiss" aria-label="Put garden bubble away" onClick={onClose}><X size={12} /></button>
    {!open && <span className="bubble-hint"><GripHorizontal size={12} /> Drag · Tap</span>}
  </aside>;
}
