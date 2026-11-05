import type { PostflopAction } from "../../core/postflopGenerator";
import type { PostflopTrainingSpot } from "../../core/postflopTrainingSpot";
import { MODEL_BET_RATIO, solvedBetSizing } from "../../data/ranges/solvedBetSizing";
import { formatBbAmount } from "../kit/format";
import { formatSharePercent } from "../kit/strategyBar";

/** Sázka, které hráč čelí, když ji vyřešené pravidlo nese. */
export function facingBetBb(spot: PostflopTrainingSpot): number | undefined {
  const source = spot.explanation.source;
  return source.kind === "STRATEGY_PACK" ? source.facingBetBB : undefined;
}

/**
 * Název akce a částka, když akce stojí žetony. Tlačítka, vyhodnocení
 * i matice range mluví o akci týmiž slovy.
 *
 * Velikost sázky je ta, kterou solve za tlačítkem hrál (`solvedBetSizing`);
 * bez vyřešené velikosti modelová, se kterou počítá i simulátor linky, takže
 * tlačítko a bank po akci mluví o téže sázce.
 */
export function actionText(spot: PostflopTrainingSpot, action: PostflopAction): { label: string; detail?: string } {
  switch (action) {
    case "BET_SMALL":
    case "BET_BIG": {
      const sizing = solvedBetSizing(spot.explanation.source, action);
      if (sizing?.allIn === true) return { label: "All-in", detail: formatBbAmount(spot.effectiveStackBB) };
      const ratio = sizing?.ratio ?? MODEL_BET_RATIO[action];
      return {
        label: `Bet ${formatSharePercent(ratio)}`,
        detail: formatBbAmount(Math.min(spot.effectiveStackBB, spot.potBB * ratio)),
      };
    }
    case "CALL": {
      const bet = facingBetBb(spot);
      return bet === undefined ? { label: "Call" } : { label: "Call", detail: formatBbAmount(bet) };
    }
    case "CHECK":
      return { label: "Check" };
    case "RAISE":
      return { label: "Raise" };
    case "FOLD":
      return { label: "Fold" };
  }
}
