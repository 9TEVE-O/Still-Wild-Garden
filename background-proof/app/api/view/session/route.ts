import { isViewSessionId, recordViewSession, ViewClosureRequiredError, type ViewSessionEvent } from "@/db/background";
export const dynamic = "force-dynamic";
const viewEvents: ViewSessionEvent[] = ["open", "heartbeat", "read", "close"];
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || Array.isArray(body) || typeof body !== "object") return Response.json({ error: "Invalid view event" }, { status: 400 });
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some(key => !["sessionId", "event"].includes(key)) || !isViewSessionId(record.sessionId) ||
      !viewEvents.includes(record.event as ViewSessionEvent))
    return Response.json({ error: "Invalid view event" }, { status: 400 });
  try {
    const result = await recordViewSession(record.sessionId, record.event as ViewSessionEvent);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ViewClosureRequiredError) return Response.json({ error: error.message }, { status: 409 });
    console.error("View session update failed", error); return Response.json({ error: "View session temporarily unavailable" }, { status: 503 });
  }
}
