import { describe, expect, it } from "vitest";

import type {
  BoardTexture,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../src/core/postflopGenerator";
import {
  FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  FLOP_PRODUCTION_REQUIRED_POT_TYPES,
  FLOP_PRODUCTION_REQUIRED_RANGE_LANES,
  FLOP_PRODUCTION_REQUIRED_SPR_BANDS,
  FLOP_PRODUCTION_REQUIRED_TEXTURES,
  buildFlopProductionCoverageReport,
  renderFlopProductionCoverageReport,
  validateFlopProductionRule,
  validateFlopProductionStrategyPack,
  type FlopProductionStrategyPack,
  type FlopProductionStrategyRule,
} from "../../src/data/ranges/flopProductionStrategyPack";
import type { PostflopStrategySourceEvidence } from "../../src/data/ranges/postflopStrategyPack";

const sourceEvidence: PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-flop-solver-export",
    verifiedAt: "2026-06-04",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Owned solver export fixture for production schema validation.",
    licenseNote: "Owned export; redistribution inside this project is permitted.",
  },
  {
    url: "https://example.test/flop-review",
    verifiedAt: "2026-06-04",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Independent review fixture; no third-party chart values copied.",
    licenseNote: "Review metadata for test fixture.",
  },
];

function productionRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  texture: BoardTexture,
): FlopProductionStrategyRule {
  const actionNode = potType === "SINGLE_RAISED"
    ? "SINGLE_RAISED_POT_CBET"
    : "THREE_BET_POT_CBET";
  return {
    id: `flop-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${texture}`,
    actionNode,
    potType,
    positionPattern,
    boardTextures: [texture],
    sprMin: potType === "SINGLE_RAISED" ? 2 : 1,
    sprMax: potType === "SINGLE_RAISED" ? 12 : 8,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    recommendedAction: "BET_SMALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value",
        action: "BET_SMALL",
        handClasses: ["AA", "AKs"],
        features: ["top pair+", "overpair"],
        weightPct: 45,
        actionMix: [
          { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
          { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
        ],
      },
      {
        lane: "BLUFF",
        label: "bluff",
        action: "BET_SMALL",
        handClasses: ["QJs", "JTs"],
        features: ["backdoor equity", "draw"],
        weightPct: 25,
      },
      {
        lane: "CHECK",
        label: "check",
        action: "CHECK",
        handClasses: ["72o", "83o"],
        features: ["air", "weak showdown"],
        weightPct: 30,
      },
    ],
    explanation: "Production fixture rule with explicit range lanes.",
  };
}

function productionPack(): FlopProductionStrategyPack {
  const rules: FlopProductionStrategyRule[] = [];
  for (const potType of FLOP_PRODUCTION_REQUIRED_POT_TYPES) {
    for (const positionPattern of FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS) {
      for (const texture of FLOP_PRODUCTION_REQUIRED_TEXTURES) {
        rules.push(productionRule(potType, positionPattern, texture));
      }
    }
  }

  return {
    id: "mtt-full-ring-9-flop-production-fixture-v1",
    version: "production-fixture-v1",
    createdAt: "2026-06-04",
    verifiedAt: "2026-06-04",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export generated for schema validation.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence,
    assumptions: [
      "MTT full-ring flop chipEV production schema fixture.",
      "Rules cover SRP and 3bet pot placeholders for validator coverage.",
    ],
    rules,
  };
}

describe("flopProductionStrategyPack", () => {
  it("definuje production schema vcetne range lanes a coverage reportu", () => {
    const pack = productionPack();
    const coverage = buildFlopProductionCoverageReport(pack);

    expect(validateFlopProductionStrategyPack(pack)).toEqual([]);
    expect(coverage.productionReady).toBe(true);
    expect(coverage.potTypes).toEqual(FLOP_PRODUCTION_REQUIRED_POT_TYPES);
    expect(coverage.positionPatterns).toEqual(FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS);
    expect(coverage.boardTextures).toEqual(FLOP_PRODUCTION_REQUIRED_TEXTURES);
    expect(coverage.sprBands).toEqual(FLOP_PRODUCTION_REQUIRED_SPR_BANDS);
    expect(coverage.rangeLanes).toEqual(FLOP_PRODUCTION_REQUIRED_RANGE_LANES);
    expect(coverage.missingPotTypes).toEqual([]);
    expect(coverage.missingPositionPatterns).toEqual([]);
    expect(coverage.missingBoardTextures).toEqual([]);
    expect(coverage.missingSprBands).toEqual([]);
    expect(coverage.missingActionNodes).toEqual([]);
    expect(coverage.missingRangeLanes).toEqual([]);
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "productionReady: true",
    );
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "SPR bands: LOW,MID,HIGH",
    );
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "missing pot types: none",
    );
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "missing SPR bands: none",
    );
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "range mix buckets:",
    );
  });

  it("odmita metadata-only heuristic vstup jako production strategii", () => {
    const pack = {
      ...productionPack(),
      confidence: "LOW",
      licenseKind: "PUBLIC_METADATA_ONLY",
      sourceEvidence: sourceEvidence.slice(0, 1),
      rules: [
        {
          ...productionRule("SINGLE_RAISED", "BTN_VS_BB", "dry"),
          sprMin: 4,
          sprMax: 7,
          actions: ["CHECK"],
          recommendedAction: "BET_SMALL",
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
    } satisfies FlopProductionStrategyPack;
    const errors = validateFlopProductionStrategyPack(pack);
    const coverage = buildFlopProductionCoverageReport(pack);

    expect(errors).toContain("Flop production pack cannot have LOW confidence.");
    expect(errors).toContain(
      "Flop production pack needs owned export, public permission, or explicit written permission.",
    );
    expect(errors).toContain("Flop production pack needs at least two source evidence entries.");
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: recommendedAction must be present in actions.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value uses an unavailable action.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value actionMix duplicates BET_BIG.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value actionMix uses an unavailable action.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value actionMix must include the bucket action.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value actionMix frequencies must sum to 100.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value exact actionMix frequencies require owned export or explicit written permission.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value contains invalid hand not-a-hand.",
    );
    expect(errors).toContain("flop-single_raised-btn_vs_bb-dry: missing BLUFF range lane.");
    expect(errors).toContain("flop-single_raised-btn_vs_bb-dry: missing CHECK range lane.");
    expect(coverage.productionReady).toBe(false);
    expect(coverage.missingPotTypes).toEqual(["THREE_BET_POT"]);
    expect(coverage.missingPositionPatterns).toHaveLength(FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS.length);
    expect(coverage.missingPositionPatterns).toEqual(expect.arrayContaining([
      "SRP_UTG_VS_BB",
      "SRP_BTN_VS_BB",
      "SRP_SB_VS_BB",
      "3BP_BTN_VS_UTG",
    ]));
    expect(coverage.sprBands).toEqual(["MID"]);
    expect(coverage.missingSprBands).toEqual(["LOW", "HIGH"]);
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "missing pot types: THREE_BET_POT",
    );
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain(
      "missing SPR bands: LOW,HIGH",
    );
    expect(renderFlopProductionCoverageReport(pack, coverage)).toContain("errors:");
  });

  it("blokuje facing-bet akce v flop c-bet production nodu", () => {
    const rule = {
      ...productionRule("SINGLE_RAISED", "BTN_VS_BB", "dry"),
      actions: ["CHECK", "BET_SMALL", "BET_BIG", "CALL"],
      recommendedAction: "CALL",
      rangeBuckets: [
        {
          ...productionRule("SINGLE_RAISED", "BTN_VS_BB", "dry").rangeBuckets[0],
          action: "CALL",
          actionMix: [
            { action: "CALL", frequencyPct: 100, visibility: "EXACT" },
          ],
        },
        ...productionRule("SINGLE_RAISED", "BTN_VS_BB", "dry").rangeBuckets.slice(1),
      ],
    } satisfies FlopProductionStrategyRule;

    const errors = validateFlopProductionRule(rule, { exactFrequencyAllowed: true });

    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: action CALL is not valid for SINGLE_RAISED_POT_CBET.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: recommendedAction CALL is not valid for SINGLE_RAISED_POT_CBET.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value action CALL is not valid for SINGLE_RAISED_POT_CBET.",
    );
    expect(errors).toContain(
      "flop-single_raised-btn_vs_bb-dry: range bucket value actionMix uses action CALL outside SINGLE_RAISED_POT_CBET.",
    );
  });

  it("vyzaduje MTT gameVariant pro flop production pack", () => {
    const pack = {
      ...productionPack(),
      dimensions: {
        ...productionPack().dimensions,
        gameVariant: "CASH",
      },
    } satisfies FlopProductionStrategyPack;

    expect(validateFlopProductionStrategyPack(pack)).toContain(
      "Flop production pack must use gameVariant MTT.",
    );
  });
});
