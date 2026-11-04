import { describe, expect, it } from "vitest";

import {
  classifyFlopHand,
  flopzillaLaneForCategory,
} from "../../src/ui/postflopRangeMatrixView";
import type { Card } from "../../src/core/types";

const dryAceBoard: Card[] = [
  { rank: "A", suit: "c" },
  { rank: "7", suit: "d" },
  { rank: "2", suit: "s" },
];

const lowBoard: Card[] = [
  { rank: "7", suit: "c" },
  { rank: "3", suit: "d" },
  { rank: "2", suit: "s" },
];

const drawBoard: Card[] = [
  { rank: "T", suit: "h" },
  { rank: "9", suit: "h" },
  { rank: "2", suit: "c" },
];

describe("postflopRangeMatrixView", () => {
  it("klasifikuje hand classes proti flopu do Flopzilla kategorii", () => {
    expect(classifyFlopHand("AA", dryAceBoard)).toBe("SET_PLUS");
    expect(classifyFlopHand("KK", lowBoard)).toBe("OVERPAIR");
    expect(classifyFlopHand("AKo", dryAceBoard)).toBe("TOP_PAIR");
    expect(classifyFlopHand("72o", dryAceBoard)).toBe("TWO_PAIR");
    expect(classifyFlopHand("54s", dryAceBoard)).toBe("GUTSHOT");
    expect(classifyFlopHand("QJs", drawBoard)).toBe("FLUSH_DRAW");
    expect(classifyFlopHand("87o", drawBoard)).toBe("OESD");
  });

  it("mapuje Flopzilla kategorie do value/bluff/check lanes", () => {
    expect(flopzillaLaneForCategory("SET_PLUS")).toBe("VALUE");
    expect(flopzillaLaneForCategory("FLUSH_DRAW")).toBe("BLUFF");
    expect(flopzillaLaneForCategory("AIR")).toBe("CHECK");
  });
});
