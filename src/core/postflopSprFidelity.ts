/**
 * How close the SPR a player is shown sits to the SPR the strategy was solved at.
 *
 * Every pilot family was solved at a single SPR, but a rule matches a whole band,
 * so a spot can be shown strategy computed at a different stack depth than it
 * displays. That is usually harmless - most buckets land within about 1.3x of a
 * solved SPR - but a few are far off: a three-bet pot at SPR 0.3 shown a solve at
 * 1.8 is effectively committed while the solve was not, and the correct line
 * barely resembles it. The band alone cannot express this, because the band is
 * wide by construction; only the distance to the actual solved point can.
 *
 * This is a pure measurement. It decides nothing about whether to show or hide a
 * recommendation - that is a separate policy - it only makes the distance
 * available so the rest of the app can surface or act on it.
 */

export type SprFidelityBand = "MATCH" | "STRETCHED" | "MISMATCH";

export interface SprFidelity {
  /** SPR of the spot as the player sees it: effective stack over pot. */
  shownSpr: number;
  /** SPR the matched family was actually solved at. */
  solvedSpr: number;
  /** max(shown, solved) / min(shown, solved); always >= 1. */
  ratio: number;
  band: SprFidelityBand;
}

// Chosen to match the measured spread rather than an arbitrary round number.
// Single-raised buckets mostly land within 1.28x of a solved SPR, so 1.3x is the
// "same game" boundary; the three-bet gaps that matter begin at 1.5x.
const MATCH_MAX_RATIO = 1.3;
const STRETCHED_MAX_RATIO = 1.5;

export function assessSprFidelity(
  shownSpr: number,
  solvedSpr: number,
): SprFidelity | null {
  if (
    !Number.isFinite(shownSpr) ||
    !Number.isFinite(solvedSpr) ||
    shownSpr <= 0 ||
    solvedSpr <= 0
  ) {
    return null;
  }

  const ratio = Math.max(shownSpr, solvedSpr) / Math.min(shownSpr, solvedSpr);
  const rounded = Math.round(ratio * 100) / 100;
  const band: SprFidelityBand = rounded <= MATCH_MAX_RATIO
    ? "MATCH"
    : rounded <= STRETCHED_MAX_RATIO
      ? "STRETCHED"
      : "MISMATCH";

  return { shownSpr, solvedSpr, ratio: rounded, band };
}
