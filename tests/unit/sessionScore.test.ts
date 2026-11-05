import { describe, expect, it } from "vitest";

import {
  HOT_STREAK,
  emptySessionScore,
  isHit,
  isHotStreak,
  recordAnswer,
} from "../../src/core/sessionScore";

// The rule, asserted directly. Driving this through the UI would mean clicking
// buttons whose correctness is only revealed after the click, so a DOM test can
// observe what happened but cannot check what should happen.

const play = (results: boolean[]) => results.reduce(recordAnswer, emptySessionScore());

describe("session score", () => {
  it("counts a run of hits", () => {
    const score = play([true, true, true]);
    expect(score).toEqual({ answered: 3, correct: 3, streak: 3, bestStreak: 3 });
  });

  it("resets the streak on a miss but keeps the tally", () => {
    const score = play([true, true, false]);
    expect(score.streak).toBe(0);
    // A miss must not erase the evidence that anything was played, or the
    // scoreboard would tell a player they have done nothing this session.
    expect(score.answered).toBe(3);
    expect(score.correct).toBe(2);
  });

  it("remembers the best streak after it is broken", () => {
    const score = play([true, true, true, true, false, true]);
    expect(score.streak).toBe(1);
    expect(score.bestStreak).toBe(4);
  });

  it("lights up only from three, so the signal keeps meaning something", () => {
    expect(isHotStreak(play([true]))).toBe(false);
    expect(isHotStreak(play([true, true]))).toBe(false);
    expect(isHotStreak(play(Array(HOT_STREAK).fill(true)))).toBe(true);
    // And goes out the moment it is broken.
    expect(isHotStreak(play([true, true, true, false]))).toBe(false);
  });

  it("treats an equivalent or acceptable answer as a hit", () => {
    // The verdict already tells the player these were fine. Breaking their
    // streak for one would have the trainer contradict itself on screen.
    expect(isHit(false, "EQUIVALENT")).toBe(true);
    expect(isHit(false, "ACCEPTABLE")).toBe(true);
    expect(isHit(false, "MISTAKE")).toBe(false);
    expect(isHit(false, undefined)).toBe(false);
    expect(isHit(true, "MISTAKE")).toBe(true);
  });

  it("never lets the tally disagree with itself", () => {
    let score = emptySessionScore();
    for (const hit of [true, false, true, true, false, true, true, true]) {
      score = recordAnswer(score, hit);
      expect(score.correct).toBeLessThanOrEqual(score.answered);
      expect(score.streak).toBeLessThanOrEqual(score.bestStreak);
      expect(score.bestStreak).toBeLessThanOrEqual(score.correct);
    }
  });
});
