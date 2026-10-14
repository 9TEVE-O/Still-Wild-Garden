import { snapshot } from "@/db/background";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const sessionId = request.headers.get("x-stillwild-view-session");
    return Response.json(await snapshot(true, sessionId), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { console.error("Snapshot read failed", error); return Response.json({ error: "Garden temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
