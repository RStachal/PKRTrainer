import { describe, expect, it } from "vitest";

import {
  aggregateBettingLaneForHand,
  bettingLaneForHand,
  classifyFlopHand,
  flopzillaLaneForCategory,
} from "../../src/core/flopHandCategory";
import type { Card, HandLabel } from "../../src/core/types";

function board(text: string): Card[] {
  return text.split(" ").map((token) => ({
    rank: token[0] as Card["rank"],
    suit: token[1] as Card["suit"],
  }));
}

const K83r = board("Ks 8h 3d");
const AKQtt = board("As Kh Qh");

describe("flop hand classification", () => {
  it("classifies a hand against the board rather than by its own high card", () => {
    expect(classifyFlopHand("AA" as HandLabel, K83r)).toBe("OVERPAIR");
    expect(classifyFlopHand("KJs" as HandLabel, K83r)).toBe("TOP_PAIR");
    expect(classifyFlopHand("88" as HandLabel, K83r)).toBe("SET_PLUS");
    // Ace-high with a blocker is not a made hand on K83r.
    expect(classifyFlopHand("A2s" as HandLabel, K83r)).toBe("BACKDOOR_DRAW");
    expect(classifyFlopHand("22" as HandLabel, K83r)).toBe("UNDERPAIR");
  });
});

describe("betting lane", () => {
  it("treats a betting ace-high blocker as a bluff, not value", () => {
    // The previous rank-only heuristic called every A-high hand VALUE. On K83r
    // A2s has no pair; betting it is pressure.
    expect(bettingLaneForHand("A2s" as HandLabel, K83r)).toBe("BLUFF");
    expect(bettingLaneForHand("A5s" as HandLabel, K83r)).toBe("BLUFF");
    expect(bettingLaneForHand("K4s" as HandLabel, AKQtt)).toBe("BLUFF");
  });

  it("treats a betting underpair as a bluff rather than value", () => {
    expect(bettingLaneForHand("22" as HandLabel, K83r)).toBe("BLUFF");
  });

  it("keeps genuine made hands in the value lane", () => {
    expect(bettingLaneForHand("AA" as HandLabel, K83r)).toBe("VALUE");
    expect(bettingLaneForHand("KJs" as HandLabel, K83r)).toBe("VALUE");
    expect(bettingLaneForHand("88" as HandLabel, K83r)).toBe("VALUE");
    expect(bettingLaneForHand("K8s" as HandLabel, K83r)).toBe("VALUE");
  });
});

describe("aggregate betting lane", () => {
  it("requires a strict majority of boards to call a hand value", () => {
    // AK is top pair on K83r but only overcards on a low board.
    const lowBoard = board("7c 5d 2h");
    expect(aggregateBettingLaneForHand("AKo" as HandLabel, [K83r, K83r, lowBoard])).toBe("VALUE");
    expect(aggregateBettingLaneForHand("AKo" as HandLabel, [K83r, lowBoard, lowBoard])).toBe("BLUFF");
  });

  it("does not call a hand value on an even split", () => {
    const lowBoard = board("7c 5d 2h");
    expect(aggregateBettingLaneForHand("AKo" as HandLabel, [K83r, lowBoard])).toBe("BLUFF");
  });

  it("falls back to bluff when no board is available", () => {
    expect(aggregateBettingLaneForHand("AA" as HandLabel, [])).toBe("BLUFF");
  });
});

describe("lane taxonomy", () => {
  it("keeps the matrix lane mapping stable for made hands and draws", () => {
    expect(flopzillaLaneForCategory("TOP_PAIR")).toBe("VALUE");
    expect(flopzillaLaneForCategory("FLUSH_DRAW")).toBe("BLUFF");
    expect(flopzillaLaneForCategory("AIR")).toBe("CHECK");
  });
});
