import type { RiverStrategyRule } from "./riverStrategyRuleBuilder";
import type { TurnStrategyPack } from "./turnStrategyPack";

/**
 * Vyřešené riverové packy, které už dorazily.
 *
 * Stejný živý seznam jako u turnu a ze stejného důvodu: rodiny se stahují jako
 * samostatné chunky a přistávají během relace, takže řetězec, který by je
 * načetl jednou při startu, by odpovídal z prázdna po celý běh.
 *
 * Tvar packu je turnový. Řádek strategie se mezi ulicemi neliší - deska,
 * hloubka, uzel, kbelíky ruk - liší se jen to, kolik karet je na stole a že po
 * riveru už nic nenásleduje. Vyrábět druhý skoro totožný typ by znamenalo mít
 * dvě místa, kde se opravuje jedna chyba; přesně tím trpí produkční packy pro
 * turn a river, které vznikly každý zvlášť.
 */
export type RiverStrategyPack = Omit<TurnStrategyPack, "dimensions" | "rules"> & {
  dimensions: Omit<TurnStrategyPack["dimensions"], "street"> & { street: "RIVER" };
  rules: readonly RiverStrategyRule[];
};

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
