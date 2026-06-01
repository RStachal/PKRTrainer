import { describe, expect, it } from "vitest";

import type { RangePack } from "../../src/data/ranges/rangePack";
import {
  buildRangePackImportReport,
  normalizeRangeRecord,
  renderRangePackImportReport,
} from "../../src/data/ranges/rangePackImport";

const pack: RangePack = {
  id: "mtt-full-ring-regular-preflop-chip-ev-v2",
  version: "2026-06-01",
  createdAt: "2026-06-01",
  verifiedAt: "2026-06-01",
  confidence: "HIGH",
  dimensions: {
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    blindSpeed: "REGULAR",
    street: "PREFLOP",
    evModel: "CHIP_EV",
    ante: "ON",
    rakeMode: "NONE",
  },
  assumptions: ["chipEV", "9-max", "big blind ante"],
  searchQueries: [
    "MTT preflop charts 9 max chip EV",
    "GTO Wizard tournament preflop 9 max",
    "PokerCoaching tournament preflop charts",
  ],
  sourceEvidence: [
    {
      title: "GTO Wizard multiway preflop solving",
      url: "https://blog.gtowizard.com/introducing-multiway-preflop-solving/",
      provider: "GTO Wizard",
      verifiedAt: "2026-06-01",
      licenseNote: "Evidence only.",
    },
    {
      title: "PokerCoaching preflop charts",
      url: "https://pages.pokercoaching.com/100bb-charts/",
      provider: "PokerCoaching",
      verifiedAt: "2026-06-01",
      licenseNote: "Evidence only.",
    },
  ],
  records: [
    {
      position: "BTN",
      bucket: 25,
      context: "RFI",
      lenient: {
        AA: ["OPEN_2X"],
        KQo: ["OPEN_2X", "FOLD"],
      },
      strict: {
        AA: ["OPEN_2X"],
        KQo: ["OPEN_2X"],
      },
    },
  ],
};

describe("rangePackImport", () => {
  it("normalizuje RangePack record na vsech 169 hand trid s implied fold", () => {
    const normalized = normalizeRangeRecord(pack.records[0]);

    expect(normalized.cells).toHaveLength(169);
    expect(normalized.cells.find((cell) => cell.hand === "AA")).toEqual({
      hand: "AA",
      strict: ["OPEN_2X"],
      lenient: ["OPEN_2X"],
      impliedFold: false,
    });
    expect(normalized.cells.find((cell) => cell.hand === "72o")).toEqual({
      hand: "72o",
      strict: ["FOLD"],
      lenient: ["FOLD"],
      impliedFold: true,
    });
  });

  it("vytvori validacni import report s pocty a sourcing disciplinou", () => {
    const report = buildRangePackImportReport(pack);

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.sourceCount).toBe(2);
    expect(report.searchQueryCount).toBe(3);
    expect(report.totalExplicitHands).toBe(2);
    expect(report.totalImpliedFolds).toBe(167);
    expect(report.records[0].strictActionCounts).toMatchObject({
      FOLD: 167,
      OPEN_2X: 2,
    });
  });

  it("renderuje textovy report pro review importu", () => {
    const text = renderRangePackImportReport(buildRangePackImportReport({
      ...pack,
      confidence: "LOW",
      assumptions: [],
    }));

    expect(text).toContain("RangePack: mtt-full-ring-regular-preflop-chip-ev-v2");
    expect(text).toContain("valid: true");
    expect(text).toContain("warnings:");
    expect(text).toContain("RangePack should describe chart assumptions.");
    expect(text).toContain("RangePack confidence is LOW; review before production use.");
  });
});
