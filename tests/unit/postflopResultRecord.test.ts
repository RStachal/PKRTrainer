import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { flopSingleRaisedPrototypeStrategyPack } from "../../src/data/ranges/postflopStrategyPack";
import { createPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyResolver";
import {
  POSTFLOP_RESULT_RECORD_SCHEMA,
  POSTFLOP_STATS_V2_BRIDGE_SCHEMA,
  bridgePostflopResultRecordToStatsV2,
  breakdownPostflopStats,
  buildPostflopResultRecord,
  isPostflopResultRecord,
} from "../../src/persistence/postflopResultRecord";

describe("postflopResultRecord", () => {
  it("sestavi postflop result record se strategy pack zdrojem", () => {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      potBB: 6,
      effectiveStackBB: 40,
      positionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
      strategyResolver: createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack),
    }));

    const record = buildPostflopResultRecord(spot, spot.recommendedAction, 123);

    expect(record).toMatchObject({
      schema: POSTFLOP_RESULT_RECORD_SCHEMA,
      qid: spot.id,
      chosen: spot.recommendedAction,
      recommended: spot.recommendedAction,
      correct: true,
      street: "FLOP",
      actionNode: "SINGLE_RAISED_POT_CBET",
      potType: "SINGLE_RAISED",
      spr: spot.spr,
      heroPosition: "BTN",
      villainPosition: "BB",
      positionPattern: "BTN_VS_BB",
      sourceKind: "STRATEGY_PACK",
      sourcePackId: flopSingleRaisedPrototypeStrategyPack.id,
      ts: 123,
    });
    expect(record.boardTextures.length).toBeGreaterThan(0);
    expect(record.sourceRuleId.length).toBeGreaterThan(0);
    expect(record.sourceConfidence).toBe("LOW");
    expect(isPostflopResultRecord(record)).toBe(true);
  });

  it("prevede postflop record na v2 breakdown bridge", () => {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 7,
      street: "FLOP",
      positionContext: {
        heroPosition: "SB",
        villainPosition: "BB",
        aggressorPosition: "SB",
        callerPosition: "BB",
        inPosition: false,
        callerType: "BIG_BLIND",
        positionPattern: "SB_VS_BB",
      },
    }));
    const record = buildPostflopResultRecord(spot, "CHECK", 456);

    const bridge = bridgePostflopResultRecordToStatsV2(record, {
      profile: {
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeed: "TURBO",
        evModel: "CHIP_EV",
      },
    });

    expect(bridge).toMatchObject({
      schema: POSTFLOP_STATS_V2_BRIDGE_SCHEMA,
      qid: record.qid,
      correct: record.correct,
      ts: 456,
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      street: "FLOP",
      evModel: "CHIP_EV",
      actionNode: "SINGLE_RAISED_POT_CBET",
      potType: "SINGLE_RAISED",
      heroPosition: "SB",
      villainPosition: "BB",
      positionPattern: "SB_VS_BB",
      chosen: "CHECK",
      recommended: spot.recommendedAction,
    });
    expect(bridge.boardTextureKey).toBe(record.boardTextures.join("|"));
    expect(bridge.strategyRuleId).toBe(record.sourceRuleId);
  });

  it("agreguje postflop bridge recordy podle dashboard dimenzi", () => {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      positionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
      strategyResolver: createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack),
    }));
    const correct = bridgePostflopResultRecordToStatsV2(
      buildPostflopResultRecord(spot, spot.recommendedAction, 1),
    );
    const wrongAction = spot.recommendedAction === "CHECK" ? "BET_SMALL" : "CHECK";
    const wrong = bridgePostflopResultRecordToStatsV2(
      buildPostflopResultRecord(spot, wrongAction, 2),
    );

    expect(breakdownPostflopStats([correct, wrong], "street")).toEqual([
      { key: "FLOP", total: 2, correct: 1, rate: 50 },
    ]);
    expect(breakdownPostflopStats([correct], "strategyPackId")[0]).toMatchObject({
      key: flopSingleRaisedPrototypeStrategyPack.id,
      total: 1,
    });
    expect(breakdownPostflopStats([correct], "confidence")[0]).toMatchObject({
      key: "LOW",
      total: 1,
    });
  });
});
