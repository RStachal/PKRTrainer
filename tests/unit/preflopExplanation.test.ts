import { describe, expect, it } from "vitest";

import {
  buildPreflopExplanation,
  buildPreflopExplanationForSpot,
  type PreflopExplanationMode,
} from "../../src/core/preflopExplanation";
import type { TableState } from "../../src/core/types";

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  effectiveStackBB: 100,
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
    // „Raise 2x", ne „Open 2x": od 27. 8. 2026 se zdůvodnění jmenuje akci
    // stejně jako tlačítko, na které hráč kliká. Dvojí slovník na jedné
    // obrazovce se týkal 10,65 % spotů.
    expect(text).toContain("Doporučení: Raise 2x");
    expect(text).toContain("Pozice:");
    expect(text).toContain("Stack:");
    expect(text).toContain("Třída handy:");
    expect(text).toContain("Plán:");
    for (const forbidden of FORBIDDEN) expect(text).not.toContain(forbidden);
  });

  it("podporuje beginner a advanced uroven detailu", () => {
    const beginner = explanation("BEGINNER");
    const advanced = explanation("ADVANCED");

    expect(beginner).not.toContain("Poznámka k range:");
    expect(advanced).toContain("Poznámka k range:");
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

    expect(text).toContain("Proti 3-betu HH spot");
    expect(text).toContain("Doporučení: 4-bet");
    expect(text).toContain("4-betujte nejsilnější pokračování");
  });

  it("v EN rezimu prelozi cely vysvetlujici text a ponecha pokerove terminy", () => {
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
    }, "ADVANCED", "EN");

    expect(text).toContain("Versus 3-bet HH spot");
    expect(text).toContain("Recommended: 4-bet");
    expect(text).toContain("Position:");
    expect(text).toContain("Hand class:");
    expect(text).toContain("Range note:");
    expect(text).not.toMatch(/[áčďéěíňóřšťúůýž]/i);
  });

  it("ve vysvetleni uvede vsechny EV-equivalent best akce", () => {
    const text = buildPreflopExplanationForSpot({
      context: "VS_OPEN",
      heroPos: "BTN",
      effStack: 40,
      hand: "AQs",
      strictCorrect: ["3BET"],
      tableState: {
        ...tableState,
        facing: "OPEN",
      },
      actionEvs: {
        source: "SOLVER",
        unit: "BB",
        equivalentThresholdBb: 0.01,
        acceptableThresholdBb: 0.05,
        values: [
          { action: "FOLD", evBb: 0 },
          { action: "CALL", evBb: 0.204 },
          { action: "3BET", evBb: 0.21 },
        ],
      },
    }, "EN");

    expect(text).toContain("Recommended: Call / 3-bet");
    expect(text).not.toContain("Recommended: 3-bet.");
  });
});
