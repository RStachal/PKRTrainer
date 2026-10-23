import { beforeEach, describe, expect, it } from "vitest";

import { encodeComboMask, encodeEvDeltas } from "../../src/core/evCodec";
import type { TurnEvPack } from "../../src/data/ranges/turnEvPack";
import {
  loadTurnEvPack,
  resetTurnEvCache,
  turnActionEvRows,
} from "../../src/data/ranges/turnEvRuntime";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Turnová EV za běhu.
 *
 * Tabulka se stahuje zvlášť od rodiny a platí jen pro tu její podobu, ze které
 * vznikla. Obojí je tu proto, že opak selhává tiše: tabulka přitažená s rodinou
 * by stála stovky kilobajtů každému, kdo si EV nikdy nezobrazí, a tabulka
 * k jiné podobě packu by ukazovala čísla k jiné strategii, aniž by na datech
 * bylo co poznat.
 *
 * Test drží řetěz živý i ve chvíli, kdy se **žádná turnová tabulka nedodává**.
 * Manifest je dnes prázdný, protože o dodání rozhoduje majitel (body 211
 * a 214) - a kód, který nikdo nespustí, tiše shnije.
 */
const rule = {
  sourceDirectory: "MTT9_20BB_BTN_BB_SRP_LOWSPR__999r",
  familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR",
  positionPattern: "SRP_BTN_VS_BB",
  node: "CBET",
  potType: "SINGLE_RAISED",
  stackBB: 20,
  heroOutOfPosition: true,
  // Tři akce, z nichž dvě jsou sázky pod polovinou potu: trenažér má jen jednu
  // malou sázku, takže se složí. Právě to sloučení je na EV to jediné, co se dá
  // udělat špatně a přitom nevypadat divně.
  actions: ["CHECK", "BET 10", "BET 12"],
  buckets: [],
  classCount: 2,
  spot: { potChips: 50, potBB: 7.7 },
} as unknown as TurnStrategyRule;

const pack: TurnStrategyPack = {
  id: "test-turn-pack",
  version: "turn-solved-v1",
  createdAt: "2026-09-09",
  provenance: "SOLVER_BACKED",
  confidence: "MEDIUM",
  contentHash: "hash-1",
  dimensions: {
    gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeeds: ["REGULAR"],
    street: "TURN", evModel: "CHIP_EV", antes: ["OFF", "ON"],
  },
  familyIds: ["MTT9_20BB_BTN_BB_SRP_LOWSPR"],
  assumptions: [],
  rules: [rule],
} as unknown as TurnStrategyPack;

const COMBOS = ["AhKh", "7d6d"];
const HERO_STRONG = [{ rank: "A", suit: "h" }, { rank: "K", suit: "h" }] as const;
const HERO_WEAK = [{ rank: "7", suit: "d" }, { rank: "6", suit: "d" }] as const;

function tableOf(overrides: Partial<TurnEvPack> = {}): TurnEvPack {
  return {
    schemaVersion: "PKRTRAINER_TURN_EV_V1",
    familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR",
    packId: pack.id,
    contentHash: pack.contentHash,
    unit: "BB",
    source: "SOLVED_TREE",
    combos: COMBOS,
    rules: [{
      m: encodeComboMask([0, 1], COMBOS.length),
      // AhKh: CHECK 1,0 / BET 10 2,0 / BET 12 5,0. 7d6d: check nula, sázky nic.
      v: encodeEvDeltas([1, 2, 5, 0, null, null], 3),
    }],
    ...overrides,
  };
}

const manifestOf = (table: TurnEvPack) => [{
  familyId: table.familyId,
  packId: table.packId,
  load: () => Promise.resolve(table),
}];

describe("turnová EV akcí za běhu", () => {
  beforeEach(() => { resetTurnEvCache(); });

  it("složené velikosti ukáže jako jednu akci s tou lepší hodnotou", async () => {
    // `BET 10` i `BET 12` jsou na potu 50 pod polovinou, takže z nich trenažér
    // udělá jedinou malou sázku. Ukázat se má ta lepší z obou (5,0), ne první
    // v pořadí ani průměr: hráč si vybírá akci, ne velikost.
    const table = tableOf();
    await loadTurnEvPack(pack, manifestOf(table));
    const rows = turnActionEvRows(pack, table, 0, HERO_STRONG as never, 7.7);
    const small = rows?.find((row) => row.action === "BET_SMALL");
    expect(small?.evBB).toBe(5);
    expect(small?.mergedFrom).toBe(2);
  });

  it("nedostupnou akci vynechá, místo aby ukázala nulu", async () => {
    // Nula je platná EV. Kdyby se chybějící hodnota četla jako nula, hráč by
    // u akce, kterou solver nepočítal, viděl číslo.
    const table = tableOf();
    await loadTurnEvPack(pack, manifestOf(table));
    const rows = turnActionEvRows(pack, table, 0, HERO_WEAK as never, 7.7);
    expect(rows?.map((row) => row.action)).toEqual(["CHECK"]);
  });

  it("tabulku k jiné podobě packu nepoužije", async () => {
    // Noc pack přegeneruje a otisk se změní. Tabulka by pak ukazovala čísla
    // k jiné strategii a na datech by nebylo co poznat.
    const table = tableOf({ contentHash: "hash-2" });
    const loaded = await loadTurnEvPack(pack, manifestOf(table));
    expect(loaded).toBeUndefined();
  });

  it("bez položky v manifestu se přizná, místo aby sáhla po cizí rodině", async () => {
    expect(await loadTurnEvPack(pack, [])).toBeUndefined();
  });

  it("kombinaci najde bez ohledu na pořadí karet", async () => {
    // Tabulka zapisuje `AhKh`, ale trenažér může držet karty obráceně.
    const table = tableOf();
    await loadTurnEvPack(pack, manifestOf(table));
    const swapped = [{ rank: "K", suit: "h" }, { rank: "A", suit: "h" }] as const;
    const rows = turnActionEvRows(pack, table, 0, swapped as never, 7.7);
    expect(rows?.find((row) => row.action === "CHECK")?.evBB).toBe(1);
  });

  it("na pravidlo, které pack nemá, EV nevydá", async () => {
    const table = tableOf();
    await loadTurnEvPack(pack, manifestOf(table));
    expect(turnActionEvRows(pack, table, 7, HERO_STRONG as never, 7.7)).toBeUndefined();
  });
});
