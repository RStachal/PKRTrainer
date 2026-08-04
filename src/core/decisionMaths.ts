import { requiredEquityWithIcm } from "./icmModel";
import { requiredFoldFrequency, type OpponentStyle } from "./opponentStyle";

/**
 * The arithmetic behind a preflop decision, in a shape the trainer can show.
 *
 * Until now the app taught *which* action, never *why that action at this price*.
 * A player told to fold learns a rule; a player told "this call needs 42 percent
 * and you have 38" learns to work it out for themselves next time, which is the
 * point of a trainer rather than a chart.
 *
 * Two adjustments plug in here, both of them a single number moving a threshold
 * rather than a second table of ranges - see `icmModel` and `opponentStyle`:
 *
 * - the payout ladder, through a bubble factor, raises what a call needs
 * - the opponent's folding, through a style, changes what a shove needs
 *
 * Both are optional. With neither supplied this reports plain chipEV against an
 * unknown opponent, which is what the shipped packs actually describe, and says
 * so rather than inventing a context.
 */

export interface CallPrice {
  /** Chips already in the middle before the hero acts. */
  potBB: number;
  /** What the hero must put in to call. */
  toCallBB: number;
}

export interface CallRequirement {
  /** Equity the call needs on chips alone. */
  chipEquity: number;
  /** Equity it needs once the payout ladder is counted, if a factor was given. */
  icmEquity?: number;
  /** The factor used, echoed so the explanation can name it. */
  bubbleFactor?: number;
  /** Pot odds expressed the way the tables in the owner's material express them. */
  oddsAgainst: number;
}

/**
 * What a call needs, with and without the ladder.
 *
 * Pot odds here are "odds against": the pot laid to the call, so calling 1 into 3
 * is 3:1 and needs a quarter of the equity. The ICM adjustment then divides those
 * odds by the bubble factor, which is exactly the operation the owner's SnG
 * material performs by hand.
 */
export function callRequirement(price: CallPrice, bubbleFactor?: number): CallRequirement {
  const { potBB, toCallBB } = price;
  if (toCallBB <= 0) return { chipEquity: 0, oddsAgainst: Infinity };

  const oddsAgainst = potBB / toCallBB;
  const chipEquity = toCallBB / (potBB + toCallBB);
  if (bubbleFactor === undefined || bubbleFactor <= 0) {
    return { chipEquity, oddsAgainst };
  }
  return {
    chipEquity,
    icmEquity: requiredEquityWithIcm(oddsAgainst, bubbleFactor),
    bubbleFactor,
    oddsAgainst,
  };
}

export interface ShoveRequirement {
  /** Folds the shove needs to break even on fold equity alone. */
  requiredFolds: number;
  /** Folds this opponent is expected to give, if a style was supplied. */
  expectedFolds?: number;
  /** True when the shove clears its cost on folds alone - a floor, not a verdict. */
  profitableOnFoldsAlone?: boolean;
}

/**
 * What a shove needs in folds, and whether this opponent gives it.
 *
 * `profitableOnFoldsAlone` ignores the equity the hand has when called, so it is
 * a floor: clearing it means the shove prints regardless of the cards, failing it
 * does not condemn the shove. Saying that plainly matters, because the number is
 * seductive enough to be over-read.
 */
export function shoveRequirement(
  riskBB: number,
  potBB: number,
  style?: OpponentStyle,
): ShoveRequirement {
  const requiredFolds = requiredFoldFrequency(riskBB, potBB);
  if (style === undefined) return { requiredFolds };
  return {
    requiredFolds,
    expectedFolds: style.foldsToShove,
    profitableOnFoldsAlone: style.foldsToShove > requiredFolds,
  };
}

const pct = (value: number) => `${(value * 100).toFixed(1).replace(".", ",")} %`;

/** One Czech sentence a player can act on, or none when there is nothing to say. */
export function explainCallPrice(requirement: CallRequirement): string {
  if (!Number.isFinite(requirement.oddsAgainst)) return "";
  const odds = requirement.oddsAgainst.toFixed(2).replace(".", ",");
  const base = `Pot odds ${odds}:1, takže call potřebuje ${pct(requirement.chipEquity)} equity.`;
  if (requirement.icmEquity === undefined || requirement.bubbleFactor === undefined) {
    return base;
  }
  const factor = requirement.bubbleFactor.toFixed(2).replace(".", ",");
  return `${base} Kvůli výplatní struktuře (bubble faktor ${factor}) ale potřebuje ${pct(requirement.icmEquity)}.`;
}

/** The same for a shove, naming the opponent's folding when it is known. */
export function explainShovePrice(requirement: ShoveRequirement): string {
  const base = `Shove potřebuje ${pct(requirement.requiredFolds)} foldů, aby se zaplatil sám.`;
  if (requirement.expectedFolds === undefined) return base;
  const verdict = requirement.profitableOnFoldsAlone
    ? "to tenhle soupeř dává, takže shove vydělává i bez dojetí"
    : "tolik tenhle soupeř nefolduje, takže shove musí obstát až u showdownu";
  return `${base} Čeká se ${pct(requirement.expectedFolds)} — ${verdict}.`;
}
