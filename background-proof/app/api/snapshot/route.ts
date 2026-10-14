import { isViewSessionId, snapshot, ViewClosureRequiredError } from "@/db/background";
export const dynamic = "force-dynamic";
// Read-only. Garden data is served only to a view session that D1 shows open; the page records its view through
// POST /api/view/session before calling this route. Refusals return no garden data and write nothing.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const sessionId = request.headers.get("x-stillwild-view-session");
  if (!isViewSessionId(sessionId)) return Response.json({ error: "An open view session is required to read the garden" }, { status: 400, headers });
  try { return Response.json(await snapshot(true, sessionId), { headers }); }
  catch (error) {
    if (error instanceof ViewClosureRequiredError) return Response.json({ error: error.message }, { status: 409, headers });
    console.error("Snapshot read failed", error); return Response.json({ error: "Garden temporarily unavailable" }, { status: 503, headers });
  }
}
