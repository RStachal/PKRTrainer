import type { RiverStrategyPack } from "./riverStrategyPack";

/**
 * Vyřešené riverové packy, které už dorazily.
 *
 * Stejný živý seznam jako u turnu a ze stejného důvodu: rodiny se stahují jako
 * samostatné chunky a přistávají během relace, takže řetězec, který by je
 * načetl jednou při startu, by odpovídal z prázdna po celý běh.
 *
 * Typ packu bydlí u jeho stavitele, ne tady. Registr má vědět, co drží, ne
 * definovat, co to je.
 */
export type { RiverStrategyPack };

const packs: RiverStrategyPack[] = [];
const registeredIds = new Set<string>();

export const runtimeSolvedRiverPacks: readonly RiverStrategyPack[] = packs;

export function registerSolvedRiverPack(pack: RiverStrategyPack): void {
  if (registeredIds.has(pack.id)) return;
  packs.push(pack);
  registeredIds.add(pack.id);
}

export function clearSolvedRiverPacksForTests(): void {
  packs.length = 0;
  registeredIds.clear();
}
