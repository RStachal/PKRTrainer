import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assessPinDrift,
  assessPinDriftForAction,
  pinnedBetActionFromRuleId,
  renderPinDrift,
} from "../../scripts/lib/facingBetPinDrift.mts";

// A facing-bet pilot trains one villain bet size, pinned from a previous run
// rather than re-derived, so a pin can be right when made and wrong later with
// nothing to say so.
//
// The refusal to judge a tree-mixing family is the point of this module, not a
// detail. A first attempt at this measurement was taken on reduced-tree data and
// produced a confident wrong answer - it named three shipped rules as training a
// rare branch, and re-measuring on full-tree data showed four of six pins were
// the most-used bet all along.

let dir: string | null = null;

function villainReview(mix: Record<string, number>): string {
  dir ??= mkdtempSync(join(tmpdir(), "pkrtrainer-pin-drift-"));
  const path = join(dir, `review-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({
    files: [{ handClasses: { AA: { comboCount: 100, averageByAction: mix } } }],
  }), "utf8");
  return path;
}

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const RULE = "mtt9_100bb_btn_bb_srp_facing_highspr-check-bet_17-aggregate";

describe("facing-bet pin drift", () => {
  it("reads the pinned size out of the rule id", () => {
    expect(pinnedBetActionFromRuleId(RULE)).toBe("BET_17");
    expect(pinnedBetActionFromRuleId("mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate"))
      .toBe("BET_39");
  });

  it("ignores a rule that is not a facing-bet rule", () => {
    // C-bet rules have no villain size to drift.
    expect(pinnedBetActionFromRuleId("mtt9_50bb_btn_bb_srp-check-aggregate")).toBeNull();
    expect(assessPinDrift({
      ruleId: "mtt9_50bb_btn_bb_srp-check-aggregate",
      familyId: "MTT9_50BB_BTN_BB_SRP",
      villainReviewPath: villainReview({ BET_17: 1 }),
      familyMixesTrees: false,
    })).toBeNull();
  });

  it("accepts a pin that is the villain's most-used bet", () => {
    const row = assessPinDrift({
      ruleId: RULE,
      familyId: "F",
      villainReviewPath: villainReview({ CHECK: 0.4, BET_17: 0.35, BET_25: 0.25 }),
      familyMixesTrees: false,
    });
    expect(row).toMatchObject({ verdict: "ON_TOP_BET", topAction: "BET_17" });
    // Checking is the most common action overall but is not a bet the hero faces.
    expect(row?.pinnedFrequency).toBeCloseTo(0.35, 5);
  });

  it("reports a pin the villain has moved away from", () => {
    const row = assessPinDrift({
      ruleId: RULE,
      familyId: "F",
      villainReviewPath: villainReview({ CHECK: 0.5, BET_17: 0.14, BET_25: 0.36 }),
      familyMixesTrees: false,
    });
    expect(row).toMatchObject({ verdict: "DRIFTED", topAction: "BET_25" });
    expect(renderPinDrift([row!])).toContain("BET_25 is used 36.0%");
  });

  it("refuses to judge a family whose boards still span both trees", () => {
    // This is the guard against repeating the original mistake. The mix here
    // would read as a clear drift, and it must still not be reported as one.
    const row = assessPinDrift({
      ruleId: RULE,
      familyId: "F",
      villainReviewPath: villainReview({ BET_17: 0.04, BET_25: 0.9 }),
      familyMixesTrees: true,
    });
    expect(row?.verdict).toBe("UNJUDGED");
    expect(row?.topAction).toBeNull();
    expect(renderPinDrift([row!])).toContain("still mixes two trees");
  });

  it("says so when there is no villain data at all", () => {
    const row = assessPinDrift({
      ruleId: RULE,
      familyId: "F",
      villainReviewPath: join(tmpdir(), "absent.json"),
      familyMixesTrees: false,
    });
    expect(row?.verdict).toBe("NO_DATA");
  });

  it("judges a pin that no shipped rule carries", () => {
    // A family can be rebuilt while shipping nothing, and those are the pins
    // nobody looks at. One was pinned to a size used under one percent - the
    // degenerate overbet the pinning was introduced to avoid - and deriving the
    // pin from shipped rule ids alone could never see it.
    const row = assessPinDriftForAction({
      familyId: "MTT9_80BB_CO_BTN_3BP_MIDSPR",
      pinnedAction: "BET_600",
      villainReviewPath: villainReview({ CHECK: 0.31, BET_79: 0.36, BET_39: 0.32, BET_600: 0.01 }),
      familyMixesTrees: false,
    });

    expect(row.verdict).toBe("DRIFTED");
    expect(row.pinnedAction).toBe("BET_600");
    expect(row.topAction).toBe("BET_79");
    expect(row.pinnedFrequency).toBeCloseTo(0.01, 5);
  });

  it("still refuses to judge a plan pin from a tree-mixing family", () => {
    expect(assessPinDriftForAction({
      familyId: "F",
      pinnedAction: "BET_39",
      villainReviewPath: villainReview({ BET_39: 0.04, BET_52: 0.4 }),
      familyMixesTrees: true,
    }).verdict).toBe("UNJUDGED");
  });

  it("summarises without claiming an unjudged rule is fine", () => {
    const judged = assessPinDrift({
      ruleId: RULE,
      familyId: "F",
      villainReviewPath: villainReview({ BET_17: 0.5, BET_25: 0.2 }),
      familyMixesTrees: false,
    })!;
    const unjudged = assessPinDrift({
      ruleId: "mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate",
      familyId: "G",
      villainReviewPath: villainReview({ BET_39: 0.04 }),
      familyMixesTrees: true,
    })!;

    const rendered = renderPinDrift([judged, unjudged]);
    expect(rendered).toContain("Every judged pin is the villain's most-used bet");
    // The count of unjudged rules has to survive into the summary, or a reader
    // takes "all fine" to cover rules nobody actually checked.
    expect(rendered).toContain("(1 not judged)");
  });
  it("separates a pin on a rare branch from one where no size dominates", () => {
    // The real shipped case: the villain checks half the time and splits the rest
    // three ways, so BET_17 is not the top bet and is also not rare. Reporting it
    // the same as a genuinely rare pin would make a cosmetic re-pin look like a
    // correctness win, and would hold a release for a number that barely moves.
    const split = assessPinDrift({
      ruleId: RULE,
      familyId: "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
      villainReviewPath: villainReview({
        CHECK: 0.508, BET_25: 0.178, BET_38: 0.173, BET_17: 0.141,
      }),
      familyMixesTrees: false,
    })!;

    expect(split.verdict).toBe("DRIFTED");
    expect(split.betSizingIsSplit).toBe(true);
    expect(Math.round(split.topShareOfBets * 100)).toBe(36);
    expect(renderPinDrift([split])).toContain("no size carries a majority");

    const rare = assessPinDrift({
      ruleId: RULE,
      familyId: "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
      villainReviewPath: villainReview({
        CHECK: 0.3, BET_25: 0.62, BET_17: 0.08,
      }),
      familyMixesTrees: false,
    })!;

    expect(rare.verdict).toBe("DRIFTED");
    expect(rare.betSizingIsSplit).toBe(false);
    expect(renderPinDrift([rare])).not.toContain("no size carries a majority");
  });
});
