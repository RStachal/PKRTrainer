import type { PostflopRecommendationSource, PostflopSolvedBetSizing } from "../../core/postflopGenerator";
import { familyBetSizing } from "./postflopBetSizing.generated";
import { familyIdFromRuleId } from "./postflopSolvedSpr";
import type { TranslatedAction } from "./turnActionTranslation";

/** Podíl potu, který solve za tlačítko dal; u all-inu 1 a `allIn: true`. */
export type SolvedBetSizing = PostflopSolvedBetSizing;

/**
 * Jakou velikost sázky solve za tlačítkem skutečně hrál, když ji známe.
 *
 * ## Proč to bydlí tady, a ne v pohledu
 *
 * Do 15. 10. 2026 byla tahle funkce soukromá v `postflopView.ts` a používalo ji
 * jen tlačítko. Simulátor linky (`postflopLineSimulator.ts`) přitom posouval pot
 * modelem - **0,33 a 0,75 potu natvrdo** - a výsledek ukazoval hráči jako „Bank
 * po akci". Změřeno 13. 10. 2026 na 76 rodinách tabulky velikostí: `BET_SMALL`
 * se s modelem rozcházel u 17 z 20 rodin, `BET_BIG` u 63 z 63 (ve stromě je vždy
 * 0,50). Hráč tedy viděl na tlačítku půlpotovou sázku a pod ní banku ze tří
 * čtvrtin.
 *
 * Velikosti ve stromech jsou čtyři - 0,25, 0,33, 0,5 a 0,75 potu podle rodiny -
 * a vlastník 15. 10. 2026 rozhodl je **nechat všechny čtyři**, tedy nesrovnávat
 * je na dvě modelové. Teď je čtou obě místa odsud, takže se nemůžou rozejít.
 *
 * ## Odkud se velikost bere
 *
 * Vyřešené pravidlo (flop, turn i river z rozkladu) ji nese samo v
 * `heroBetSizes` - spočítanou z akcí uzlu (`ruleBetSizes`). Pilotní pravidlo
 * ji nemá a bere se z tabulky rodin podle jeho id. Do 15. 10. 2026 se ptala
 * jen tabulka, a ta vyřešená pravidla nepozná: jejich id je `RODINA__deska`,
 * bez pomlčky, kterou `familyIdFromRuleId` dělí. Na vyřešeném spotu tak
 * tlačítko i banka jely na modelu, přestože pack nesl skutečnou velikost.
 *
 * ## Co vrací
 *
 * Největší z vyřešených velikostí, když se jich pod tlačítkem slilo víc:
 * tlačítko je jedna volba a podstřelit ji by byla tatáž chyba z druhé strany.
 * `allIn` jen tehdy, když je shove **jedinou** akcí za tlačítkem - není to podíl
 * potu, a kde vedle něj sedí skutečná sázka, má tlačítko popisovat ji.
 * `undefined`, když velikost neznáme; volající pak použije model.
 */
export function solvedBetSizing(
  source: PostflopRecommendationSource | undefined,
  action: "BET_SMALL" | "BET_BIG",
): SolvedBetSizing | undefined {
  if (source === undefined || source.kind !== "STRATEGY_PACK") return undefined;
  // Vyřešené pravidlo mluví samo za sebe - i tím, že tlačítko nenabízí.
  if (source.heroBetSizes !== undefined) return source.heroBetSizes[action];

  const sizing = familyBetSizing(familyIdFromRuleId(source.ruleId));
  if (sizing === undefined) return undefined;

  const pcts = action === "BET_SMALL" ? sizing.smallPct : sizing.bigPct;
  if (action === "BET_BIG" && pcts.length === 0 && sizing.bigIsAllIn) {
    return { ratio: 1, allIn: true, merged: 1 };
  }
  if (pcts.length === 0) return undefined;
  return { ratio: Math.max(...pcts) / 100, allIn: false, merged: pcts.length };
}

/**
 * Velikosti hrdinových sázek z akcí samotného vyřešeného uzlu.
 *
 * `actions` jsou akce uzlu přeložené proti potu uzlu (`translateTurnActions`),
 * takže každá sázka už nese `potFraction`. Shove se pozná podle **stacku**, ne
 * podle velikosti: sázka za celý zbytek je all-in, ať je to 1,8 potu nebo 13.
 * Pravidla pro sloučení jsou tatáž jako u tabulky rodin (viz `solvedBetSizing`).
 *
 * Bez potu uzlu se nevrací nic: velikost proti jinému jmenovateli by byla
 * vymyšlené číslo, a model je aspoň poctivě modelem.
 */
export function ruleBetSizes(
  actions: readonly TranslatedAction[],
  potChips: number | undefined,
  stackChips: number | undefined,
): Partial<Record<"BET_SMALL" | "BET_BIG", SolvedBetSizing>> | undefined {
  if (potChips === undefined || potChips <= 0) return undefined;
  const sizes: Partial<Record<"BET_SMALL" | "BET_BIG", SolvedBetSizing>> = {};
  for (const button of ["BET_SMALL", "BET_BIG"] as const) {
    const fractions = actions
      .filter((item) => item.action === button && item.potFraction !== undefined)
      .map((item) => item.potFraction as number);
    if (fractions.length === 0) continue;
    const isShove = (fraction: number) => (
      stackChips !== undefined && stackChips > 0 && fraction * potChips >= stackChips - 0.5
    );
    const real = fractions.filter((fraction) => !isShove(fraction));
    sizes[button] = real.length > 0
      ? { ratio: Math.max(...real), allIn: false, merged: fractions.length }
      : { ratio: 1, allIn: true, merged: fractions.length };
  }
  return sizes;
}
