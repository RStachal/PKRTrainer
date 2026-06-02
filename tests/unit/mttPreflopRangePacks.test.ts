import { describe, expect, it } from "vitest";

import {
  allMttPreflopRangePacks,
  currentMttPreflopRangePack,
  mttPreflopRangePackForProfile,
  mttPreflopAnteOffRangePack,
  mttPreflopAnteOnRangePack,
  mttPreflopRangePacks,
  mttSixMaxCandidateImportReports,
  mttSixMaxPreflopRangePackCandidates,
} from "../../src/data/ranges/mttPreflopRangePacks";
import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { rangePackToRangeFile, validateRangePack } from "../../src/data/ranges/rangePack";
import { anteOffRanges } from "../../src/data/ranges/ante-off";
import { anteOnRanges } from "../../src/data/ranges/ante-on";

describe("mttPreflopRangePacks", () => {
  it("obali stavajici ante-on a ante-off data do RangePack v2 bez zmeny records", () => {
    expect(rangePackToRangeFile(mttPreflopAnteOnRangePack)).toEqual(anteOnRanges);
    expect(rangePackToRangeFile(mttPreflopAnteOffRangePack)).toEqual(anteOffRanges);
  });

  it("ma validni metadata a sourcing pro obe aktualni MTT range sady", () => {
    expect(mttPreflopRangePacks).toHaveLength(2);

    for (const pack of mttPreflopRangePacks) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.dimensions).toMatchObject({
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeed: "REGULAR",
        street: "PREFLOP",
        evModel: "CHIP_EV",
        rakeMode: "NONE",
      });
      expect(pack.searchQueries).toHaveLength(4);
      expect(pack.searchQueries.join(" ")).toContain("turbo");
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(5);
      expect(pack.sourceEvidence.map((source) => source.provider)).toEqual([
        "GTO Wizard",
        "Poker Academy",
        "GTO Sims",
        "GTOBase",
        "PokerCoaching",
      ]);
      expect(pack.assumptions.join(" ")).toContain("converted without changing recommendations");
      expect(pack.assumptions.join(" ")).toContain("Turbo currently changes blind schedule");
    }
  });

  it("vybere aktualni RangePack podle ante modu", () => {
    expect(currentMttPreflopRangePack("ON")).toBe(mttPreflopAnteOnRangePack);
    expect(currentMttPreflopRangePack("OFF")).toBe(mttPreflopAnteOffRangePack);
  });

  it("pripravuje 6-max candidate RangePacky bez produkcnich records", () => {
    expect(mttSixMaxPreflopRangePackCandidates).toHaveLength(4);
    expect(allMttPreflopRangePacks).toHaveLength(6);

    for (const pack of mttSixMaxPreflopRangePackCandidates) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.confidence).toBe("LOW");
      expect(pack.dimensions).toMatchObject({
        gameVariant: "MTT",
        tableFormat: "SIX_MAX",
        street: "PREFLOP",
        evModel: "CHIP_EV",
        rakeMode: "NONE",
      });
      expect(pack.searchQueries).toHaveLength(4);
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(5);
      expect(pack.records).toHaveLength(0);
      expect(pack.assumptions.join(" ")).toContain("Candidate RangePack");
    }
  });

  it("vytvori import reporty pro 6-max candidate packy pred produkcnim zapojenim", () => {
    expect(mttSixMaxCandidateImportReports).toHaveLength(4);

    for (const report of mttSixMaxCandidateImportReports) {
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.sourceCount).toBeGreaterThanOrEqual(5);
      expect(report.searchQueryCount).toBe(4);
      expect(report.recordCount).toBe(0);
      expect(report.totalExplicitHands).toBe(0);
      expect(report.totalImpliedFolds).toBe(0);
      expect(report.warnings).toEqual([
        "RangePack confidence is LOW; review before production use.",
        "RangePack has no records.",
      ]);
    }
  });

  it("najde RangePack podle plneho treninkoveho profilu", () => {
    expect(mttPreflopRangePackForProfile(DEFAULT_TRAINING_PROFILE)).toBe(
      mttPreflopAnteOnRangePack,
    );

    const sixMaxTurbo = profileWith(DEFAULT_TRAINING_PROFILE, {
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      ante: "OFF",
    });

    expect(mttPreflopRangePackForProfile(sixMaxTurbo)?.id).toBe(
      "mtt-six-max-turbo-preflop-chip-ev-ante-off-candidate-v0",
    );
  });
});
