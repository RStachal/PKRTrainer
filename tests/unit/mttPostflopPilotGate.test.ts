import { describe, expect, it } from "vitest";

import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";
import { buildMttPostflopPilotGateReport } from "../../src/data/ranges/mttPostflopPilotGate";
import type { ProductionPermissionManifest } from "../../src/data/ranges/productionPermissionManifest";

const HANDS = [
  "KK", "QQ", "JJ", "TT", "99", "88", "66", "55", "44", "33",
  "AKs", "AQs", "AJs", "ATs", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs",
  "AKo", "AQo", "AJo", "KQo", "QJo", "T9s", "98s", "87s", "76s", "65s",
] as const;

describe("MTT postflop pilot gate", () => {
  it("pusti uzky BTN vs BB SRP flop pilot bez oznaceni jako full production", () => {
    const pack = pilotPack();
    const report = buildMttPostflopPilotGateReport(pack, permissionFor(pack.id));

    expect(report.valid).toBe(true);
    expect(report.fullProductionReady).toBe(false);
    expect(report.permissionReady).toBe(true);
    expect(report.legalImportSlot).toBe(true);
    expect(report.runtimeSmokeValid).toBe(true);
    expect(report.counts).toMatchObject({
      rules: 1,
      rangeBuckets: HANDS.length,
      runtimeSmokeSamples: 1,
    });
    expect(report.warnings).toContain("Pilot pack is intentionally narrower than full flop-production coverage.");
  });

  it("odmitne pilot pack mimo BTN vs BB SRP scope", () => {
    const pack = {
      ...pilotPack(),
      rules: [{
        ...pilotPack().rules[0],
        positionPattern: "SRP_UTG_VS_BB",
      }],
    } satisfies FlopProductionStrategyPack;
    const report = buildMttPostflopPilotGateReport(pack, permissionFor(pack.id));

    expect(report.valid).toBe(false);
    expect(report.errors).toContain("pilot-btn-bb-srp: BTN vs BB SRP pilot only allows SRP_BTN_VS_BB.");
  });

  it("pusti UTG vs BB SRP scoped pilot s explicitnim scopem", () => {
    const pack = {
      ...pilotPack(),
      rules: [{
        ...pilotPack().rules[0],
        id: "pilot-utg-bb-srp",
        positionPattern: "SRP_UTG_VS_BB",
      }],
    } satisfies FlopProductionStrategyPack;
    const report = buildMttPostflopPilotGateReport(pack, permissionFor(pack.id), "UTG_vs_BB_SRP_FLOP_CBET");

    expect(report.valid).toBe(true);
    expect(report.pilotScope).toBe("UTG_vs_BB_SRP_FLOP_CBET");
    expect(report.fullProductionReady).toBe(false);
  });

  it("pusti BTN vs CO 3BP scoped pilot s explicitnim scopem", () => {
    const pack = {
      ...pilotPack(),
      rules: [{
        ...pilotPack().rules[0],
        id: "pilot-btn-co-3bp",
        actionNode: "THREE_BET_POT_CBET",
        potType: "THREE_BET_POT",
        positionPattern: "3BP_BTN_VS_CO",
      }],
    } satisfies FlopProductionStrategyPack;
    const report = buildMttPostflopPilotGateReport(pack, permissionFor(pack.id), "BTN_vs_CO_3BP_FLOP_CBET");

    expect(report.valid).toBe(true);
    expect(report.pilotScope).toBe("BTN_vs_CO_3BP_FLOP_CBET");
    expect(report.fullProductionReady).toBe(false);
  });
});

function pilotPack(): FlopProductionStrategyPack {
  return {
    contentLanguage: "cs",
    id: "mtt-full-ring-9-regular-flop-chip-ev-ante-off-production-v1",
    version: "pilot-test-v1",
    createdAt: "2026-07-01",
    verifiedAt: "2026-07-01",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned local solver export used for scoped pilot validation.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["OFF"],
    },
    sourceEvidence: [
      {
        url: "file:///solver-review.json",
        verifiedAt: "2026-07-01",
        operator: "PKRTrainer test",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Synthetic owned solver pilot-shape fixture.",
        licenseNote: "Owned local fixture.",
      },
      {
        url: "file:///pilot-gate-review.json",
        verifiedAt: "2026-07-01",
        operator: "PKRTrainer test review",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Independent pilot-shape review fixture.",
        licenseNote: "Internal fixture.",
      },
    ],
    assumptions: [
      "Scoped BTN vs BB SRP flop c-bet pilot.",
      "This fixture intentionally does not represent full flop-production coverage.",
    ],
    rules: [{
      id: "pilot-btn-bb-srp",
      actionNode: "SINGLE_RAISED_POT_CBET",
      potType: "SINGLE_RAISED",
      positionPattern: "SRP_BTN_VS_BB",
      boardTextures: ["ace-high", "rainbow", "disconnected", "dry"],
      sprMin: 3,
      sprMax: 8,
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      recommendedAction: "BET_SMALL",
      rangeBuckets: HANDS.map((hand, index) => ({
        lane: index < 10 ? "VALUE" : index < 20 ? "BLUFF" : "CHECK",
        label: `${hand} pilot bucket`,
        action: index < 20 ? "BET_SMALL" : "CHECK",
        handClasses: [hand],
        features: [index < 10 ? "value-density" : index < 20 ? "equity-bluff" : "showdown-control"],
        actionMix: index < 20
          ? [
              { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
              { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
            ]
          : [
              { action: "CHECK", frequencyPct: 80, visibility: "EXACT" },
              { action: "BET_SMALL", frequencyPct: 20, visibility: "EXACT" },
            ],
      })),
      cardRemovalSamples: [{
        handClass: "KK",
        heroCards: [{ rank: "K", suit: "s" }, { rank: "K", suit: "h" }],
        board: [{ rank: "A", suit: "s" }, { rank: "7", suit: "d" }, { rank: "2", suit: "c" }],
        rationale: "Representative card-removal sample for pilot test.",
      }],
      explanation: "Pilot test explanation.",
    }],
  };
}

function permissionFor(packId: string): ProductionPermissionManifest {
  return {
    packId,
    version: "pilot-permission-test-v1",
    reviewedAt: "2026-07-01",
    reviewer: "PKRTrainer test",
    rightsOwner: "PKRTrainer test",
    licenseKind: "OWNED_SOLVER_EXPORT",
    allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
    sourceMaterialLocation: "tests/unit/mttPostflopPilotGate.test.ts",
    evidence: [{
      referenceId: "pilot-test-owned-export",
      storedAt: "tests/unit/mttPostflopPilotGate.test.ts",
      reviewer: "PKRTrainer test",
      description: "Synthetic owned solver pilot fixture.",
      containsRangeValues: true,
    }],
    notes: ["Synthetic pilot gate fixture."],
  };
}
