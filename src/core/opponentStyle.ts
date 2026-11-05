/**
 * Opponent styles as a fold-frequency shift, not as a lookup table of ranges.
 *
 * The architecture is deliberately the same as bubble factor in `icmModel`: the
 * GTO baseline stays exactly where it is, and the opponent supplies one number
 * that moves a threshold. Bubble factor moves the equity a call needs; style
 * moves the folds a bluff gets. Two mechanisms, one shape, and neither of them
 * needs a second set of ranges.
 *
 * ## The two axes
 *
 * The owner's SnG material names them directly: "Maniaci s vysokým VPIP, kteří
 * mají také vysoké PFR" are the loose-aggressive, and "Maniaci, kteří mají vysoké
 * VPIP, ale nízké PFR, jsou často calling station" - so how much a player enters
 * with (VPIP) and how much of that is raising (PFR/VPIP) are the two dimensions.
 *
 * ## Where the numbers come from, and where they stop
 *
 * Two anchors are measured rather than assumed:
 *
 * - Jonathan Little, volume 2, gives the calling width against a ten big blind
 *   shove as about 20 percent for a tight field and about 40 for a loose one.
 *   Calling 20 percent is folding 80, which is the fold frequency this model
 *   turns on.
 * - Nathan Williams puts the threshold for a recreational player at a VPIP above
 *   40 percent, and says a fold-to-3bet of 80 percent or more is the point where
 *   flatting beats three-betting.
 *
 * Everything between those anchors is interpolation and is marked as such. This
 * file does not claim to know that a "rock" folds 84 percent; it claims the
 * ordering is right and the two ends are measured.
 */

/** How much of their range a player enters the pot with. */
export type Looseness = "TIGHT" | "LOOSE";
/** How much of what they play, they play by betting and raising. */
export type Aggression = "AGGRESSIVE" | "PASSIVE";

export interface OpponentStyle {
  id: string;
  looseness: Looseness;
  aggression: Aggression;
  /** Typical VPIP band, as a fraction. */
  readonly vpip: readonly [number, number];
  /** Share of hands played that are raised, as a fraction. */
  readonly aggressionRatio: readonly [number, number];
  /**
   * How often they fold facing a shove. The number this model actually turns on.
   *
   * `MEASURED` marks the two Little anchors; `INTERPOLATED` marks the rest, which
   * sit between them in the order the styles imply and are not claims about any
   * particular population.
   */
  readonly foldsToShove: number;
  readonly basis: "MEASURED" | "INTERPOLATED";
}

/** The four quadrants the owner named, plus the labels that refine them. */
export const OPPONENT_STYLES = {
  TIGHT_AGGRESSIVE: {
    id: "TIGHT_AGGRESSIVE", looseness: "TIGHT", aggression: "AGGRESSIVE",
    vpip: [0.15, 0.24], aggressionRatio: [0.7, 1], foldsToShove: 0.8, basis: "MEASURED",
  },
  TIGHT_PASSIVE: {
    id: "TIGHT_PASSIVE", looseness: "TIGHT", aggression: "PASSIVE",
    vpip: [0.12, 0.2], aggressionRatio: [0, 0.4], foldsToShove: 0.82, basis: "INTERPOLATED",
  },
  LOOSE_AGGRESSIVE: {
    id: "LOOSE_AGGRESSIVE", looseness: "LOOSE", aggression: "AGGRESSIVE",
    vpip: [0.3, 0.6], aggressionRatio: [0.6, 1], foldsToShove: 0.62, basis: "INTERPOLATED",
  },
  LOOSE_PASSIVE: {
    id: "LOOSE_PASSIVE", looseness: "LOOSE", aggression: "PASSIVE",
    vpip: [0.4, 0.8], aggressionRatio: [0, 0.3], foldsToShove: 0.6, basis: "MEASURED",
  },
} as const satisfies Record<string, OpponentStyle>;

export type OpponentStyleId = keyof typeof OPPONENT_STYLES;

/** The finer labels, each resolving to one of the four quadrants. */
export const STYLE_LABELS: Readonly<Record<string, OpponentStyleId>> = {
  REG: "TIGHT_AGGRESSIVE",
  ROCK: "TIGHT_PASSIVE",
  NIT: "TIGHT_PASSIVE",
  MANIAC: "LOOSE_AGGRESSIVE",
  GAMBLER: "LOOSE_AGGRESSIVE",
  CALLING_STATION: "LOOSE_PASSIVE",
  FISH: "LOOSE_PASSIVE",
  WHALE: "LOOSE_PASSIVE",
};

/**
 * The folds a bluff of `bet` into `pot` needs to break even, both in the same unit.
 *
 * Straight from the break-even identity: risking `bet` to win `pot` pays off when
 * it works often enough that `pot x folds = bet x (1 - folds)`.
 */
export function requiredFoldFrequency(bet: number, pot: number): number {
  if (bet <= 0) return 0;
  return bet / (pot + bet);
}

/**
 * Whether a shove of this size shows a profit on fold equity alone against a style.
 *
 * "Alone" is the point: this ignores the equity the hand has when called, so it is
 * a floor rather than a verdict. A hand that clears this is printing money; one
 * that does not may still be fine once its equity when called is counted.
 */
export function shoveProfitableOnFoldsAlone(
  style: OpponentStyle,
  bet: number,
  pot: number,
): boolean {
  return style.foldsToShove > requiredFoldFrequency(bet, pot);
}

/**
 * How the shove threshold moves against this opponent, as a multiplier on width.
 *
 * Above one means shove wider, below one means tighter. Derived rather than
 * chosen: it is the ratio of the fold equity this opponent gives to the fold
 * equity the baseline assumes, so a player who folds less shrinks the range in
 * proportion. The owner's material states the direction independently - "pokud má
 * calling station více žetonů, stealy se stávají nákladnější a musíme tedy
 * výrazně omezit naši range pro push" - and this puts a number on it.
 */
export function shoveWidthMultiplier(
  style: OpponentStyle,
  baselineFolds = 0.7,
): number {
  if (baselineFolds <= 0) return 1;
  return style.foldsToShove / baselineFolds;
}

/** Resolve a label such as "fish" or "reg" to the quadrant it belongs to. */
export function styleForLabel(label: string): OpponentStyle | undefined {
  const key = STYLE_LABELS[label.trim().toUpperCase().replace(/[ -]/g, "_")];
  return key === undefined ? undefined : OPPONENT_STYLES[key];
}

/**
 * Classify an observed opponent from the two stats the material relies on.
 *
 * Returns `undefined` below a sample the owner's own guidance calls unusable:
 * "bez sample size jen orientačně". Guessing a style from a handful of hands is
 * how a read becomes a liability.
 */
export function classifyOpponent(
  vpip: number,
  pfr: number,
  handsObserved: number,
  minimumHands = 30,
): OpponentStyle | undefined {
  if (handsObserved < minimumHands || vpip <= 0) return undefined;
  const loose = vpip >= 0.3;
  const ratio = pfr / vpip;
  const aggressive = ratio >= 0.5;
  if (loose) return aggressive ? OPPONENT_STYLES.LOOSE_AGGRESSIVE : OPPONENT_STYLES.LOOSE_PASSIVE;
  return aggressive ? OPPONENT_STYLES.TIGHT_AGGRESSIVE : OPPONENT_STYLES.TIGHT_PASSIVE;
}
