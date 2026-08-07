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
import type { RangePack } from "../../src/data/ranges/rangePack";

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

function productionDolarEvPreflopPack(): RangePack {
  return {
    id: "mtt-full-ring-9-regular-preflop-dolar-ev-ante-on-production-v1",
    version: "dolar-runtime-test-v1",
    createdAt: "2026-06-18",
    verifiedAt: "2026-06-18",
    confidence: "MEDIUM",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "DOLAR_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
    assumptions: ["Synthetic reviewed DOLAR_EV production fixture."],
    searchQueries: ["owned query one", "owned query two", "owned query three"],
    sourceEvidence: [
      {
        title: "Owned DOLAR_EV export",
        url: "https://example.test/dolar-owned",
        provider: "PKRTrainer Solver",
        verifiedAt: "2026-06-18",
        licenseNote: "Owned synthetic fixture.",
      },
      {
        title: "Independent DOLAR_EV review",
        url: "https://example.test/dolar-review",
        provider: "PKRTrainer Review",
        verifiedAt: "2026-06-18",
        licenseNote: "Synthetic review fixture.",
      },
    ],
    records: POSITION_ORDER.flatMap((position) => (
      STACK_BUCKETS.flatMap((bucket) => (
        REQUIRED_CONTEXTS.map((context) => ({
          position,
          bucket,
          context,
          lenient: { AA: ["FOLD" as const] },
          strict: { AA: ["FOLD" as const] },
        }))
      ))
    )),
  };
}

describe("mttProductionReadiness", () => {
  it("popise soucasny MTT preflop production stav podle formatu, speedu a ante", () => {
    const report = buildMttPreflopReadinessReport();

    expect(report.rows).toHaveLength(8);
    expect(report.productionRows).toBe(0);
    expect(report.candidateRows).toBe(6);
    expect(report.missingRows).toBe(2);

    const legacyCandidates = report.rows.filter((row) => (
      row.tableFormat === "FULL_RING_9" && row.blindSpeed === "REGULAR"
    ));
    expect(legacyCandidates.map((row) => `${row.tableFormat}|${row.blindSpeed}|${row.ante}`))
      .toEqual(["FULL_RING_9|REGULAR|ON", "FULL_RING_9|REGULAR|OFF"]);
    expect(legacyCandidates.every((row) => row.status === "CANDIDATE")).toBe(true);
    expect(legacyCandidates.every((row) => row.recordCount > 0)).toBe(true);
    expect(legacyCandidates.every((row) => row.sourceCount >= 2)).toBe(true);
    expect(legacyCandidates.every((row) => row.missingReasons.some((reason) => (
      reason.includes("canonical legal production provenance")
    )))).toBe(true);
    expect(legacyCandidates.every((row) => (
      row.recommendationPolicy === "DEDICATED_HAND_RECOMMENDATIONS"
    ))).toBe(true);
    expect(legacyCandidates.every((row) => (
      row.coverage.positions.join("|") === POSITION_ORDER.join("|") &&
      row.coverage.stackBuckets.join("|") === STACK_BUCKETS.join("|") &&
      row.coverage.contexts.join("|") === REQUIRED_CONTEXTS.join("|")
    ))).toBe(true);

    // Six-max splits by speed now. Regular carries ranges derived from the
    // nine-handed pack by seats-behind; turbo does not, because a derived turbo
    // pack would be the derived regular pack relabelled, which is the silent
    // metadata-only reuse the speed audit exists to catch. Both remain
    // CANDIDATE - derived is not measured, and production refuses inferred
    // chart values.
    const sixMax = report.rows.filter((row) => row.tableFormat === "SIX_MAX");
    expect(sixMax).toHaveLength(4);
    expect(sixMax.every((row) => row.status === "CANDIDATE")).toBe(true);

    const sixMaxRegular = sixMax.filter((row) => row.blindSpeed === "REGULAR");
    expect(sixMaxRegular).toHaveLength(2);
    expect(sixMaxRegular.every((row) => row.recordCount > 0)).toBe(true);
    expect(sixMaxRegular.every((row) => row.packId?.includes("derived") === true)).toBe(true);

    const sixMaxTurbo = sixMax.filter((row) => row.blindSpeed === "TURBO");
    expect(sixMaxTurbo).toHaveLength(2);
    expect(sixMaxTurbo.every((row) => row.recordCount === 0)).toBe(true);
    expect(sixMaxTurbo.every((row) => (
      row.coverage.missingPositions.join("|") === SIX_MAX_POSITION_ORDER.join("|") &&
      row.coverage.missingStackBuckets.join("|") === STACK_BUCKETS.join("|") &&
      row.coverage.missingContexts.join("|") === REQUIRED_CONTEXTS.join("|")
    ))).toBe(true);
    expect(sixMaxTurbo.every((row) => row.missingReasons.some((reason) => (
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
    expect(report.productionRows).toBe(0);
    expect(report.missingRows).toBe(10);
    expect(report.candidateRows).toBe(54);

    const production = report.rows.filter((row) => row.status === "PRODUCTION");
    expect(production).toEqual([]);

    const legacyCandidates = report.rows.filter((row) => (
      row.tableFormat === "FULL_RING_9" &&
      row.blindSpeed === "REGULAR" &&
      row.evModel === "CHIP_EV" &&
      row.street === "PREFLOP"
    ));
    expect(legacyCandidates).toHaveLength(2);
    expect(legacyCandidates.every((row) => (
      row.status === "CANDIDATE" &&
      !row.productionReady &&
      row.coverageKind === "PREFLOP_RANGE_PACK" &&
      row.importSlot?.packId.includes("-production-v1") === true &&
      row.missingReasons.some((reason) => (
        reason.includes("canonical legal production provenance")
      ))
    ))).toBe(true);

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

  it("povoli DOLAR_EV preflop production pouze po registraci dedikovaneho packu", () => {
    const pack = productionDolarEvPreflopPack();
    const report = buildMttCompletionReadinessReport({ preflopPacks: [pack] });
    const row = report.rows.find((item) => (
      item.tableFormat === "FULL_RING_9" &&
      item.blindSpeed === "REGULAR" &&
      item.evModel === "DOLAR_EV" &&
      item.street === "PREFLOP" &&
      item.ante === "ON"
    ));

    expect(row).toMatchObject({
      status: "PRODUCTION",
      productionReady: true,
      coverageKind: "PREFLOP_RANGE_PACK",
      packId: pack.id,
      importSlot: null,
      missingReasons: [],
    });
    expect(report.rows.filter((item) => (
      item.evModel === "DOLAR_EV" &&
      item.street === "PREFLOP" &&
      item.productionReady
    ))).toHaveLength(1);
  });

  it("napoji postflop completion matrix na registrovany production pack coverage", () => {
    const report = buildMttCompletionReadinessReport({
      flopProductionPacks: [incompleteFlopProductionPack()],
    });

    expect(report.productionRows).toBe(0);
    expect(report.candidateRows).toBe(54);
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

  it("production release gate selze pro kazdy non-production MTT profil", () => {
    const gate = buildMttCompletionReleaseGateReport();
    const rendered = renderMttCompletionReleaseGateReport(gate);

    expect(gate.valid).toBe(false);
    expect(gate.mode).toBe("PRODUCTION");
    expect(gate.totalRows).toBe(64);
    expect(gate.productionReadyRows).toBe(0);
    expect(gate.previewRows).toBe(54);
    expect(gate.blockedRows).toBe(10);
    expect(gate.errors).toHaveLength(64);
    expect(gate.errors[0]).toContain("row is not production-ready");
    expect(rendered).toContain("mode: PRODUCTION");
    expect(rendered).toContain("valid: false");
    expect(rendered).toContain("productionReady rows: 0");
    expect(rendered).not.toContain("https://");
  });

  it("preview release gate stale vyzaduje explicitni blocker pro non-production profil", () => {
    const gate = buildMttCompletionReleaseGateReport(
      buildMttCompletionReadinessReport(),
      { mode: "PREVIEW" },
    );
    const rendered = renderMttCompletionReleaseGateReport(gate);

    expect(gate.valid).toBe(true);
    expect(gate.mode).toBe("PREVIEW");
    expect(gate.totalRows).toBe(64);
    expect(gate.productionReadyRows).toBe(0);
    expect(gate.previewRows).toBe(54);
    expect(gate.blockedRows).toBe(10);
    expect(gate.errors).toEqual([]);
    expect(rendered).toContain("mode: PREVIEW");
    expect(rendered).toContain("valid: true");
    expect(rendered).toContain("productionReady rows: 0");
    expect(rendered).not.toContain("https://");
  });

  it("renderuje detailni MTT completion readiness vcetne legalnich import slotu", () => {
    const rendered = renderMttCompletionReadinessReport(buildMttCompletionReadinessReport());

    expect(rendered).toContain("MTT completion readiness");
    expect(rendered).toContain("non-production rows: 64");
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
    })).toBe(false);

    const legacyCandidate = mttPreflopReadinessRowForProfile({
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      ante: "ON",
    });
    expect(legacyCandidate.status).toBe("CANDIDATE");
    expect(legacyCandidate.missingReasons.join(" "))
      .toContain("canonical legal production provenance");

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
    // Six-max regular has records now, so the reason it is not production is no
    // longer emptiness - it is that derived data carries LOW confidence, which
    // is the honest blocker and the one that should remain until measured
    // six-max charts land.
    expect(sixMaxCandidate.status).toBe("CANDIDATE");
    expect(sixMaxCandidate.confidence).toBe("LOW");
    expect(sixMaxCandidate.missingReasons).toContain("RangePack confidence is LOW.");
    expect(sixMaxCandidate.missingReasons).not.toContain(
      "RangePack has no normalized hand-class records.",
    );
  });

  it("umi vyhodnotit readiness primo z TrainingProfile a skutecne zvoleneho ante", () => {
    expect(mttPreflopProductionReadyForTrainingProfile(DEFAULT_TRAINING_PROFILE, "OFF"))
      .toBe(false);

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

    const sixMaxRegular = profileWith(DEFAULT_TRAINING_PROFILE, { tableFormat: "SIX_MAX" });
    const sixMaxCompletion = mttCompletionReadinessRowForTrainingProfile(sixMaxRegular, "ON");
    expect(sixMaxCompletion).toMatchObject({
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      evModel: "CHIP_EV",
      street: "PREFLOP",
      ante: "ON",
      status: "CANDIDATE",
      productionReady: false,
      coverageKind: "PREFLOP_RANGE_PACK",
      packId: "mtt-six-max-regular-preflop-chip-ev-ante-on-derived-v1",
    });
    expect(sixMaxCompletion?.importSlot?.packId)
      .toBe("mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1");
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
    expect(report.productionReadyRows).toBe(0);
    expect(report.candidateRows).toBe(6);
    expect(report.lowConfidenceRows).toBe(4);
    // Two, not four: six-max regular is populated and six-max turbo is not.
    expect(report.emptyRecordRows).toBe(2);
    expect(report.missingExpectedProfiles).toHaveLength(2);
    expect(report.missingExpectedProfiles.every((row) => (
      row.tableFormat === "FULL_RING_9" && row.blindSpeed === "TURBO"
    ))).toBe(true);

    const productionRows = report.rows.filter((row) => row.productionReady);
    expect(productionRows).toEqual([]);

    // 487 until the calling-rejam sheets added VS_ALLIN at 15, 20, 25 and 30BB
    // for the five seats they cover - twenty records that did not exist before.
    const legacyCandidates = report.rows.filter((row) => row.recordCount === 507);
    expect(legacyCandidates).toHaveLength(2);
    expect(legacyCandidates.every((row) => (
      row.status === "CANDIDATE" &&
      !row.productionReady &&
      row.warnings.some((warning) => (
        warning.includes("canonical legal production provenance")
      ))
    ))).toBe(true);

    const candidateRows = report.rows.filter((row) => row.status === "CANDIDATE");
    expect(candidateRows.every((row) => row.productionReady === false)).toBe(true);
    expect(candidateRows.filter((row) => row.recordCount === 0).every((row) => (
      row.warnings.some((warning) => (
        warning.includes("no normalized hand-class records")
      ))
    ))).toBe(true);
    expect(report.rows.flatMap((row) => row.warnings).join(" ")).not.toContain("https://");
  });

  it("release gate nedovoli production pack s LOW confidence, empty records nebo chybejicimi legal metadaty", () => {
    const mttReport = buildMttPreflopPackImportReadinessReport();
    const productionRows = mttReport.rows.filter((row) => row.status === "PRODUCTION");

    expect(productionRows).toEqual([]);
    expect(mttReport.rows.filter((row) => row.recordCount === 507).every((row) => (
      row.warnings.some((warning) => (
        warning.includes("canonical legal production provenance")
      ))
    ))).toBe(true);

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
