import { getGarden, plantGarden } from "@/db/garden";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try { return Response.json({ garden: await getGarden(), serverNow: Date.now() }, { headers }); }
  catch (e) { console.error("Garden read failed", e); return Response.json({ error: "Garden storage unavailable" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Same-origin request required" }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  try {
    const body = await request.text();
    if (body.length > 100 || body.trim() !== "{}") return Response.json({ error: "No garden changes are accepted" }, { status: 400 });
    return Response.json({ garden: await plantGarden(), serverNow: Date.now() }, { headers });
  } catch (e) { console.error("Garden planting failed", e); return Response.json({ error: "Garden storage unavailable" }, { status: 503, headers }); }
}
