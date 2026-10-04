export type Garden = { seed: number; bornAt: number; version: 1 };
export type Growth = { day: number; plants: number; agents: number; stage: string; caption: string; note: string; age: number; season: number };
export function random(seed: number, n: number): number { let x = (seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x21f0aaad); x ^= x >>> 15; x = Math.imul(x, 0x735a2d97); return ((x ^ (x >>> 15)) >>> 0) / 4294967296; }
export function gardenAt(garden: Garden | null, now: number): Growth {
  const age = garden ? Math.max(0, now - garden.bornAt) : 0;
  const day = Math.floor(age / 86400000) + 1;
  const plants = garden ? 1 + Math.floor(Math.sqrt(age / 3600000) * 1.5) : 0;
  const agents = garden ? Math.min(3, 1 + Math.floor(age / 90000)) : 0;
  const stage = day < 2 ? "The quiet beginning." : day < 7 ? "A little more alive." : day < 30 ? "Finding its own way." : "Wild, in its own time.";
  const caption = day < 2 ? "A single seed. All the time in the world." : day < 7 ? "Small things are putting down roots." : "Nothing to tend. Everything to notice.";
  const notes = ["Pip is finding a place for the next seed.", "A little water. A little patience.", "Moss is making room for something new.", "Somewhere, a new leaf is unfolding."];
  return { age, day, plants, agents, stage, caption, note: garden ? notes[Math.floor(age / 22000) % Math.min(agents + 1, 4)] : "", season: Math.floor(age / (30 * 86400000)) };
}
