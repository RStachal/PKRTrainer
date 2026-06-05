import { describe, expect, it } from "vitest";

import {
  buildPreflopExplanation,
  type PreflopExplanationMode,
} from "../../src/core/preflopExplanation";
import type { TableState } from "../../src/core/types";

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "NONE",
  isBvB: false,
};

const FORBIDDEN = [
  "http://",
  "https://",
  "GTO Wizard",
  "Upswing",
  "RangePack",
  "StrategyPack",
  "mtt-full-ring",
  "SINGLE_RAISED_POT_CBET",
];

function explanation(mode: PreflopExplanationMode): string {
  return buildPreflopExplanation({
    context: "RFI",
    heroPos: "BTN",
    effStack: 40,
    hand: "A5s",
    recommended: ["OPEN_2X"],
    tableState,
  }, mode);
}

describe("preflopExplanation", () => {
  it("vytvori standardni pokerove vysvetleni bez zdroju", () => {
    const text = explanation("STANDARD");

    expect(text).toContain("RFI / Open");
    expect(text).toContain("Recommended: Open 2x");
    expect(text).toContain("Position:");
    expect(text).toContain("Stack:");
    expect(text).toContain("Hand class:");
    expect(text).toContain("Plan:");
    for (const forbidden of FORBIDDEN) expect(text).not.toContain(forbidden);
  });

  it("podporuje beginner a advanced uroven detailu", () => {
    const beginner = explanation("BEGINNER");
    const advanced = explanation("ADVANCED");

    expect(beginner).not.toContain("Range note:");
    expect(advanced).toContain("Range note:");
    expect(advanced.length).toBeGreaterThan(beginner.length);
  });

  it("vysvetli HH import jako stejny pokerovy spot", () => {
    const text = buildPreflopExplanation({
      context: "VS_3BET",
      heroPos: "CO",
      effStack: 25,
      hand: "AQo",
      recommended: ["4BET"],
      tableState: {
        ...tableState,
        heroPos: "CO",
        facing: "3BET",
      },
      importedFromHandHistory: true,
    });

    expect(text).toContain("Vs 3-bet HH spot");
    expect(text).toContain("Recommended: 4-bet");
    expect(text).toContain("4-bet the strongest continues");
  });
});
