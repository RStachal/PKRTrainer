import { describe, expect, it } from "vitest";

import type {
  PostflopStrategyInput,
  PostflopStreet,
} from "../../src/core/postflopGenerator";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import {
  buildMttCompletionReadinessReport,
} from "../../src/data/ranges/mttProductionReadiness";
import {
  createMttProductionPostflopStrategyResolver,
} from "../../src/data/ranges/postflopStrategyRegistry";
import { rangePackForTrainingProfile } from "../../src/data/ranges/trainingRangePacks";

describe("MTT production runtime matrix", () => {
  it("routuje vsech 64 profilu fail-closed bez cross-profile fallbacku", () => {
    const rows = buildMttCompletionReadinessReport().rows;
    expect(rows).toHaveLength(64);

    for (const row of rows) {
      const profile: TrainingProfile = {
        gameVariant: "MTT",
        tableFormat: row.tableFormat,
        blindSpeed: row.blindSpeed,
        street: row.street,
        evModel: row.evModel,
        ante: row.ante,
        rakeMode: "NONE",
      };
      const label = [
        row.tableFormat,
        row.blindSpeed,
        row.evModel,
        row.street,
        row.ante,
      ].join("|");

      if (row.street === "PREFLOP") {
        const pack = rangePackForTrainingProfile(profile);
        if (row.productionReady) {
          expect(pack?.id, label).toBe(row.packId);
          const store = createRangeStoreFromRangePack(pack!);
          expect(store.isLoaded(), label).toBe(true);
          expect(store.lookup({
            position: "BTN",
            bucket: 25,
            context: "RFI",
            ante: row.ante === "ON" ? "OFF" : "ON",
          }), label).toBeUndefined();
        } else {
          expect(row.status, label).not.toBe("PRODUCTION");
        }
        continue;
      }

      if (!row.productionReady) {
        const resolver = createMttProductionPostflopStrategyResolver({
          tableFormat: row.tableFormat,
          blindSpeed: row.blindSpeed,
          street: row.street,
          evModel: row.evModel,
          ante: row.ante,
        });
        expect(resolver(inputForStreet(row.street)), label).toBeNull();
      }
    }
  });
});

function inputForStreet(street: PostflopStreet): PostflopStrategyInput {
  const base: PostflopStrategyInput = {
    street,
    textures: ["dry", "rainbow"],
    potType: "SINGLE_RAISED",
    potBB: 6,
    effectiveStackBB: 40,
    positionPattern: "BTN_VS_BB",
    actionNode: street === "FLOP"
      ? "SINGLE_RAISED_POT_CBET"
      : street === "TURN"
        ? "TURN_BARREL"
        : "RIVER_PRESSURE",
    heroHand: "AA",
  };
  if (street === "TURN") {
    return {
      ...base,
      priorFlopAction: "BET_SMALL",
      turnCardClass: "LOW_BRICK",
    };
  }
  if (street === "RIVER") {
    return {
      ...base,
      priorTurnAction: "BET_SMALL",
      riverRunoutClass: "BLANK",
    };
  }
  return base;
}
