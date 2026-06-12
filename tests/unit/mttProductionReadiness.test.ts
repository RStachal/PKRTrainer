import { describe, expect, it } from "vitest";

import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
} from "../../src/core/types";
import {
  DEFAULT_TRAINING_PROFILE,
  SIX_MAX_POSITION_ORDER,
  profileWith,
} from "../../src/core/trainingProfile";
import {
  MTT_PREFLOP_TURBO_STRATEGY_POLICY,
  buildMttCompletionReleaseGateReport,
  buildMttCompletionReadinessReport,
  buildMttPreflopPackImportReadinessReport,
  buildMttPreflopReadinessReport,
  filterMttCompletionReadinessReport,
  mttCompletionReadinessRowForTrainingProfile,
  mttPreflopProductionReady,
  mttPreflopProductionReadyForTrainingProfile,
  mttPreflopReadinessRowForProfile,
  mttPreflopReadinessRowForTrainingProfile,
  renderMttCompletionReadinessReport,
  renderMttCompletionReleaseGateReport,
} from "../../src/data/ranges/mttProductionReadiness";
import { flopProductionStrategyPacks } from "../../src/data/ranges/flopProductionStrategyResolver";
import {
  buildFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "../../src/data/ranges/flopProductionStrategyPack";
import type { PostflopStrategySourceEvidence } from "../../src/data/ranges/postflopStrategyPack";

const REQUIRED_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

const postflopSourceEvidence: PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-flop-production-readiness",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Owned production readiness fixture.",
    licenseNote: "Owned fixture export for readiness tests.",
  },
  {
    url: "https://example.test/flop-production-review",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Independent review fixture.",
    licenseNote: "Review metadata for readiness tests.",
  },
];

function incompleteFlopProductionPack(): FlopProductionStrategyPack {
  return {
    id: "mtt-full-ring-9-flop-readiness-incomplete-v1",
    version: "readiness-incomplete-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
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
    sourceEvidence: postflopSourceEvidence,
    assumptions: ["Readiness fixture intentionally has incomplete coverage."],
    rules: [
      {
        id: "flop-readiness-btn-bb-mid-spr",
        actionNode: "SINGLE_RAISED_POT_CBET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        boardTextures: ["dry"],
        sprMin: 4,
        sprMax: 7,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_SMALL",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value",
            action: "BET_SMALL",
            handClasses: ["AA"],
            features: ["overpair"],
          },
          {
            lane: "BLUFF",
            label: "bluff",
            action: "BET_SMALL",
            handClasses: ["QJs"],
            features: ["backdoor equity"],
          },
          {
            lane: "CHECK",
            label: "check",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Incomplete readiness fixture rule.",
      },
    ],
  };
}

describe("mttProductionReadiness", () => {
  it("popise soucasny MTT preflop production stav podle formatu, speedu a ante", () => {
    const report = buildMttPreflopReadinessReport();

    expect(report.rows).toHaveLength(8);
    expect(report.productionRows).toBe(2);
    expect(report.candidateRows).toBe(4);
    expect(report.missingRows).toBe(2);

    const production = report.rows.filter((row) => row.status === "PRODUCTION");
    expect(production.map((row) => `${row.tableFormat}|${row.blindSpeed}|${row.ante}`))
      .toEqual(["FULL_RING_9|REGULAR|ON", "FULL_RING_9|REGULAR|OFF"]);
    expect(production.every((row) => row.recordCount > 0)).toBe(true);
    expect(production.every((row) => row.sourceCount >= 2)).toBe(true);
    expect(production.every((row) => row.missingReasons.length === 0)).toBe(true);
    expect(production.every((row) => (
      row.recommendationPolicy === "DEDICATED_HAND_RECOMMENDATIONS"
    ))).toBe(true);
    expect(production.every((row) => (
      row.coverage.positions.join("|") === POSITION_ORDER.join("|") &&
      row.coverage.stackBuckets.join("|") === STACK_BUCKETS.join("|") &&
      row.coverage.contexts.join("|") === REQUIRED_CONTEXTS.join("|")
    ))).toBe(true);

    const sixMax = report.rows.filter((row) => row.tableFormat === "SIX_MAX");
    expect(sixMax).toHaveLength(4);
    expect(sixMax.every((row) => row.status === "CANDIDATE")).toBe(true);
    expect(sixMax.every((row) => row.recordCount === 0)).toBe(true);
    expect(sixMax.every((row) => (
      row.coverage.missingPositions.join("|") === SIX_MAX_POSITION_ORDER.join("|") &&
      row.coverage.missingStackBuckets.join("|") === STACK_BUCKETS.join("|") &&
      row.coverage.missingContexts.join("|") === REQUIRED_CONTEXTS.join("|")
    ))).toBe(true);
    expect(sixMax.every((row) => row.missingReasons.some((reason) => (
      reason.includes("no normalized hand-class records")
    )))).toBe(true);

    const turboFullRing = report.rows.filter((row) => (
      row.tableFormat === "FULL_RING_9" && row.blindSpeed === "TURBO"
    ));
    expect(turboFullRing).toHaveLength(2);
    expect(turboFullRing.every((row) => row.status === "MISSING")).toBe(true);
    expect(turboFullRing.every((row) => row.packId === null)).toBe(true);
    expect(turboFullRing.every((row) => (
      row.recommendationPolicy === "MISSING_DEDICATED_PACK"
    ))).toBe(true);
    expect(turboFullRing.every((row) => row.missingReasons.includes(
      MTT_PREFLOP_TURBO_STRATEGY_POLICY.productionRequirement,
    ))).toBe(true);
    expect(turboFullRing.every((row) => row.missingReasons.includes(
      MTT_PREFLOP_TURBO_STRATEGY_POLICY.forbiddenShortcut,
    ))).toBe(true);
    expect(turboFullRing.every((row) => (
      row.coverage.missingPositions.join("|") === POSITION_ORDER.join("|")
    ))).toBe(true);

    const turboSixMax = report.rows.filter((row) => (
      row.tableFormat === "SIX_MAX" && row.blindSpeed === "TURBO"
    ));
    expect(turboSixMax.every((row) => (
      row.recommendationPolicy === "SPEED_METADATA_ONLY"
    ))).toBe(true);
    expect(turboSixMax.every((row) => row.missingReasons.some((reason) => (
      reason.includes("Blind speed is metadata-only")
    )))).toBe(true);
  });

  it("popise canonical MTT completion matrix vcetne DOLAR_EV a postflop streetu", () => {
    const report = buildMttCompletionReadinessReport();

    expect(report.rows).toHaveLength(64);
    expect(report.productionRows).toBe(2);
    expect(report.missingRows).toBe(10);
    expect(report.candidateRows).toBe(52);

    const production = report.rows.filter((row) => row.status === "PRODUCTION");
    expect(production.map((row) => (
      `${row.tableFormat}|${row.blindSpeed}|${row.evModel}|${row.street}|${row.ante}`
    ))).toEqual([
      "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|ON",
      "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|OFF",
    ]);
    expect(production.every((row) => row.productionReady)).toBe(true);
    expect(production.every((row) => row.coverageKind === "PREFLOP_RANGE_PACK")).toBe(true);
    expect(production.every((row) => row.importSlot === null)).toBe(true);

    const dolarPreflop = report.rows.filter((row) => (
      row.evModel === "DOLAR_EV" && row.street === "PREFLOP"
    ));
    expect(dolarPreflop).toHaveLength(8);
    expect(dolarPreflop.every((row) => row.status === "MISSING")).toBe(true);
    expect(dolarPreflop.every((row) => row.productionReady === false)).toBe(true);
    expect(dolarPreflop.every((row) => row.missingReasons.some((reason) => (
      reason.includes("No dedicated DOLAR_EV MTT preflop RangePack")
    )))).toBe(true);
    expect(dolarPreflop.find((row) => (
      row.tableFormat === "SIX_MAX" && row.blindSpeed === "TURBO" && row.ante === "OFF"
    ))?.importSlot).toMatchObject({
      kind: "mtt-preflop",
      packId: "mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1",
      normalizedInputPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1/normalized.json",
      permissionManifestPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1/permission.json",
    });

    const postflop = report.rows.filter((row) => row.street !== "PREFLOP");
    expect(postflop).toHaveLength(48);
    expect(postflop.every((row) => row.status === "CANDIDATE")).toBe(true);
    expect(postflop.every((row) => row.coverageKind === "POSTFLOP_PUBLIC_HEURISTIC")).toBe(true);
    expect(postflop.every((row) => row.missingReasons.some((reason) => (
      reason.includes("Dedicated production StrategyPack coverage")
    )))).toBe(true);
    expect(postflop.find((row) => (
      row.tableFormat === "SIX_MAX" &&
      row.blindSpeed === "TURBO" &&
      row.evModel === "DOLAR_EV" &&
      row.street === "RIVER" &&
      row.ante === "OFF"
    ))?.importSlot).toMatchObject({
      kind: "river-production",
      packId: "mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1",
      normalizedInputPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/normalized.json",
      permissionManifestPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/permission.json",
    });
  });

  it("napoji postflop completion matrix na registrovany production pack coverage", () => {
    const report = buildMttCompletionReadinessReport({
      flopProductionPacks: [incompleteFlopProductionPack()],
    });

    expect(report.productionRows).toBe(2);
    expect(report.candidateRows).toBe(52);
    expect(report.missingRows).toBe(10);

    const flopRows = report.rows.filter((row) => (
      row.tableFormat === "FULL_RING_9" &&
      row.evModel === "CHIP_EV" &&
      row.street === "FLOP"
    ));

    expect(flopRows).toHaveLength(4);
    expect(flopRows.every((row) => row.status === "CANDIDATE")).toBe(true);
    expect(flopRows.every((row) => row.productionReady === false)).toBe(true);

    const coveredRow = flopRows.find((row) => (
      row.blindSpeed === "REGULAR" && row.ante === "ON"
    ));
    expect(coveredRow?.coverageKind).toBe("POSTFLOP_PRODUCTION_PACK");
    expect(coveredRow?.packId).toBe("mtt-full-ring-9-flop-readiness-incomplete-v1");
    expect(coveredRow?.importSlot).toMatchObject({
      kind: "flop-production",
      packId: "mtt-full-ring-9-regular-flop-chip-ev-ante-on-production-v1",
    });
    expect(coveredRow?.missingReasons.some((reason) => (
      reason.includes("missing pot types: THREE_BET_POT")
    ))).toBe(true);
    expect(coveredRow?.missingReasons.some((reason) => (
      reason.includes("missing SPR bands: LOW, HIGH")
    ))).toBe(true);

    const uncoveredRows = flopRows.filter((row) => (
      row.blindSpeed !== "REGULAR" || row.ante !== "ON"
    ));
    expect(uncoveredRows).toHaveLength(3);
    expect(uncoveredRows.every((row) => row.coverageKind === "POSTFLOP_PUBLIC_HEURISTIC"))
      .toBe(true);
    expect(uncoveredRows.every((row) => row.packId === null)).toBe(true);
    expect(uncoveredRows.every((row) => row.missingReasons.some((reason) => (
      reason.includes("No production FLOP StrategyPack")
    )))).toBe(true);
  });

  it("release gate vyzaduje explicitni blocker pro kazdy non-production MTT profil", () => {
    const gate = buildMttCompletionReleaseGateReport();
    const rendered = renderMttCompletionReleaseGateReport(gate);

    expect(gate.valid).toBe(true);
    expect(gate.totalRows).toBe(64);
    expect(gate.productionReadyRows).toBe(2);
    expect(gate.previewRows).toBe(52);
    expect(gate.blockedRows).toBe(10);
    expect(gate.errors).toEqual([]);
    expect(rendered).toContain("valid: true");
    expect(rendered).toContain("productionReady rows: 2");
    expect(rendered).not.toContain("https://");
  });

  it("renderuje detailni MTT completion readiness vcetne legalnich import slotu", () => {
    const rendered = renderMttCompletionReadinessReport(buildMttCompletionReadinessReport());

    expect(rendered).toContain("MTT completion readiness");
    expect(rendered).toContain("non-production rows: 62");
    expect(rendered).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(rendered).toContain("import kind: river-production");
    expect(rendered).toContain("import pack: mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
    expect(rendered).toContain(
      "input: Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/normalized.json",
    );
    expect(rendered).toContain(
      "permission: Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/permission.json",
    );
    expect(rendered).not.toContain("https://");
  });

  it("umi filtrovat MTT completion readiness pro konkretni operator import slot slice", () => {
    const report = filterMttCompletionReadinessReport(buildMttCompletionReadinessReport(), {
      tableFormat: "SIX_MAX",
      evModel: "DOLAR_EV",
      street: "RIVER",
      status: "CANDIDATE",
    });

    expect(report.rows).toHaveLength(4);
    expect(report.productionRows).toBe(0);
    expect(report.candidateRows).toBe(4);
    expect(report.missingRows).toBe(0);
    expect(report.rows.every((row) => (
      row.tableFormat === "SIX_MAX" &&
      row.evModel === "DOLAR_EV" &&
      row.street === "RIVER" &&
      row.status === "CANDIDATE"
    ))).toBe(true);
    expect(renderMttCompletionReadinessReport(report)).toContain("total rows: 4");
    expect(renderMttCompletionReadinessReport(report)).not.toContain("FULL_RING_9");
  });

  it("vrati production boolean pro konkretni MTT preflop readiness profil", () => {
    expect(mttPreflopProductionReady({
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      ante: "ON",
    })).toBe(true);

    expect(mttPreflopProductionReady({
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      ante: "ON",
    })).toBe(false);

    const sixMaxCandidate = mttPreflopReadinessRowForProfile({
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      ante: "OFF",
    });
    expect(sixMaxCandidate.status).toBe("CANDIDATE");
    expect(sixMaxCandidate.confidence).toBe("LOW");
    expect(sixMaxCandidate.missingReasons).toContain("RangePack confidence is LOW.");
    expect(sixMaxCandidate.missingReasons).toContain(
      "RangePack has no normalized hand-class records.",
    );
  });

  it("umi vyhodnotit readiness primo z TrainingProfile a skutecne zvoleneho ante", () => {
    expect(mttPreflopProductionReadyForTrainingProfile(DEFAULT_TRAINING_PROFILE, "OFF"))
      .toBe(true);

    const turbo = profileWith(DEFAULT_TRAINING_PROFILE, { blindSpeed: "TURBO" });
    expect(mttPreflopProductionReadyForTrainingProfile(turbo, "ON")).toBe(false);
    expect(mttPreflopReadinessRowForTrainingProfile(turbo, "ON")?.status).toBe("MISSING");

    const postflop = profileWith(DEFAULT_TRAINING_PROFILE, { street: "FLOP" });
    expect(mttPreflopReadinessRowForTrainingProfile(postflop, "ON")).toBeNull();

    const dolar = profileWith(DEFAULT_TRAINING_PROFILE, { evModel: "DOLAR_EV" });
    const dolarCompletion = mttCompletionReadinessRowForTrainingProfile(dolar, "ON");
    expect(dolarCompletion?.status).toBe("MISSING");
    expect(dolarCompletion?.productionReady).toBe(false);
    expect(dolarCompletion?.missingReasons.join(" ")).toContain("DOLAR_EV");
  });

  it("definuje turbo policy bez povyseni metadata-only speedu do production", () => {
    expect(MTT_PREFLOP_TURBO_STRATEGY_POLICY.legalInputRequirement)
      .toContain("owned solver exports");
    expect(MTT_PREFLOP_TURBO_STRATEGY_POLICY.forbiddenShortcut)
      .toContain("metadata alone");
  });

  it("vytvori import-readiness report pro vsechny registrovane MTT preflop packy", () => {
    const report = buildMttPreflopPackImportReadinessReport();

    expect(report.rows).toHaveLength(6);
    expect(report.productionReadyRows).toBe(2);
    expect(report.candidateRows).toBe(4);
    expect(report.lowConfidenceRows).toBe(4);
    expect(report.emptyRecordRows).toBe(4);
    expect(report.missingExpectedProfiles).toHaveLength(2);
    expect(report.missingExpectedProfiles.every((row) => (
      row.tableFormat === "FULL_RING_9" && row.blindSpeed === "TURBO"
    ))).toBe(true);

    const productionRows = report.rows.filter((row) => row.productionReady);
    expect(productionRows.every((row) => row.status === "PRODUCTION")).toBe(true);
    expect(productionRows.every((row) => row.warnings.length === 0)).toBe(true);
    expect(productionRows.every((row) => row.recordCount === 487)).toBe(true);

    const candidateRows = report.rows.filter((row) => row.status === "CANDIDATE");
    expect(candidateRows.every((row) => row.productionReady === false)).toBe(true);
    expect(candidateRows.every((row) => row.warnings.some((warning) => (
      warning.includes("no normalized hand-class records")
    )))).toBe(true);
    expect(report.rows.flatMap((row) => row.warnings).join(" ")).not.toContain("https://");
  });

  it("release gate nedovoli production pack s LOW confidence, empty records nebo chybejicimi legal metadaty", () => {
    const mttReport = buildMttPreflopPackImportReadinessReport();
    const productionRows = mttReport.rows.filter((row) => row.status === "PRODUCTION");

    expect(productionRows.length).toBeGreaterThan(0);
    for (const row of productionRows) {
      expect(row.productionReady).toBe(true);
      expect(row.confidence).not.toBe("LOW");
      expect(row.recordCount).toBeGreaterThan(0);
      expect(row.sourceCount).toBeGreaterThanOrEqual(2);
      expect(row.searchQueryCount).toBeGreaterThanOrEqual(3);
      expect(row.warnings).toEqual([]);
    }

    const unsafeRows = mttReport.rows.filter((row) => (
      row.status !== "PRODUCTION" ||
      row.confidence === "LOW" ||
      row.recordCount === 0 ||
      row.sourceCount < 2 ||
      row.searchQueryCount < 3 ||
      row.warnings.length > 0
    ));
    expect(unsafeRows.every((row) => !row.productionReady)).toBe(true);

    const invalidFlopProductionPacks = flopProductionStrategyPacks
      .map((pack) => ({ pack, report: buildFlopProductionCoverageReport(pack) }))
      .filter(({ pack, report }) => (
        !report.productionReady ||
        pack.confidence === "LOW" ||
        pack.rules.length === 0 ||
        pack.sourceEvidence.length < 2 ||
        pack.licenseKind === "PUBLIC_METADATA_ONLY" ||
        pack.licenseKind === "UNKNOWN"
      ));
    expect(invalidFlopProductionPacks).toEqual([]);
  });
});
