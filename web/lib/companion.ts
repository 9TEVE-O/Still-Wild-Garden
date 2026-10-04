import type { Garden } from "./garden";

/** Copy the owner's immutable beginning. Never generate a descendant gift here. */
export function companionRecord(garden: Garden) {
  if (garden.version !== 1 || !Number.isInteger(garden.seed) || garden.seed < 0 || garden.seed > 0xffffffff ||
      !Number.isSafeInteger(garden.bornAt) || garden.bornAt < 0 || garden.bornAt > 8640000000000000) {
    throw new Error("This garden version cannot be copied to Android.");
  }
  return { format: "stillwild-garden", formatVersion: 1, garden: { version: 1, seed: garden.seed, bornAt: garden.bornAt } };
}

export function companionFile(garden: Garden): File {
  return new File([JSON.stringify(companionRecord(garden), null, 2) + "\n"], "my-stillwild-garden.json", { type: "application/json" });
}
