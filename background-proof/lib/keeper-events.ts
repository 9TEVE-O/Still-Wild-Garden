import type { Consequence } from "./world";

export type SavedKeeperEvent = { id: string; committedAt: number; payload: Consequence };

// Only a performed keeper action can be presented as that keeper's work.
// Rainfall changes the shared water store but is not work performed by Dew.
const performedActions: Record<Consequence["keeper"], ReadonlySet<string>> = {
  Pip: new Set(["seed-planted"]),
  Dew: new Set(["spring-water-collected", "roots-watered"]),
  Moss: new Set(["habitat-made"]),
};

export function latestKeeperAction(
  events: readonly SavedKeeperEvent[] | undefined,
  keeper: Consequence["keeper"],
): SavedKeeperEvent | undefined {
  return events?.find(event =>
    event.payload.keeper === keeper
    && performedActions[keeper].has(event.payload.type)
    && !(keeper === "Dew"
      && event.payload.type === "spring-water-collected"
      && event.payload.change.water === 0));
}
