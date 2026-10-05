import { runBackground } from "@/db/background";
import { parseForecast } from "@/lib/weather";
export const dynamic = "force-dynamic";
// Owner-private Sites dispatch is the authenticated service boundary. Do not expose publicly.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 65_536) return Response.json({ error: "Weather payload too large" }, { status: 413 });
    const text = await request.text(); if (text.length > 65_536) return Response.json({ error: "Weather payload too large" }, { status: 413 });
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["trigger", "weather"].includes(k)) || !["manual", "schedule"].includes(body.trigger)) return Response.json({ error: "Only trigger and weather fields are accepted" }, { status: 400 });
    if ("weather" in body) {
      try { if (!parseForecast(body.weather, Date.now(), "scheduler-relay").length) throw new Error("No completed intervals"); }
      catch { return Response.json({ error: "Invalid UTC weather payload" }, { status: 400 }); }
    }
    return Response.json(await runBackground(body.trigger, Date.now(), body.weather), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Stillwild background update failed", error); return Response.json({ error: "Background update temporarily unavailable" }, { status: 503 });
  }
}
