import { snapshot } from "@/db/background";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Evidence read failed", error); return Response.json({ error: "Evidence temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
