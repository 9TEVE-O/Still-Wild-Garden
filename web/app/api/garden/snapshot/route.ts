import { getEvolutionSnapshot, PROOF_GARDEN_ID } from "@/db/evolution";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(
      { gardenId: PROOF_GARDEN_ID, snapshot: await getEvolutionSnapshot(PROOF_GARDEN_ID), serverNow: Date.now() },
      { headers },
    );
  } catch (error) {
    console.error("Evolution snapshot read failed", error);
    return Response.json({ error: "Evolution garden storage unavailable" }, { status: 503, headers });
  }
}
