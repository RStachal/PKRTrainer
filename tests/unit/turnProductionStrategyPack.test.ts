import { describe, expect, it } from "vitest";

import type {
  PostflopAction,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../src/core/postflopGenerator";
import type { PostflopStrategySourceEvidence } from "../../src/data/ranges/postflopStrategyPack";
import {
  TURN_PRODUCTION_REQUIRED_CARD_CLASSES,
  TURN_PRODUCTION_REQUIRED_ACTION_NODES,
  TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  TURN_PRODUCTION_REQUIRED_POT_TYPES,
  TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS,
  TURN_PRODUCTION_REQUIRED_RANGE_LANES,
  buildTurnProductionCoverageReport,
  renderTurnProductionCoverageReport,
  validateTurnProductionRule,
  validateTurnProductionStrategyPack,
  type TurnProductionStrategyPack,
  type TurnProductionStrategyRule,
  type TurnProductionTurnCardClass,
} from "../../src/data/ranges/turnProductionStrategyPack";

const sourceEvidence: PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-turn-solver-export",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "TURN",
    evModel: "CHIP_EV",
    methodology: "Owned solver export fixture for turn production schema validation.",
    licenseNote: "Owned export; redistribution inside this project is permitted.",
  },
  {
    url: "https://example.test/turn-review",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "TURN",
    evModel: "CHIP_EV",
    methodology: "Independent review fixture; no third-party chart values copied.",
    licenseNote: "Review metadata for test fixture.",
  },
];

function productionRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  priorFlopAction: PostflopAction,
  turnCardClass: TurnProductionTurnCardClass,
): TurnProductionStrategyRule {
  return {
    id: `turn-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${priorFlopAction.toLowerCase()}-${turnCardClass.toLowerCase()}`,
    actionNode: "TURN_BARREL",
    potType,
    positionPattern,
    priorFlopAction,
    turnCardClasses: [turnCardClass],
    sprMin: potType === "SINGLE_RAISED" ? 1.5 : 0.8,
    sprMax: potType === "SINGLE_RAISED" ? 10 : 6,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    recommendedAction: turnCardClass === "DYNAMIC" ? "CHECK" : "BET_SMALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value",
        action: "BET_SMALL",
        handClasses: ["AA", "AKs"],
        features: ["top pair+", "overpair"],
        actionMix: [
          { action: "BET_SMALL", frequencyPct: 65, visibility: "EXACT" },
          { action: "CHECK", frequencyPct: 35, visibility: "EXACT" },
        ],
      },
      {
        lane: "BLUFF",
        label: "bluff",
        action: "BET_SMALL",
        handClasses: ["QJs", "JTs"],
        features: ["blocker", "draw"],
      },
      {
        lane: "CHECK",
        label: "check",
        action: "CHECK",
        handClasses: ["72o", "83o"],
        features: ["showdown value", "give-up"],
      },
    ],
    explanation: "Production turn fixture with prior flop action and turn card class.",
  };
}

function facingBetProductionRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  priorFlopAction: PostflopAction,
  turnCardClass: TurnProductionTurnCardClass,
): TurnProductionStrategyRule {
  return {
    id: `turn-facing-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${priorFlopAction.toLowerCase()}-${turnCardClass.toLowerCase()}`,
    actionNode: "TURN_FACING_BET",
    potType,
    positionPattern,
    priorFlopAction,
    turnCardClasses: [turnCardClass],
    sprMin: potType === "SINGLE_RAISED" ? 1.5 : 0.8,
    sprMax: potType === "SINGLE_RAISED" ? 10 : 6,
    actions: ["FOLD", "CALL", "RAISE"],
    recommendedAction: "CALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value continue",
        action: "RAISE",
        handClasses: ["AA", "AKs"],
        features: ["two pair+", "strong draw"],
        actionMix: [
          { action: "RAISE", frequencyPct: 35, visibility: "EXACT" },
          { action: "CALL", frequencyPct: 65, visibility: "EXACT" },
        ],
      },
      {
        lane: "BLUFF",
        label: "bluff raise",
        action: "RAISE",
        handClasses: ["QJs", "JTs"],
        features: ["blocker", "combo draw"],
      },
      {
        lane: "CHECK",
        label: "fold lane",
        action: "FOLD",
        handClasses: ["72o", "83o"],
        features: ["air", "dominated give-up"],
      },
    ],
    explanation: "Production turn facing-bet fixture with prior flop action and turn card class.",
  };
}

function productionPack(): TurnProductionStrategyPack {
  const rules: TurnProductionStrategyRule[] = [];
  for (const potType of TURN_PRODUCTION_REQUIRED_POT_TYPES) {
    for (const positionPattern of TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS) {
      for (const priorFlopAction of TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS) {
        for (const turnCardClass of TURN_PRODUCTION_REQUIRED_CARD_CLASSES) {
          rules.push(productionRule(potType, positionPattern, priorFlopAction, turnCardClass));
          rules.push(facingBetProductionRule(potType, positionPattern, priorFlopAction, turnCardClass));
        }
      }
    }
  }

  return {
    id: "mtt-full-ring-9-turn-production-fixture-v1",
    version: "production-fixture-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export generated for schema validation.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "TURN",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence,
    assumptions: [
      "Turn production schema fixture covers required pot types, positions, prior flop actions and turn card classes.",
    ],
    rules,
  };
}

describe("turnProductionStrategyPack", () => {
  it("definuje production schema vcetne prior flop action, turn card class a range lanes", () => {
    const pack = productionPack();
    const coverage = buildTurnProductionCoverageReport(pack);

    expect(validateTurnProductionStrategyPack(pack)).toEqual([]);
    expect(coverage.productionReady).toBe(true);
    expect(coverage.potTypes).toEqual(TURN_PRODUCTION_REQUIRED_POT_TYPES);
    expect(coverage.positionPatterns).toEqual(TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS);
    expect(coverage.priorFlopActions).toEqual(TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS);
    expect(coverage.turnCardClasses).toEqual(TURN_PRODUCTION_REQUIRED_CARD_CLASSES);
    expect(coverage.actionNodes).toEqual(TURN_PRODUCTION_REQUIRED_ACTION_NODES);
    expect(coverage.rangeLanes).toEqual(TURN_PRODUCTION_REQUIRED_RANGE_LANES);
    expect(coverage.missingPotTypes).toEqual([]);
    expect(coverage.missingPositionPatterns).toEqual([]);
    expect(coverage.missingPriorFlopActions).toEqual([]);
    expect(coverage.missingTurnCardClasses).toEqual([]);
    expect(coverage.missingActionNodes).toEqual([]);
    expect(coverage.missingRangeLanes).toEqual([]);
    expect(renderTurnProductionCoverageReport(pack, coverage)).toContain(
      "productionReady: true",
    );
    expect(renderTurnProductionCoverageReport(pack, coverage)).toContain(
      "missing turn card classes: none",
    );
    expect(renderTurnProductionCoverageReport(pack, coverage)).toContain(
      "range mix buckets:",
    );
  });

  it("odmita metadata-only turn vstup jako production strategii", () => {
    const pack = {
      ...productionPack(),
      confidence: "LOW",
      licenseKind: "PUBLIC_METADATA_ONLY",
      sourceEvidence: sourceEvidence.slice(0, 1),
      rules: [
        {
          ...productionRule("SINGLE_RAISED", "BTN_VS_BB", "BET_SMALL", "BLANK"),
          actions: ["CHECK"],
          recommendedAction: "BET_SMALL",
          priorFlopAction: "NOT_ACTION" as PostflopAction,
          turnCardClasses: ["NOT_A_TURN" as TurnProductionTurnCardClass],
          rangeBuckets: [
            {
              lane: "VALUE",
              label: "value",
              action: "BET_SMALL",
              handClasses: ["not-a-hand"],
              features: [],
              actionMix: [
                { action: "BET_BIG", frequencyPct: 80, visibility: "EXACT" },
                { action: "BET_BIG", frequencyPct: 40, visibility: "EXACT" },
              ],
            },
          ],
        },
      ],
    } satisfies TurnProductionStrategyPack;
    const errors = validateTurnProductionStrategyPack(pack);
    const coverage = buildTurnProductionCoverageReport(pack);

    expect(errors).toContain("Turn production pack cannot have LOW confidence.");
    expect(errors).toContain(
      "Turn production pack needs owned export, public permission, or explicit written permission.",
    );
    expect(errors).toContain("Turn production pack needs at least two source evidence entries.");
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: priorFlopAction is invalid.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: invalid turnCardClass NOT_A_TURN.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: recommendedAction must be present in actions.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: range bucket value uses an unavailable action.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: range bucket value actionMix duplicates BET_BIG.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: range bucket value exact actionMix frequencies require owned export or explicit written permission.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: range bucket value contains invalid hand not-a-hand.",
    );
    expect(errors).toContain("turn-single_raised-btn_vs_bb-bet_small-blank: missing BLUFF range lane.");
    expect(errors).toContain("turn-single_raised-btn_vs_bb-bet_small-blank: missing CHECK range lane.");
    expect(coverage.productionReady).toBe(false);
    expect(coverage.missingPotTypes).toEqual(["THREE_BET_POT"]);
    expect(coverage.missingPriorFlopActions).toEqual(["CHECK", "BET_SMALL", "BET_BIG"]);
    expect(coverage.missingTurnCardClasses).toEqual(TURN_PRODUCTION_REQUIRED_CARD_CLASSES);
    expect(renderTurnProductionCoverageReport(pack, coverage)).toContain(
      "missing prior flop actions: CHECK,BET_SMALL,BET_BIG",
    );
    expect(renderTurnProductionCoverageReport(pack, coverage)).toContain("errors:");
  });

  it("blokuje facing-bet akce v turn barrel production nodu", () => {
    const base = productionRule("SINGLE_RAISED", "BTN_VS_BB", "BET_SMALL", "BLANK");
    const rule = {
      ...base,
      priorFlopAction: "CALL",
      actions: ["CHECK", "BET_SMALL", "BET_BIG", "RAISE"],
      recommendedAction: "RAISE",
      rangeBuckets: [
        {
          ...base.rangeBuckets[0],
          action: "RAISE",
          actionMix: [
            { action: "RAISE", frequencyPct: 100, visibility: "EXACT" },
          ],
        },
        ...base.rangeBuckets.slice(1),
      ],
    } satisfies TurnProductionStrategyRule;

    const errors = validateTurnProductionRule(rule, { exactFrequencyAllowed: true });

    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: priorFlopAction CALL is not valid for TURN_BARREL.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: action RAISE is not valid for TURN_BARREL.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: recommendedAction RAISE is not valid for TURN_BARREL.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: range bucket value action RAISE is not valid for TURN_BARREL.",
    );
    expect(errors).toContain(
      "turn-single_raised-btn_vs_bb-bet_small-blank: range bucket value actionMix uses action RAISE outside TURN_BARREL.",
    );
  });

  it("povoli facing-bet akce jen v turn facing-bet production nodu", () => {
    const base = facingBetProductionRule("SINGLE_RAISED", "BTN_VS_BB", "BET_SMALL", "BLANK");
    const validErrors = validateTurnProductionRule(base, { exactFrequencyAllowed: true });
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
    } satisfies TurnProductionStrategyRule;

    const errors = validateTurnProductionRule(invalid, { exactFrequencyAllowed: true });

    expect(validErrors).toEqual([]);
    expect(errors).toContain(
      "turn-facing-single_raised-btn_vs_bb-bet_small-blank: action BET_SMALL is not valid for TURN_FACING_BET.",
    );
    expect(errors).toContain(
      "turn-facing-single_raised-btn_vs_bb-bet_small-blank: recommendedAction BET_SMALL is not valid for TURN_FACING_BET.",
    );
    expect(errors).toContain(
      "turn-facing-single_raised-btn_vs_bb-bet_small-blank: range bucket value continue action BET_SMALL is not valid for TURN_FACING_BET.",
    );
    expect(errors).toContain(
      "turn-facing-single_raised-btn_vs_bb-bet_small-blank: range bucket value continue actionMix uses action BET_SMALL outside TURN_FACING_BET.",
    );
  });

  it("vyzaduje MTT gameVariant pro turn production pack", () => {
    const pack = {
      ...productionPack(),
      dimensions: {
        ...productionPack().dimensions,
        gameVariant: "CASH",
      },
    } satisfies TurnProductionStrategyPack;

    expect(validateTurnProductionStrategyPack(pack)).toContain(
      "Turn production pack must use gameVariant MTT.",
    );
  });
});
