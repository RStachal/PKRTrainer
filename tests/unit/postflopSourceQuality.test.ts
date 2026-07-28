import { describe, expect, it } from "vitest";

import {
  breakdownPostflopStats,
  type PostflopStatsV2BridgeRecord,
} from "../../src/persistence/postflopResultRecord";

// The dashboard's "By production status" breakdown tells a player how much of
// their measured progress rests on real solver content. It used to decide that
// from `confidence`, a quality label the pack author sets, rather than from
// provenance, which is the structural fact of where the content came from. The
// public heuristic packs carry LOW today, so the answer came out right - but only
// by coincidence. Raising one to MEDIUM would have started counting heuristic
// answers as PRODUCTION in the player's own statistics.

function bridgeRecord(
  overrides: Partial<PostflopStatsV2BridgeRecord>,
): PostflopStatsV2BridgeRecord {
  return {
    schema: "postflop_stats_v2_bridge_v1",
    schemaVersion: 1,
    qid: "q1",
    correct: true,
    ts: 1,
    profileId: "p",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    blindSpeed: "REGULAR",
    street: "FLOP",
    evModel: "CHIP_EV",
    ante: "OFF",
    rakeMode: "NONE",
    actionNode: "SINGLE_RAISED_POT_CBET",
    potType: "SINGLE_RAISED",
    boardTextureKey: "dry",
    heroPosition: "BTN",
    villainPosition: "BB",
    positionPattern: "BTN_VS_BB",
    chosen: "CHECK",
    recommended: "CHECK",
    strategyPackId: "pack",
    strategyRuleId: "rule",
    confidence: "HIGH",
    ...overrides,
  } as PostflopStatsV2BridgeRecord;
}

function qualityOf(record: PostflopStatsV2BridgeRecord): string {
  const groups = breakdownPostflopStats([record], "sourceQuality");
  expect(groups).toHaveLength(1);
  return groups[0].key;
}

describe("postflop source quality", () => {
  it("never counts heuristic content as production, however confident the pack", () => {
    // The defect this guards: confidence alone would have called this PRODUCTION.
    for (const confidence of ["LOW", "MEDIUM", "HIGH"] as const) {
      expect(qualityOf(bridgeRecord({ confidence, strategyProvenance: "PUBLIC_HEURISTIC" })), confidence)
        .toBe("HEURISTIC");
    }
  });

  it("grades solver-backed content by its confidence", () => {
    expect(qualityOf(bridgeRecord({ confidence: "HIGH", strategyProvenance: "SOLVER_BACKED" })))
      .toBe("PRODUCTION");
    expect(qualityOf(bridgeRecord({ confidence: "MEDIUM", strategyProvenance: "SOLVER_BACKED" })))
      .toBe("PRODUCTION");
    expect(qualityOf(bridgeRecord({ confidence: "LOW", strategyProvenance: "SOLVER_BACKED" })))
      .toBe("PREVIEW");
  });

  it("leaves records written before provenance was stored classified as they were", () => {
    // Reinterpreting history on a guess would silently rewrite a player's past
    // statistics, so an absent provenance keeps the old confidence-based answer.
    expect(qualityOf(bridgeRecord({ confidence: "HIGH" }))).toBe("PRODUCTION");
    expect(qualityOf(bridgeRecord({ confidence: "LOW" }))).toBe("PREVIEW");
    expect(qualityOf(bridgeRecord({ confidence: "HIGH", strategyProvenance: null })))
      .toBe("PRODUCTION");
  });

  it("still calls an answer with no pack behind it a fallback", () => {
    expect(qualityOf(bridgeRecord({ strategyPackId: null }))).toBe("FALLBACK");
    expect(qualityOf(bridgeRecord({ confidence: null }))).toBe("FALLBACK");
    // Even when provenance says heuristic: no pack means the generator's own model.
    expect(qualityOf(bridgeRecord({ strategyPackId: null, strategyProvenance: "PUBLIC_HEURISTIC" })))
      .toBe("FALLBACK");
  });

  it("separates the populations when both are present", () => {
    const groups = breakdownPostflopStats([
      bridgeRecord({ qid: "a", confidence: "HIGH", strategyProvenance: "SOLVER_BACKED", correct: true }),
      bridgeRecord({ qid: "b", confidence: "HIGH", strategyProvenance: "PUBLIC_HEURISTIC", correct: false }),
    ], "sourceQuality");

    const byKey = new Map(groups.map((group) => [group.key, group]));
    expect(byKey.get("PRODUCTION")).toMatchObject({ total: 1, correct: 1 });
    expect(byKey.get("HEURISTIC")).toMatchObject({ total: 1, correct: 0 });
  });
});
