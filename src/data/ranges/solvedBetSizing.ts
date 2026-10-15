import type { PostflopRecommendationSource } from "../../core/postflopGenerator";
import { familyBetSizing } from "./postflopBetSizing.generated";
import { familyIdFromRuleId } from "./postflopSolvedSpr";

export interface SolvedBetSizing {
  /** Podíl potu, který solve za tlačítko dal; u all-inu 1 a `allIn: true`. */
  ratio: number;
  allIn: boolean;
  /** Kolik vyřešených velikostí se pod tím tlačítkem slilo. */
  merged: number;
}

/**
 * Jakou velikost sázky solve za tlačítkem skutečně hrál, když je rodina známá.
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
 * ## Co vrací
 *
 * Největší z vyřešených velikostí, když se jich pod tlačítkem slilo víc:
 * tlačítko je jedna volba a podstřelit ji by byla tatáž chyba z druhé strany.
 * `allIn` jen tehdy, když je shove **jedinou** akcí za tlačítkem - není to podíl
 * potu, a kde vedle něj sedí skutečná sázka, má tlačítko popisovat ji.
 * `undefined`, když rodinu nebo velikost neznáme; volající pak použije model.
 */
export function solvedBetSizing(
  source: PostflopRecommendationSource | undefined,
  action: "BET_SMALL" | "BET_BIG",
): SolvedBetSizing | undefined {
  if (source === undefined || source.kind !== "STRATEGY_PACK") return undefined;
  const sizing = familyBetSizing(familyIdFromRuleId(source.ruleId));
  if (sizing === undefined) return undefined;

  const pcts = action === "BET_SMALL" ? sizing.smallPct : sizing.bigPct;
  if (action === "BET_BIG" && pcts.length === 0 && sizing.bigIsAllIn) {
    return { ratio: 1, allIn: true, merged: 1 };
  }
  if (pcts.length === 0) return undefined;
  return { ratio: Math.max(...pcts) / 100, allIn: false, merged: pcts.length };
}
