import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import {
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type HandLabel,
  type Position,
} from "../../src/core/types";
import type { RangeSourceEvidence } from "../../src/data/ranges/rangePack";
import {
  buildMttPreflopImportReadinessReport,
  normalizeMttPreflopRangePackImport,
  renderMttPreflopImportReadinessReport,
  type MttPreflopRangePackImportInput,
} from "../../src/data/ranges/mttPreflopRangePackImport";

const ACTION_CONTEXTS: readonly ActionContext[] = [
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

const FULL_RING_POSITIONS: readonly Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];

const PRIMARY_ACTION_BY_CONTEXT: Record<ActionContext, ActionKey> = {
  RFI: "OPEN_2X",
  VS_LIMP: "ISO_3X",
  VS_OPEN: "3BET",
  VS_3BET: "4BET",
  VS_4BET: "CALL_JAM",
  SQUEEZE: "SQUEEZE",
  BVB: "OPEN_2X",
  PUSH_FOLD: "JAM",
  VS_ALLIN: "CALL_JAM",
};

const sourceEvidence: RangeSourceEvidence[] = [
  {
    title: "Owned solver export manifest",
    url: "https://example.test/mtt-preflop-solver-export",
    provider: "PKRTrainer",
    verifiedAt: "2026-06-04",
    licenseNote: "Owned solver export; redistribution inside this project is permitted.",
  },
  {
    title: "Independent review notes",
    url: "https://example.test/mtt-preflop-review",
    provider: "PKRTrainer Review",
    verifiedAt: "2026-06-04",
    licenseNote: "Review metadata only; no third-party chart values copied.",
  },
];

function handMap(action: ActionKey): Record<HandLabel, ActionKey[]> {
  const out = {} as Record<HandLabel, ActionKey[]>;
  for (const hand of ALL_HAND_CLASSES) {
    out[hand] = [hand === "AA" ? action : "FOLD"];
  }
  return out;
}

function fullRingTurboInput(): MttPreflopRangePackImportInput {
  return {
    id: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-import-v1",
    version: "import-v1",
    createdAt: "2026-06-04",
    verifiedAt: "2026-06-04",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned export generated for PKRTrainer; no paid chart content copied.",
    assumptions: [
      "MTT FULL_RING_9 chipEV turbo import.",
      "Ante ON with big blind ante structure.",
      "Source stacks map directly to PKRTrainer stack buckets.",
    ],
    searchQueries: [
      "MTT 9-max turbo chipEV preflop import validation",
      "MTT full ring turbo ante stack bucket mapping",
      "poker tournament 9max preflop legal solver export",
    ],
    sourceEvidence,
    records: STACK_BUCKETS.map((bucket, index) => {
      const context = ACTION_CONTEXTS[index % ACTION_CONTEXTS.length];
      return {
        position: FULL_RING_POSITIONS[index % FULL_RING_POSITIONS.length],
        sourceStackBB: bucket,
        bucket,
        context,
        lenient: handMap(PRIMARY_ACTION_BY_CONTEXT[context]),
        strict: handMap(PRIMARY_ACTION_BY_CONTEXT[context]),
      };
    }),
  };
}

describe("mttPreflopRangePackImport", () => {
  it("normalizuje legalni 9-max turbo vstup a overi production readiness coverage", () => {
    const input = fullRingTurboInput();
    const pack = normalizeMttPreflopRangePackImport(input);
    const report = buildMttPreflopImportReadinessReport(input);

    expect(pack.dimensions).toMatchObject({
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      evModel: "CHIP_EV",
      ante: "ON",
    });
    expect(pack.records).toHaveLength(STACK_BUCKETS.length);
    expect(Object.keys(pack.records[0].strict)).toHaveLength(169);
    expect(report.valid).toBe(true);
    expect(report.productionReady).toBe(true);
    expect(report.missingPositions).toEqual([]);
    expect(report.missingContexts).toEqual([]);
    expect(report.missingBuckets).toEqual([]);
    expect(report.duplicateRecordKeys).toEqual([]);
    expect(report.records[0].strictActionDistribution).toEqual([
      { action: "FOLD", count: 168, pct: 99.4 },
      { action: "OPEN_2X", count: 1, pct: 0.6 },
    ]);
    expect(renderMttPreflopImportReadinessReport(report)).toContain(
      "MTT preflop RangePack import: mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-import-v1",
    );
    expect(renderMttPreflopImportReadinessReport(report)).toContain("action distribution:");
  });

  it("zpresneny zaznam s otviracem projde vedle obecneho a nezahodi se", () => {
    // Bod 234: produkční cesta `vsSeat` při normalizaci zahazovala a dva
    // záznamy téže buňky lišící se otvíračem hlásila jako duplicitu. Zpřesněný
    // záznam je nadstavba nad obecným - úplnost packu se počítá jen z obecných.
    const input = fullRingTurboInput();
    const general = input.records.find((record) => record.context === "VS_OPEN")!;
    const refined = {
      ...general,
      vsSeat: "BTN" as const,
      provenance: "test: koupený chart vlastníka, schváleno 2026-09-15",
      strict: handMap("3BET"),
      lenient: handMap("3BET"),
    };
    const withRefined = { ...input, records: [...input.records, refined] };
    const pack = normalizeMttPreflopRangePackImport(withRefined);
    const stored = pack.records.filter((record) => (
      record.context === "VS_OPEN" && record.position === general.position && record.bucket === general.bucket
    ));
    expect(stored.map((record) => record.vsSeat)).toEqual([undefined, "BTN"]);
    expect(stored[1].provenance).toContain("koupený chart");
    expect(stored[1].strict.AA).toEqual(["3BET"]);
    const report = buildMttPreflopImportReadinessReport(withRefined);
    expect(report.duplicateRecordKeys).toEqual([]);
    expect(report.productionReady).toBe(true);
    // Táž sedačka podruhé už duplicita je.
    const twice = { ...input, records: [...input.records, refined, refined] };
    expect(buildMttPreflopImportReadinessReport(twice).duplicateRecordKeys)
      .toEqual([`${general.position}|${general.bucket}|VS_OPEN|vsBTN`]);
  });

  it("povoli DOLAR_EV jako samostatny MTT preflop importni model", () => {
    const input = fullRingTurboInput();
    const report = buildMttPreflopImportReadinessReport({
      ...input,
      id: "mtt-full-ring-9-turbo-preflop-dolar-ev-ante-on-import-v1",
      dimensions: {
        ...input.dimensions,
        evModel: "DOLAR_EV",
      },
    });

    expect(report.valid).toBe(true);
    expect(report.dimensions.evModel).toBe("DOLAR_EV");
  });

  it("reportuje trivialni all-fold mapy a chybejici kontextovou akci", () => {
    const input = fullRingTurboInput();
    const report = buildMttPreflopImportReadinessReport({
      ...input,
      records: [
        {
          ...input.records[0],
          strict: handMap("FOLD"),
          lenient: handMap("FOLD"),
        },
        ...input.records.slice(1),
      ],
    });

    expect(report.valid).toBe(true);
    expect(report.productionReady).toBe(false);
    expect(report.warnings).toContain("UTG/5/RFI/strict is a trivial all-FOLD map and needs explicit review.");
    expect(report.warnings).toContain("UTG/5/RFI/strict has no expected non-fold action for RFI.");
  });

  it("odmitne nelegalni licenci, chybejici hand class a pozici mimo format", () => {
    const input = fullRingTurboInput();
    const partialStrict = { ...input.records[0].strict };
    delete partialStrict.AA;
    const report = buildMttPreflopImportReadinessReport({
      ...input,
      dimensions: {
        ...input.dimensions,
        tableFormat: "SIX_MAX",
      },
      licenseKind: "UNKNOWN",
      records: [
        {
          ...input.records[0],
          position: "UTG+1",
          strict: partialStrict,
        },
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.legalLicense).toBe(false);
    expect(report.errors).toContain(
      "MTT preflop import needs owned export, public permission, or explicit written permission.",
    );
    expect(report.errors).toContain("records[0].position is not valid for SIX_MAX.");
    expect(report.errors).toContain("records[0] is missing 1 hand classes.");
    expect(report.records[0].missingHands).toEqual(["AA"]);
  });

  it("reportuje 6-max regular coverage mezery pred povysenim candidate packu", () => {
    const input = fullRingTurboInput();
    const report = buildMttPreflopImportReadinessReport({
      ...input,
      id: "mtt-six-max-regular-preflop-chip-ev-ante-off-import-v1",
      dimensions: {
        ...input.dimensions,
        tableFormat: "SIX_MAX",
        blindSpeed: "REGULAR",
        ante: "OFF",
      },
      assumptions: [
        "MTT SIX_MAX chipEV regular import.",
        "Ante OFF structure.",
      ],
      records: [
        {
          ...input.records[0],
          position: "BTN",
          bucket: 25,
          sourceStackBB: 25,
          context: "RFI",
        },
      ],
    });

    expect(report.valid).toBe(true);
    expect(report.productionReady).toBe(false);
    expect(report.missingPositions).toEqual(["UTG", "HJ", "CO", "SB", "BB"]);
    expect(report.missingContexts).toContain("VS_3BET");
    expect(report.missingBuckets).toContain(150);
    expect(renderMttPreflopImportReadinessReport(report)).toContain(
      "missing positions: UTG,HJ,CO,SB,BB",
    );
  });

  it("blokuje akci nelegalni pro node, duplicitni akci a strict mimo lenient", () => {
    const input = fullRingTurboInput();
    const lenient = { ...input.records[0].lenient, AA: ["FOLD" as const] };
    const strict = {
      ...input.records[0].strict,
      AA: ["CALL" as const, "CALL" as const],
    };
    const report = buildMttPreflopImportReadinessReport({
      ...input,
      records: [
        {
          ...input.records[0],
          context: "RFI",
          lenient,
          strict,
        },
        ...input.records.slice(1),
      ],
    });

    expect(report.valid).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      "records[0].strict.AA contains action CALL illegal for RFI.",
      "records[0].strict.AA contains duplicate actions.",
      "records[0].strict.AA action CALL is missing from lenient.",
    ]));
  });

  it("pocita EV coverage jen kdyz export obsahuje kazdou nabizenou akci", () => {
    const input = fullRingTurboInput();
    const record = input.records[2];
    expect(record.context).toBe("VS_OPEN");
    expect(record.bucket).toBe(15);

    const completeReport = buildMttPreflopImportReadinessReport({
      ...input,
      records: input.records.map((item, index) => index === 2
        ? {
            ...item,
            actionEvs: {
              AA: {
                source: "SOLVER" as const,
                unit: "BB" as const,
                equivalentThresholdBb: 0.01,
                acceptableThresholdBb: 0.05,
                values: [
                  { action: "FOLD" as const, evBb: 0 },
                  { action: "CALL" as const, evBb: 0.204 },
                  { action: "3BET" as const, evBb: 0.21 },
                  // A shove is offered against an open at 15BB, so a complete
                  // export has to price it. This fixture is the "complete" half
                  // of the test, and the whole point of the check is that
                  // "complete" means every action actually on offer.
                  { action: "JAM" as const, evBb: 0.18 },
                ],
              },
            },
          }
        : item),
    });

    expect(completeReport.valid).toBe(true);
    expect(completeReport.actionEvHands).toBe(1);
    expect(completeReport.evReady).toBe(false);

    const partialReport = buildMttPreflopImportReadinessReport({
      ...input,
      records: input.records.map((item, index) => index === 2
        ? {
            ...item,
            actionEvs: {
              AA: {
                source: "SOLVER" as const,
                unit: "BB" as const,
                equivalentThresholdBb: 0.01,
                acceptableThresholdBb: 0.05,
                values: [
                  { action: "CALL" as const, evBb: 0.204 },
                  { action: "3BET" as const, evBb: 0.21 },
                ],
              },
            },
          }
        : item),
    });

    expect(partialReport.valid).toBe(false);
    expect(partialReport.actionEvHands).toBe(0);
    expect(partialReport.errors).toContain(
      "records[2].actionEvs.AA: action FOLD is missing an EV.",
    );
  });
});
