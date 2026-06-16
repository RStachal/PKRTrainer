import { describe, expect, it } from "vitest";

import {
  buildRiverProductionCoverageReport,
  renderRiverProductionCoverageReport,
  validateRiverProductionRule,
  validateRiverProductionStrategyPack,
  type RiverProductionStrategyRule,
  type RiverProductionStrategyPack,
} from "../../src/data/ranges/riverProductionStrategyPack";

function pack(confidence: "LOW" | "MEDIUM" = "MEDIUM"): RiverProductionStrategyPack {
  return {
    id: "mtt-full-ring-9-river-production-fixture-v1",
    version: "fixture-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence,
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned river fixture.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "RIVER",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence: [
      {
        url: "https://example.test/river-owned",
        verifiedAt: "2026-06-11",
        operator: "PKRTrainer",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "RIVER",
        evModel: "CHIP_EV",
        methodology: "Owned fixture.",
        licenseNote: "Owned export fixture.",
      },
      {
        url: "https://example.test/river-review",
        verifiedAt: "2026-06-11",
        operator: "PKRTrainer Review",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "RIVER",
        evModel: "CHIP_EV",
        methodology: "Independent fixture review.",
        licenseNote: "Review fixture.",
      },
    ],
    assumptions: ["River production fixture."],
    rules: [
      {
        id: "river-btn-bb-blank-value",
        actionNode: "RIVER_PRESSURE",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorTurnAction: "BET_SMALL",
        riverRunoutClasses: ["BLANK"],
        blockerRelevance: "HIGH",
        sprMin: 1,
        sprMax: 8,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_BIG",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "polar value",
            action: "BET_BIG",
            handClasses: ["AA"],
            features: ["top value"],
            blockerRelevance: "LOW",
          },
          {
            lane: "BLUFF",
            label: "blocker bluff",
            action: "BET_BIG",
            handClasses: ["QJs"],
            features: ["blocker candidate"],
            blockerRelevance: "HIGH",
          },
          {
            lane: "CHECK",
            label: "showdown",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["give up"],
            blockerRelevance: "LOW",
          },
        ],
        explanation: "Synthetic river fixture prefers polar pressure on blank river.",
      },
    ],
  };
}

describe("riverProductionStrategyPack", () => {
  it("validuje river production schema a reportuje coverage mezery", () => {
    const coverage = buildRiverProductionCoverageReport(pack());

    expect(validateRiverProductionStrategyPack(pack())).toEqual([]);
    expect(coverage.productionReady).toBe(false);
    expect(coverage.potTypes).toEqual(["SINGLE_RAISED"]);
    expect(coverage.riverRunoutClasses).toEqual(["BLANK"]);
    expect(coverage.blockerRelevance).toEqual(["LOW", "HIGH"]);
    expect(coverage.missingPotTypes).toEqual(["THREE_BET_POT"]);
    expect(renderRiverProductionCoverageReport(pack(), coverage)).toContain(
      "River production StrategyPack: mtt-full-ring-9-river-production-fixture-v1",
    );
  });

  it("blokuje LOW confidence a nelegalni exact frequency", () => {
    const low = pack("LOW");
    const withExact = {
      ...low,
      licenseKind: "PUBLIC_CHART_WITH_PERMISSION" as const,
      confidence: "MEDIUM" as const,
      rules: [
        {
          ...low.rules[0],
          rangeBuckets: [
            {
              ...low.rules[0].rangeBuckets[0],
              actionMix: [
                { action: "BET_BIG" as const, frequencyPct: 100, visibility: "EXACT" as const },
              ],
            },
            ...low.rules[0].rangeBuckets.slice(1),
          ],
        },
      ],
    };

    expect(validateRiverProductionStrategyPack(low)).toContain(
      "River production pack cannot have LOW confidence.",
    );
    expect(validateRiverProductionStrategyPack(withExact)).toContain(
      "river-btn-bb-blank-value: range bucket polar value exact actionMix frequencies require owned export or explicit written permission.",
    );
  });

  it("blokuje facing-bet akce v river pressure production nodu", () => {
    const base = pack().rules[0];
    const rule = {
      ...base,
      priorTurnAction: "FOLD",
      actions: ["CHECK", "BET_SMALL", "BET_BIG", "FOLD"],
      recommendedAction: "FOLD",
      rangeBuckets: [
        {
          ...base.rangeBuckets[0],
          action: "FOLD",
          actionMix: [
            { action: "FOLD", frequencyPct: 100, visibility: "EXACT" },
          ],
        },
        ...base.rangeBuckets.slice(1),
      ],
    } satisfies RiverProductionStrategyRule;

    const errors = validateRiverProductionRule(rule, { exactFrequencyAllowed: true });

    expect(errors).toContain(
      "river-btn-bb-blank-value: priorTurnAction FOLD is not valid for RIVER_PRESSURE.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-value: action FOLD is not valid for RIVER_PRESSURE.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-value: recommendedAction FOLD is not valid for RIVER_PRESSURE.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-value: range bucket polar value action FOLD is not valid for RIVER_PRESSURE.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-value: range bucket polar value actionMix uses action FOLD outside RIVER_PRESSURE.",
    );
  });

  it("povoli facing-bet akce jen v river facing-bet production nodu", () => {
    const base = {
      ...pack().rules[0],
      id: "river-btn-bb-blank-facing-call",
      actionNode: "RIVER_FACING_BET",
      actions: ["FOLD", "CALL", "RAISE"],
      recommendedAction: "CALL",
      rangeBuckets: [
        {
          ...pack().rules[0].rangeBuckets[0],
          label: "value continue",
          action: "RAISE",
          actionMix: [
            { action: "RAISE", frequencyPct: 40, visibility: "EXACT" },
            { action: "CALL", frequencyPct: 60, visibility: "EXACT" },
          ],
        },
        {
          ...pack().rules[0].rangeBuckets[1],
          label: "bluff raise",
          action: "RAISE",
        },
        {
          ...pack().rules[0].rangeBuckets[2],
          label: "fold lane",
          action: "FOLD",
        },
      ],
    } satisfies RiverProductionStrategyRule;
    const invalid = {
      ...base,
      actions: ["FOLD", "CALL", "RAISE", "BET_SMALL"],
      recommendedAction: "BET_SMALL",
      rangeBuckets: [
        {
          ...base.rangeBuckets[0],
          action: "BET_SMALL",
          actionMix: [
            { action: "BET_SMALL", frequencyPct: 100, visibility: "EXACT" },
          ],
        },
        ...base.rangeBuckets.slice(1),
      ],
    } satisfies RiverProductionStrategyRule;

    const validErrors = validateRiverProductionRule(base, { exactFrequencyAllowed: true });
    const errors = validateRiverProductionRule(invalid, { exactFrequencyAllowed: true });

    expect(validErrors).toEqual([]);
    expect(errors).toContain(
      "river-btn-bb-blank-facing-call: action BET_SMALL is not valid for RIVER_FACING_BET.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-facing-call: recommendedAction BET_SMALL is not valid for RIVER_FACING_BET.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-facing-call: range bucket value continue action BET_SMALL is not valid for RIVER_FACING_BET.",
    );
    expect(errors).toContain(
      "river-btn-bb-blank-facing-call: range bucket value continue actionMix uses action BET_SMALL outside RIVER_FACING_BET.",
    );
  });

  it("vyzaduje MTT gameVariant pro river production pack", () => {
    const cashPack = {
      ...pack(),
      dimensions: {
        ...pack().dimensions,
        gameVariant: "CASH",
      },
    } satisfies RiverProductionStrategyPack;

    expect(validateRiverProductionStrategyPack(cashPack)).toContain(
      "River production pack must use gameVariant MTT.",
    );
  });
});
