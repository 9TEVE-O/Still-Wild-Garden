import { recordViewSession, ViewClosureRequiredError } from "@/db/background";
export const dynamic = "force-dynamic";
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || Array.isArray(body) || typeof body !== "object") return Response.json({ error: "Invalid view event" }, { status: 400 });
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some(key => !["sessionId", "event"].includes(key)) || typeof record.sessionId !== "string" ||
      !sessionIdPattern.test(record.sessionId) || !["open", "heartbeat", "close"].includes(String(record.event)))
    return Response.json({ error: "Invalid view event" }, { status: 400 });
  try {
    const result = await recordViewSession(record.sessionId, record.event as "open" | "heartbeat" | "close");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ViewClosureRequiredError) return Response.json({ error: error.message }, { status: 409 });
    console.error("View session update failed", error); return Response.json({ error: "View session temporarily unavailable" }, { status: 503 });
  }
}
