import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import {
  allCashPreflopRangePacks,
  cashCandidateImportReportForProfile,
  cashPreflopRangePackForProfile,
  cashSixMaxPreflopRangePackCandidates,
} from "../../src/data/ranges/cashPreflopRangePacks";
import { rangePackMatchesTrainingProfile } from "../../src/data/ranges/rangePackProfileGuard";
import { validateRangePack } from "../../src/data/ranges/rangePack";
import { mttPreflopAnteOffRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { sngChipEvPreflopRangePackCandidates } from "../../src/data/ranges/sngPreflopRangePacks";

describe("cashPreflopRangePacks", () => {
  it("pripravuje rake a no-rake cash 6-max candidate RangePacky bez records", () => {
    expect(cashSixMaxPreflopRangePackCandidates).toHaveLength(2);
    expect(allCashPreflopRangePacks).toHaveLength(2);
    expect(cashSixMaxPreflopRangePackCandidates.map((pack) => pack.dimensions.rakeMode))
      .toEqual(["RAKE", "NO_RAKE"]);

    for (const pack of cashSixMaxPreflopRangePackCandidates) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.confidence).toBe("LOW");
      expect(pack.records).toEqual([]);
      expect(pack.dimensions).toMatchObject({
        gameVariant: "CASH",
        tableFormat: "SIX_MAX",
        blindSpeed: "REGULAR",
        street: "PREFLOP",
        evModel: "CHIP_EV",
        ante: "OFF",
      });
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(5);
      expect(pack.assumptions.join(" ")).toContain("must never be reused for MTT or SNG");
    }
  });

  it("najde cash candidate podle plneho profilu a oddeli rake dimenzi", () => {
    const rakeProfile = profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "RAKE",
    });
    const noRakeProfile = profileWith(rakeProfile, { rakeMode: "NO_RAKE" });

    expect(cashPreflopRangePackForProfile(rakeProfile)?.id)
      .toBe("cash-six-max-regular-preflop-chip-ev-rake-candidate-v0");
    expect(cashPreflopRangePackForProfile(noRakeProfile)?.id)
      .toBe("cash-six-max-regular-preflop-chip-ev-no-rake-candidate-v0");
    expect(cashCandidateImportReportForProfile(rakeProfile)?.warnings)
      .toContain("RangePack has no records.");
    expect(cashCandidateImportReportForProfile(noRakeProfile)?.sourceCount)
      .toBeGreaterThanOrEqual(5);
  });

  it("nevybere cash pack pro MTT/SNG ani pri podobnem table formatu", () => {
    const cashProfile = profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "RAKE",
    });
    const cashPack = cashPreflopRangePackForProfile(cashProfile);
    expect(cashPack).toBeDefined();

    const mttLikeProfile = profileWith(cashProfile, {
      gameVariant: "MTT",
      rakeMode: "NONE",
    });
    const sngLikeProfile = profileWith(cashProfile, {
      gameVariant: "SNG",
      rakeMode: "NONE",
    });

    expect(cashPreflopRangePackForProfile(mttLikeProfile)).toBeUndefined();
    expect(cashPreflopRangePackForProfile(sngLikeProfile)).toBeUndefined();
    expect(rangePackMatchesTrainingProfile(cashProfile, mttPreflopAnteOffRangePack))
      .toBe(false);
    expect(rangePackMatchesTrainingProfile(cashProfile, sngChipEvPreflopRangePackCandidates[0]))
      .toBe(false);
    expect(rangePackMatchesTrainingProfile(mttLikeProfile, cashPack!)).toBe(false);
    expect(rangePackMatchesTrainingProfile(sngLikeProfile, cashPack!)).toBe(false);
  });
});
