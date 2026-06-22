// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { renderHHView } from "../../src/ui/hhView";
import type { PostflopStrategyResolver } from "../../src/core/postflopGenerator";
import type { HHReviewRecord } from "../../src/persistence/hhReviewStore";
import type { RangeStore } from "../../src/data/rangeStore";

const validHh = [
  "PokerStars Hand #1: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #1 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain2: posts small blind 10",
  "Villain3: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ah Kd]",
  "Hero: folds",
  "*** SUMMARY ***",
].join("\n");

const validSixMaxHh = [
  "PokerStars Hand #6: Tournament #1, 10/20",
  "Table 'Six' 6-max Seat #1 is the button",
  "Seat 1: Hero (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Villain2: posts small blind 10",
  "Villain3: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ah Kd]",
  "Hero: folds",
  "*** SUMMARY ***",
].join("\n");

const sixMaxStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => ({
    actions: { AKo: ["FOLD"] } as never,
    strict: { AKo: ["FOLD"] } as never,
  }),
};

const validFlopHh = [
  "PokerStars Hand #2: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Villain1: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ks Qs]",
  "Hero: raises 40 to 60",
  "Villain1: calls 40",
  "*** FLOP *** [Ah 7d 2c]",
  "Villain1: checks",
  "Hero: bets 40",
  "*** SUMMARY ***",
].join("\n");

const validTurnRiverHh = [
  "PokerStars Hand #3: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Villain1: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ks Qs]",
  "Hero: raises 40 to 60",
  "Villain1: calls 40",
  "*** FLOP *** [Ah 7d 2c]",
  "Villain1: checks",
  "Hero: bets 40",
  "Villain1: calls 40",
  "*** TURN *** [Ah 7d 2c] [5s]",
  "Villain1: checks",
  "Hero: checks",
  "*** RIVER *** [Ah 7d 2c 5s] [Jd]",
  "Villain1: bets 120",
  "Hero: calls 120",
  "*** SUMMARY ***",
].join("\n");

const productionFacingBetRunoutHh = [
  "PokerStars Hand #4: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Villain1: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ks Qs]",
  "Hero: raises 40 to 60",
  "Villain1: calls 40",
  "*** FLOP *** [Ah 7d 2c]",
  "Villain1: bets 40",
  "Hero: calls 40",
  "*** TURN *** [Ah 7d 2c] [5s]",
  "Villain1: bets 80",
  "Hero: calls 80",
  "*** RIVER *** [Ah 7d 2c 5s] [Jd]",
  "Villain1: bets 120",
  "Hero: calls 120",
  "*** SUMMARY ***",
].join("\n");

const productionLikePostflopResolver: PostflopStrategyResolver = (input) => ({
  action: input.actionNode?.endsWith("_FACING_BET") ? "CALL" : "BET_SMALL",
  explanation: `Production HH resolver ${input.street.toLowerCase()} recommendation`,
  source: {
    kind: "STRATEGY_PACK",
    packId: "internal-hh-production-parity-pack",
    packVersion: "2026.06",
    packVerifiedAt: "2026-06-17",
    ruleId: `hh-production-${input.street.toLowerCase()}`,
    confidence: "HIGH",
    matchedTextures: input.textures,
    sprMin: 0,
    sprMax: 30,
    positionPattern: input.positionPattern,
    sourceUrls: ["https://solver.example/internal/hh-production"],
    assumptions: ["production parity test fixture"],
    selectionScore: 100,
    tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
  },
});

describe("hhView - DOM import", () => {
  it("pred analyzou pocka na produkcni preload a teprve potom sestavi spot", async () => {
    const root = document.createElement("div");
    let finishPreload!: () => void;
    const beforeAnalyze = vi.fn(() => new Promise<void>((resolve) => {
      finishPreload = resolve;
    }));
    const parseOptions = vi.fn(() => ({}));
    renderHHView(root, { beforeAnalyze, parseOptions });

    root.querySelector<HTMLTextAreaElement>(".hh-input")!.value = validHh;
    const button = root.querySelector<HTMLButtonElement>(".hh-analyze")!;
    button.click();

    expect(beforeAnalyze).toHaveBeenCalledOnce();
    expect(parseOptions).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(root.querySelector(".poker-table")).toBeNull();

    finishPreload();
    await vi.waitFor(() => {
      expect(root.querySelector(".poker-table")).not.toBeNull();
    });
    expect(parseOptions).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("zobrazi source-free chybu kdyz produkcni preload selze", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const parseOptions = vi.fn(() => ({ rangeStore: sixMaxStore }));
    renderHHView(root, {
      beforeAnalyze: async () => {
        throw new Error("https://private.example/pack failed");
      },
      parseOptions,
    });

    root.querySelector<HTMLTextAreaElement>(".hh-input")!.value = validSixMaxHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")!.click();

    await vi.waitFor(() => {
      expect(root.querySelector(".hh-errors")?.textContent)
        .toContain("Produkční strategii pro HH analýzu se nepodařilo načíst.");
    });
    expect(root.textContent).not.toContain("private.example");
    expect(parseOptions).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(root.querySelector(".hh-errors"));
  });

  it("vykresli potvrzeny 6-max profil se sesti sedadly a profilovou identitou", () => {
    const root = document.createElement("div");
    const reviews: HHReviewRecord[][] = [];
    renderHHView(root, {
      parseOptions: () => ({
        profile: {
          gameVariant: "MTT",
          tableFormat: "SIX_MAX",
          blindSpeed: "REGULAR",
          street: "PREFLOP",
          evModel: "CHIP_EV",
          ante: "OFF",
          rakeMode: "NONE",
        },
        rangeStore: sixMaxStore,
        requireLoadedStrategy: true,
        rangePack: {
          id: "six-max-fixture",
          version: "1",
          verifiedAt: "2026-06-19",
        },
      }),
      onReviewBuilt: (records) => {
        reviews.push([...records]);
      },
    });

    root.querySelector<HTMLTextAreaElement>(".hh-input")!.value = validSixMaxHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    expect(root.querySelectorAll(".seat")).toHaveLength(6);
    expect([...root.querySelectorAll<HTMLElement>(".seat")].map((seat) => seat.dataset.position))
      .toEqual(expect.arrayContaining(["UTG", "HJ", "CO", "BTN", "SB", "BB"]));
    expect(reviews[0][0]).toMatchObject({
      profileId: "MTT|SIX_MAX|REGULAR|PREFLOP|CHIP_EV|OFF|NONE",
      strategyPackId: "six-max-fixture",
      position: "BTN",
    });
  });

  it("zobrazi chyby a necitelna pole pro prazdny vstup bez padu", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderHHView(root);

    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const errors = root.querySelector<HTMLElement>(".hh-errors");
    const unreadable = root.querySelector<HTMLElement>(".hh-unreadable");
    const css = root.querySelector("style")?.textContent ?? "";
    expect(css).toContain("linear-gradient(180deg,rgba(18,25,38,.98)");
    expect(css).toContain("@media (max-width:640px)");
    expect(css).toContain(".hh-analysis__matrix");
    expect(root.querySelector<HTMLTextAreaElement>(".hh-input")?.placeholder)
      .toBe("Vložte historii handy…");
    expect(root.querySelector<HTMLButtonElement>(".hh-analyze")?.textContent).toBe("Analyzovat");
    expect(errors?.hidden).toBe(false);
    expect(errors?.textContent).toContain("Vstup je prázdný");
    expect(unreadable?.hidden).toBe(false);
    expect(unreadable?.textContent).toContain("pozice");
    expect(root.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
    expect(document.activeElement).toBe(errors);
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("vykresli kompatibilni HH jako stul a zavola callback", () => {
    const root = document.createElement("div");
    const importedIds: string[] = [];
    const reviewCounts: number[] = [];
    renderHHView(root, {
      onSpotBuilt: (spot) => importedIds.push(spot.id),
      onReviewBuilt: (records) => {
        reviewCounts.push(records.length);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    expect(root.querySelector(".poker-table")).not.toBeNull();
    expect(root.querySelectorAll(".seat")).toHaveLength(9);
    expect(root.querySelectorAll(".hole-card")).toHaveLength(2);
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.spotId)
      .toContain("HJ|50|AKo");
    expect(root.querySelector<HTMLElement>(".hh-analysis__facts")?.dataset.position)
      .toBe("HJ");
    expect(root.querySelector<HTMLElement>(".hh-analysis__facts")?.dataset.hand)
      .toBe("AKo");
    expect(root.querySelector<HTMLElement>(".hh-analysis__facts")?.dataset.stack)
      .toBe("50");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewSavedToDrillStats)
      .toBe("false");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.chosen).toBe("FOLD");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.correct).toMatch(/true|false/);
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewRecordCount).toBe("1");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent).toContain("Vaše akce");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent)
      .toContain("50 BB → nejbližší úroveň 50 BB");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent).toContain("Fold");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent).toContain("Výsledek");
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(169);
    expect(root.querySelector<HTMLElement>(".hh-analysis .matrix-cell--hero")?.dataset.hand)
      .toBe("AKo");
    expect(importedIds).toHaveLength(1);
    expect(importedIds[0]).toContain("HJ|50|AKo");
    expect(reviewCounts).toEqual([1]);
    expect(root.querySelector(".hh-postflop-analysis")).toBeNull();
  });

  it("zobrazi flop review z importovane HH bez ulozeni do drill statistik", () => {
    const root = document.createElement("div");
    const reviews: unknown[][] = [];
    renderHHView(root, {
      onReviewBuilt: (records) => {
        reviews.push([...records]);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validFlopHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const flop = root.querySelector<HTMLElement>(".hh-postflop-analysis");
    expect(flop).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewRecordCount).toBe("2");
    expect(flop?.dataset.reviewSavedToDrillStats).toBe("false");
    expect(flop?.dataset.street).toBe("FLOP");
    expect(flop?.dataset.potType).toBe("SINGLE_RAISED");
    expect(flop?.dataset.positionPattern).toBe("SRP_BTN_VS_BB");
    expect(flop?.dataset.board).toBe("Ah-7d-2c");
    expect(flop?.dataset.recommended).toMatch(/^(CHECK|BET_SMALL|BET_BIG)$/);
    expect(flop?.textContent).toContain("Flop – rozbor");
    expect(flop?.textContent).toContain("Ah 7d 2c");
    expect(flop?.textContent).toContain("Single-raised pot");
    expect(flop?.textContent).toContain("SRP BTN vs BB");
    expect(flop?.textContent).toContain("Doporučení");
    expect(flop?.textContent).not.toContain("SINGLE_RAISED");
    expect(flop?.textContent).not.toContain("SRP_BTN_VS_BB");
    expect(flop?.textContent).not.toContain("StrategyPack");
    expect(flop?.textContent).not.toContain("http");
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toHaveLength(2);
    expect(reviews[0][0]).toMatchObject({
      street: "PREFLOP",
      savedToDrillStats: false,
      chosen: expect.any(String),
    });
    expect(reviews[0][1]).toMatchObject({
      street: "FLOP",
      savedToDrillStats: false,
      board: ["Ah", "7d", "2c"],
      positionPattern: "SRP_BTN_VS_BB",
    });
  });

  it("zobrazi turn a river review z importovane HH vcetne facing-bet river akci", () => {
    const root = document.createElement("div");
    const reviews: unknown[][] = [];
    renderHHView(root, {
      onReviewBuilt: (records) => {
        reviews.push([...records]);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validTurnRiverHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const postflop = [...root.querySelectorAll<HTMLElement>(".hh-postflop-analysis")];
    expect(postflop).toHaveLength(3);
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewRecordCount).toBe("4");
    expect(postflop.map((section) => section.dataset.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(postflop[1].dataset.board).toBe("Ah-7d-2c-5s");
    expect(postflop[2].dataset.board).toBe("Ah-7d-2c-5s-Jd");
    expect(postflop[2].dataset.recommended).toMatch(/^(FOLD|CALL|RAISE)$/);
    expect(postflop[1].textContent).toContain("Turn – rozbor");
    expect(postflop[2].textContent).toContain("River – rozbor");
    expect(postflop[2].textContent).not.toContain("RIVER_FACING_BET");
    expect(postflop[2].textContent).not.toContain("StrategyPack");
    expect(postflop[2].textContent).not.toContain("http");
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toHaveLength(4);
    expect(reviews[0][2]).toMatchObject({
      street: "TURN",
      savedToDrillStats: false,
      board: ["Ah", "7d", "2c", "5s"],
      positionPattern: "SRP_BTN_VS_BB",
    });
    expect(reviews[0][3]).toMatchObject({
      street: "RIVER",
      savedToDrillStats: false,
      board: ["Ah", "7d", "2c", "5s", "Jd"],
      positionPattern: "SRP_BTN_VS_BB",
    });
  });

  it("zobrazi MTT flop-turn-river review pres production resolver bez source citaci", () => {
    const root = document.createElement("div");
    const reviews: HHReviewRecord[][] = [];
    renderHHView(root, {
      postflopStrategyResolver: productionLikePostflopResolver,
      onReviewBuilt: (records) => {
        reviews.push([...records]);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = productionFacingBetRunoutHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const postflop = [...root.querySelectorAll<HTMLElement>(".hh-postflop-analysis")];
    const visibleText = root.textContent ?? "";
    expect(postflop).toHaveLength(3);
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewRecordCount).toBe("4");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewSavedToDrillStats)
      .toBe("false");
    expect(postflop.map((section) => section.dataset.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(postflop.map((section) => section.dataset.recommended)).toEqual(["CALL", "CALL", "CALL"]);
    expect(postflop.map((section) => section.dataset.reviewSavedToDrillStats)).toEqual([
      "false",
      "false",
      "false",
    ]);
    expect(visibleText).toContain("Production HH resolver flop recommendation");
    expect(visibleText).toContain("Production HH resolver turn recommendation");
    expect(visibleText).toContain("Production HH resolver river recommendation");
    expect(visibleText).not.toContain("STRATEGY_PACK");
    expect(visibleText).not.toContain("internal-hh-production-parity-pack");
    expect(visibleText).not.toContain("hh-production-");
    expect(visibleText).not.toContain("https://");
    expect(visibleText).not.toContain("FACING_BET");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].map((record) => record.street)).toEqual([
      "PREFLOP",
      "FLOP",
      "TURN",
      "RIVER",
    ]);
    expect(reviews[0].every((record) => record.savedToDrillStats === false)).toBe(true);
    expect(reviews[0][1]).toMatchObject({
      street: "FLOP",
      recommended: "CALL",
      actionNode: "FLOP_FACING_BET",
      positionPattern: "SRP_BTN_VS_BB",
    });
    expect(reviews[0][2]).toMatchObject({
      street: "TURN",
      recommended: "CALL",
      actionNode: "TURN_FACING_BET",
      positionPattern: "SRP_BTN_VS_BB",
    });
    expect(reviews[0][3]).toMatchObject({
      street: "RIVER",
      recommended: "CALL",
      actionNode: "RIVER_FACING_BET",
      positionPattern: "SRP_BTN_VS_BB",
    });
  });

  it("v production rezimu zablokuje postflop review bez resolver match a nepouzije heuristiku", () => {
    const root = document.createElement("div");
    const reviews: HHReviewRecord[][] = [];
    renderHHView(root, {
      postflopStrategyResolver: () => null,
      postflopAllowFallback: false,
      onReviewBuilt: (records) => {
        reviews.push([...records]);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = productionFacingBetRunoutHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const unavailable = root.querySelector<HTMLElement>(".hh-postflop-unavailable");
    expect(unavailable?.textContent).toContain("není dostupná produkční postflop strategie");
    expect(unavailable?.textContent).not.toMatch(/https?:|source|StrategyPack|mtt-/i);
    expect(root.querySelector(".hh-postflop-analysis")).toBeNull();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].map((record) => record.street)).toEqual(["PREFLOP"]);
  });

  it("vycisti HH analyzu po nevalidnim vstupu", () => {
    const root = document.createElement("div");
    renderHHView(root);

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(169);

    textarea!.value = "";
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.spotId).toBeUndefined();
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(0);
    expect(root.querySelector(".poker-table")).toBeNull();
  });
});
