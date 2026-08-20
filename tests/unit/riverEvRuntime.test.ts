import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { encodeComboMask, encodeEvDeltas } from "../../src/core/evCodec";
import {
  buildRiverStrategyRule,
  type RiverPlanItem,
} from "../../src/data/ranges/riverStrategyRuleBuilder";
import type { RiverEvPack } from "../../src/data/ranges/riverEvPack";
import {
  loadRiverEvPack,
  resetRiverEvCache,
  riverActionEvRows,
} from "../../src/data/ranges/riverEvRuntime";
import type { RiverStrategyPack } from "../../src/data/ranges/riverSolvedRuntimeRegistry";

/**
 * EV akcí za běhu.
 *
 * Tabulka se stahuje zvlášť od rodiny a platí jen pro tu její podobu, ze které
 * vznikla. Obojí je tu proto, že opak selhává tiše: tabulka přitažená s rodinou
 * by stála půl megabajtu každému, kdo si EV nikdy nezobrazí, a tabulka k jiné
 * podobě packu by ukazovala čísla k jiné strategii, aniž by na datech bylo co
 * poznat.
 */
const node = JSON.parse(readFileSync("tests/fixtures/riverSubgame.sample.json", "utf8"));
const item = JSON.parse(
  readFileSync("tests/fixtures/riverPlanItem.sample.json", "utf8"),
) as RiverPlanItem;
const baseRule = buildRiverStrategyRule(
  "MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/river/CHECK_CHECK__2c",
  node,
  item,
  {
    hero: {
      side: "OOP", seat: "BB", villainSeat: "BTN",
      isAggressor: false, confidence: 1, facingBet: false,
    },
  },
)!;

// Tři akce, z nichž dvě jsou sázky pod polovinou potu: trenažér má jen jednu
// malou sázku, takže se složí. Právě to sloučení je na EV to jediné, co se dá
// udělat špatně a nevypadat divně.
const rule = { ...baseRule, actions: ["CHECK", "BET 10", "BET 12"] };

const pack: RiverStrategyPack = {
  id: "test-river-pack",
  version: "river-solved-v1",
  createdAt: "2026-08-20",
  provenance: "SOLVER_BACKED",
  confidence: "MEDIUM",
  contentHash: "hash-1",
  dimensions: {
    gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeeds: ["REGULAR"],
    street: "RIVER", evModel: "CHIP_EV", antes: ["OFF", "ON"],
  },
  familyIds: ["MTT9_20BB_BTN_BB_SRP_LOWSPR"],
  assumptions: [],
  rules: [rule],
};

const COMBOS = ["AhKh", "7d6d"];
const HERO_STRONG = [{ rank: "A", suit: "h" }, { rank: "K", suit: "h" }] as const;
const HERO_WEAK = [{ rank: "7", suit: "d" }, { rank: "6", suit: "d" }] as const;

function tableOf(overrides: Partial<RiverEvPack> = {}): RiverEvPack {
  return {
    schemaVersion: "PKRTRAINER_RIVER_EV_V3",
    familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR",
    packId: pack.id,
    contentHash: pack.contentHash,
    unit: "BB",
    source: "SOLVED_TREE",
    combos: COMBOS,
    rules: [{
      m: encodeComboMask([0, 1], COMBOS.length),
      // AhKh: CHECK 1,0 / BET 10 2,0 / BET 12 5,0. 7d6d: složení je nula, sázky nic.
      v: encodeEvDeltas([1, 2, 5, 0, null, null], 3),
    }],
    ...overrides,
  };
}

const manifestOf = (table: RiverEvPack) => [{
  familyId: table.familyId,
  packId: table.packId,
  load: () => Promise.resolve(table),
}];

describe("EV akcí za běhu", () => {
  beforeEach(() => { resetRiverEvCache(); });

  it("složené velikosti ukáže jako jednu akci s tou lepší hodnotou", async () => {
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    const rows = riverActionEvRows(pack, table, 0, HERO_STRONG, 84)!;
    expect(rows.map((row) => row.action)).toEqual(["CHECK", "BET_SMALL"]);
    expect(rows[0]).toMatchObject({ evBB: 1, mergedFrom: 1 });
    // 5 a ne 2: hráč volí akci, ne velikost, a tohle ta volba doopravdy stojí.
    expect(rows[1]).toMatchObject({ evBB: 5, mergedFrom: 2 });
  });

  it("nedostupnou akci vynechá, místo aby ukázala nulu", async () => {
    // Nula je platné EV a u složení to nejčastější. Kdyby se chybějící akce
    // četla jako nula, hráč by u nedostupné sázky viděl číslo.
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    const rows = riverActionEvRows(pack, table, 0, HERO_WEAK, 84)!;
    expect(rows).toEqual([{ action: "CHECK", evBB: 0, mergedFrom: 1 }]);
  });

  it("tabulku k jiné podobě packu nepoužije", async () => {
    // Přegenerovaný pack s nepřegenerovanou tabulkou: tvar dat zůstane v
    // pořádku, takže tohle je jediné místo, kde se to dá poznat.
    const stale = tableOf({ contentHash: "hash-0" });
    expect(await loadRiverEvPack(pack, manifestOf(stale))).toBeUndefined();
  });

  it("bez položky v manifestu se přizná, místo aby sáhla po cizí rodině", async () => {
    const other = tableOf({ packId: "jiny-pack" });
    expect(await loadRiverEvPack(pack, manifestOf(other))).toBeUndefined();
  });

  it("na pravidlo, které pack nemá, EV nevydá", async () => {
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    expect(riverActionEvRows(pack, table, 7, HERO_STRONG, 84)).toBeUndefined();
  });

  it("kombinaci mimo tabulku nepřizná", async () => {
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    const unknown = [{ rank: "2", suit: "c" }, { rank: "3", suit: "d" }] as const;
    expect(riverActionEvRows(pack, table, 0, unknown as never, 84)).toBeUndefined();
  });

  it("kombinaci najde bez ohledu na pořadí karet", async () => {
    // Tabulka zapisuje jedno pořadí; rozdaná ruka může přijít v opačném a
    // nesmí se tím ztratit.
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    const swapped = [HERO_STRONG[1], HERO_STRONG[0]] as const;
    expect(riverActionEvRows(pack, table, 0, swapped, 84))
      .toEqual(riverActionEvRows(pack, table, 0, HERO_STRONG, 84));
  });

  it("stahuje jednou, i když se ptá víc buněk matrixu", async () => {
    let loads = 0;
    const table = tableOf();
    const manifest = [{
      familyId: table.familyId,
      packId: table.packId,
      load: () => { loads += 1; return Promise.resolve(table); },
    }];
    await loadRiverEvPack(pack, manifest);
    await loadRiverEvPack(pack, manifest);
    expect(loads).toBe(1);
  });
});
