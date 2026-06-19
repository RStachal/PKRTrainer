import { describe, expect, it } from "vitest";

import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import type { Card } from "../../src/core/types";
import {
  POSTFLOP_LINE_RESULT_RECORD_SCHEMA,
  buildPostflopLineResultRecord,
  isPostflopLineResultRecord,
  postflopLineId,
} from "../../src/persistence/postflopLineResultRecord";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "d" },
];

const board: [Card, Card, Card, Card, Card] = [
  { rank: "A", suit: "h" },
  { rank: "7", suit: "d" },
  { rank: "2", suit: "c" },
  { rank: "4", suit: "s" },
  { rank: "Q", suit: "h" },
];

describe("postflopLineResultRecord", () => {
  it("sestavi oddeleny multi-street line record z flop-turn-river simulace", () => {
    const line = generatePostflopLine({ seed: 42, heroCards, board });
    const record = buildPostflopLineResultRecord(line, {
      profile: {
        gameVariant: "MTT",
        tableFormat: "SIX_MAX",
        blindSpeed: "TURBO",
        evModel: "DOLAR_EV",
      },
      startedAt: 100,
      completedAt: 250,
    });

    expect(record).toMatchObject({
      schema: POSTFLOP_LINE_RESULT_RECORD_SCHEMA,
      lineId: postflopLineId(line),
      seed: 42,
      startedAt: 100,
      completedAt: 250,
      totalStreets: 3,
      correctStreets: 3,
      perfect: true,
    });
    expect(record.streetResults.map((street) => street.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(record.streetResults.map((street) => street.record.profileId)).toEqual([
      "MTT|SIX_MAX|TURBO|FLOP|DOLAR_EV|ON|NONE",
      "MTT|SIX_MAX|TURBO|TURN|DOLAR_EV|ON|NONE",
      "MTT|SIX_MAX|TURBO|RIVER|DOLAR_EV|ON|NONE",
    ]);
    expect(record.scenarioId).toContain("postflop_line_scenario_v1");
    expect(record.scenarioId).toContain("MTT|SIX_MAX|TURBO|FLOP|DOLAR_EV|ON|NONE");
    expect(record.streetResults.every((street) => (
      street.record.scenarioId?.startsWith("postflop_scenario_v1|") === true
    ))).toBe(true);
    expect(record.actionHistory).toHaveLength(3);
    expect(isPostflopLineResultRecord(record)).toBe(true);
  });

  it("umi ulozit neperfektni line odpoved bez kontaminace street bridge schema", () => {
    const line = generatePostflopLine({ seed: 12, heroCards, board });
    const wrongFlop = line.streets[0].spot.recommendedAction === "CHECK" ? "BET_BIG" : "CHECK";
    const record = buildPostflopLineResultRecord(line, {
      chosenByStreet: { FLOP: wrongFlop },
      startedAt: 10,
      completedAt: 20,
    });

    expect(record.correctStreets).toBe(2);
    expect(record.perfect).toBe(false);
    expect(record.streetResults[0].record.correct).toBe(false);
    expect(record.streetResults[1].record.correct).toBe(true);
    expect(record.streetResults[2].record.correct).toBe(true);
  });

  it("odmitne poskozeny line record", () => {
    const line = generatePostflopLine({ seed: 9, heroCards, board });
    const record = buildPostflopLineResultRecord(line);

    expect(isPostflopLineResultRecord({
      ...record,
      streetResults: record.streetResults.slice(0, 2),
    })).toBe(false);
    expect(isPostflopLineResultRecord({
      ...record,
      actionHistory: [{ ...record.actionHistory[0], action: "NOT_ACTION" }],
    })).toBe(false);
  });

  it("akceptuje line record s facing-bet CALL/FOLD akcemi", () => {
    const line = generatePostflopLine({
      seed: 33,
      heroCards,
      board,
      actionNode: "FLOP_FACING_BET",
      chosenActionsByStreet: {
        FLOP: "CALL",
        TURN: "FOLD",
      },
    });
    const record = buildPostflopLineResultRecord(line, {
      chosenByStreet: {
        FLOP: "CALL",
        TURN: "FOLD",
      },
      startedAt: 10,
      completedAt: 20,
    });

    expect(record.totalStreets).toBe(2);
    expect(record.actionHistory.map((action) => action.action)).toEqual(["CALL", "FOLD"]);
    expect(isPostflopLineResultRecord(record)).toBe(true);
  });
});
