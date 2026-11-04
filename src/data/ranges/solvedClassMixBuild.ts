import { CLASS_MIX_ORDER, CLASS_MIX_SCHEMA, type SolvedClassMixFile } from "./solvedClassMix";
import { readTurnSubgame, type TurnSubgameNode } from "./turnSubgameReader";

/**
 * Generátorová půlka `solvedClassMix.ts`: z uzlu podhry řetězec pro jedno
 * pravidlo a z hotového packu soubor s frekvencemi. Je zvlášť, aby čtečka
 * podher nepřišla do svazku aplikace, která frekvence jen čte.
 */

const SLOT = new Map(CLASS_MIX_ORDER.map((hand, index) => [hand, index] as const));

/**
 * Směs každé třídy uzlu v celých procentech, v pořadí akcí uzlu (tytéž akce
 * nese pravidlo, `buildTurnStrategyRule` bere `strategy.actions`). Tvar
 * popisuje hlavička `solvedClassMix.ts`. Prázdný řetězec, když uzel strategii
 * nemá.
 */
export function encodeClassMix(node: TurnSubgameNode): string {
  const strategy = readTurnSubgame(node);
  if (strategy === undefined) return "";
  const slots = new Array<string>(CLASS_MIX_ORDER.length).fill("");
  for (const entry of strategy.classes) {
    const index = SLOT.get(entry.handClass);
    if (index === undefined) continue;
    const percents = strategy.actions.map((_, position) => (
      Math.round((entry.mix[position]?.frequency ?? 0) * 100)
    ));
    while (percents.length > 1 && percents[percents.length - 1] === 0) percents.pop();
    slots[index] = percents.join(",");
  }
  return slots.join(";");
}

/**
 * Soubor s frekvencemi k hotovému packu, pravidla v pořadí packu.
 *
 * Páruje se podle identity pravidla, ne podle pořadí při stavbě: generátor
 * pravidla ořezává (`RULE_BUDGET`, `trimToModuleBudget`) a pack nese ta, která
 * zbyla, jako tytéž objekty (`rules: input.rules`).
 */
export function classMixFile(
  pack: { id: string; contentHash: string; rules: readonly object[] },
  mixByRule: ReadonlyMap<object, string>,
): SolvedClassMixFile {
  return {
    schemaVersion: CLASS_MIX_SCHEMA,
    packId: pack.id,
    contentHash: pack.contentHash,
    rules: pack.rules.map((rule) => mixByRule.get(rule) ?? ""),
  };
}
