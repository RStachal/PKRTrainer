import type { FlopSolvedStrategyPack } from "./flopSolvedStrategyPack";

/**
 * Vyřešené flopové packy, které už dorazily.
 *
 * Živý seznam ze stejného důvodu jako u turnu a riveru: rodiny se stahují jako
 * samostatné chunky a přistávají během relace, takže řetězec postavený jednou
 * při startu by odpovídal z prázdna po celý běh.
 */
export type { FlopSolvedStrategyPack };

const packs: FlopSolvedStrategyPack[] = [];
const registeredIds = new Set<string>();

export const runtimeSolvedFlopPacks: readonly FlopSolvedStrategyPack[] = packs;

export function registerSolvedFlopPack(pack: FlopSolvedStrategyPack): void {
  if (registeredIds.has(pack.id)) return;
  packs.push(pack);
  registeredIds.add(pack.id);
}

export function clearSolvedFlopPacksForTests(): void {
  packs.length = 0;
  registeredIds.clear();
}
