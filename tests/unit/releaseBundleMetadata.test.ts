import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { postflopPublicHeuristicStrategyPacks } from "../../src/data/ranges/postflopStrategyPack";
import { validateRangePack } from "../../src/data/ranges/rangePack";
import {
  allTrainingRangePacks,
  rangePackForTrainingProfile,
} from "../../src/data/ranges/trainingRangePacks";

describe("release bundle metadata", () => {
  it("obsahuje nove RangePack/StrategyPack metadata v offline katalogu", () => {
    const ids = allTrainingRangePacks.map((pack) => pack.id);

    expect(ids).toContain("mtt-six-max-regular-preflop-chip-ev-ante-on-candidate-v0");
    expect(ids).toContain("sng-six-max-turbo-preflop-chip-ev-ante-off-candidate-v0");
    expect(ids).toContain("cash-six-max-regular-preflop-chip-ev-rake-candidate-v0");
    expect(ids).toContain("cash-six-max-regular-preflop-chip-ev-no-rake-candidate-v0");
    expect(postflopPublicHeuristicStrategyPacks.map((pack) => pack.id)).toEqual([
      "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
      "mtt-full-ring-9-turn-single-raised-chip-ev-public-heuristic-v1",
      "mtt-full-ring-9-river-single-raised-chip-ev-public-heuristic-v1",
    ]);

    for (const pack of allTrainingRangePacks) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolvery vybiraji packy jen podle presneho profilu", () => {
    expect(rangePackForTrainingProfile(DEFAULT_TRAINING_PROFILE)?.id)
      .toBe("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1");

    expect(rangePackForTrainingProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "NO_RAKE",
    }))?.id).toBe("cash-six-max-regular-preflop-chip-ev-no-rake-candidate-v0");

    expect(rangePackForTrainingProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "MTT",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "RAKE",
    }))).toBeUndefined();
  });
});
