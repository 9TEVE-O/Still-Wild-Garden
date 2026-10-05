"use client";
import { useEffect, useState } from "react";
import { GardenCanvas } from "@/components/garden-canvas";
import { gardenAt, type Garden } from "@/lib/garden";
import type { World, Consequence } from "@/lib/world";
type Snapshot = { world: World | null; serverNow: number; completedTicks: number;
  events: { id: string; committedAt: number; payload: Consequence }[];
  runs: { id: string; startedAt: number; status: string; committedTicks: number }[];
  proof: { status: string; earliestCheckAt: number | null } };
const date = (ms: number) => new Date(ms).toLocaleString("en-AU", { timeZone: "Australia/Darwin", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export default function Home() {
  const [data, setData] = useState<Snapshot | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error("The garden is temporarily out of reach. Try again shortly.");
      setData(await response.json()); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reach the garden."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load(); const onReturn = () => { if (!document.hidden) void load(); };
    const timer = setInterval(onReturn, 5 * 60_000);
    document.addEventListener("visibilitychange", onReturn); window.addEventListener("online", onReturn);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onReturn); window.removeEventListener("online", onReturn); };
  }, []);
  const world = data?.world; const environment = world?.state.environment;
  const garden: Garden | null = world ? { seed: world.seed, bornAt: world.bornAt, version: 1 } : null;
  // Legacy artwork is reused with saved world counts. Age cannot create plants here.
  const growth = world ? { ...gardenAt(garden, world.updatedAt), plants: world.state.plants, agents: 3,
    age: Math.max(3_600_000, world.updatedAt - world.bornAt) } : undefined;
  return <main className="proof-app">
    <header className="topbar"><a className="wordmark" href="/">stillwild<span className="wordmark-dot">.</span></a><span className="proof-label">Private test garden</span></header>
    <section className="proof-world" aria-label="The Darwin test garden">
      <GardenCanvas garden={garden} now={data?.serverNow ?? 0} savedGrowth={growth} />
      <div className="proof-intro"><p className="proof-kicker">Darwin · A small beginning</p><h1>Life between visits.</h1><p>Three keepers. A little weather.<br />All the time in the world.</p></div>
      <div className="proof-weather">{environment ? <><strong>{environment.temperatureC.toFixed(1)} °C</strong><span>{environment.isDay ? "Daylight" : "After sunset"} · {environment.cloudPercent}% cloud</span><span>{environment.sourceStatus === "modelled" ? "Open-Meteo modelled weather" : environment.sourceStatus === "stale" ? "Archived weather, older sample" : "Simulated weather fallback"}</span><small>Valid to {date(environment.validEnd)} ACST</small></> : <span>{world ? "Waiting for the next complete weather hour." : "Waiting for the first background update."}</span>}</div>
      <p className="proof-world-note">{data?.events[0]?.payload.text ?? "Nothing to tend. Something to notice."}</p>
    </section>
    <section className="proof-journal" aria-label="Saved garden activity">
      <div className="proof-stats"><span><strong>{world?.state.plants ?? "…"}</strong> rooted seeds</span><span><strong>{world?.state.water ?? "…"}</strong> water in store</span><span><strong>{world?.state.habitat ?? "…"}</strong> places for growth</span></div>
      <div className="proof-journal-heading"><h2>While the garden rests</h2><button className="proof-refresh" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh view"}</button></div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <p className="proof-muted">{world ? `Last saved ${date(world.updatedAt)} ACST. Each visit reads what is already here.` : "The background service will plant this separate test garden."}</p>
      <ul className="proof-events">{data?.events.slice(0,8).map(event => <li key={event.id}><span>{event.payload.text}</span><time dateTime={new Date(event.committedAt).toISOString()}>{date(event.committedAt)}</time></li>)}</ul>
      {!data?.events.length && <p className="proof-muted">The first keeper consequence will arrive with a completed hourly update.</p>}
      <details className="proof-details"><summary>Background test status</summary><p>The 24-hour absence check is pending. Saved updates alone do not establish that every view stayed closed.</p><p>{data?.completedTicks ?? 0} committed hours · revision {world?.revision ?? 0} · rules version 2</p><p>{data?.proof.earliestCheckAt ? `Earliest review: ${date(data.proof.earliestCheckAt)} ACST.` : "The review window starts after the first saved baseline."}</p><p>Keeper behaviour follows fixed rules. A possible future role for an LLM is still undecided.</p></details>
      <footer className="proof-footer"><span>No tasks. No score. No punishment for leaving.</span><a href="https://stillwild-garden.subzteveo.chatgpt.site/">Original garden</a></footer>
    </section>
  </main>;
}
