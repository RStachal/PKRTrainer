// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildPool, generateSpot } from "../../src/core/drillEngine";
import { priceActions, type PreflopPricingPlayers } from "../../src/core/preflop/preflopEv";
import { pricingPlayers, withRealPricing } from "../../src/core/preflop/realPricing";
import { loadPreflopEquity } from "../../src/core/preflopEquity";
import { mulberry32 } from "../../src/core/rng";
import { grade } from "../../src/core/scoring";
import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import { POSITION_ORDER, type ActionContext, type ActionKey, type Filters, type Spot } from "../../src/core/types";
import { GTO_PLAYERS, preflopTablePlayers } from "../../src/core/villain/tableCast";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks, currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { createStatsStore } from "../../src/persistence/statsStore";
import { buildPreflopCurriculumPlan, buildPreflopSpacedRepetitionQueue } from "../../src/persistence/preflopCurriculum";
import { upgradeResultRecordToV2 } from "../../src/persistence/statsRecordV2";
import { createPreflopSession } from "../../src/training/preflopSession";
import { setAppLanguage } from "../../src/ui/cs";
import { realComparison } from "../../src/ui/trainer/realFeedback";
import { makeFilters } from "../properties/drillSupport";

/**
 * Režim REAL na preflopu (plán GTO/REAL, 4.4 až 4.6): rozdaná zásoba zůstává GTO,
 * ukázaný spot se ocení proti hráčům u stolu a GTO odpověď zůstává vedle.
 */

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function fullRingStore() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

const store = fullRingStore();
const ALL_IN_CONTEXTS: readonly ActionContext[] = ["PUSH_FOLD", "VS_ALLIN", "VS_OPEN", "VS_4BET", "RFI"];
const EVERY_CONTEXT: readonly ActionContext[] = [
  "RFI", "VS_LIMP", "VS_OPEN", "VS_3BET", "VS_4BET", "SQUEEZE", "BVB", "PUSH_FOLD", "VS_ALLIN",
];

function pricedSpots(context: ActionContext): Spot[] {
  const filters: Filters = makeFilters({ ante: "OFF", contexts: [context], scoringMode: "STRICT" });
  return buildPool(1, context, filters, store, { maxSize: 400 })
    .filter((spot) => spot.actionEvs?.source === "ALL_IN_EQUITY");
}

afterEach(() => {
  document.body.innerHTML = "";
  setAppLanguage("CZ");
});

describe("spot oceněný proti stolu", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it("v GTO vrací tentýž spot", () => {
    const [spot] = pricedSpots("PUSH_FOLD");
    expect(withRealPricing(spot, GTO_PLAYERS, store)).toBe(spot);
  });

  it.each(ALL_IN_CONTEXTS)("identita: bez typů i se žraloky na všech místech EV z chartů (%s)", (context) => {
    const spots = pricedSpots(context);
    expect(spots.length, "kontext bez oceněných spotů").toBeGreaterThan(0);
    for (const spot of spots) {
      const price = (players?: PreflopPricingPlayers) => priceActions(
        spot.context,
        spot.heroPos,
        spot.hand,
        spot.effStack,
        spot.ante,
        spot.startingPot!,
        spot.answers.map((answer) => answer.key),
        store,
        players,
        spot.tableState.callsBefore,
        spot.tableState.vsSeat,
      )?.evs;
      expect(price(), spot.id).toEqual(spot.actionEvs);
      const sharks = Array.from({ length: 9 }, () => "SHARK" as const);
      expect(price({ villain: "SHARK", callers: sharks }), spot.id).toEqual(spot.actionEvs);
    }
  });

  it.each(EVERY_CONTEXT)("v GTO není odpověď podle chartu nikdy chyba (%s)", (context) => {
    // Známkování dává EV přednost před chartem. Do 5. 11. 2026 tak byl fold podle
    // chartu chyba v 490 z 490 spotů squeeze, s doporučením jít all-in s KTo.
    const filters = makeFilters({ ante: "OFF", contexts: [context], scoringMode: "STRICT" });
    const spots = buildPool(1, context, filters, store, { maxSize: 400 });
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      if (spot.strictCorrect.length !== 1) continue;
      expect(grade(spot, spot.strictCorrect[0], "STRICT").correct, spot.id).toBe(true);
    }
  });

  it("co model v GTO nezopakuje, to proti typu netvrdí", () => {
    for (const context of ["BVB", "SQUEEZE"] as const) {
      const filters = makeFilters({ ante: "OFF", contexts: [context], scoringMode: "STRICT" });
      const unpriced = buildPool(1, context, filters, store, { maxSize: 200 })
        .filter((spot) => spot.actionEvs === undefined);
      expect(unpriced.length, context).toBeGreaterThan(0);
      for (const spot of unpriced) {
        expect(withRealPricing(spot, { mode: "REAL", focus: "WHALE" }, store), spot.id).toBe(spot);
      }
    }
  });

  it("živý stůl čte typy z téhož stolu, který hráč vidí", () => {
    const [spot] = pricedSpots("PUSH_FOLD").filter((item) => item.heroPos === "UTG");
    expect(spot).toBeDefined();
    const table = preflopTablePlayers(spot, { mode: "REAL" });
    const players = pricingPlayers(spot, table);
    expect(players.villain).toBeUndefined();
    expect(players.callers).toEqual(POSITION_ORDER.slice(1).map((seat) => table.cast[seat]));
    expect(withRealPricing(spot, { mode: "REAL" }, store).real?.villain).toBeUndefined();
  });

  it("hodnotí proti soupeři a GTO nechává vedle", () => {
    const spots = pricedSpots("VS_ALLIN");
    expect(spots.length).toBeGreaterThan(0);
    let flipped = 0;
    for (const spot of spots) {
      const real = withRealPricing(spot, { mode: "REAL", focus: "DICE" }, store);
      expect(real.real?.villain).toBe("DICE");
      expect(real.actionEvs?.source).toBe("VILLAIN_MODEL");
      expect(real.real?.gtoEvs).toEqual(spot.actionEvs);
      // Kostka shovuje širší, takže dorovnání je vždy aspoň tak dobré jako proti chartu.
      const call = (set: Spot["actionEvs"]) => set!.values.find((item) => item.action === ("CALL_JAM" as ActionKey))!.evBb;
      expect(call(real.actionEvs)).toBeGreaterThanOrEqual(call(spot.actionEvs) - 1e-9);
      expect(real.real!.shoveShare!.real).toBeGreaterThan(real.real!.shoveShare!.gto);
      if (grade(real, "CALL_JAM" as ActionKey, "STRICT").correct !== grade(spot, "CALL_JAM" as ActionKey, "STRICT").correct) {
        flipped += 1;
      }
    }
    expect(flipped, "kostka nezměnila ani jednu odpověď").toBeGreaterThan(0);
  });

  it("každý typ posune shove správným směrem, vždy proti týmž kartám", () => {
    // Hráč na big blindu nikoho za sebou nemá, typ by neměl koho posunout.
    const [spot] = pricedSpots("PUSH_FOLD").filter((item) => (
      item.heroPos !== "BB" && (item.hand === "72o" || item.hand === "52o" || item.hand === "32o" || item.hand === "62o")
    ));
    expect(spot).toBeDefined();
    const jam = (priced: Spot) => priced.actionEvs!.values.find((item) => item.action === ("JAM" as ActionKey))!.evBb;
    const folds = (focus: "ROCK" | "WHALE") => withRealPricing(spot, { mode: "REAL", focus }, store).real!.foldFrequency!;
    expect(folds("ROCK").real).toBeGreaterThan(folds("WHALE").real);
    expect(jam(withRealPricing(spot, { mode: "REAL", focus: "ROCK" }, store)))
      .toBeGreaterThan(jam(withRealPricing(spot, { mode: "REAL", focus: "WHALE" }, store)));
  });

  it("nepřesahuje do spotů, které model neumí, a do scénářů s ICM", () => {
    // Limp model nemá: ani cenu all-inu, ani jeden krok nad chartem.
    const limp = generateSpot(mulberry32(3), "VS_LIMP", makeFilters({ ante: "OFF", contexts: ["VS_LIMP"] }), store);
    expect(limp).not.toBeNull();
    expect(limp!.actionEvs).toBeUndefined();
    expect(withRealPricing(limp!, { mode: "REAL", focus: "WHALE" }, store)).toBe(limp);
    const [spot] = pricedSpots("PUSH_FOLD");
    const icm = { ...spot, tableState: { ...spot.tableState, stackSetupId: "ICM" } };
    expect(withRealPricing(icm, { mode: "REAL", focus: "WHALE" }, store)).toBe(icm);
  });

  it("EV ze solveru posune o rozdíl z modelu, kotva zůstává", () => {
    const [spot] = pricedSpots("PUSH_FOLD");
    const solved: Spot = {
      ...spot,
      actionEvs: {
        ...spot.actionEvs!,
        source: "SOLVED_TREE",
        values: spot.actionEvs!.values.map((item) => ({ ...item, evBb: item.evBb + 1 })),
      },
    };
    const model = withRealPricing(spot, { mode: "REAL", focus: "WHALE" }, store);
    const shifted = withRealPricing(solved, { mode: "REAL", focus: "WHALE" }, store);
    expect(shifted.real?.gtoEvs).toEqual(solved.actionEvs);
    for (const item of shifted.actionEvs!.values) {
      const plain = model.actionEvs!.values.find((value) => value.action === item.action)!;
      expect(item.evBb).toBeCloseTo(plain.evBb + 1, 2);
    }
  });
});

describe("relace a vyhodnocení v REAL", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  const pack = currentMttPreflopRangePack("OFF");
  const profile = { ...DEFAULT_TRAINING_PROFILE, ante: "OFF" as const, street: "PREFLOP" as const };

  function session(filters: Filters) {
    const stats = createStatsStore(new MemoryStorage());
    const created = createPreflopSession(stats);
    const started = created.start(filters, 7, profile, pack);
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    return { stats, created, started };
  }

  it("ukázaný spot i další spot jsou oceněné a odpověď se hodnotí podle nich", () => {
    const filters: Filters = {
      ...makeFilters({ ante: "OFF", contexts: ["PUSH_FOLD"], scoringMode: "STRICT" }),
      trainingMode: "REAL",
      villainFocus: "WHALE",
    };
    const { stats, created, started } = session(filters);
    expect(started.spot.real?.villain).toBe("WHALE");
    const answer = created.answer(started.spot.answers[0].key, { trainingMode: "REAL", villainArchetype: "WHALE" });
    expect(answer?.grade.actionEv).toBeDefined();
    expect(stats.events()[0].chosenEvBb).toBe(
      started.spot.actionEvs!.values.find((item) => item.action === started.spot.answers[0].key)!.evBb,
    );
    const next = created.next();
    expect(next?.real?.villain).toBe("WHALE");
    expect(created.spot).toBe(next);
  });

  it("v GTO spot nic navíc nenese", () => {
    const { started } = session(makeFilters({ ante: "OFF", contexts: ["PUSH_FOLD"], scoringMode: "STRICT" }));
    expect(started.spot.real).toBeUndefined();
    expect(started.spot.actionEvs?.source).toBe("ALL_IN_EQUITY");
  });

  it("vyhodnocení řekne GTO, odpověď proti typu, důvod i původ", () => {
    const spot: Spot = {
      answers: [{ key: "JAM" as ActionKey, label: "Jam" }, { key: "FOLD" as ActionKey, label: "Fold" }],
      actionEvs: {
        source: "VILLAIN_MODEL", unit: "BB", equivalentThresholdBb: 0.1, acceptableThresholdBb: 0.3,
        values: [{ action: "JAM" as ActionKey, evBb: 1.4 }, { action: "FOLD" as ActionKey, evBb: 0 }],
      },
      real: {
        villain: "ROCK",
        gtoActions: ["FOLD"],
        gtoEvs: {
          source: "ALL_IN_EQUITY", unit: "BB", equivalentThresholdBb: 0.1, acceptableThresholdBb: 0.3,
          values: [{ action: "JAM" as ActionKey, evBb: -0.5 }, { action: "FOLD" as ActionKey, evBb: 0 }],
        },
        foldFrequency: { real: 0.84, gto: 0.78 },
      },
    } as unknown as Spot;
    const block = realComparison(document, spot)!;
    expect(block.querySelector(".dx-trainer__real-line")?.textContent).toBe("GTO: Fold. Proti kameni: Jam, +1,40 BB.");
    expect(block.querySelector(".dx-trainer__real-why")?.textContent).toBe("Kámen složí 84 % místo 78 %.");
    expect(block.querySelector(".dx-trainer__origin")?.textContent).toBe("Model hráče (odhad)");

    setAppLanguage("EN");
    const english = realComparison(document, spot)!;
    expect(english.querySelector(".dx-trainer__real-line")?.textContent).toBe("GTO: Fold. Against the rock: Jam, +1.40 BB.");
    expect(english.querySelector(".dx-trainer__real-why")?.textContent).toBe("The rock folds 84% instead of 78%.");
  });

  it("stejná odpověď se řekne jednou a bez nezměněného důvodu", () => {
    const evs = (jam: number) => ({
      source: "ALL_IN_EQUITY" as const, unit: "BB" as const, equivalentThresholdBb: 0.1, acceptableThresholdBb: 0.3,
      values: [{ action: "JAM" as ActionKey, evBb: jam }, { action: "FOLD" as ActionKey, evBb: 0 }],
    });
    const spot = {
      answers: [{ key: "JAM", label: "Jam" }, { key: "FOLD", label: "Fold" }],
      actionEvs: evs(2),
      real: { gtoActions: ["JAM"], gtoEvs: evs(1.8), foldFrequency: { real: 0.701, gto: 0.702 } },
    } as unknown as Spot;
    const block = realComparison(document, spot)!;
    expect(block.querySelector(".dx-trainer__real-line")?.textContent).toBe("GTO i proti tomuhle stolu: Jam.");
    expect(block.querySelector(".dx-trainer__real-why")).toBeNull();
    expect(realComparison(document, { ...spot, real: undefined } as Spot)).toBeNull();
  });

  it("osnova chartů nepočítá odpovědi z REAL", () => {
    const record = {
      qid: "RFI|BTN|25|AKs|OFF",
      chosen: "FOLD" as ActionKey,
      correct: false,
      context: "RFI" as const,
      position: "BTN" as const,
      bucket: 25 as const,
      ts: 1,
    };
    const gto = upgradeResultRecordToV2(record, { profile });
    const real = upgradeResultRecordToV2({ ...record, trainingMode: "REAL", villainArchetype: "ROCK" }, { profile });
    expect(buildPreflopCurriculumPlan([real]).scope.records).toBe(0);
    expect(buildPreflopCurriculumPlan([gto]).scope.records).toBe(1);
    expect(buildPreflopSpacedRepetitionQueue([real])).toHaveLength(0);
    expect(buildPreflopSpacedRepetitionQueue([gto])).toHaveLength(1);
  });
});
