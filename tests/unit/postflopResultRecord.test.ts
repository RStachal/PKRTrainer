import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { flopSingleRaisedPrototypeStrategyPack } from "../../src/data/ranges/postflopStrategyPack";
import { createPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyResolver";
import {
  POSTFLOP_RESULT_RECORD_SCHEMA,
  POSTFLOP_STATS_V2_BRIDGE_RECORD_VERSION,
  POSTFLOP_STATS_V2_BRIDGE_SCHEMA,
  availablePostflopStatsDimensions,
  bridgePostflopResultRecordToStatsV2,
  breakdownPostflopStats,
  buildPostflopResultRecord,
  isPostflopResultRecord,
  isPostflopStatsV2BridgeRecord,
  normalizePostflopStatsV2BridgeRecord,
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
    expect(record.sourcePackVersion).toBe(flopSingleRaisedPrototypeStrategyPack.version);
    expect(record.sourceVerifiedAt).toBe(flopSingleRaisedPrototypeStrategyPack.verifiedAt);
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
      schemaVersion: POSTFLOP_STATS_V2_BRIDGE_RECORD_VERSION,
      qid: record.qid,
      correct: record.correct,
      ts: 456,
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      street: "FLOP",
      evModel: "CHIP_EV",
      ante: "ON",
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
    expect(bridge.scenarioId).toContain(
      "MTT|FULL_RING_9|TURBO|FLOP|CHIP_EV|ON|NONE",
    );
    expect(bridge.strategyPackVersion).toBe(record.sourcePackVersion);
    expect(bridge.strategyVerifiedAt).toBe(record.sourceVerifiedAt);
  });

  it("normalizuje legacy postflop bridge record bez schemaVersion", () => {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 19,
      street: "FLOP",
    }));
    const bridge = bridgePostflopResultRecordToStatsV2(
      buildPostflopResultRecord(spot, spot.recommendedAction, 321, 654),
    );
    const legacy = { ...bridge } as Partial<typeof bridge>;
    delete (legacy as Partial<typeof bridge>).schemaVersion;
    delete legacy.ante;

    expect(isPostflopStatsV2BridgeRecord(legacy)).toBe(true);
    expect(normalizePostflopStatsV2BridgeRecord(
      legacy as Parameters<typeof normalizePostflopStatsV2BridgeRecord>[0],
    )).toMatchObject({
      schemaVersion: POSTFLOP_STATS_V2_BRIDGE_RECORD_VERSION,
      ante: "ON",
    });
    expect(isPostflopStatsV2BridgeRecord({ ...bridge, schemaVersion: 0 })).toBe(false);
  });

  it("zachova volitelny decision time v postflop recordu i bridge zaznamu", () => {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 12,
      street: "FLOP",
    }));

    const record = buildPostflopResultRecord(spot, spot.recommendedAction, 111, 987);
    const bridge = bridgePostflopResultRecordToStatsV2(record);

    expect(record.responseMs).toBe(987);
    expect(bridge.responseMs).toBe(987);
    expect(isPostflopResultRecord(record)).toBe(true);
    expect(isPostflopStatsV2BridgeRecord(bridge)).toBe(true);
    expect(isPostflopResultRecord({ ...record, responseMs: -10 })).toBe(false);
    expect(isPostflopStatsV2BridgeRecord({ ...bridge, responseMs: -10 })).toBe(false);
  });

  it("validuje a bridguje 3bet pot record", () => {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 1788246284,
      street: "FLOP",
      potType: "THREE_BET_POT",
      positionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        aggressorPosition: "HJ",
        callerPosition: "LJ",
        inPosition: false,
        callerType: "OUT_OF_POSITION_CALLER",
        positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      },
    }));

    const record = buildPostflopResultRecord(spot, spot.recommendedAction, 789);
    const bridge = bridgePostflopResultRecordToStatsV2(record);

    expect(isPostflopResultRecord(record)).toBe(true);
    expect(record).toMatchObject({
      actionNode: "THREE_BET_POT_CBET",
      potType: "THREE_BET_POT",
      positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      sourceKind: "FALLBACK",
    });
    expect(bridge).toMatchObject({
      actionNode: "THREE_BET_POT_CBET",
      potType: "THREE_BET_POT",
      positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
    });
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
    expect(breakdownPostflopStats([correct], "ante")[0]).toMatchObject({
      key: "ON",
      total: 1,
    });
    expect(availablePostflopStatsDimensions()).toEqual([
      "gameVariant",
      "tableFormat",
      "blindSpeed",
      "evModel",
      "ante",
      "rakeMode",
      "street",
      "actionNode",
      "potType",
      "positionPattern",
      "positionPair",
      "boardTextureKey",
      "strategyPackId",
      "confidence",
      "sourceQuality",
    ]);
  });

  it("agreguje street progression pro flop, turn a river oddelene", () => {
    const base = bridgePostflopResultRecordToStatsV2(
      buildPostflopResultRecord(postflopSpotToTrainingSpot(generatePostflopSpot({
        seed: 1,
        street: "FLOP",
      })), "CHECK", 1),
    );
    const turn = { ...base, qid: "turn", street: "TURN" as const, actionNode: "TURN_BARREL" as const };
    const river = { ...base, qid: "river", street: "RIVER" as const, actionNode: "RIVER_PRESSURE" as const };

    expect(breakdownPostflopStats([base, turn, river], "street")).toEqual([
      { key: "FLOP", total: 1, correct: base.correct ? 1 : 0, rate: base.correct ? 100 : 0 },
      { key: "TURN", total: 1, correct: turn.correct ? 1 : 0, rate: turn.correct ? 100 : 0 },
      { key: "RIVER", total: 1, correct: river.correct ? 1 : 0, rate: river.correct ? 100 : 0 },
    ]);
  });
});
