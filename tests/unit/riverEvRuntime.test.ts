import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { encodeComboMask, encodeEvTable } from "../../src/core/evCodec";
import {
  buildRiverStrategyRule,
  type RiverPlanItem,
} from "../../src/data/ranges/riverStrategyRuleBuilder";
import type { RiverEvPack } from "../../src/data/ranges/riverEvPack";
import {
  loadRiverEvPack,
  resetRiverEvCache,
  riverActionEvForCombo,
} from "../../src/data/ranges/riverEvRuntime";
import type { RiverStrategyPack } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";

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

function tableOf(overrides: Partial<RiverEvPack> = {}): RiverEvPack {
  return {
    schemaVersion: "PKRTRAINER_RIVER_EV_V2",
    familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR",
    packId: pack.id,
    contentHash: pack.contentHash,
    unit: "BB",
    source: "SOLVED_TREE",
    combos: COMBOS,
    rules: [{
      m: encodeComboMask([0, 1], COMBOS.length),
      // AhKh: CHECK 1,0 / BET 10 2,0 / BET 12 5,0. 7d6d: složení je nula, sázky nic.
      v: encodeEvTable([1, 2, 5, 0, null, null]),
    }],
    ...overrides,
  };
}

function input(overrides: Partial<PostflopStrategyInput> = {}): PostflopStrategyInput {
  return {
    street: "RIVER",
    textures: [],
    board: item.board.map((card) => ({ rank: card[0], suit: card[1] })) as never,
    potType: rule.potType,
    potBB: 84,
    effectiveStackBB: rule.stackBB,
    positionPattern: rule.positionPattern as never,
    actionNode: "RIVER_OOP_LEAD",
    heroHand: rule.buckets[0].handClasses[0] as never,
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
    const rows = riverActionEvForCombo(pack, table, input(), "AhKh")!;
    expect(rows.map((row) => row.action)).toEqual(["CHECK", "BET_SMALL"]);
    expect(rows[0]).toMatchObject({ evBB: 1, mergedFrom: 1 });
    // 5 a ne 2: hráč volí akci, ne velikost, a tohle ta volba doopravdy stojí.
    expect(rows[1]).toMatchObject({ evBB: 5, mergedFrom: 2 });
  });

  it("nedostupnou akci vynechá, místo aby ukázala nulu", async () => {
    // Nula je platné EV a u složení to nejčastější. Kdyby se chybějící akce
    // četla jako nula, hráč by u nedostupné sázky viděl číslo.
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    const rows = riverActionEvForCombo(pack, table, input(), "7d6d")!;
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

  it("na spot, na který pack neodpovídá, EV nevydá", async () => {
    const table = (await loadRiverEvPack(pack, manifestOf(tableOf())))!;
    const otherBoard = [...item.board];
    otherBoard[4] = otherBoard[4][0] === "2" ? "As" : "2c";
    const rows = riverActionEvForCombo(pack, table, input({
      board: otherBoard.map((card) => ({ rank: card[0], suit: card[1] })) as never,
    }), "AhKh");
    expect(rows).toBeUndefined();
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
