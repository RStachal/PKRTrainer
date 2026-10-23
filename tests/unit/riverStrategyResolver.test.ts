import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildRiverStrategyRule,
  type RiverPlanItem,
  type RiverStrategyRule,
} from "../../src/data/ranges/riverStrategyRuleBuilder";
import {
  RIVER_DEPTH_TOLERANCE_BB,
  createRiverStrategyResolver,
} from "../../src/data/ranges/riverStrategyResolver";
import type { RiverStrategyPack } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";
import { combosOfClass } from "../../src/core/riverActionEv";
import { encodeComboMask, encodeEvDeltas } from "../../src/core/evCodec";
import type { RiverEvPack } from "../../src/data/ranges/riverEvPack";
import { loadRiverEvPack, resetRiverEvCache } from "../../src/data/ranges/riverEvRuntime";

/**
 * Riverový resolver na skutečné vyřešené podhře.
 *
 * Fixture vznikla průchodem celé cesty - `plan_river.py` a `solve_plan.py` - a
 * ne vymyšlením tvaru, který by data mohla mít. Právě proto, že opačný postup už
 * jednou selhal: riverová fáze byla zapojená, otestovaná na plánování a spadla
 * na první položce.
 */
const node = JSON.parse(readFileSync("tests/fixtures/riverSubgame.sample.json", "utf8"));
const item = JSON.parse(
  readFileSync("tests/fixtures/riverPlanItem.sample.json", "utf8"),
) as RiverPlanItem;
const rule = buildRiverStrategyRule(
  "MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/river/CHECK_CHECK__2c",
  node,
  item,
  {
    // Identita hráče se předává tak, jak ji předává generátor. Pravidlo bez ní
    // resolver odmítne, a to schválně: uzel, který neví, čí strategii drží,
    // nepojmenuje žádné rozhodnutí, takže by se dal vydat komukoli.
    hero: {
      side: "OOP",
      seat: "BB",
      villainSeat: "BTN",
      isAggressor: false,
      confidence: 1,
      facingBet: false,
    },
  },
)!;

const pack: RiverStrategyPack = {
  id: "test-river-pack",
  version: "river-solved-v1",
  createdAt: "2026-08-13",
  provenance: "SOLVER_BACKED",
  confidence: "LOW",
  contentHash: "abc",
  dimensions: {
    gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeeds: ["REGULAR"],
    street: "RIVER", evModel: "CHIP_EV", antes: ["OFF", "ON"],
  },
  familyIds: ["MTT9_20BB_BTN_BB_SRP_LOWSPR"],
  assumptions: [],
  rules: [rule],
};

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

describe("riverový resolver", () => {
  it("odpoví na desku, kterou někdo vyřešil", () => {
    const answer = createRiverStrategyResolver(pack)(input());
    expect(answer).not.toBeNull();
    const source = answer?.source;
    expect(source?.kind).toBe("STRATEGY_PACK");
    if (source?.kind === "STRATEGY_PACK") expect(source.provenance).toBe("SOLVER_BACKED");
    // Text je pro hráče: česky a bez interních enumů.
    expect(answer?.explanation).toContain("Vyřešený river");
    expect(answer?.explanation).not.toContain("SRP_");
  });

  // Dva zápisy jedné situace: generátor vydá `BTN_VS_BB`, pravidlo nese
  // `SRP_BTN_VS_BB`. Do 2. 9. 2026 se vyřešená knihovna na ten první nechytla
  // vůbec - změřeno 230 z 2 400 dotazů volnou cestou generátoru, tedy obsah,
  // který existuje a hráč ho nedostal.
  it("odpoví i na starší zápis téže dvojice sedaček", () => {
    expect(rule.positionPattern, "fixture má nést kanonický tvar").toBe("SRP_BTN_VS_BB");
    const answer = createRiverStrategyResolver(pack)(input({
      positionPattern: "BTN_VS_BB" as never,
    }));
    expect(answer).not.toBeNull();
    expect(answer?.source?.kind).toBe("STRATEGY_PACK");
  });

  // Druhá polovina téhož tvrzení: překlad se nesmí zvrhnout v to, že sedí
  // všechno na všechno. Jiná dvojice sedaček zůstává odmítnutá.
  it("na jinou dvojici sedaček neodpoví ani po překladu", () => {
    const answer = createRiverStrategyResolver(pack)(input({
      positionPattern: "SRP_CO_VS_BB" as never,
    }));
    expect(answer).toBeNull();
  });

  it("k odpovědi přiloží EV ostatních akcí, jakmile tabulka dorazí", async () => {
    // Tohle je celý důvod, proč EV vzniká: hráč po odpovědi vidí, co ho ostatní
    // akce stály. Bez tabulky odpověď vyjde bez čísel a stahování se nastartuje
    // na pozadí - čekat na půl megabajtu uprostřed rozdání by byla prodleva
    // přesně v tu chvíli, kdy se kouká na karty.
    resetRiverEvCache();
    const heroCombo = combosOfClass(
      rule.buckets[0].handClasses[0],
      new Set(item.board),
    )[0];
    const heroCards = [
      { rank: heroCombo[0], suit: heroCombo[1] },
      { rank: heroCombo[2], suit: heroCombo[3] },
    ] as never;

    const withoutTable = createRiverStrategyResolver(pack)(input({ heroCards }));
    expect(withoutTable?.actionEvs, "bez tabulky se čísla nevymýšlejí").toBeUndefined();

    // To volání výš si zapamatovalo, že k tomuhle packu v ostrém manifestu
    // tabulka není - a je to tak správně, aby se stahování nezkoušelo znovu při
    // každém spotu. Test proto pokračuje s čistou cache.
    resetRiverEvCache();

    const table: RiverEvPack = {
      schemaVersion: "PKRTRAINER_RIVER_EV_V3",
      familyId: rule.familyId,
      packId: pack.id,
      contentHash: pack.contentHash,
      unit: "BB",
      source: "SOLVED_TREE",
      combos: [heroCombo],
      // Sestupně, ať je vidět, že se pořadí zachovává až do sady.
      rules: [{
        m: encodeComboMask([0], 1),
        v: encodeEvDeltas(rule.actions.map((_, index) => 5 - index), rule.actions.length),
      }],
    };
    await loadRiverEvPack(pack, [{
      familyId: table.familyId, packId: table.packId, load: () => Promise.resolve(table),
    }]);

    const answer = createRiverStrategyResolver(pack)(input({ heroCards }));
    const set = answer?.actionEvs;
    expect(set, "s tabulkou musí EV být").toBeDefined();
    // Ne `SOLVER`: je to expektace nad soupeřovou range, ne solverova
    // counterfactual value, a splynout ta dvě tvrzení nesmí.
    expect(set?.source).toBe("SOLVED_TREE");
    expect(set?.unit).toBe("BB");
    // Každá nabízená akce má číslo; půlka s čísly a půlka bez by vypadala jako
    // vlastnost akce, ne jako mezera v datech.
    const offered = new Set(set?.values.map((value) => value.action));
    expect(offered.size).toBe(set?.values.length);
    expect(set?.values.every((value) => Number.isFinite(value.evBb))).toBe(true);

    // A celá tabulka uzlu, ne jen hrdinova ruka: matice z ní vypisuje EV
    // jednotlivých kombinací, aby hráč viděl i to, co by stálo držet jinou.
    expect(answer?.comboEvs?.map((row) => row.combo)).toEqual([heroCombo]);
    expect(answer?.comboEvs?.[0].values.length).toBe(set?.values.length);
  });

  it("při nepřeložitelném popisku odmítne, místo aby posunul odpověď", () => {
    // Popisky se indexují proti původnímu seznamu, ale překlad nepřeložitelný
    // popisek zahodí a pole se zkrátí. Tady je vadný popisek první, takže by se
    // kbelík pro CHECK načetl z místa, kde leží sázka - hráč by dostal pokyn
    // sázet, s cedulkou, že to spočítal solver.
    const shifted: RiverStrategyRule = {
      ...rule,
      actions: ["ŽÁDNÁ TAKOVÁ AKCE", "CHECK", "BET 10"],
      buckets: [{ ...rule.buckets[0], action: "CHECK" }],
    };
    const answer = createRiverStrategyResolver({ ...pack, rules: [shifted] })(input({
      heroHand: shifted.buckets[0].handClasses[0] as never,
    }));
    expect(answer).toBeNull();
  });

  it("odmítne jinou pátou kartu", () => {
    // Na riveru je pátá karta celá odpověď; sousední deska je jiná hra.
    const other = [...item.board];
    other[4] = other[4][0] === "2" ? "As" : "2c";
    const answer = createRiverStrategyResolver(pack)(input({
      board: other.map((card) => ({ rank: card[0], suit: card[1] })) as never,
    }));
    expect(answer).toBeNull();
  });

  it("drží hloubku těsněji než turn, protože po riveru nic nenásleduje", () => {
    // Turn snese deset blindů, protože se pot stihne srovnat na další ulici.
    // Na riveru je rozdíl deseti blindů rozdíl mezi třetinovou sázkou a potovou.
    expect(RIVER_DEPTH_TOLERANCE_BB).toBeLessThan(10);
    const answer = createRiverStrategyResolver(pack)(input({
      effectiveStackBB: rule.stackBB + RIVER_DEPTH_TOLERANCE_BB + 1,
    }));
    expect(answer).toBeNull();
  });

  it("odmítne ruku, kterou v téhle desce nikdo neřešil", () => {
    const known = new Set(rule.buckets.flatMap((bucket) => bucket.handClasses));
    const unknown = ["72o", "82o", "92o"].find((hand) => !known.has(hand));
    if (unknown === undefined) return;
    expect(createRiverStrategyResolver(pack)(input({ heroHand: unknown as never }))).toBeNull();
  });

  it("velikost sázky měří potem uzlu v žetonech, ne potem v blindech", () => {
    // Solver píše žetony. Kdyby se dělilo trenažérovým potem v blindech, vyšla by
    // sázka za třetinu potu nad každou hranici a hráči by se ukázala jako velká -
    // tedy opak toho, co solver spočítal.
    const smallBet: RiverStrategyRule = {
      ...rule,
      actions: ["CHECK", "BET 28.000000"],
      buckets: [{ ...rule.buckets[0], action: "BET 28.000000" }],
      riverSpot: { ...rule.riverSpot, potChips: 84 },
    };
    const answer = createRiverStrategyResolver({ ...pack, rules: [smallBet] })(
      input({
        heroHand: smallBet.buckets[0].handClasses[0] as never,
        // Trenažérův pot v blindech; musí se lišit od potu v žetonech, jinak by
        // test obě jednotky nerozlišil a neověřil nic.
        potBB: 16.8,
      }),
    );
    // 28 z 84 žetonů je třetina potu, tedy malá sázka. Proti 16,8 by to bylo
    // 1,67 potu, tedy velká.
    expect(answer?.action).toBe("BET_SMALL");
  });
});
