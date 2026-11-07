import { startAbsenceCheck, ViewClosureRequiredError } from "@/db/background";
export const dynamic = "force-dynamic";
// Owner-private service access; this records proof metadata and cannot reset a garden.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length !== 1 || (body as Record<string, unknown>).allViewsClosedAttested !== true)
    return Response.json({ error: "Explicit all-views-closed owner attestation required" }, { status: 400 });
  try { return Response.json(await startAbsenceCheck(true), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) {
    if (e instanceof ViewClosureRequiredError) return Response.json({ error: e.message }, { status: 409 });
    console.error("Absence checkpoint failed", e); return Response.json({ error: "Proof checkpoint unavailable" }, { status: 503 });
  }
}
