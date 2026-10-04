import { env } from "cloudflare:workers";
import type { Garden } from "@/lib/garden";
function db() { if (!env.DB) throw new Error("Garden storage unavailable"); return env.DB; }
export async function getGarden(): Promise<Garden | null> {
  return db().prepare("SELECT seed, born_at AS bornAt, version FROM gardens WHERE id = ?").bind("origin").first<Garden>();
}
export async function plantGarden(): Promise<Garden> {
  const bytes = new Uint32Array(1); crypto.getRandomValues(bytes);
  await db().prepare("INSERT INTO gardens (id, seed, born_at, version) VALUES (?, ?, ?, 1) ON CONFLICT(id) DO NOTHING").bind("origin", bytes[0], Date.now()).run();
  const result = await getGarden(); if (!result) throw new Error("Garden was not saved"); return result;
}
