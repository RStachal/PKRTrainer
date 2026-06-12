import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import type { ActionKey, HandLabel } from "../../src/core/types";
import type { RangeSourceEvidence } from "../../src/data/ranges/rangePack";
import {
  buildMttSixMaxImportReadinessReport,
  normalizeMttSixMaxRangePackImport,
  renderMttSixMaxImportReadinessReport,
  type MttSixMaxRangePackImportInput,
} from "../../src/data/ranges/mttSixMaxRangePackImport";

const sourceEvidence: RangeSourceEvidence[] = [
  {
    title: "Internal solver export manifest",
    url: "https://example.test/internal-solver-export",
    provider: "PKRTrainer",
    verifiedAt: "2026-06-03",
    licenseNote: "Owned solver export; redistribution inside this project is permitted.",
  },
  {
    title: "Independent review notes",
    url: "https://example.test/review-notes",
    provider: "PKRTrainer Review",
    verifiedAt: "2026-06-03",
    licenseNote: "Review metadata only; no third-party chart values copied.",
  },
];

function handMap(action: ActionKey): Record<HandLabel, ActionKey[]> {
  const out = {} as Record<HandLabel, ActionKey[]>;
  for (const hand of ALL_HAND_CLASSES) {
    out[hand] = [hand === "AA" ? "OPEN_2X" : action];
  }
  return out;
}

function validInput(): MttSixMaxRangePackImportInput {
  return {
    id: "mtt-six-max-regular-preflop-chip-ev-ante-on-import-candidate-v1",
    version: "import-candidate-v1",
    createdAt: "2026-06-03",
    verifiedAt: "2026-06-03",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned export generated for PKRTrainer; no paid chart content copied.",
    assumptions: [
      "MTT 6-max chipEV regular speed import.",
      "Big blind ante is ON.",
      "Source stack 25bb maps to PKRTrainer bucket 25.",
    ],
    searchQueries: [
      "MTT 6-max chipEV preflop import validation",
      "MTT 6max regular ante stack bucket mapping",
      "poker tournament six max preflop legal solver export",
    ],
    sourceEvidence,
    records: [
      {
        position: "BTN",
        sourceStackBB: 25,
        bucket: 25,
        context: "RFI",
        lenient: handMap("FOLD"),
        strict: handMap("FOLD"),
      },
    ],
  };
}

describe("mttSixMaxRangePackImport", () => {
  it("normalizuje legalni 6-max vstup do RangePacku s explicitnimi hand tridami", () => {
    const input = validInput();
    const pack = normalizeMttSixMaxRangePackImport(input);
    const report = buildMttSixMaxImportReadinessReport(input);

    expect(pack.dimensions).toMatchObject({
      gameVariant: "MTT",
      tableFormat: "SIX_MAX",
      evModel: "CHIP_EV",
      ante: "ON",
    });
    expect(pack.records).toHaveLength(1);
    expect(Object.keys(pack.records[0].strict)).toHaveLength(169);
    expect(pack.records[0].strict.AA).toEqual(["OPEN_2X"]);
    expect(report.valid).toBe(true);
    expect(report.productionReady).toBe(false);
    expect(report.records[0]).toMatchObject({
      position: "BTN",
      sourceStackBB: 25,
      bucket: 25,
      explicitHands: 169,
    });
    expect(report.missingPositions).toEqual(["UTG", "HJ", "CO", "SB", "BB"]);
    expect(report.missingContexts).toContain("VS_3BET");
    expect(report.missingBuckets).toContain(150);
    expect(report.warnings).toContain("MTT preflop import has no record for position UTG.");
    expect(report.warnings).toContain("MTT preflop import has no record for action context VS_3BET.");
    expect(report.warnings).toContain("MTT preflop import has no record for stack bucket 150.");
    expect(renderMttSixMaxImportReadinessReport(report)).toContain("stack mapping: 25->25");
    expect(renderMttSixMaxImportReadinessReport(report)).toContain(
      "MTT preflop RangePack import: mtt-six-max-regular-preflop-chip-ev-ante-on-import-candidate-v1",
    );
  });

  it("povoli DOLAR_EV jako samostatny 6-max importni model", () => {
    const input = validInput();
    const report = buildMttSixMaxImportReadinessReport({
      ...input,
      id: "mtt-six-max-regular-preflop-dolar-ev-ante-on-import-candidate-v1",
      dimensions: {
        ...input.dimensions,
        evModel: "DOLAR_EV",
      },
    });

    expect(report.valid).toBe(true);
    expect(report.dimensions.evModel).toBe("DOLAR_EV");
  });

  it("odmitne chybejici hand-class hodnoty", () => {
    const input = validInput();
    const partialStrict = { ...input.records[0].strict };
    delete partialStrict.AA;
    const report = buildMttSixMaxImportReadinessReport({
      ...input,
      records: [{ ...input.records[0], strict: partialStrict }],
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toContain("records[0] is missing 1 hand classes.");
    expect(report.records[0].missingHands).toEqual(["AA"]);
  });

  it("pouziva obecny MTT preflop validator i pro legacy six-max wrapper", () => {
    const report = buildMttSixMaxImportReadinessReport({
      ...validInput(),
      dimensions: {
        ...validInput().dimensions,
        tableFormat: "FULL_RING_9",
        evModel: "ICM",
      },
      licenseKind: "UNKNOWN",
    });

    expect(report.valid).toBe(false);
    expect(report.legalLicense).toBe(false);
    expect(report.errors).not.toContain("MTT 6-max import must use tableFormat SIX_MAX.");
    expect(report.errors).toContain("MTT preflop import must use evModel CHIP_EV or DOLAR_EV.");
    expect(report.errors).toContain(
      "MTT preflop import needs owned export, public permission, or explicit written permission.",
    );
  });
});
