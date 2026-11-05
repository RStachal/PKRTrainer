import type { TurnStrategyPack } from "./turnStrategyPack";

/**
 * Solved turn packs that have arrived, held in one live array.
 *
 * Each family is its own chunk and each chunk lands whenever its download
 * finishes, so the set of available packs grows during a session. The resolver
 * chain reads this array on every call rather than capturing it once, which is
 * the whole reason it is a mutable module-level array instead of a value passed
 * around: a chain built at boot would answer from an empty list forever.
 *
 * Registering the same pack twice is a no-op rather than an error. Two profiles
 * can want the same family, and the second request finding it already present is
 * the normal case, not a fault.
 */

const packs: TurnStrategyPack[] = [];
const registeredIds = new Set<string>();

export const runtimeSolvedTurnPacks: readonly TurnStrategyPack[] = packs;

export function registerSolvedTurnPack(pack: TurnStrategyPack): void {
  if (registeredIds.has(pack.id)) return;
  packs.push(pack);
  registeredIds.add(pack.id);
}

export function clearSolvedTurnPacksForTests(): void {
  packs.length = 0;
  registeredIds.clear();
}
