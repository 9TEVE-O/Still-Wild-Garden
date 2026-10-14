import { isViewSessionId, snapshot } from "@/db/background";
export const dynamic = "force-dynamic";
// Read-only. The page records its view through POST /api/view/session before calling this route.
export async function GET(request: Request) {
  try {
    const header = request.headers.get("x-stillwild-view-session");
    return Response.json(await snapshot(true, isViewSessionId(header) ? header : null), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { console.error("Snapshot read failed", error); return Response.json({ error: "Garden temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
