import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { validateRangePack } from "../../src/data/ranges/rangePack";
import {
  sngChipEvPreflopRangePackCandidates,
  sngPreflopRangePackForProfile,
} from "../../src/data/ranges/sngPreflopRangePacks";
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
