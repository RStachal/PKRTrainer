// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { PostflopRangeBucket } from "../../src/core/postflopGenerator";
import type { PostflopTrainingSpot } from "../../src/core/postflopTrainingSpot";
import type { Card } from "../../src/core/types";
import { setAppLanguage } from "../../src/ui/cs";
import { colorForPostflopAction } from "../../src/ui/rangeMatrixView";
import { postflopRangeContent } from "../../src/ui/trainer/postflopRange";

/**
 * Postflopová range v novém GUI (Agents/ui-redesign-plan.md, fáze 2).
 *
 * Packy nesou strategii po kbelících (všechny třídy se stejnou převažující
 * akcí a průměr jejich směsi), ne po třídách. Buňka proto ukazuje převažující
 * akci a frekvence jsou v souhrnu a v detailu jako průměr skupiny.
 */

const NBSP = " ";
const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

const exact = (mix: Record<string, number>) => Object.entries(mix).map(([action, frequencyPct]) => ({
  action, frequencyPct, visibility: "EXACT" as const,
}));

const BUCKETS = [
  {
    lane: "VALUE", label: "Sázka pro hodnotu", action: "BET_SMALL", features: [],
    handClasses: ["AA", "AKo", "KQs"], actionMix: exact({ BET_SMALL: 80, CHECK: 20 }),
  },
  {
    lane: "BLUFF", label: "Blaf", action: "BET_SMALL", features: [],
    handClasses: ["76s"], actionMix: exact({ BET_SMALL: 80, CHECK: 20 }),
  },
  {
    lane: "CHECK", label: "Check", action: "CHECK", features: [],
    handClasses: ["22", "JTo"], actionMix: exact({ CHECK: 70, BET_SMALL: 30 }),
  },
] as unknown as PostflopRangeBucket[];

function spot(options: {
  buckets?: PostflopRangeBucket[];
  provenance?: "SOLVER_BACKED" | "PUBLIC_HEURISTIC";
  comboEvs?: unknown[];
} = {}): PostflopTrainingSpot {
  return {
    street: "FLOP",
    heroCards: [card("A", "s"), card("K", "d")],
    board: [card("K", "s"), card("7", "d"), card("2", "c")],
    potBB: 6,
    effectiveStackBB: 40,
    heroPosition: "BTN",
    villainPosition: "BB",
    ...(options.comboEvs ? { comboEvs: options.comboEvs } : {}),
    explanation: {
      summary: "",
      valueHands: [],
      bluffHands: [],
      checkHands: [],
      nextStreetPlan: "",
      source: {
        kind: "STRATEGY_PACK",
        provenance: options.provenance ?? "SOLVER_BACKED",
        heroBetSizes: { BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 } },
        rangeBuckets: options.buckets ?? BUCKETS,
      },
    },
  } as unknown as PostflopTrainingSpot;
}

const at = (root: HTMLElement, hand: string) => root.querySelector<HTMLElement>(`[data-hand="${hand}"]`)!;

afterEach(() => {
  document.body.innerHTML = "";
  setAppLanguage("CZ");
});

describe("postflopová range v novém GUI", () => {
  it("buňka nese převažující akci v barvě tlačítka, blaf je šrafovaný", () => {
    const root = postflopRangeContent(document, spot());
    expect(root.querySelectorAll(".dx-matrix__cell")).toHaveLength(169);
    expect(at(root, "AKo").style.getPropertyValue("--action-accent")).toBe(colorForPostflopAction("BET_SMALL"));
    expect(at(root, "AKo").getAttribute("aria-label")).toBe(`AKo: Bet 33${NBSP}%, hodnota (tvoje ruka)`);
    expect(at(root, "76s").dataset.hatched).toBe("true");
    expect(at(root, "76s").dataset.groups).toBe("BET_SMALL BLUFF");
    expect(at(root, "22").style.getPropertyValue("--action-accent")).toBe(colorForPostflopAction("CHECK"));
    expect(at(root, "22").getAttribute("aria-label")).toBe("22: Check");
    // Ruka, kterou range na téhle ulici nedrží, není totéž co ruka, která checkuje.
    expect(at(root, "72o").dataset.empty).toBe("true");
    expect(root.querySelectorAll(".dx-range__board .dx-card")).toHaveLength(3);
  });

  it("souhrn: frekvence celé range vážené kombinacemi a podíl blafů v sázkách", () => {
    const root = postflopRangeContent(document, spot());
    // Bet: AA 6 + AKo 12 + KQs 4 + 76s 4 = 26 kombinací po 80 %, check: 22 6 + JTo 12 = 18 po 30 %.
    // Bet = (26·80 + 18·30) / 44 = 59,5 %, check 40,5 %.
    const keys = [...root.querySelectorAll<HTMLButtonElement>(".dx-range__key")];
    expect(keys.map((key) => key.dataset.group)).toEqual(["BET_SMALL", "CHECK", "BLUFF"]);
    expect(keys.map((key) => key.querySelector(".dx-range__value")?.textContent)).toEqual([
      `60${NBSP}%`,
      `40${NBSP}%`,
      `15${NBSP}% sázek`,
    ]);
    expect(root.querySelector(".dx-range__summary .dx-trainer__note")?.textContent)
      .toBe("Jak často celá range volí každou akci.");
    expect(root.querySelector(".dx-range__summary .dx-strategy-bar")).not.toBeNull();

    keys[2].click();
    expect(at(root, "76s").dataset.muted).toBeUndefined();
    expect(at(root, "AA").dataset.muted).toBe("true");
  });

  it("detail: převažující akce, ruka na desce a průměr skupiny, ne frekvence té ruky", () => {
    const root = postflopRangeContent(document, spot());
    const detail = root.querySelector<HTMLElement>(".dx-range__detail")!;
    expect(detail.dataset.hand).toBe("AKo");
    const lines = [...detail.querySelectorAll(".dx-range__line")].map((line) => line.textContent);
    expect(lines).toEqual([`Nejčastěji: Bet 33${NBSP}% · hodnota`, "Na desce: Top pair"]);
    expect(detail.querySelector(".dx-trainer__hands-title")?.textContent)
      .toBe(`Ruce, které nejčastěji hrají Bet 33${NBSP}%, v průměru`);
    expect(detail.querySelector(".dx-strategy-bar")?.getAttribute("aria-label")).toContain("Check 20");

    at(root, "72o").click();
    expect(detail.textContent).toContain("Tahle ruka v range na téhle ulici není.");
    expect(detail.querySelector(".dx-strategy-bar")).toBeNull();
  });

  it("u blafu řekne, že je to blaf, a poznámka vysvětlí šrafování", () => {
    const root = postflopRangeContent(document, spot());
    at(root, "76s").click();
    expect(root.querySelector(".dx-range__detail .dx-range__line")?.textContent)
      .toBe(`Nejčastěji: Bet 33${NBSP}% · blaf`);
    const notes = [...root.querySelectorAll(".dx-range__side > .dx-trainer__note")].map((note) => note.textContent);
    expect(notes).toContain("Šrafované buňky jsou blafy: sázky s rukou, která nesází pro hodnotu.");
    expect(notes.some((note) => note?.startsWith("Frekvence jsou průměry skupin"))).toBe(true);
  });

  it("EV kombinací ukáže po jedné, se zvýrazněnou kombinací hráče", () => {
    const root = postflopRangeContent(document, spot({
      comboEvs: [
        { combo: "AsKd", values: [{ action: "BET_SMALL", evBb: 4.2 }, { action: "CHECK", evBb: 3.9 }] },
        { combo: "AhKc", values: [{ action: "BET_SMALL", evBb: 3.1 }, { action: "CHECK", evBb: 3.3 }] },
      ],
    }));
    const rows = [...root.querySelectorAll<HTMLElement>(".dx-range__detail .dx-trainer__ev-row")];
    expect(rows.map((row) => row.dataset.combo)).toEqual(["AsKd", "AhKc"]);
    expect(rows[0].dataset.chosen).toBe("true");
    expect(rows[0].querySelector(".dx-trainer__ev-name")?.textContent).toBe("A♠K♦ (tvoje)");
    expect(rows[1].querySelector(".dx-trainer__ev-value")?.textContent)
      .toBe(`Check +3,3 BB · Bet 33${NBSP}% +3,1 BB`);
  });

  it("bez přesných frekvencí ukáže podíl kombinací podle převažující akce", () => {
    const qualitative = BUCKETS.map((bucket) => ({
      ...bucket,
      actionMix: bucket.actionMix?.map((item) => ({ ...item, visibility: "QUALITATIVE" as const })),
    }));
    const root = postflopRangeContent(document, spot({ buckets: qualitative }));
    expect(root.querySelector(".dx-range__summary .dx-trainer__note")?.textContent)
      .toBe("Podíl kombinací podle akce, kterou hrají nejčastěji.");
    // Bet 26 ze 44 kombinací, check 18.
    expect([...root.querySelectorAll(".dx-range__key .dx-range__value")].map((value) => value.textContent))
      .toEqual([`59${NBSP}%`, `41${NBSP}%`, `15${NBSP}% sázek`]);
    expect(root.querySelector(".dx-range__detail .dx-strategy-bar")).toBeNull();
  });

  it("heuristiku za solver nevydá ani s frekvencemi", () => {
    const root = postflopRangeContent(document, spot({ provenance: "PUBLIC_HEURISTIC" }));
    expect(root.querySelector(".dx-range__summary .dx-trainer__note")?.textContent)
      .toBe("Podíl kombinací podle akce, kterou hrají nejčastěji.");
  });

  it("bez kbelíků ukáže sílu rukou na desce a přizná to", () => {
    const root = postflopRangeContent(document, spot({ buckets: [] }));
    expect(root.querySelector(".dx-range__summary .dx-range__title")?.textContent).toBe("Síla rukou na desce");
    expect(root.querySelectorAll("[data-empty]")).toHaveLength(0);
    expect(at(root, "KK").getAttribute("aria-label")).toBe("KK: Set+");
    expect(root.textContent).toContain("Strategii po rukou pro tenhle spot nemáme");
    // Overpair je na K-high desce jen AA: 6 z 1 326 kombinací, tedy „<1 %“, ne „0 %“.
    expect(root.querySelector('.dx-range__key[data-group="OVERPAIR"] .dx-range__value')?.textContent)
      .toBe(`<1${NBSP}%`);
  });
});
