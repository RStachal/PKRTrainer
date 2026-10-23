import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  dominantVillainBet,
  villainActionMix,
  villainBetFrequency,
} from "../../scripts/lib/villainBetFrequency.mts";

// A facing-bet pilot puts the player against ONE villain bet size. That size used
// to be picked by whichever candidate produced the richest-looking range matrix,
// with nothing about how often the villain actually bets it. Measured on the
// shipped packs that trained a 4-percent branch while the real 41-percent size
// went untrained.

let dir: string | null = null;

function review(files: unknown): string {
  dir ??= mkdtempSync(join(tmpdir(), "pkrtrainer-villain-mix-"));
  const path = join(dir, `review-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({ files }), "utf8");
  return path;
}

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("villain bet frequency", () => {
  it("weights each hand class by its combinations", () => {
    // A pair has 6 combos and a suited hand 4, so the pair must count for more.
    const path = review([{
      handClasses: {
        AA: { comboCount: 6, averageByAction: { CHECK: 1, BET_50: 0 } },
        AKs: { comboCount: 4, averageByAction: { CHECK: 0, BET_50: 1 } },
      },
    }]);
    const mix = villainActionMix(path);

    expect(mix.combos).toBe(10);
    expect(villainBetFrequency(mix, "CHECK")).toBeCloseTo(0.6, 5);
    expect(villainBetFrequency(mix, "BET_50")).toBeCloseTo(0.4, 5);
  });

  it("sums a hand class across every board of the family", () => {
    const path = review([
      { handClasses: { AA: { comboCount: 6, averageByAction: { BET_50: 1 } } } },
      { handClasses: { AA: { comboCount: 6, averageByAction: { BET_50: 0 } } } },
    ]);
    expect(villainBetFrequency(villainActionMix(path), "BET_50")).toBeCloseTo(0.5, 5);
  });

  it("names the most-bet size, ignoring checks", () => {
    // Checking is usually the single most common action, but it is not a bet the
    // hero can face, so it must never be offered as the size to train against.
    const path = review([{
      handClasses: {
        AA: {
          comboCount: 10,
          averageByAction: { CHECK: 0.6, BET_39: 0.04, BET_52: 0.36 },
        },
      },
    }]);
    const mix = villainActionMix(path);

    expect(dominantVillainBet(mix)).toMatchObject({ action: "BET_52" });
    // The shape that caused the defect: the pinned size is real but rare.
    expect(villainBetFrequency(mix, "BET_39")).toBeCloseTo(0.04, 5);
  });

  it("reports zero for a size the villain never uses", () => {
    const path = review([{ handClasses: { AA: { comboCount: 6, averageByAction: { CHECK: 1 } } } }]);
    expect(villainBetFrequency(villainActionMix(path), "BET_600")).toBe(0);
    expect(dominantVillainBet(villainActionMix(path))).toBeNull();
  });

  it("falls back to an empty mix rather than failing", () => {
    // Callers rank candidates with this; an unreadable review must degrade to the
    // previous behaviour, not break the harvest.
    expect(villainActionMix(join(tmpdir(), "does-not-exist.json")).combos).toBe(0);
    expect(villainActionMix(review("not-an-array")).combos).toBe(0);
  });

  it("ignores hand classes with no combinations", () => {
    // Card removal can leave a class with zero combos on a board; it must not
    // contribute a frequency as if it were played.
    const path = review([{
      handClasses: {
        AA: { comboCount: 0, averageByAction: { BET_50: 1 } },
        KK: { comboCount: 6, averageByAction: { CHECK: 1 } },
      },
    }]);
    const mix = villainActionMix(path);
    expect(mix.combos).toBe(6);
    expect(villainBetFrequency(mix, "BET_50")).toBe(0);
  });
});
