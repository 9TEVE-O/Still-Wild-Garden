import { startAbsenceCheck } from "@/db/background";
export const dynamic = "force-dynamic";
// Owner-private service access; this records proof metadata and cannot reset a garden.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  if ((await request.text()).trim() !== "{}") return Response.json({ error: "Empty object required" }, { status: 400 });
  try { return Response.json(await startAbsenceCheck(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("Absence checkpoint failed", e); return Response.json({ error: "Proof checkpoint unavailable" }, { status: 503 }); }
}
