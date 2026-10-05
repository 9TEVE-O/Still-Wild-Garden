import { runBackground, type SchedulerExecution } from "@/db/background";
import { parseForecast } from "@/lib/weather";
export const dynamic = "force-dynamic";
// Owner-private Sites dispatch is the authenticated service boundary. Do not expose publicly.
function schedulerExecution(value: unknown): SchedulerExecution | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid scheduler metadata");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(k => !["taskId", "executionId", "triggeredAt"].includes(k))) throw new Error("Invalid scheduler metadata");
  if (typeof record.taskId !== "string" || !record.taskId.trim() || record.taskId.length > 200) throw new Error("Invalid scheduler task ID");
  if (typeof record.executionId !== "string" || !record.executionId.trim() || record.executionId.length > 200) throw new Error("Invalid scheduler execution ID");
  if (typeof record.triggeredAt !== "number" || !Number.isSafeInteger(record.triggeredAt) || record.triggeredAt <= 0) throw new Error("Invalid scheduler trigger time");
  return { taskId: record.taskId, executionId: record.executionId, triggeredAt: record.triggeredAt };
}
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 65_536) return Response.json({ error: "Weather payload too large" }, { status: 413 });
    const text = await request.text(); if (text.length > 65_536) return Response.json({ error: "Weather payload too large" }, { status: 413 });
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["trigger", "weather", "scheduler"].includes(k)) || !["manual", "schedule"].includes(body.trigger)) return Response.json({ error: "Only trigger, weather and scheduler fields are accepted" }, { status: 400 });
    let scheduler: SchedulerExecution | undefined;
    try { scheduler = schedulerExecution(body.scheduler); }
    catch { return Response.json({ error: "Invalid scheduler provenance metadata" }, { status: 400 }); }
    if (body.trigger !== "schedule" && scheduler) return Response.json({ error: "Scheduler metadata requires trigger=schedule" }, { status: 400 });
    if ("weather" in body) {
      try { if (!parseForecast(body.weather, Date.now(), "scheduler-relay").length) throw new Error("No completed intervals"); }
      catch { return Response.json({ error: "Invalid UTC weather payload" }, { status: 400 }); }
    }
    // Scheduler metadata is persisted as a correlation key. Its independent origin must be verified against the scheduler's own receipt/history.
    return Response.json(await runBackground(body.trigger, Date.now(), body.weather, scheduler), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Stillwild background update failed", error); return Response.json({ error: "Background update temporarily unavailable" }, { status: 503 });
  }
}
