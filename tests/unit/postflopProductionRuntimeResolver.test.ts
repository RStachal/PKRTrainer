import { describe, expect, it } from "vitest";

import type {
  PostflopStrategyInput,
  PostflopStreet,
} from "../../src/core/postflopGenerator";
import type { AnteMode } from "../../src/core/types";
import type { BlindSpeed, EvModel, TableFormat } from "../../src/core/trainingProfile";
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";
import type { RiverProductionStrategyPack } from "../../src/data/ranges/riverProductionStrategyPack";
import {
  createDefaultPostflopStrategyResolver,
  createMttProductionPostflopStrategyResolver,
  type MttProductionPostflopResolverProfile,
} from "../../src/data/ranges/postflopStrategyRegistry";
import {
  type PostflopStrategySourceEvidence,
} from "../../src/data/ranges/postflopStrategyPack";
import type { TurnProductionStrategyPack } from "../../src/data/ranges/turnProductionStrategyPack";

const tableFormats = ["FULL_RING_9", "SIX_MAX"] as const satisfies readonly TableFormat[];
const blindSpeeds = ["REGULAR", "TURBO"] as const satisfies readonly BlindSpeed[];
const evModels = ["CHIP_EV", "DOLAR_EV"] as const satisfies readonly EvModel[];
const antes = ["ON", "OFF"] as const satisfies readonly AnteMode[];
const streets = ["FLOP", "TURN", "RIVER"] as const satisfies readonly PostflopStreet[];

const sourceEvidence: readonly PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-postflop-production",
    verifiedAt: "2026-06-17",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Owned production runtime resolver fixture.",
    licenseNote: "Owned export fixture.",
  },
  {
    url: "https://example.test/owned-postflop-review",
    verifiedAt: "2026-06-17",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Independent fixture review.",
    licenseNote: "Review metadata only.",
  },
];

const baseProfile: MttProductionPostflopResolverProfile = {
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "ON",
};

const baseInput: PostflopStrategyInput = {
  street: "FLOP",
  textures: ["dry", "rainbow"],
  potType: "SINGLE_RAISED",
  potBB: 6,
  effectiveStackBB: 40,
  positionPattern: "BTN_VS_BB",
  actionNode: "SINGLE_RAISED_POT_CBET",
  heroHand: "AA",
};

describe("MTT production postflop runtime resolver", () => {
  it("nepouzije heuristic fallback pro zadny MTT production postflop profil bez production packu", () => {
    const previewResolver = createDefaultPostflopStrategyResolver();
    expect(previewResolver(baseInput)?.source?.kind).toBe("STRATEGY_PACK");

    for (const tableFormat of tableFormats) {
      for (const blindSpeed of blindSpeeds) {
        for (const evModel of evModels) {
          for (const ante of antes) {
            for (const street of streets) {
              const profile = { tableFormat, blindSpeed, evModel, ante, street };
              const resolver = createMttProductionPostflopStrategyResolver(profile, {
                flopProductionPacks: [],
                turnProductionPacks: [],
                riverProductionPacks: [],
              });

              expect(resolver(inputForStreet(street)), JSON.stringify(profile)).toBeNull();
            }
          }
        }
      }
    }
  });

  it("filtruje production packy podle table format, speed, EV, ante a street", () => {
    const flopResolver = createMttProductionPostflopStrategyResolver(baseProfile, {
      flopProductionPacks: [flopPack()],
      turnProductionPacks: [turnPack()],
      riverProductionPacks: [riverPack()],
    });
    const turboResolver = createMttProductionPostflopStrategyResolver({
      ...baseProfile,
      blindSpeed: "TURBO",
    }, {
      flopProductionPacks: [flopPack()],
    });

    const result = flopResolver(baseInput);
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-runtime-flop-production-v1");
    }
    expect(turboResolver(baseInput)).toBeNull();
    expect(createMttProductionPostflopStrategyResolver({
      ...baseProfile,
      evModel: "ICM",
    }, {
      flopProductionPacks: [flopPack()],
    })(baseInput)).toBeNull();
  });

  it("umi production-only resolver pro flop, turn i river bez heuristiky", () => {
    const cases: {
      street: PostflopStreet;
      profile: MttProductionPostflopResolverProfile;
      input: PostflopStrategyInput;
      packs: Parameters<typeof createMttProductionPostflopStrategyResolver>[1];
      expectedPackId: string;
    }[] = [
      {
        street: "FLOP",
        profile: baseProfile,
        input: inputForStreet("FLOP"),
        packs: { flopProductionPacks: [flopPack()] },
        expectedPackId: "mtt-runtime-flop-production-v1",
      },
      {
        street: "TURN",
        profile: { ...baseProfile, street: "TURN" },
        input: inputForStreet("TURN"),
        packs: { turnProductionPacks: [turnPack()] },
        expectedPackId: "mtt-runtime-turn-production-v1",
      },
      {
        street: "RIVER",
        profile: { ...baseProfile, street: "RIVER" },
        input: inputForStreet("RIVER"),
        packs: { riverProductionPacks: [riverPack()] },
        expectedPackId: "mtt-runtime-river-production-v1",
      },
    ];

    for (const item of cases) {
      const resolver = createMttProductionPostflopStrategyResolver(item.profile, item.packs);
      const result = resolver(item.input);

      expect(result?.source?.kind, item.street).toBe("STRATEGY_PACK");
      if (result?.source?.kind === "STRATEGY_PACK") {
        expect(result.source.packId, item.street).toBe(item.expectedPackId);
        expect(result.source.confidence, item.street).toBe("MEDIUM");
      }
    }
  });
});

function inputForStreet(street: PostflopStreet): PostflopStrategyInput {
  if (street === "TURN") {
    return {
      ...baseInput,
      street: "TURN",
      actionNode: "TURN_BARREL",
      priorFlopAction: "BET_SMALL",
      turnCardClass: "LOW_BRICK",
    };
  }
  if (street === "RIVER") {
    return {
      ...baseInput,
      street: "RIVER",
      actionNode: "RIVER_PRESSURE",
      priorTurnAction: "BET_SMALL",
      riverRunoutClass: "BLANK",
    };
  }
  return baseInput;
}

function flopPack(): FlopProductionStrategyPack {
  return {
    id: "mtt-runtime-flop-production-v1",
    version: "runtime-test-v1",
    createdAt: "2026-06-17",
    verifiedAt: "2026-06-17",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON"],
    },
    sourceEvidence,
    assumptions: ["Runtime production resolver fixture."],
    rules: [
      {
        id: "runtime-flop-btn-bb-dry-big",
        actionNode: "SINGLE_RAISED_POT_CBET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        boardTextures: ["dry"],
        sprMin: 2,
        sprMax: 12,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_BIG",
        rangeBuckets: standardBuckets(),
        explanation: "Production-only runtime fixture uses a big flop bet.",
      },
    ],
  };
}

function turnPack(): TurnProductionStrategyPack {
  return {
    id: "mtt-runtime-turn-production-v1",
    version: "runtime-test-v1",
    createdAt: "2026-06-17",
    verifiedAt: "2026-06-17",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR"],
      street: "TURN",
      evModel: "CHIP_EV",
      antes: ["ON"],
    },
    sourceEvidence,
    assumptions: ["Runtime production resolver fixture."],
    rules: [
      {
        id: "runtime-turn-btn-bb-low-brick-small",
        actionNode: "TURN_BARREL",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorFlopAction: "BET_SMALL",
        turnCardClasses: ["LOW_BRICK"],
        sprMin: 2,
        sprMax: 12,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_SMALL",
        rangeBuckets: standardBuckets(),
        explanation: "Production-only runtime fixture uses a small turn barrel.",
      },
    ],
  };
}

function riverPack(): RiverProductionStrategyPack {
  return {
    id: "mtt-runtime-river-production-v1",
    version: "runtime-test-v1",
    createdAt: "2026-06-17",
    verifiedAt: "2026-06-17",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR"],
      street: "RIVER",
      evModel: "CHIP_EV",
      antes: ["ON"],
    },
    sourceEvidence,
    assumptions: ["Runtime production resolver fixture."],
    rules: [
      {
        id: "runtime-river-btn-bb-blank-big",
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
        rangeBuckets: standardRiverBuckets(),
        explanation: "Production-only runtime fixture uses big river pressure.",
      },
    ],
  };
}

function standardBuckets() {
  return [
    {
      lane: "VALUE",
      label: "value",
      action: "BET_BIG",
      handClasses: ["AA"],
      features: ["top value"],
    },
    {
      lane: "BLUFF",
      label: "bluff",
      action: "BET_BIG",
      handClasses: ["QJs"],
      features: ["blocker bluff"],
    },
    {
      lane: "CHECK",
      label: "check",
      action: "CHECK",
      handClasses: ["72o"],
      features: ["showdown or give-up"],
    },
  ] as const;
}

function standardRiverBuckets() {
  return standardBuckets().map((bucket) => ({
    ...bucket,
    blockerRelevance: bucket.lane === "BLUFF" ? "HIGH" as const : "LOW" as const,
  }));
}
