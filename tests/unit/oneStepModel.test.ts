import { beforeAll, describe, expect, it } from "vitest";

import { buildPool, openSizeAtDepth } from "../../src/core/drillEngine";
import { oneStepAgreement, oneStepPricing } from "../../src/core/preflop/oneStepModel";
import { withRealPricing } from "../../src/core/preflop/realPricing";
import { combosInClass, loadPreflopEquity } from "../../src/core/preflopEquity";
import { ALL_HAND_CLASSES } from "../../src/core/poker";
import { grade } from "../../src/core/scoring";
import {
  POSITION_ORDER,
  type ActionContext,
  type ActionKey,
  type HandLabel,
  type Position,
  type Spot,
  type StackBucket,
} from "../../src/core/types";
import { VILLAIN_ARCHETYPES, type VillainArchetype } from "../../src/core/villain/archetypes";
import { preflopTablePlayers, type TablePlayers } from "../../src/core/villain/tableCast";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { makeFilters } from "../properties/drillSupport";

/**
 * Open, 3-bet a call proti typům (plán GTO/REAL, 4.4 až 4.6): model kotvený na chart.
 * Hlídá se shoda s chartem, identita žraloka, směr podle plánu a hlavně to, že se z
 * exploitu nestane karikatura.
 */

const store = createRangeStoreFromRangePack(currentMttPreflopRangePack("ON"));
const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const combos = (hands: readonly HandLabel[]) => hands.reduce((sum, hand) => sum + combosInClass(hand), 0);

const ANSWERS: Record<string, readonly string[]> = {
  RFI: ["OPEN_25X", "FOLD"],
  VS_OPEN: ["FOLD", "CALL", "3BET"],
  VS_3BET: ["FOLD", "CALL", "4BET"],
};

function spotFor(context: "RFI" | "VS_OPEN" | "VS_3BET", hero: Position, bucket: StackBucket, hand: HandLabel, vsSeat?: Position): Spot {
  const entry = store.lookup({ ante: "ON", position: hero, bucket, context, ...(vsSeat === undefined ? {} : { vsSeat }) });
  const strict = entry?.strict[hand] ?? [];
  const open = openSizeAtDepth(bucket, "ON", store) === 2 ? "OPEN_2X" : "OPEN_25X";
  const keys = ANSWERS[context].map((key) => (key.startsWith("OPEN") ? open : key)) as ActionKey[];
  return {
    id: `${context}|${hero}|${bucket}|${hand}|ON`,
    context,
    heroPos: hero,
    effStack: bucket,
    ante: "ON",
    pushFold: false,
    hand,
    heroCards: [{ rank: "A", suit: "s" }, { rank: "K", suit: "s" }],
    tableState: {
      heroPos: hero,
      pushFold: false,
      effectiveStackBB: bucket,
      limpsBefore: 0,
      callsBefore: 0,
      facing: context === "RFI" ? "NONE" : context === "VS_OPEN" ? "OPEN" : "3BET",
      isBvB: false,
      ...(vsSeat === undefined ? {} : { vsSeat }),
    },
    answers: keys.map((key) => ({ key, label: key })),
    correctKeys: strict.length > 0 ? [...strict] : ["FOLD" as ActionKey],
    strictCorrect: strict.length > 0 ? [...strict] : ["FOLD" as ActionKey],
    explanation: "Test.",
    startingPot: 2.5,
  };
}

function table(cast: Partial<Record<Position, VillainArchetype>>, focusSeat?: Position): TablePlayers {
  return { mode: "REAL", cast, ...(focusSeat === undefined ? {} : { focusSeat }) };
}

const everyone = (hero: Position, type: VillainArchetype): Partial<Record<Position, VillainArchetype>> => (
  Object.fromEntries(POSITION_ORDER.filter((seat) => seat !== hero).map((seat) => [seat, type]))
);

function plan(context: "RFI" | "VS_OPEN" | "VS_3BET", hero: Position, bucket: StackBucket, players: TablePlayers, vsSeat?: Position) {
  return new Map(HANDS.flatMap((hand) => {
    const outcome = oneStepPricing(spotFor(context, hero, bucket, hand, vsSeat), players, store);
    return outcome === undefined ? [] : [[hand, outcome] as const];
  }));
}

describe("jeden krok kotvený na chart", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it.each([
    ["RFI", 0.85],
    ["VS_OPEN", 0.8],
    ["VS_3BET", 0.8],
  ] as const)("bez typu zopakuje chart aspoň z velké části (%s)", (context, floor) => {
    const filters = makeFilters({ ante: "ON", contexts: [context as ActionContext] });
    const spots = buildPool(1, context, filters, store, { maxSize: 300 });
    const shares = spots
      .map((spot) => oneStepAgreement(spot, preflopTablePlayers(spot, { mode: "REAL" }), store))
      .filter((value): value is number => value !== undefined);
    expect(shares.length).toBeGreaterThan(100);
    const mean = shares.reduce((sum, value) => sum + value, 0) / shares.length;
    expect(mean, `průměrná shoda ${(mean * 100).toFixed(1)} %`).toBeGreaterThan(floor);
  });

  it.each([
    ["RFI", "BTN", 40, undefined],
    ["RFI", "UTG", 25, undefined],
    ["VS_OPEN", "BB", 40, "HJ"],
    ["VS_OPEN", "BTN", 50, "HJ"],
    ["VS_3BET", "HJ", 40, "BTN"],
  ] as const)("identita: proti samým žralokům chart platí beze změny (%s %s %s)", (context, hero, bucket, villain) => {
    const outcomes = plan(context, hero, bucket, table(everyone(hero, "SHARK"), villain), villain);
    expect(outcomes.size).toBeGreaterThan(50);
    for (const [hand, outcome] of outcomes) {
      expect(outcome.action, hand).toBe(outcome.gtoAction);
    }
  });

  it("proti kameni na big blindu se otevře šíř a nic se neubere", () => {
    const outcomes = plan("RFI", "BTN", 40, table({ BB: "ROCK" }));
    const wider = [...outcomes].filter(([, outcome]) => outcome.gtoAction === "FOLD" && outcome.action !== "FOLD");
    const tighter = [...outcomes].filter(([, outcome]) => outcome.gtoAction !== "FOLD" && outcome.action === "FOLD");
    expect(wider.length).toBeGreaterThan(5);
    expect(tighter).toEqual([]);
    const [, sample] = wider[0];
    expect(sample.foldFrequency!.real).toBeGreaterThan(sample.foldFrequency!.gto);
  });

  it("proti kostce na big blindu se otevře úžeji a nic nepřibude", () => {
    const outcomes = plan("RFI", "BTN", 40, table({ BB: "DICE" }));
    const wider = [...outcomes].filter(([, outcome]) => outcome.gtoAction === "FOLD" && outcome.action !== "FOLD");
    const tighter = [...outcomes].filter(([, outcome]) => outcome.gtoAction !== "FOLD" && outcome.action === "FOLD");
    expect(tighter.length).toBeGreaterThan(5);
    expect(wider).toEqual([]);
  });

  it("proti velrybě na big blindu se neotevírá úžeji: izolovat široce", () => {
    const outcomes = plan("RFI", "BTN", 40, table({ BB: "WHALE" }));
    const tighter = [...outcomes].filter(([, outcome]) => outcome.gtoAction !== "FOLD" && outcome.action === "FOLD");
    expect(tighter).toEqual([]);
  });

  it("jeden hráč z osmi hnul otevřením z UTG míň než na buttonu", () => {
    const widened = (hero: Position) => {
      const outcomes = plan("RFI", hero, 40, table({ BB: "ROCK" }));
      const added = [...outcomes].filter(([, outcome]) => outcome.gtoAction === "FOLD" && outcome.action !== "FOLD");
      return combos(added.map(([hand]) => hand));
    };
    expect(widened("UTG")).toBeLessThan(widened("BTN"));
  });

  it.each(VILLAIN_ARCHETYPES)("pojistka šířky drží range do násobku chartu (%s)", (type) => {
    for (const [hero, bucket] of [["BTN", 40], ["UTG", 40], ["CO", 25]] as const) {
      const outcomes = plan("RFI", hero, bucket as StackBucket, table(everyone(hero, type)));
      const inChart = (hand: HandLabel) => spotFor("RFI", hero, bucket as StackBucket, hand).strictCorrect[0] !== "FOLD";
      // Pojistka se měří proti celému chartu. Ruce, které model nezopakuje, hrají podle
      // chartu dál a v plánu nemají výsledek, takže se počítají jako v chartu.
      const chart = HANDS.filter(inChart);
      const real = HANDS.filter((hand) => {
        const outcome = outcomes.get(hand);
        return outcome === undefined ? inChart(hand) : outcome.action !== "FOLD";
      });
      expect(combos(real), `${hero} ${bucket}`).toBeLessThanOrEqual(combos(chart) * 1.3);
      expect(combos(real), `${hero} ${bucket}`).toBeGreaterThanOrEqual(combos(chart) / 1.3);
    }
  });

  it.each(VILLAIN_ARCHETYPES)("nikdy nezahodí es a krále a neotevře 72o (%s)", (type) => {
    const players = table(everyone("BTN", type));
    for (const hand of ["AA", "KK"] as HandLabel[]) {
      const outcome = oneStepPricing(spotFor("RFI", "BTN", 40, hand), players, store);
      if (outcome !== undefined) expect(outcome.action, hand).not.toBe("FOLD");
    }
    const utg = oneStepPricing(spotFor("RFI", "UTG", 40, "72o" as HandLabel), table(everyone("UTG", type)), store);
    if (utg !== undefined) expect(utg.action).toBe("FOLD");
  });

  it("proti tomu, kdo skládá míň než chart, se neblafuje", () => {
    for (const type of ["WHALE", "DICE"] as const) {
      const outcomes = plan("VS_OPEN", "BB", 40, table({ HJ: type }, "HJ"), "HJ");
      const bluffs = [...outcomes].filter(([, outcome]) => outcome.gtoAction === "FOLD" && outcome.action === "3BET");
      expect(bluffs.map(([hand]) => hand), type).toEqual([]);
    }
  });

  it.each(["ROCK", "EAGLE", "WHALE"] as const)("proti užšímu 3-betu se 4-bet nepřidává (%s)", (type) => {
    const cells = [["HJ", 25, "BTN"], ["UTG", 100, "BB"], ["BTN", 40, "SB"], ["CO", 60, "BTN"]] as const;
    let compared = 0;
    for (const [hero, bucket, villain] of cells) {
      const outcomes = plan("VS_3BET", hero, bucket as StackBucket, table({ [villain]: type }, villain), villain);
      compared += outcomes.size;
      const added = [...outcomes].filter(([, outcome]) => outcome.gtoAction !== "4BET" && outcome.action === "4BET");
      expect(added.map(([hand]) => hand), `${hero} ${bucket} proti ${villain}`).toEqual([]);
    }
    expect(compared).toBeGreaterThan(50);
  });

  it("proti tomu, kdo 3-betuje šíř, smí 4-bet přibýt, ale jen z ruky, kterou chart hraje", () => {
    const outcomes = plan("VS_3BET", "HJ", 40, table({ BTN: "DICE" }, "BTN"), "BTN");
    expect(outcomes.size).toBeGreaterThan(50);
    const bluffs = [...outcomes].filter(([, outcome]) => outcome.gtoAction === "FOLD" && outcome.action === "4BET");
    expect(bluffs.map(([hand]) => hand)).toEqual([]);
  });

  it("proti kameni, který otevírá úzce a na 3-bet skládá, se dorovnává míň a 3-betuje víc", () => {
    const outcomes = plan("VS_OPEN", "BB", 40, table({ HJ: "ROCK" }, "HJ"), "HJ");
    const fewerCalls = [...outcomes].filter(([, outcome]) => outcome.gtoAction === "CALL" && outcome.action === "FOLD");
    const moreRaises = [...outcomes].filter(([, outcome]) => outcome.gtoAction !== "3BET" && outcome.action === "3BET");
    expect(fewerCalls.length).toBeGreaterThan(0);
    expect(moreRaises.length).toBeGreaterThan(0);
    const [, sample] = moreRaises[0];
    expect(sample.foldFrequency!.real).toBeGreaterThan(sample.foldFrequency!.gto);
    expect(sample.raiseShare!.real).toBeLessThan(sample.raiseShare!.gto);
    expect(sample.foldAgainst).toBe("3BET");
    expect(sample.raiseKind).toBe("OPEN");
  });
});

describe("spot v REAL podle jednoho kroku", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  function movedSpot(): { spot: Spot; real: Spot } {
    for (const hand of HANDS) {
      const spot = spotFor("RFI", "BTN", 40, hand);
      const real = withRealPricing(spot, { mode: "REAL", focus: "ROCK" }, store);
      if (real.real !== undefined && real.strictCorrect[0] !== spot.strictCorrect[0]) return { spot, real };
    }
    throw new Error("proti kameni se nezměnila žádná ruka");
  }

  it("odchylka platí přísně, GTO akce zůstává mírně přijatelná, EV se netvrdí", () => {
    const { spot, real } = movedSpot();
    const deviation = real.strictCorrect[0];
    const chart = spot.strictCorrect[0];
    expect(real.actionEvs).toBeUndefined();
    expect(real.real?.gtoActions).toEqual(["FOLD"]);
    expect(real.real?.villain).toBe("ROCK");

    expect(grade(real, deviation, "STRICT").correct).toBe(true);
    expect(grade(real, chart, "STRICT").correct).toBe(false);
    expect(grade(real, chart, "LENIENT").correct).toBe(true);
    expect(grade(real, deviation, "LENIENT").recommended).toEqual([deviation]);
  });

  it("v GTO se spot nemění", () => {
    const spot = spotFor("RFI", "BTN", 40, "KK" as HandLabel);
    expect(withRealPricing(spot, { mode: "GTO" }, store)).toBe(spot);
  });

  it("stejná odpověď se v REAL řekne a známky nemění", () => {
    const spot = spotFor("RFI", "BTN", 40, "AA" as HandLabel);
    const real = withRealPricing(spot, { mode: "REAL", focus: "SHARK" }, store);
    expect(real.real).toBeDefined();
    expect(real.strictCorrect).toEqual(spot.strictCorrect);
    expect(real.correctKeys).toEqual(spot.correctKeys);
  });
});
