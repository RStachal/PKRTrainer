import { describe, expect, it } from "vitest";

import { POSITION_ORDER } from "../../src/core/types";
import {
  DEFAULT_TRAINING_PROFILE,
  SIX_MAX_POSITION_ORDER,
  defaultRakeModeForVariant,
  isPostflopStreet,
  isProfileSupported,
  isTournamentVariant,
  evModelLabel,
  positionsForFormat,
  profileId,
  profileWith,
} from "../../src/core/trainingProfile";

describe("trainingProfile", () => {
  it("zachova dnesni 9-max poradi pozic", () => {
    expect(positionsForFormat("FULL_RING_9")).toEqual(POSITION_ORDER);
  });

  it("definuje kanonicke 6-max pozice jako podmnozinu stavajicich pozic", () => {
    expect(positionsForFormat("SIX_MAX")).toEqual([
      "UTG",
      "HJ",
      "CO",
      "BTN",
      "SB",
      "BB",
    ]);
    expect(SIX_MAX_POSITION_ORDER).toHaveLength(6);
    expect(new Set(SIX_MAX_POSITION_ORDER).size).toBe(6);
  });

  it("vytvari stabilni profileId se vsemi rozhodujicimi dimenzemi", () => {
    expect(profileId(DEFAULT_TRAINING_PROFILE)).toBe(
      "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE",
    );

    const turboSixMax = profileWith(DEFAULT_TRAINING_PROFILE, {
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
    });

    expect(profileId(turboSixMax)).toBe(
      "MTT|SIX_MAX|TURBO|PREFLOP|CHIP_EV|ON|NONE",
    );

    expect(profileId(profileWith(DEFAULT_TRAINING_PROFILE, {
      evModel: "DOLAR_EV",
    }))).toBe("MTT|FULL_RING_9|REGULAR|PREFLOP|DOLAR_EV|ON|NONE");
  });

  it("rozlisuje turnajove/cash a preflop/postflop profily", () => {
    expect(isTournamentVariant("MTT")).toBe(true);
    expect(isTournamentVariant("SNG")).toBe(true);
    expect(isTournamentVariant("CASH")).toBe(false);
    expect(isPostflopStreet("PREFLOP")).toBe(false);
    expect(isPostflopStreet("FLOP")).toBe(true);
  });

  it("rezervuje rake/no-rake pro cash a chipEV/dolarEV/ICM pro SNG", () => {
    expect(defaultRakeModeForVariant("MTT")).toBe("NONE");
    expect(defaultRakeModeForVariant("CASH")).toBe("NO_RAKE");
    expect(isProfileSupported(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "SNG",
      evModel: "ICM",
    }))).toBe(true);
    expect(isProfileSupported(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "SNG",
      evModel: "DOLAR_EV",
    }))).toBe(false);
    expect(isProfileSupported(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      rakeMode: "NONE",
    }))).toBe(false);
  });

  it("labeluje ev modely bez raw enumu pro UI", () => {
    expect(evModelLabel("CHIP_EV")).toBe("chipEV");
    expect(evModelLabel("DOLAR_EV")).toBe("$EV");
    expect(evModelLabel("ICM")).toBe("ICM");
  });
});
