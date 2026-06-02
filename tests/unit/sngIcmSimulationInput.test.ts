import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import {
  sngChipEvPreflopRangePackCandidates,
  sngIcmCandidateSimulationInputs,
  sngIcmPreflopRangePackCandidates,
} from "../../src/data/ranges/sngPreflopRangePacks";
import {
  buildSngIcmSimulationInput,
  validateSngIcmSimulationInput,
} from "../../src/data/ranges/sngIcmSimulationInput";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";

describe("sngIcmSimulationInput", () => {
  it("pripravi explicitni simulation input pro kazdy SNG ICM candidate pack", () => {
    expect(sngIcmCandidateSimulationInputs).toHaveLength(8);

    for (const input of sngIcmCandidateSimulationInputs) {
      expect(validateSngIcmSimulationInput(input)).toEqual([]);
      expect(input.rangePackId).toContain("preflop-icm");
      expect(input.payoutStructure.paidPlaces).toBeGreaterThan(0);
      expect(input.remainingPlayers).toBe(input.stackDistribution.remainingPlayers);
      expect(input.stackDistribution.stacks).toHaveLength(input.remainingPlayers);
      expect(input.bubbleFactor).toBeGreaterThan(1);
      expect(input.supportedSpotTypes).toEqual([
        "PUSH_FOLD",
        "CALL_ALL_IN",
        "REJAM",
      ]);
      expect(input.sourceUrls.length).toBeGreaterThanOrEqual(2);
      expect(input.assumptions.join(" ")).toContain("ICM metadata");
    }
  });

  it("odmitne chipEV nebo MTT pack jako ICM simulation input", () => {
    expect(() => buildSngIcmSimulationInput(sngChipEvPreflopRangePackCandidates[0]))
      .toThrow("SNG ICM simulation input requires an SNG ICM RangePack.");
    expect(() => buildSngIcmSimulationInput(currentMttPreflopRangePack("ON")))
      .toThrow("SNG ICM simulation input requires an SNG ICM RangePack.");
  });

  it("validuje konzistenci remainingPlayers a spotType", () => {
    const input = buildSngIcmSimulationInput(sngIcmPreflopRangePackCandidates[0]);

    expect(validateSngIcmSimulationInput({
      ...input,
      remainingPlayers: input.remainingPlayers + 1,
      spotType: "REJAM",
      supportedSpotTypes: ["PUSH_FOLD"],
    })).toEqual([
      "remainingPlayers must match stackDistribution.remainingPlayers.",
      "spotType must be included in supportedSpotTypes.",
    ]);
  });

  it("nepouziva defaultni MTT profil jako simulacni zdroj", () => {
    expect(DEFAULT_TRAINING_PROFILE.gameVariant).toBe("MTT");
    expect(sngIcmCandidateSimulationInputs.some((input) => (
      input.rangePackId.includes(DEFAULT_TRAINING_PROFILE.gameVariant.toLowerCase())
    ))).toBe(false);
  });
});
