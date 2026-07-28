import { existsSync, readFileSync } from "node:fs";

/**
 * How often the solver actually makes each bet the hero can face.
 *
 * A facing-bet pilot puts the player against ONE villain bet size, chosen from
 * the sizes the solver had available. Which one was chosen used to be decided by
 * whichever candidate produced the most lanes and the most range buckets - that
 * is, the richest-looking matrix - with nothing anywhere about how often the
 * villain actually bets it.
 *
 * Measured on the shipped packs, that put three of the six facing-bet rules
 * against a rare branch: one pinned a size the solver uses 4 percent of the time
 * while its real main size, used 41 percent, went untrained. A player practising
 * "facing a c-bet" was practising the exception.
 *
 * Frequencies come from the villain's own decision node, weighted by combos so a
 * hand class with six combinations counts for six.
 */

export interface VillainActionMix {
  /** Action label to combo-weighted frequency, summing to about 1. */
  byAction: Map<string, number>;
  combos: number;
}

interface ReviewFile {
  handClasses?: Record<string, {
    comboCount?: number;
    averageByAction?: Record<string, number>;
  }>;
}

/**
 * Read the villain's action mix from a strategy review of the node where they
 * act. Returns an empty mix when the review is missing or unreadable, so callers
 * fall back to their previous behaviour rather than failing.
 */
export function villainActionMix(reviewPath: string): VillainActionMix {
  const empty: VillainActionMix = { byAction: new Map(), combos: 0 };
  if (!existsSync(reviewPath)) return empty;
  let parsed: { files?: ReviewFile[] };
  try {
    parsed = JSON.parse(readFileSync(reviewPath, "utf8")) as { files?: ReviewFile[] };
  } catch {
    return empty;
  }

  const totals = new Map<string, number>();
  let combos = 0;
  for (const file of parsed.files ?? []) {
    for (const info of Object.values(file.handClasses ?? {})) {
      const count = Number(info.comboCount ?? 0);
      if (!Number.isFinite(count) || count <= 0) continue;
      combos += count;
      for (const [action, frequency] of Object.entries(info.averageByAction ?? {})) {
        const value = Number(frequency);
        if (!Number.isFinite(value)) continue;
        totals.set(action, (totals.get(action) ?? 0) + value * count);
      }
    }
  }
  if (combos === 0) return empty;

  const byAction = new Map<string, number>();
  for (const [action, weighted] of totals) byAction.set(action, weighted / combos);
  return { byAction, combos };
}

/** How often the villain makes this exact bet; 0 when unknown. */
export function villainBetFrequency(mix: VillainActionMix, betAction: string): number {
  return mix.byAction.get(betAction) ?? 0;
}

/** The bet the villain makes most often, ignoring checks; null when none. */
export function dominantVillainBet(mix: VillainActionMix): { action: string; frequency: number } | null {
  let best: { action: string; frequency: number } | null = null;
  for (const [action, frequency] of mix.byAction) {
    if (!action.startsWith("BET")) continue;
    if (best === null || frequency > best.frequency) best = { action, frequency };
  }
  return best;
}
