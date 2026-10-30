"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GardenCanvas } from "@/components/garden-canvas";
import { gardenAt, type Garden } from "@/lib/garden";
import type { World, Consequence } from "@/lib/world";
type Snapshot = { world: World | null; serverNow: number; completedTicks: number;
  events: { id: string; committedAt: number; payload: Consequence }[];
  runs: { id: string; startedAt: number; status: string; committedTicks: number }[];
  proof: { status: string; earliestCheckAt: number | null; baseline: { startedAt: number } | null;
    originalCheckpoint: { id: string; startedAt: number; earliestCheckAt: number } | null } };
const date = (ms: number) => new Date(ms).toLocaleString("en-AU", { timeZone: "Australia/Darwin", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const keeperStories = [
  { id: "Pip", role: "Finds space and sows seeds", countLabel: "saved plantings" },
  { id: "Dew", role: "Collects water and tends roots", countLabel: "saved waterings" },
  { id: "Moss", role: "Makes room for life to grow", countLabel: "saved habitat changes" },
] as const;
export default function Home() {
  const [data, setData] = useState<Snapshot | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const viewSession = useRef<string | null>(null);
  async function load(sessionId = viewSession.current) {
    // Every read is recorded against an open view session first; without that record the garden is not read.
    if (!sessionId) { setError("View closure tracking is unavailable. Reload the page to try again."); return; }
    setLoading(true);
    try {
      const recorded = await fetch("/api/view/session", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, event: "read" }) });
      if (!recorded.ok) throw new Error("View closure tracking is unavailable. Reload the page to try again.");
      // A pagehide or cleanup that closed this session while its read was being recorded ends the read here,
      // so no snapshot is fetched after the session's recorded close.
      if (viewSession.current !== sessionId) return;
      const response = await fetch("/api/snapshot", { cache: "no-store", headers: { "X-Stillwild-View-Session": sessionId } });
      if (!response.ok) throw new Error("The garden is temporarily out of reach. Try again shortly.");
      setData(await response.json()); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reach the garden."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let activeSessionId: string | null = null; let disposed = false;
    const sendSessionEvent = (sessionId: string, event: "open" | "heartbeat" | "close", keepalive = false) =>
      fetch("/api/view/session", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, event }), keepalive });
    const openSession = async () => {
      const sessionId = crypto.randomUUID();
      activeSessionId = sessionId; viewSession.current = sessionId;
      const response = await sendSessionEvent(sessionId, "open");
      if (!response.ok) throw new Error("View closure tracking is unavailable. Please try again shortly.");
      return sessionId;
    };
    const closeSession = (sessionId: string) => {
      void sendSessionEvent(sessionId, "close", true).catch(() => undefined);
      if (activeSessionId === sessionId) { activeSessionId = null; viewSession.current = null; }
    };
    // A page hidden or unmounted while its open is pending has already sent its close; it must not read afterwards.
    const openAndLoad = () => void openSession()
      .then(sessionId => { if (!disposed && activeSessionId === sessionId) return load(sessionId); })
      .catch(e => { if (!disposed) setError(e instanceof Error ? e.message : "View closure tracking is unavailable."); });
    openAndLoad();
    const onReturn = () => { if (!document.hidden && activeSessionId) void load(activeSessionId); };
    const onPageHide = () => { if (activeSessionId) closeSession(activeSessionId); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) openAndLoad(); };
    const heartbeat = setInterval(() => { if (activeSessionId) void sendSessionEvent(activeSessionId, "heartbeat").catch(() => undefined); }, 30_000);
    const timer = setInterval(onReturn, 5 * 60_000);
    document.addEventListener("visibilitychange", onReturn); window.addEventListener("online", onReturn);
    window.addEventListener("pagehide", onPageHide); window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      clearInterval(timer); clearInterval(heartbeat); document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn); window.removeEventListener("pagehide", onPageHide); window.removeEventListener("pageshow", onPageShow);
      if (activeSessionId) closeSession(activeSessionId);
    };
  }, []);
  const world = data?.world; const environment = world?.state.environment;
  const garden: Garden | null = world ? { seed: world.seed, bornAt: world.bornAt, version: 1 } : null;
  // Legacy artwork is reused with saved world counts. Age cannot create plants here.
  const growth = world ? { ...gardenAt(garden, world.updatedAt), plants: world.state.plants, agents: 3,
    age: Math.max(3_600_000, world.updatedAt - world.bornAt) } : undefined;
  return <main className="proof-app">
    <header className="topbar"><Link className="wordmark" href="/">stillwild<span className="wordmark-dot">.</span></Link><span className="proof-label">Private test garden</span></header>
    <section className="proof-world" aria-label="The Darwin test garden">
      <GardenCanvas garden={garden} now={data?.serverNow ?? 0} savedGrowth={growth} />
      <div className="proof-intro"><p className="proof-kicker">Darwin · A small beginning</p><h1>Life between visits.</h1><p>Three keepers. A little weather.<br />All the time in the world.</p></div>
      <div className="proof-weather">{environment ? <><strong>{environment.temperatureC.toFixed(1)} °C</strong><span>{environment.isDay ? "Daylight" : "After sunset"} · {environment.cloudPercent}% cloud</span><span>{environment.sourceStatus === "modelled" ? "Open-Meteo modelled weather" : environment.sourceStatus === "stale" ? "Archived weather, older sample" : "Simulated weather fallback"}</span><small>Valid to {date(environment.validEnd)} ACST</small></> : <span>{world ? "Waiting for the next complete weather hour." : "Waiting for the first background update."}</span>}</div>
      <p className="proof-world-note">{data?.events[0]?.payload.text ?? "Nothing to tend. Something to notice."}</p>
    </section>
    <section className="proof-journal" aria-label="Saved garden activity">
      <div className="proof-stats"><span><strong>{world?.state.plants ?? "…"}</strong> rooted seeds</span><span><strong>{world?.state.water ?? "…"}</strong> water in store</span><span><strong>{world?.state.habitat ?? "…"}</strong> places for growth</span></div>
      <section className="proof-keeper-ledger" aria-labelledby="proof-keeper-ledger-heading">
        <div className="proof-keeper-ledger-heading">
          <div>
            <p className="proof-ledger-kicker">From the saved garden</p>
            <h2 id="proof-keeper-ledger-heading">The keepers have been here.</h2>
          </div>
          <p>Each count comes from a committed world snapshot. These changes were saved by the background updater, not calculated when you opened this page.</p>
        </div>
        <div className="proof-keeper-grid">
          {keeperStories.map(keeper => {
            const lastEvent = data?.events.find(event => event.payload.keeper === keeper.id);
            return <article className="proof-keeper-card" key={keeper.id}>
              <div className="proof-keeper-card-heading"><h3>{keeper.id}</h3><p>{keeper.role}</p></div>
              <p className="proof-keeper-count"><strong>{world?.state.keepers[keeper.id].completed ?? "…"}</strong><span>{keeper.countLabel}</span></p>
              <div className="proof-keeper-last">
                <span className="proof-ledger-kicker">Latest listed action</span>
                {lastEvent ? <><p>{lastEvent.payload.text}</p><time dateTime={new Date(lastEvent.committedAt).toISOString()}>{date(lastEvent.committedAt)} ACST</time></>
                  : <p>{world ? "No action by this keeper in the returned event list." : "Waiting for saved garden activity."}</p>}
              </div>
            </article>;
          })}
        </div>
        <p className="proof-ledger-boundary">{world ? `World revision ${world.revision} · ${data?.completedTicks ?? 0} committed hourly ticks. ` : "No saved world has been returned yet. "}Saved activity is evidence of progress, not proof of a completed 24-hour absence test.</p>
      </section>
      <div className="proof-journal-heading"><h2>While the garden rests</h2><button className="proof-refresh" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh view"}</button></div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <p className="proof-muted">{world ? `Last saved ${date(world.updatedAt)} ACST. Each visit reads what is already here.` : "The background service will plant this separate test garden."}</p>
      <ul className="proof-events">{data?.events.slice(0,8).map(event => <li key={event.id}><span>{event.payload.text}</span><time dateTime={new Date(event.committedAt).toISOString()}>{date(event.committedAt)}</time></li>)}</ul>
      {!data?.events.length && <p className="proof-muted">The first keeper consequence will arrive with a completed hourly update.</p>}
      <details className="proof-details"><summary>Background test status</summary><p>The original 4–5 October 2026 absence review was executed and is INCONCLUSIVE: full-window view closure and historical scheduler identity were not established. Saved updates alone cannot establish a successful absence test.</p><p>{data?.completedTicks ?? 0} committed hours · revision {world?.revision ?? 0} · rules version 2</p><p>{data?.proof.originalCheckpoint ? `Original checkpoint was eligible for review from ${date(data.proof.originalCheckpoint.earliestCheckAt)} ACST; this time alone is not proof of absence.` : "The snapshot does not include the original checkpoint."}</p><p>{data?.proof.baseline && data.proof.earliestCheckAt ? `A second 24-hour window began ${date(data.proof.baseline.startedAt)} ACST. Its review is due from ${date(data.proof.earliestCheckAt)} ACST and still needs independent schedule corroboration.` : "Verified view-closure control is required before an owner-authorised second 24-hour window. No second window has started."} <a href="https://github.com/9TEVE-O/Still-Wild-Garden/blob/main/background-proof/project_docs/CURRENT_BUILD_STATE.md">Current evidence record</a>.</p><p>Keeper behaviour follows fixed rules. A possible future role for an LLM is still undecided.</p></details>
      <footer className="proof-footer"><span>No tasks. No score. No punishment for leaving.</span><a href="https://stillwild-garden.subzteveo.chatgpt.site/">Original garden</a></footer>
    </section>
  </main>;
}
