import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { validateRangePack } from "../../src/data/ranges/rangePack";
import {
  allSngPreflopRangePacks,
  sngChipEvCandidateImportReports,
  sngChipEvPreflopRangePackCandidates,
  sngIcmCandidateImportReports,
  sngIcmPreflopRangePackCandidates,
  sngPreflopRangePackForProfile,
} from "../../src/data/ranges/sngPreflopRangePacks";
import { renderRangePackImportReport } from "../../src/data/ranges/rangePackImport";
import {
  allTrainingRangePacks,
  rangePackForTrainingProfile,
} from "../../src/data/ranges/trainingRangePacks";

describe("sngPreflopRangePacks", () => {
  it("pripravuje SNG chipEV candidate packy pro format, speed a ante", () => {
    expect(sngChipEvPreflopRangePackCandidates).toHaveLength(8);

    for (const pack of sngChipEvPreflopRangePackCandidates) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.confidence).toBe("LOW");
      expect(pack.dimensions).toMatchObject({
        gameVariant: "SNG",
        street: "PREFLOP",
        evModel: "CHIP_EV",
        rakeMode: "NONE",
      });
      expect(pack.searchQueries).toHaveLength(4);
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(5);
      expect(pack.records).toHaveLength(0);
      expect(pack.assumptions.join(" ")).toContain("ICM model");
    }
  });

  it("pripravuje SNG ICM candidate packy se simulatorovou evidenci", () => {
    expect(sngIcmPreflopRangePackCandidates).toHaveLength(8);
    expect(allSngPreflopRangePacks).toHaveLength(16);

    for (const pack of sngIcmPreflopRangePackCandidates) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.confidence).toBe("LOW");
      expect(pack.dimensions).toMatchObject({
        gameVariant: "SNG",
        street: "PREFLOP",
        evModel: "ICM",
        rakeMode: "NONE",
      });
      expect(pack.searchQueries).toHaveLength(4);
      expect(pack.sourceEvidence.map((source) => source.provider)).toEqual([
        "ICMIZER",
        "ICMIZER",
        "ICMIZER",
        "HoldemResources",
        "VIP Grinders",
      ]);
      expect(pack.icmContext?.payoutStructure.paidPlaces).toBeGreaterThan(0);
      expect(pack.icmContext?.bubbleFactor).toBeGreaterThan(1);
      expect(pack.icmSpotTypes).toEqual(["PUSH_FOLD", "CALL_ALL_IN", "REJAM"]);
      expect(pack.records).toHaveLength(0);
    }
  });

  it("oddeli SNG chipEV a ICM candidate import reporty", () => {
    expect(sngChipEvCandidateImportReports).toHaveLength(8);
    expect(sngIcmCandidateImportReports).toHaveLength(8);

    for (const report of sngChipEvCandidateImportReports) {
      expect(report.valid).toBe(true);
      expect(report.dimensions.evModel).toBe("CHIP_EV");
      expect(report.icm).toBeUndefined();
      expect(report.recordCount).toBe(0);
      expect(report.warnings).toEqual([
        "RangePack confidence is LOW; review before production use.",
        "RangePack has no records.",
      ]);
    }

    for (const report of sngIcmCandidateImportReports) {
      expect(report.valid).toBe(true);
      expect(report.dimensions.evModel).toBe("ICM");
      expect(report.icm?.payoutStructureId).toMatch(/^SNG_/);
      expect(report.icm?.remainingPlayers).toBeGreaterThan(1);
      expect(report.icm?.heroStackBB).toBeGreaterThan(0);
      expect(report.icm?.bubbleFactor).toBeGreaterThan(1);
      expect(report.icm?.supportedSpotTypes).toEqual([
        "PUSH_FOLD",
        "CALL_ALL_IN",
        "REJAM",
      ]);
    }

    expect(renderRangePackImportReport(sngIcmCandidateImportReports[0]))
      .toContain("icm payout: SNG_9_MAX_TOP_3");
  });

  it("najde SNG chipEV RangePack podle plneho profilu", () => {
    const profile = profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "SNG",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      ante: "ON",
      evModel: "CHIP_EV",
    });

    expect(sngPreflopRangePackForProfile(profile)?.id).toBe(
      "sng-full-ring-9-regular-preflop-chip-ev-ante-on-candidate-v0",
    );
    expect(rangePackForTrainingProfile(profile)?.id).toBe(
      "sng-full-ring-9-regular-preflop-chip-ev-ante-on-candidate-v0",
    );
  });

  it("najde SNG ICM RangePack podle plneho profilu", () => {
    const profile = profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "SNG",
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      ante: "OFF",
      evModel: "ICM",
    });

    expect(sngPreflopRangePackForProfile(profile)?.id).toBe(
      "sng-six-max-turbo-preflop-icm-ante-off-candidate-v0",
    );
    expect(rangePackForTrainingProfile(profile)?.icmSpotTypes).toEqual([
      "PUSH_FOLD",
      "CALL_ALL_IN",
      "REJAM",
    ]);
  });

  it("nikdy nezamicha chipEV a ICM pack pri profilovem vyhledani", () => {
    for (const chipEvPack of sngChipEvPreflopRangePackCandidates) {
      const resolved = sngPreflopRangePackForProfile({
        ...DEFAULT_TRAINING_PROFILE,
        ...chipEvPack.dimensions,
      });

      expect(resolved?.dimensions.evModel).toBe("CHIP_EV");
      expect(resolved?.id).toContain("chip-ev");
      expect(resolved?.id).not.toContain("icm");
      expect(resolved?.icmContext).toBeUndefined();
    }

    for (const icmPack of sngIcmPreflopRangePackCandidates) {
      const resolved = sngPreflopRangePackForProfile({
        ...DEFAULT_TRAINING_PROFILE,
        ...icmPack.dimensions,
      });

      expect(resolved?.dimensions.evModel).toBe("ICM");
      expect(resolved?.id).toContain("icm");
      expect(resolved?.id).not.toContain("chip-ev");
      expect(resolved?.icmContext).not.toBeUndefined();
    }
  });

  it("spolecny katalog obsahuje MTT i SNG profile packy", () => {
    expect(allTrainingRangePacks.length).toBeGreaterThan(
      sngChipEvPreflopRangePackCandidates.length,
    );
    expect(allTrainingRangePacks.some((pack) => pack.dimensions.gameVariant === "MTT"))
      .toBe(true);
    expect(allTrainingRangePacks.some((pack) => pack.dimensions.gameVariant === "SNG"))
      .toBe(true);
  });
});
