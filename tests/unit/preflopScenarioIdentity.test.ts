import { describe, expect, it } from "vitest";

import { preflopScenarioId } from "../../src/core/preflopScenarioIdentity";
import {
  DEFAULT_TRAINING_PROFILE,
  profileWith,
} from "../../src/core/trainingProfile";
import type { Spot } from "../../src/core/types";

const spot: Spot = {
  id: "RFI|BTN|25|AKs|ON",
  context: "RFI",
  heroPos: "BTN",
  effStack: 25,
  ante: "ON",
  pushFold: false,
  hand: "AKs",
  heroCards: [
    { rank: "A", suit: "s" },
    { rank: "K", suit: "s" },
  ],
  tableState: {
    heroPos: "BTN",
    pushFold: false,
    limpsBefore: 0,
    callsBefore: 0,
    facing: "NONE",
    isBvB: false,
  },
  answers: [
    { key: "FOLD", label: "Fold" },
    { key: "OPEN_2X", label: "Open 2x" },
  ],
  correctKeys: ["OPEN_2X"],
  strictCorrect: ["OPEN_2X"],
  explanation: "Test.",
  startingPot: 2.5,
};

describe("preflopScenarioId", () => {
  it("oddeli jinak shodny spot podle celeho training profilu", () => {
    const regularChipEv = DEFAULT_TRAINING_PROFILE;
    const turboChipEv = profileWith(regularChipEv, { blindSpeed: "TURBO" });
    const regularDollarEv = profileWith(regularChipEv, { evModel: "DOLAR_EV" });
    const sixMax = profileWith(regularChipEv, { tableFormat: "SIX_MAX" });

    const ids = [
      preflopScenarioId(regularChipEv, spot),
      preflopScenarioId(turboChipEv, spot),
      preflopScenarioId(regularDollarEv, spot),
      preflopScenarioId(sixMax, spot),
    ];

    expect(new Set(ids).size).toBe(ids.length);
    expect(preflopScenarioId(regularChipEv, spot))
      .toBe(preflopScenarioId(regularChipEv, spot));
  });

  it("rozlisuje rozhodujici stav stolu i pri stejnem Question_ID", () => {
    const facingOpen: Spot = {
      ...spot,
      tableState: {
        ...spot.tableState,
        facing: "OPEN",
        callsBefore: 1,
      },
    };

    expect(preflopScenarioId(DEFAULT_TRAINING_PROFILE, facingOpen))
      .not.toBe(preflopScenarioId(DEFAULT_TRAINING_PROFILE, spot));
  });
});
