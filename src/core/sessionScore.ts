import type { ActionEvOutcome } from "./actionEv";

/**
 * How the current run is going: a streak, a tally, and nothing persisted.
 *
 * The trainer graded every answer and then forgot it until the dashboard, so a
 * player working through spots had nothing in front of them that moved - which
 * is the difference between practising and playing. The streak is the part that
 * pulls, because it is the number you do not want to reset. The tally is what
 * keeps it honest: a streak alone hides a bad session, and a trainer that only
 * shows you your best moment is flattering you rather than teaching you.
 *
 * Session-scoped on purpose. This is the run you are in, not your record; the
 * dashboard already owns the long view and reads from the stats store.
 *
 * Kept apart from the DOM because the rule - what counts as a hit, when a streak
 * survives - is worth asserting directly. Driving it through the UI would mean
 * clicking buttons whose correctness is only revealed after the click, which is
 * a test that can only observe what happened rather than check a rule.
 */

export interface SessionScore {
  answered: number;
  correct: number;
  streak: number;
  bestStreak: number;
}

/** The streak at which the display is worth lighting up. */
export const HOT_STREAK = 3;

export function emptySessionScore(): SessionScore {
  return { answered: 0, correct: 0, streak: 0, bestStreak: 0 };
}

/**
 * Fold one graded answer into the score.
 *
 * Returns a new value rather than mutating, so a caller cannot half-apply an
 * answer and leave the tally disagreeing with the streak.
 */
export function recordAnswer(score: SessionScore, hit: boolean): SessionScore {
  const streak = hit ? score.streak + 1 : 0;
  return {
    answered: score.answered + 1,
    correct: score.correct + (hit ? 1 : 0),
    streak,
    bestStreak: Math.max(score.bestStreak, streak),
  };
}

/**
 * Whether the streak has earned its highlight.
 *
 * Three, not one. Celebrating the first correct answer of a session spends the
 * signal before it means anything, and a player who sees it every other spot
 * stops reading it.
 */
export function isHotStreak(score: SessionScore): boolean {
  return score.streak >= HOT_STREAK;
}

/**
 * What counts as a hit.
 *
 * Not the same as "the chart's first choice". When the EV comparison calls two
 * actions equivalent or the second one acceptable, the grader already says so in
 * the verdict, and the scoreboard has to agree - otherwise the trainer tells a
 * player their answer was fine and then breaks their streak for it.
 */
export function isHit(
  correct: boolean,
  outcome?: ActionEvOutcome,
): boolean {
  return correct || outcome === "EQUIVALENT" || outcome === "ACCEPTABLE";
}
