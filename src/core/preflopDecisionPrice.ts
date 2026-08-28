import { decisionPrices, type DecisionPrice } from "./decisionPrice";
import { openSizeAtDepth } from "./drillEngine";
import { preflopRaiseSizes } from "./preflopSizes";
import { rangeStore, type RangeStore } from "../data/rangeStore";
import type { ActionKey, Spot } from "./types";

/**
 * Cena každé nabízené akce pro jeden preflopový spot.
 *
 * ## Co se sem smí dosadit a co ne
 *
 * Jen velikosti, které produkt **učí** (otevření podle hloubky) nebo které nese
 * jako **přiznaný předpoklad** (tří-bet a čtyři-bet, viz `preflopSizes`). Kde
 * velikost nemá odkud vzít - squeeze, iso-raise nad víc limperů - se akce
 * **vynechá**. Vymyšlená velikost dá vymyšlený práh, který vypadá stejně
 * autoritativně jako spočítaný.
 *
 * ## Kolik hrdina už v potu má
 *
 * Blind se počítá jako vložený: BB dorovnává o blind míň, SB o půl. Bez toho by
 * obrana z velkého blindu vycházela dráž, než doopravdy je - a právě tam se
 * hraje nejvíc spotů.
 */

const POSTED_BY_SEAT: Partial<Record<string, number>> = { BB: 1, SB: 0.5 };

const RAISE_SIZE_BY_KEY: Partial<Record<ActionKey, number>> = {
  OPEN_2X: 2, OPEN_25X: 2.5, OPEN_3X: 3,
  ISO_2X: 2, ISO_25X: 2.5, ISO_3X: 3,
};

export function preflopDecisionPrices(
  spot: Spot,
  store: RangeStore = rangeStore,
  bubbleFactor?: number,
): DecisionPrice[] {
  const actions = spot.answers.map((answer) => answer.key);
  const posted = POSTED_BY_SEAT[spot.heroPos] ?? 0;
  const startingPot = spot.startingPot ?? 1.5;
  const openBB = openSizeAtDepth(spot.effStack, spot.ante, store);
  const stack = spot.effStack;

  const riskByAction: Partial<Record<ActionKey, number>> = {};
  for (const [key, size] of Object.entries(RAISE_SIZE_BY_KEY)) {
    if (actions.includes(key as ActionKey) && size !== undefined) {
      riskByAction[key as ActionKey] = size - posted;
    }
  }

  let potBB = startingPot;
  let toCallBB = 0;
  let alreadyIn = posted;

  if (spot.context === "VS_LIMP") {
    potBB += spot.tableState.limpsBefore;
    toCallBB = Math.max(0, 1 - posted);
  } else if (spot.context === "VS_OPEN" || spot.context === "SQUEEZE") {
    if (openBB === undefined) return [];
    // Squeeze: každý caller přidal tolik, kolik bylo otevření.
    potBB += openBB * (1 + spot.tableState.callsBefore);
    toCallBB = Math.max(0, openBB - posted);
  } else if (spot.context === "VS_3BET") {
    if (openBB === undefined) return [];
    const { threeBetBB } = preflopRaiseSizes(spot.heroPos, stack, openBB);
    potBB += openBB + threeBetBB;
    alreadyIn = openBB;
    toCallBB = Math.max(0, threeBetBB - openBB);
    if (actions.includes("4BET")) {
      riskByAction["4BET"] = Math.max(0, preflopRaiseSizes(spot.heroPos, stack, openBB).fourBetBB - openBB);
    }
  } else if (spot.context === "VS_4BET") {
    if (openBB === undefined) return [];
    const { threeBetBB, fourBetBB } = preflopRaiseSizes(spot.heroPos, stack, openBB);
    potBB += openBB + threeBetBB + fourBetBB;
    alreadyIn = threeBetBB;
    toCallBB = Math.max(0, fourBetBB - threeBetBB);
  } else if (spot.context === "VS_ALLIN") {
    potBB += stack;
    toCallBB = Math.max(0, stack - posted);
  }

  if (actions.includes("JAM")) riskByAction.JAM = Math.max(0, stack - alreadyIn);
  // Squeeze ani over-limp nemají velikost, kterou by produkt učil. Zůstávají
  // bez ceny schválně; prázdno se pozná, vymyšlené číslo ne.

  return decisionPrices({ actions, potBB, toCallBB, riskByAction, bubbleFactor });
}
