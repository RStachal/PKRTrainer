import { describe, expect, it } from "vitest";

import {
  staticTrainingCapability,
  type TrainingCapabilityStatus,
} from "../../src/core/trainingCapability";
import {
  profileWith,
  DEFAULT_TRAINING_PROFILE,
  type BlindSpeed,
  type EvModel,
  type GameVariant,
  type RakeMode,
  type TableFormat,
  type TrainingProfile,
  type TrainingStreet,
} from "../../src/core/trainingProfile";
import type { AnteMode } from "../../src/core/types";
import { trainingCapabilityForProfile } from "../../src/data/ranges/trainingCapability";

const VARIANTS: readonly GameVariant[] = ["MTT", "SNG", "CASH"];
const FORMATS: readonly TableFormat[] = ["FULL_RING_9", "SIX_MAX"];
const SPEEDS: readonly BlindSpeed[] = ["REGULAR", "TURBO"];
const STREETS: readonly TrainingStreet[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];
const EV_MODELS: readonly EvModel[] = ["CHIP_EV", "DOLAR_EV", "ICM"];
const ANTES: readonly AnteMode[] = ["ON", "OFF"];
const RAKE_MODES: readonly RakeMode[] = ["NONE", "RAKE", "NO_RAKE"];

function allProfiles(): TrainingProfile[] {
  return VARIANTS.flatMap((gameVariant) => (
    FORMATS.flatMap((tableFormat) => (
      SPEEDS.flatMap((blindSpeed) => (
        STREETS.flatMap((street) => (
          EV_MODELS.flatMap((evModel) => (
            ANTES.flatMap((ante) => (
              RAKE_MODES.map((rakeMode) => ({
                gameVariant,
                tableFormat,
                blindSpeed,
                street,
                evModel,
                ante,
                rakeMode,
              }))
            ))
          ))
        ))
      ))
    ))
  ));
}

describe("training capability matrix", () => {
  it("klasifikuje exhaustive kartesky profil bez neurciteho stavu", () => {
    const profiles = allProfiles();
    const statuses = new Set<TrainingCapabilityStatus>();

    expect(profiles).toHaveLength(864);
    for (const profile of profiles) {
      const capability = trainingCapabilityForProfile(profile);
      statuses.add(capability.status);
      expect(capability.reason.length, JSON.stringify(profile)).toBeGreaterThan(0);
      expect(
        capability.status === "PRODUCTION" ? capability.canStartTraining : true,
        JSON.stringify(profile),
      ).toBe(true);
      if (capability.status === "UNSUPPORTED") {
        expect(capability.allowedFlowModes, JSON.stringify(profile)).toEqual([]);
        expect(capability.canStartTraining, JSON.stringify(profile)).toBe(false);
      }
    }
    expect(statuses).toEqual(new Set([
      "PREVIEW",
      "BLOCKED",
      "UNSUPPORTED",
    ]));
    expect(trainingCapabilityForProfile(DEFAULT_TRAINING_PROFILE)).toMatchObject({
      status: "BLOCKED",
      canStartTraining: false,
    });
  });

  it("drzi MTT v1 na 64 legalnich profilech a nepovoli ICM", () => {
    const legalMtt = allProfiles().filter((profile) => (
      profile.gameVariant === "MTT" &&
      staticTrainingCapability(profile).status !== "UNSUPPORTED"
    ));

    expect(legalMtt).toHaveLength(64);
    expect(staticTrainingCapability(profileWith(DEFAULT_TRAINING_PROFILE, {
      evModel: "ICM",
    })).status).toBe("UNSUPPORTED");
  });

  it("povoli SNG a Cash jen v deklarovanem preview scope", () => {
    expect(trainingCapabilityForProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "SNG",
      evModel: "ICM",
    })).status).toBe("PREVIEW");
    expect(trainingCapabilityForProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "SNG",
      street: "FLOP",
    })).status).toBe("UNSUPPORTED");
    expect(trainingCapabilityForProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      ante: "OFF",
      rakeMode: "RAKE",
    })).status).toBe("PREVIEW");
    expect(trainingCapabilityForProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      street: "FLOP",
      ante: "OFF",
      rakeMode: "RAKE",
    })).status).toBe("UNSUPPORTED");
  });
});
