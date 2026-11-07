import { gardenAt, random, type Garden } from "./garden";
import { FIRST_SPROUT, GROWTH_SPOTS, GROWTH_SPRITES, SHRUB_SIZES, type SpriteCell } from "./growth-atlas";

/**
 * Five-stage growth layer for the live view.
 *
 * Plant counts still come from the version 1 rule in lib/garden.ts (plants = 1 + floor(1.5 * sqrt(hours))),
 * so the saved seed and birth time are the only inputs. Additional plant k appears at hour (k / 1.5)^2,
 * which gives each plant its own age and stage. Stage thresholds are creative world units, not a
 * horticultural model. The first plant is the island's baked golden sprout and is never drawn over.
 */
export type PlantStage = "mound" | "sprout" | "sapling" | "shrub" | "flowering";
export const STAGE_START_DAYS: Readonly<Record<PlantStage, number>> = { mound: 0, sprout: 2, sapling: 9, shrub: 30, flowering: 120 };

/**
 * Species layer for the live view (candidate, owner-gated).
 *
 * The version 1 renderer, growth rule, seed format and sprite atlas are all unchanged: a plant's
 * shape and stage still come only from its age. Each plant is additionally assigned one deterministic
 * species from its garden seed, expressed purely as a canvas foliage tint (CSS hue-rotate/saturate)
 * applied when the live renderer draws that plant — see lib/render-world.ts. Species never changes a
 * plant's spot, stage, count or timing, so every v1 contract and the gift/Android drawing are untouched.
 * Weights keep the native emerald dominant, so the garden reads as one place with natural variety rather
 * than a colour chart.
 */
export type Species = { id: string; name: string; filter: string; accent: string };
export const SPECIES: readonly Species[] = [
  { id: "emerald", name: "Emerald moss", filter: "none", accent: "#d2ea9f" },
  { id: "jade", name: "Jade fern", filter: "hue-rotate(28deg) saturate(1.1)", accent: "#a9e6d2" },
  { id: "fern", name: "Deep fern", filter: "hue-rotate(-22deg) saturate(1.16)", accent: "#bfe39a" },
  { id: "amber", name: "Amberleaf", filter: "hue-rotate(-92deg) saturate(1.22)", accent: "#ecd083" },
  { id: "rose", name: "Roseblossom", filter: "hue-rotate(-152deg) saturate(1.18)", accent: "#eaa7c6" },
  { id: "violet", name: "Duskbell", filter: "hue-rotate(96deg) saturate(1.12)", accent: "#bcb1ea" },
];
const SPECIES_WEIGHTS = [5, 3, 3, 2, 1, 1] as const;
/** Deterministic species for additional plant k (1-based) of a garden, emerald-weighted. */
export function speciesFor(seed: number, k: number): Species {
  const total = SPECIES_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = random(seed, 6000 + k) * total;
  for (let i = 0; i < SPECIES.length; i++) { r -= SPECIES_WEIGHTS[i]; if (r < 0) return SPECIES[i]; }
  return SPECIES[0];
}

export type PlacedPlant = { k: number; spot: number; x: number; y: number; ageDays: number; stage: PlantStage; sprite: SpriteCell; species: Species };

const ISLAND_W = 1536, ISLAND_H = 1024;

export function stageForAge(days: number): PlantStage {
  if (days < STAGE_START_DAYS.sprout) return "mound";
  if (days < STAGE_START_DAYS.sapling) return "sprout";
  if (days < STAGE_START_DAYS.shrub) return "sapling";
  if (days < STAGE_START_DAYS.flowering) return "shrub";
  return "flowering";
}

/** Hour at which additional plant k (1-based) first appears under the version 1 count rule. */
export function sownAtHours(k: number): number {
  return (k / 1.5) ** 2;
}

let orderCache: { seed: number; order: number[] } | null = null;
/** Planting order for a garden: outward from the first sprout, loosened by the garden's own seed. */
export function spotOrder(seed: number): number[] {
  if (orderCache?.seed === seed) return orderCache.order;
  const [mx, my] = FIRST_SPROUT;
  const order = GROWTH_SPOTS
    .map(([x, y], i) => ({ i, key: Math.hypot((x - mx) * ISLAND_W, (y - my) * ISLAND_H * 1.9) * (0.55 + 0.9 * random(seed, 3000 + i)) }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map(o => o.i);
  orderCache = { seed, order };
  return order;
}

function spriteFor(stage: PlantStage, seed: number, spot: number, y: number, ageDays: number): SpriteCell {
  const depth = Math.min(1, Math.max(0, (y * ISLAND_H - 330) / 290));     // nearer the front, a little larger
  const maturity = Math.min(1, Math.max(0, (ageDays - 30) / 300));        // shrubs keep filling out for a year
  const size = (0.9 + 0.2 * depth) * (1 + 0.28 * maturity);
  let group: string;
  if (stage === "mound" || stage === "sprout") group = `${stage}:0`;
  else if (stage === "sapling") group = `sapling:${size < 1 ? 0 : 1}`;
  else {
    let best = 0;
    SHRUB_SIZES.forEach((s, i) => { if (Math.abs(s - size) < Math.abs(SHRUB_SIZES[best] - size)) best = i; });
    group = `${stage}:${best}`;
  }
  const cells = GROWTH_SPRITES[group];
  return cells[Math.floor(random(seed, 4000 + spot) * cells.length) % cells.length];
}

/** Every additional plant visible at `now`, back to front. The island holds at most GROWTH_SPOTS.length. */
export function plantsAt(garden: Garden | null, now: number): PlacedPlant[] {
  if (!garden) return [];
  const growth = gardenAt(garden, now);
  const count = Math.min(Math.max(0, growth.plants - 1), GROWTH_SPOTS.length);
  const order = spotOrder(garden.seed);
  const ageHours = growth.age / 3_600_000;
  const plants: PlacedPlant[] = [];
  for (let k = 1; k <= count; k++) {
    const spot = order[k - 1];
    const [x, y] = GROWTH_SPOTS[spot];
    const ageDays = Math.max(0, (ageHours - sownAtHours(k)) / 24);
    const stage = stageForAge(ageDays);
    plants.push({ k, spot, x, y, ageDays, stage, sprite: spriteFor(stage, garden.seed, spot, y, ageDays), species: speciesFor(garden.seed, k) });
  }
  return plants.sort((a, b) => a.y - b.y || a.x - b.x);
}
