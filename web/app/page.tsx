"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, AudioLines, Check, CircleDot, Cloud, Expand, Film, Gift, Info, Leaf, LoaderCircle, Minimize, Moon, Sprout, VolumeX, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Toaster, toast } from "sonner";
import { GardenBubble } from "@/components/garden-bubble";
import { GardenCanvas } from "@/components/garden-canvas";
import { gardenAt, type Garden } from "@/lib/garden";
import { makeGift, saveFile, wallpaper } from "@/lib/gift";
import { companionFile } from "@/lib/companion";

const keepers = [
  { name: "Pip", role: "The seedkeeper", detail: "Finds a quiet place for the next seed.", color: "#d9e6a0" },
  { name: "Dew", role: "The rainmaker", detail: "Carries water to whatever is growing.", color: "#91dcd9" },
  { name: "Moss", role: "The caretaker", detail: "Makes room for new life, slowly.", color: "#a5cfa0" },
];

export default function Home() {
  const [garden, setGarden] = useState<Garden | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [planting, setPlanting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [panel, setPanel] = useState<"about" | "keepers" | null>(null);
  const [gifting, setGifting] = useState(false);
  const [giftFile, setGiftFile] = useState<File | null>(null);
  const [giftError, setGiftError] = useState("");
  const [shared, setShared] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [sound, setSound] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loopProgress, setLoopProgress] = useState<number | null>(null);
  const [loopUrl, setLoopUrl] = useState("");
  const [loopResult, setLoopResult] = useState<{ file: File; width: number; height: number } | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = gardenAt(garden, now + offset);

  useEffect(() => {
    if (!loopResult) { setLoopUrl(""); return; }
    const url = URL.createObjectURL(loopResult.file); setLoopUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [loopResult]);

  async function load() {
    setError("");
    try {
      const r = await fetch("/api/garden", { cache: "no-store" });
      if (!r.ok) throw new Error("Your garden is temporarily out of reach. Try again in a moment.");
      const data = await r.json() as { garden: Garden | null; serverNow: number };
      setGarden(data.garden);
      setOffset(data.serverNow - Date.now());
      setLoaded(true);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const onVisibility = () => { if (!document.hidden) { setNow(Date.now()); void load(); } else { void audio.current?.suspend(); setSound(false); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisibility); void audio.current?.close(); };
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => { if (e.key === "Escape") setImmersive(false); };
    document.addEventListener("keydown", listener);
    const fs = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", fs);
    return () => { document.removeEventListener("keydown", listener); document.removeEventListener("fullscreenchange", fs); };
  }, []);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(context.registerTool({ name: "read_garden", title: "Read the garden", description: "Read this garden's current growth and keepers without changing it.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: (input: unknown) => { if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("Expected an empty object."); return { planted: !!garden, day: scene.day, seeds: scene.plants, keepers: scene.agents, stage: scene.stage }; } }, { signal: controller.signal })).catch(() => {});
    return () => controller.abort();
  }, [garden, scene.day, scene.plants, scene.agents, scene.stage]);

  async function plant() {
    setPlanting(true); setError("");
    try {
      const r = await fetch("/api/garden", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error("The seed couldn't take root. Your garden has not changed. Please try again.");
      const data = await r.json() as { garden: Garden | null; serverNow: number }; setGarden(data.garden); setOffset(data.serverNow - Date.now()); setNow(Date.now());
      toast("A small beginning. It belongs to itself now.");
    } catch (e) { setError((e as Error).message); }
    finally { setPlanting(false); }
  }
  async function prepareGift() {
    if (!garden) return;
    setGifting(true); setGiftFile(null); setGiftError(""); setShared(false);
    try { setGiftFile(await makeGift(garden)); }
    catch { setGiftError("This little seed isn't ready to travel. Close this window and try again."); }
  }
  async function shareGift() {
    if (!giftFile) return;
    if (!navigator.canShare?.({ files: [giftFile] })) { saveFile(giftFile); toast("Seed saved. Send the file with AirDrop or Quick Share."); return; }
    try { await navigator.share({ files: [giftFile] }); setShared(true); }
    catch (e) { if ((e as Error).name !== "AbortError") { toast("Your device couldn't share this file. Use Save seed, then share it from Files."); } }
  }
  async function enterImmersive() {
    setImmersive(true);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* Ambient view works without fullscreen. */ }
  }
  async function exitImmersive() {
    setImmersive(false);
    if (document.fullscreenElement) await document.exitFullscreen();
  }
  async function toggleSound() {
    if (sound) { await audio.current?.suspend(); setSound(false); return; }
    try {
      if (!audio.current) {
        const ctx = new AudioContext(); audio.current = ctx;
        const gain = ctx.createGain(); gain.gain.value = 0.026; gain.connect(ctx.destination);
        [130.81, 196, 261.63].forEach((f, i) => { const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.25 / (i + 1); osc.connect(g); g.connect(gain); osc.start(); });
      }
      await audio.current.resume(); setSound(true);
    } catch { toast("Sound isn't available in this browser."); }
  }
  async function saveWallpaper() {
    setExporting(true);
    try { saveFile(await wallpaper(garden)); toast("Wallpaper saved. Set it as your wallpaper in your phone's Photos or Settings."); }
    catch { toast("Couldn't save this view. Please try again."); }
    finally { setExporting(false); }
  }

  async function createLoop() {
    setLoopProgress(0); setLoopResult(null);
    try { const { exportLoop } = await import("@/lib/export-loop"); const result = await exportLoop(garden, setLoopProgress); setLoopResult(result); toast("Your loop is ready. Its file size has been checked."); }
    catch (e) { toast((e as Error).message); }
    finally { setLoopProgress(null); }
  }

  return <main className={`garden-app ${immersive ? "immersive" : ""}`}>
    <div className="sky-grain" aria-hidden="true" />
    <header className="topbar chrome">
      <a className="wordmark" href="/" aria-label="Stillwild home"><span className="pixel-mark" aria-hidden="true">✳</span>stillwild<span className="wordmark-dot">.</span></a>
      <div className="top-right"><button className={`bubble-toggle ${bubble ? "active" : ""}`} onClick={() => setBubble(v => !v)} aria-pressed={bubble}><CircleDot size={16} /><span>Bubble mode</span></button><span className="private-label"><Cloud size={14} /> A WORLD OF YOUR OWN</span><button className="icon-button" aria-label="About your garden" onClick={() => setPanel("about")}><Info size={19} /></button></div>
    </header>

    <section className="garden-space" aria-label="Living pixel garden">
      <div className="chapter chrome">
        <p className="eyebrow"><span className="tiny-line" /> GARDEN 001 <span className="slash">/</span> {garden ? `DAY ${String(scene.day).padStart(3, "0")}` : "THE VERY BEGINNING"}</p>
        <h1>{garden ? scene.stage : <>A world,<br /><em>waiting to happen.</em></>}</h1>
        <p className="chapter-caption">{garden ? scene.caption : "One seed. Then it’s out of your hands."}</p>
      </div>
      <div className="weather chrome"><Moon size={17} strokeWidth={1.4} /><div><span>A little after dusk</span><small>{garden ? "Quietly becoming" : "Everything is still"}</small></div></div>
      <GardenCanvas ref={canvas} garden={garden} now={now + offset} />
      <div className="world-caption chrome"><span className="coordinate">{garden ? `SW · ${garden.seed.toString(16).slice(0, 6).toUpperCase()}` : "SW · ORIGIN"}</span><span className="world-caption-rule" /><span>{garden ? scene.note : "The smallest things hold entire worlds."}</span></div>
      {garden && <button className="keepers-peek chrome" onClick={() => setPanel("keepers")}><span className="keeper-pixels" aria-hidden="true"><i /><i /><i /></span><span>{scene.agents} {scene.agents === 1 ? "keeper" : "keepers"}, quietly at work</span><ArrowUpRight size={14} /></button>}
    </section>

    <div className="bottom-area chrome">
      <div className="status-row"><span className="status-caption"><span className={`status-dot ${garden ? "alive" : ""}`} />{error ? "Waiting to reconnect" : !loaded ? "Finding your garden…" : garden ? "Growing at its own pace" : "A small beginning is all it takes"}</span>{garden && <button className="plain-button" onClick={() => setPanel("keepers")}>Meet the keepers <ArrowUpRight size={14} /></button>}</div>
      {error && <div className="error-message" role="alert">{error} {!loaded && <button onClick={load}>Try again</button>}</div>}
      <nav className="garden-dock" aria-label="Garden controls">
        <button className={`dock-button sound-button ${sound ? "active" : ""}`} onClick={toggleSound} aria-label={sound ? "Turn ambient sound off" : "Turn ambient sound on"} aria-pressed={sound}>{sound ? <AudioLines size={19} /> : <VolumeX size={19} />}<span>Sound {sound ? "on" : "off"}</span></button>
        <span className="dock-divider" />
        <button className="dock-button" onClick={enterImmersive}><Expand size={18} /><span>Just watch</span></button>
        <span className="dock-divider" />
        {garden ? <button className="dock-button primary-button" onClick={prepareGift}><Gift size={18} /><span>Give a piece</span></button> : <button className="dock-button primary-button" disabled={!loaded || planting || !!error} onClick={plant}>{planting ? <LoaderCircle className="spin" size={18} /> : <Sprout size={19} />}<span>{planting ? "Taking root…" : "Plant the seed"}</span></button>}
      </nav>
      <footer><span>NO TASKS. NO SCORE. JUST LIFE.</span><button onClick={() => setPanel("about")}>Leave a little room for wonder <ArrowUpRight size={12} /></button><span className="footer-signature">a living digital garden</span></footer>
    </div>

    {immersive && <div className="ambient-controls"><span>Just you and a little world.</span><button className="glass-button" onClick={saveWallpaper} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />} Save wallpaper</button><button className="icon-button" aria-label="Leave ambient view" onClick={exitImmersive}><Minimize size={18} /></button></div>}

    {bubble && !immersive && <GardenBubble garden={garden} now={now + offset} sound={sound} onSound={toggleSound} onKeepers={() => setPanel("keepers")} onGift={prepareGift} onClose={() => setBubble(false)} onExpand={() => { setBubble(false); void enterImmersive(); }} />}

    <Dialog open={gifting} onOpenChange={setGifting}><DialogContent className="gift-dialog">
      <div className={`gift-orb ${shared ? "released" : ""}`} aria-hidden="true"><div className="orb-ring" /><div className="orb-shine" /><img src="/art/sapling.png" alt="" /><span className="gift-spark one" /><span className="gift-spark two" /><span className="gift-spark three" /></div>
      <p className="eyebrow">A LITTLE OF YOUR WORLD</p>
      <DialogTitle className="dialog-heading">{shared ? "On its way." : "Some things are better given."}</DialogTitle>
      <DialogDescription className="dialog-copy">A seed from your garden. A whole new beginning for someone else. Yours keeps growing, just as it was.</DialogDescription>
      <div className="gift-facts"><span><Leaf size={14} /> An original seed</span><span>One tiny, living file</span></div>
      {giftError ? <p role="alert" className="error-message">{giftError}</p> : <button className="primary-button large-button" disabled={!giftFile} onClick={shareGift}>{!giftFile ? <LoaderCircle className="spin" size={18} /> : shared ? <Check size={18} /> : <Gift size={18} />}{!giftFile ? "Gathering a little magic…" : shared ? "Share again" : "Pass it on"}</button>}
      {giftFile && <button className="plain-button save-seed" onClick={() => { saveFile(giftFile); toast("Seed saved to your files."); }}><ArrowDownToLine size={15} /> Save seed file</button>}
      <p className="fine-print">Choose AirDrop or Quick Share in your device’s share sheet. If this file type isn’t supported, save it and share from Files. The seed opens as a small offline garden in a browser; some phones only preview HTML files. The web can’t restrict the share sheet to nearby devices.</p>
    </DialogContent></Dialog>

    <Sheet open={!!panel} onOpenChange={v => { if (!v) setPanel(null); }}><SheetContent className="garden-sheet">
      <p className="eyebrow">STILLWILD / FIELD NOTES</p>
      <SheetTitle className="dialog-heading">{panel === "keepers" ? "Small hands. Quiet work." : "A garden that belongs to itself."}</SheetTitle>
      <SheetDescription className="dialog-copy">{panel === "keepers" ? "They sow, carry water and make room for what comes next. They never wander beyond their little world." : "Plant once. Come back whenever. There is nothing to win, nothing to maintain, and no right way to watch."}</SheetDescription>
      {panel === "keepers" ? <><div className="keeper-list">{keepers.map((k, i) => <article key={k.name} className={i >= scene.agents ? "keeper-dormant" : ""}><span className="keeper-avatar" style={{ color: k.color }}><i /><i /></span><div><h3>{k.name}<small>{i < scene.agents ? k.role : "Not awake yet"}</small></h3><p>{k.detail}</p></div></article>)}</div><div className="field-note"><p className="eyebrow">LIFE, SO FAR</p><div className="growth-numbers"><span><b>{scene.plants}</b> seeds rooted</span><span><b>{scene.day}</b> days unfolding</span></div><p>One seed at first. The first keeper wakes after planting. Two more join over the next three minutes. New growth arrives over hours and days.</p></div></> : <div className="about-notes"><article><h3><Sprout size={18} /> It starts small.</h3><p>One seed and one keeper. The garden slowly fills with life. There’s no reset, pruning or speed control.</p></article><article><h3><Cloud size={18} /> It keeps its time.</h3><p>Your seed and planting time are saved in the cloud. When you return, the garden unfolds the growth you missed. The keepers are a self-contained simulation, with no access to the internet or your other apps.</p></article><article><h3><CircleDot size={18} /> A living layer.</h3><p>Bubble mode gives your garden a movable window. Drag it to an edge, tap to unfold sound, keeper and gifting modules. It floats inside this site. A phone-wide layer over other apps needs a native app; Android overlays require permission, while iPhone uses supported widgets and Live Activities.</p></article><article><h3><Expand size={18} /> A little world, anywhere.</h3><p>“Just watch” hides the controls. Save a still image for your phone wallpaper. A moving system wallpaper needs a native app; this website can’t install one.</p></article><article><h3><Gift size={18} /> Give a beginning.</h3><p>A gift is a self-contained file, with its own seed and the memory of where it came from. No public garden link. Send it nearby with AirDrop or Quick Share.</p></article><p className="fine-print">Designed to last, with portable seed files. Continued cloud availability and future device compatibility can’t be guaranteed. The garden eventually renews itself in seasons, keeping its history without filling your device.</p></div>}
      <div className="loop-export"><p className="eyebrow">TAKE A LITTLE MOTION WITH YOU</p><p>A seamless six-second GIF. The island stays still; its little keepers do the moving.</p><button className="glass-button" disabled={loopProgress !== null} onClick={createLoop}>{loopProgress !== null ? <LoaderCircle className="spin" size={16} /> : <Film size={16} />}{loopProgress !== null ? `Making your loop… ${loopProgress}%` : "Make a small loop"}</button>{loopResult && <div className="loop-result"><img src={loopUrl} alt="Your six-second looping garden preview" /><p>{loopResult.width} × {loopResult.height} · 6 sec · {(loopResult.file.size / 1_000_000).toFixed(2)} MB <span>UNDER 2 MB</span></p><button className="primary-button large-button" onClick={() => saveFile(loopResult.file)}><ArrowDownToLine size={16} />Save GIF</button></div>}<small>Measured after encoding. This is a snapshot of your garden, not a living seed.</small></div>
      {panel === "about" && garden && <div className="field-note"><p className="eyebrow">YOUR GARDEN ON ANDROID</p><p>Save your existing garden for the Android companion, then import this file in the app. It keeps the same beginning and growth. Keep this personal copy for yourself; “Give a piece” creates a new garden for someone else.</p><button className="glass-button" onClick={() => { try { saveFile(companionFile(garden)); toast("Garden saved. Import this file in the Android companion."); } catch (e) { toast((e as Error).message); } }}><ArrowDownToLine size={16} />Save for Android</button></div>}
      <button className="glass-button wallpaper-sheet-button" onClick={saveWallpaper} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}Save a wallpaper</button>
    </SheetContent></Sheet>
    <Toaster theme="dark" position="bottom-center" toastOptions={{ style: { background: "#17251f", border: "1px solid #ffffff20", color: "#e7ecdc" } }} />
  </main>;
}
