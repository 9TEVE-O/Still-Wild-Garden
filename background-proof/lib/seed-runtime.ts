// Kept closure-free so the exact runtime can travel inside an offline HTML seed.
// No network, hosting identifier, account identifier or credential is exported.
export function seedRuntime(artData: { island: string; sapling: string }) {
  type Seed = { version: number; seed: number; bornAt: number; parentSeed: number; parentBornAt: number };
  const el = document.getElementById("stillwild-seed")!;
  const seed: Seed = JSON.parse(el.textContent!);
  const canvas = document.getElementById("world") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const island = new Image(); island.src = artData.island;
  const sapling = new Image(); sapling.src = artData.sapling;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const random = (n: number) => { let x = (seed.seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x21f0aaad); x ^= x >>> 15; x = Math.imul(x, 0x735a2d97); return ((x ^ (x >>> 15)) >>> 0) / 4294967296; };
  function resize() { const ratio = Math.min(devicePixelRatio, 2); canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
  addEventListener("resize", resize); resize();
  let last = 0;
  function paint(t: number) {
    requestAnimationFrame(paint);
    if (document.hidden || t - last < (reduced.matches ? 1000 : 33)) return;
    last = t;
    const age = Math.max(0, Date.now() - seed.bornAt), time = reduced.matches ? 0 : Date.now() / 1000;
    const w = innerWidth, h = innerHeight;
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * .8); bg.addColorStop(0, "#183d28"); bg.addColorStop(1, "#0a120e"); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 65; i++) { ctx.fillStyle = `rgba(195,223,170,${.1 + random(i + 70) * .3})`; ctx.fillRect(random(i) * w, random(i + 90) * h, 1.5, 1.5); }
    const scale = Math.min(1, .24 + Math.log1p(age / 60000) * .048);
    const iw = Math.min(w * .98, h * 1.5, 1100) * scale, ih = iw * 2 / 3;
    const ix = (w - iw) / 2, iy = h * .52 - ih / 2;
    ctx.imageSmoothingEnabled = false;
    if (island.complete && island.naturalWidth) ctx.drawImage(island, ix, iy, iw, ih);
    const plants = 1 + Math.floor(Math.sqrt(age / 3600000) * 1.5);
    for (let i = 0; i < Math.min(plants - 1, 45); i++) {
      const id = Math.max(0, plants - 46) + i;
      const a = random(id + 200) * Math.PI * 2, r = Math.sqrt(random(id + 400)) * .32;
      const px = ix + iw * (.49 + Math.cos(a) * r), py = iy + ih * (.49 + Math.sin(a) * r * .53), sz = iw * (.035 + random(id + 500) * .026);
      if (sapling.complete && sapling.naturalWidth) ctx.drawImage(sapling, px - sz / 2, py - sz * .83, sz, sz);
    }
    const agents = Math.min(3, 1 + Math.floor(age / 90000));
    for (let i = 0; i < agents; i++) { const a = time * (.038 + i * .009) + i * 2.1 + random(700) * 6; const px = ix + iw * (.49 + Math.cos(a) * (.16 + i * .04)), py = iy + ih * (.48 + Math.sin(a) * (.16 + i * .04) * .55); ctx.fillStyle = ["#e4efb7", "#a0e8e0", "#c0daa8"][i]; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.fillRect(px, py, 4, 5); ctx.shadowBlur = 0; }
    document.getElementById("age")!.textContent = `Day ${Math.floor(age / 86400000) + 1} · ${plants} rooted ${plants === 1 ? "seed" : "seeds"} · ${agents} ${agents === 1 ? "keeper" : "keepers"}`;
  }
  requestAnimationFrame(paint);
  const message = (value: string) => { document.getElementById("message")!.textContent = value; };
  const download = (file: File) => { const a = document.createElement("a"), url = URL.createObjectURL(file); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  document.getElementById("watch")!.onclick = () => { const hidden = document.body.classList.toggle("quiet"); document.getElementById("watch")!.textContent = hidden ? "Show notes" : "Just watch"; };
  document.getElementById("wallpaper")!.onclick = () => { canvas.toBlob(blob => { if (blob) { download(new File([blob], "stillwild-wallpaper.png", { type: "image/png" })); message("Saved. Choose it as your wallpaper in your device settings."); } else message("Your browser couldn't export this view."); }); };
  document.getElementById("give")!.onclick = async () => {
    const number = new Uint32Array(1); crypto.getRandomValues(number);
    const child = { version: 1, seed: number[0], bornAt: Date.now(), parentSeed: seed.seed, parentBornAt: seed.bornAt };
    const copy = document.documentElement.cloneNode(true) as HTMLElement;
    copy.querySelector("#stillwild-seed")!.textContent = JSON.stringify(child);
    copy.querySelector("#message")!.textContent = "";
    copy.querySelector("#age")!.textContent = "One seed. All the time in the world.";
    copy.querySelector("body")!.classList.remove("quiet");
    copy.querySelector("#watch")!.textContent = "Just watch";
    const file = new File(["<!doctype html>" + copy.outerHTML], `stillwild-seed-${number[0].toString(16)}.html`, { type: "text/html" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); message("Your device has handled the share. Your garden keeps growing."); }
      catch (e) { if ((e as Error).name !== "AbortError") { download(file); message("Saved instead. Send this file with AirDrop or Quick Share."); } }
    } else { download(file); message("Seed saved. Send the file with AirDrop or Quick Share from Files."); }
  };
}
