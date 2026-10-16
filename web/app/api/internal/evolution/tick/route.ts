import { env } from "cloudflare:workers";
import { runEvolutionTick } from "@/db/evolution";
import { isConfiguredScheduledToken, matchesScheduledBearer } from "@/lib/security/scheduled-token";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const HOUR_MS = 3_600_000;

export async function POST(request: Request) {
  const token = env.STILLWILD_TICK_TOKEN;
  if (!isConfiguredScheduledToken(token)) {
    return Response.json({ error: "Scheduled garden tick is not configured" }, { status: 503, headers });
  }

  if (!matchesScheduledBearer(request.headers.get("authorization"), token)) {
    return Response.json({ error: "Unauthorised scheduled tick" }, { status: 401, headers });
  }

  const now = Date.now();
  const tickId = Math.floor(now / HOUR_MS);

  try {
    const result = await runEvolutionTick(
      {
        tickId,
        precipitationMm: 0,
        temperatureC: null,
        provider: "stillwild-proof-fixture",
        sourceStatus: "simulated",
      },
      now,
    );
    return Response.json({ ...result, serverNow: now }, { headers });
  } catch (error) {
    console.error("Scheduled evolution tick failed", error);
    return Response.json({ error: "Scheduled evolution tick failed" }, { status: 500, headers });
  }
}
