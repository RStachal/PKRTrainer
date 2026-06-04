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
  buildMttPreflopPackImportReadinessReport,
  buildMttPreflopReadinessReport,
  mttPreflopProductionReady,
  mttPreflopProductionReadyForTrainingProfile,
  mttPreflopReadinessRowForProfile,
  mttPreflopReadinessRowForTrainingProfile,
} from "../../src/data/ranges/mttProductionReadiness";

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
});
