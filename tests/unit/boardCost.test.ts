/**
 * Cena desky z nočního logu.
 *
 * Testuje se na **skutečných řádcích** z `artifacts/decomposition/expansion.log`,
 * ne na vymyšlených: regulární výraz nad logem je přesně ta věc, která projde
 * review a tiše nic nenajde (bod 198), a jednou se to tady už stalo - ukotvení
 * na konec řádku zahodilo všechny opakované pokusy, tedy ty nejdražší desky.
 */
import { describe, expect, it } from "vitest";

import {
  capFromP90,
  comboCount,
  costForDepth,
  costForFamily,
  depthCostsFrom,
  depthOfFamily,
  familyCostsFrom,
  fitWidthModels,
  parseBoardSolves,
  rangeWidthOf,
  type BoardCostTable,
} from "../../scripts/lib/boardCost.mts";

const FRESH = [
  "[00:31:27] solving MTT9_40BB_UTG_2_HJ_SRP 883r",
  "[00:53:31]   hotovo za 22.1 min, checkpoint 29 MB",
];

const RETRY = [
  "[21:04:11] solving MTT9_25BB_CO_BTN_SRP J73r (stupeň 1: strop 60 min, přesnost 0.5 %)",
  "[21:50:53]   hotovo za 46.7 min, checkpoint 18 MB (napodruhé)",
];

const FAILED = [
  "[01:22:41] solving MTT9_40BB_UTG_2_HJ_SRP 742r",
  "[01:52:42]   SELHALO po 30.0 min (rc=timeout); příští noc stupeň 1 - strop 60 min, přesnost 0.5 %",
];

// Třetí tvar řádku: čerstvá deska hloubky, která se od rozhodnutí 2c solví na
// 1 %, hlásí přesnost **místo** stupně.
const COARSE = [
  "[22:10:02] solving MTT9_50BB_BTN_BB_SRP A72r (přesnost 1.0 %, strop 90 min)",
  "[23:01:20]   hotovo za 51.3 min, checkpoint 44 MB",
];

const RIVER = [
  "[03:09:42]   solving river MTT9_40BB_UTG_BB_SRP__AQ6r / CHECK_BET25_CALL__Qh: 39 z 39",
  "[03:11:02]   hotovo za 1.3 min, checkpoint 2 MB",
];

const SLEPT = [
  "[23:09:18] solving MTT9_25BB_UTG_HJ_SRP 955tt",
  "[07:36:51]   hotovo za 507.5 min, checkpoint 18 MB (napodruhé)",
];

describe("parseBoardSolves", () => {
  it("čte čerstvou desku i její hloubku", () => {
    expect(parseBoardSolves(FRESH)).toEqual([
      { family: "MTT9_40BB_UTG_2_HJ_SRP", board: "883r", depthBB: 40, minutes: 22.1, level: 0 },
    ]);
  });

  it("čte i opakovaný pokus, který má za jménem desky stupeň žebříku", () => {
    // Tohle je ten případ, který ukotvení na konec řádku zahazovalo - a jsou to
    // nejdražší desky, takže bez nich vyjde strop těsný.
    const solves = parseBoardSolves(RETRY);
    expect(solves).toHaveLength(1);
    expect(solves[0]).toMatchObject({ board: "J73r", minutes: 46.7, level: 1 });
  });

  it("čte i čerstvou desku, která za jménem hlásí přesnost místo stupně", () => {
    /*
     * Rozhodnutí 2c přidalo třetí tvar řádku a výraz tu do 9. 10. 2026
     * vyjmenovával tvary závorky (`\(stupeň (\d+):`). Tenhle řádek by propadl,
     * takže by se **celá hloubka 50 bb** do ceny nezapočítala a plán by na ni dál
     * používal extrapolaci - tedy tatáž vada jako u ukotvení na konec řádku, jen
     * o patro výš.
     */
    const solves = parseBoardSolves(COARSE);
    expect(solves).toHaveLength(1);
    expect(solves[0]).toMatchObject({
      family: "MTT9_50BB_BTN_BB_SRP", board: "A72r", depthBB: 50, minutes: 51.3, level: 0,
    });
  });

  it("neúspěšnou desku nepočítá", () => {
    // Deska na stropu cenu neříká; říká jen, že je dražší než strop.
    expect(parseBoardSolves(FAILED)).toEqual([]);
  });

  it("riverovou vrstvu nepovažuje za desku", () => {
    // `solving river …` má jiný tvar a jinou jednotku práce; kdyby se sem
    // dostala, srazila by medián, protože vrstev je tisíce a jsou krátké.
    expect(parseBoardSolves(RIVER)).toEqual([]);
  });

  it("prospanou desku zahodí", () => {
    // Noc 1.-2. 10. 2026: stroj spal 8 h 21 min na baterii, takže na hodinách
    // vyšlo 507,5 min. Runner by solve nad 90 min zabil, takže delší čas není
    // cena desky, ale pohyb hodin bez procesu.
    expect(parseBoardSolves(SLEPT)).toEqual([]);
  });

  it("nepřiřadí cenu k desce, která skončila bez začátku", () => {
    expect(parseBoardSolves(["[00:53:31]   hotovo za 22.1 min, checkpoint 29 MB"])).toEqual([]);
  });

  it("nepřiřadí cenu k předchozí desce, když se mezitím začala jiná", () => {
    // Uříznutý log: první deska `hotovo` nedostala. Její čas se nesmí přilepit
    // k druhé desce, jinak by jedna cena patřila dvěma deskám.
    const solves = parseBoardSolves([FRESH[0], ...RETRY]);
    expect(solves).toHaveLength(1);
    expect(solves[0].board).toBe("J73r");
  });
});

describe("depthCostsFrom", () => {
  it("rozdělí po hloubkách a spočítá medián, p90 a maximum", () => {
    const lines = [...FRESH, ...RETRY, ...FAILED];
    const costs = depthCostsFrom(parseBoardSolves(lines));
    expect(costs.map((row) => row.depthBB)).toEqual([25, 40]);
    expect(costForDepth({ measuredAt: "", source: "", solves: 0, depths: costs }, 25))
      .toMatchObject({ boards: 1, median: 46.7, basis: "měřeno" });
  });

  it("plán je medián, ne p90", () => {
    // Směr, kterým se smí mýlit: výhled fronty je minuty děleno oknem, takže
    // dražší deska hlásí **víc** nocí zásoby. Nadsazená cena tedy hlásí zásobu,
    // která není, a noc běží naprázdno.
    const solves = [2, 4, 6, 8, 100].map((minutes) => ({
      family: "MTT9_25BB_CO_BTN_SRP", board: "x", depthBB: 25, minutes, level: 0,
    }));
    const [row] = depthCostsFrom(solves);
    expect(row.planMinutes).toBe(row.median);
    expect(row.planMinutes).toBeLessThan(row.p90);
  });

  it("slib je průměr, ne medián - a u zešikmeného rozdělení je nad ním", () => {
    // Opačný směr než u plánu výš, a proto druhé pole. Slib „noc dokončí tuhle
    // rodinu" je součet N desek a nezkreslený odhad součtu je `N krát průměr`.
    // Medián by slíbil rodinu, která nedojde, a ráno by se nedodalo nic.
    //
    // Změřeno 14. 10. 2026 na skutečných datech: 25 bb má medián 6,4 a průměr
    // 7,3 (zkreslení 14,1 %), 50 bb 23,9 proti 25,6 (7,1 %). Zdejší vzorek je
    // zešikmený stejným směrem, jen ostřeji, aby byl rozdíl vidět na očích.
    const solves = [2, 4, 6, 8, 100].map((minutes) => ({
      family: "MTT9_25BB_CO_BTN_SRP", board: "x", depthBB: 25, minutes, level: 0,
    }));
    const [row] = depthCostsFrom(solves);
    expect(row.promiseMinutes).toBe(24); // (2+4+6+8+100)/5
    expect(row.promiseMinutes).toBeGreaterThan(row.median);
    // A nesmí to být tatáž hodnota jako plán, jinak by se ta oprava dala
    // nedopatřením vrátit zpátky na medián a nic by to neohlásilo.
    expect(row.promiseMinutes).not.toBe(row.planMinutes);
  });

  it("u symetrického rozdělení slib a plán splynou - rozdíl dělá chvost, ne statistika sama", () => {
    // Falsifikace testu výš: kdyby `promiseMinutes` bylo prostě „něco většího",
    // prošlo by i tady. Průměr se od mediánu odchyluje jen tím, co je ve chvostu.
    const solves = [10, 20, 30].map((minutes) => ({
      family: "MTT9_25BB_CO_BTN_SRP", board: "x", depthBB: 25, minutes, level: 0,
    }));
    const [row] = depthCostsFrom(solves);
    expect(row.promiseMinutes).toBe(20);
    expect(row.promiseMinutes).toBe(row.median);
  });

  it("neznámá hloubka nemá cenu, místo aby dostala cizí", () => {
    // Tichá výchozí hodnota byla ta vada: hlídač měl `MINUTES_PER_BOARD_DEEP = 40`
    // a na hloubku, kterou nikdo nezměřil, odpověděl číslem.
    const costs = depthCostsFrom(parseBoardSolves(FRESH));
    expect(costForDepth({ measuredAt: "", source: "", solves: 0, depths: costs }, 100))
      .toBeUndefined();
  });
});

describe("capFromP90", () => {
  it("reprodukuje stropy, které do 6. 10. 2026 stály ručně v runneru", () => {
    // Ověření odvození proti číslům, která vznikla úsudkem: 25 bb mělo 30,
    // 40 bb 60, hlubší 90. Kdyby pravidlo dávalo něco jiného, bylo by to
    // pravidlo vymyšlené k číslům, ne odvozené z nich.
    expect(capFromP90(13.1)).toBe(30);
    expect(capFromP90(28.6)).toBe(60);
    expect(capFromP90(59)).toBe(90);
  });

  it("drží spodní i horní mez", () => {
    expect(capFromP90(1)).toBe(30);
    expect(capFromP90(400)).toBe(90);
  });
});

describe("depthOfFamily", () => {
  it("přečte hloubku ze jména rodiny", () => {
    expect(depthOfFamily("MTT9_40BB_UTG_2_HJ_SRP")).toBe(40);
    expect(depthOfFamily("MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR")).toBe(100);
  });

  it("vrátí nulu, když se hloubka přečíst nedá", () => {
    expect(depthOfFamily("MTT9_CO_BTN_SRP")).toBe(0);
  });
});
/**
 * Cena podle rodiny a šířky range (od 20. 10. 2026).
 *
 * Řádek hloubky je průměr přes rodiny, které noc zrovna solvila. Na 40 bb to
 * byly rodiny s raným otvíračem, a nové dvojice s obranou blindů pak vycházely
 * o polovinu levnější, než jsou (bod 311).
 */
describe("šířka range", () => {
  it("počítá kombinace i s váhou: pár 6, suited 4, offsuit 12", () => {
    expect(comboCount("AA:1,AKs:1,AKo:0.5")).toBe(16);
    expect(comboCount("22:1,33:1")).toBe(12);
  });

  it("šířka rodiny je OOP plus IP z parametrů solveru", () => {
    const params = [
      "set_pot 550",
      "set_effective_stack 4750",
      "set_board Ks,9s,8d",
      "set_range_oop 55:1,AJs:1,AQo:1",
      "set_range_ip AA:1,KK:0.5",
    ].join("\n");
    expect(rangeWidthOf(params)).toBe(6 + 4 + 12 + 6 + 3);
    expect(rangeWidthOf("set_pot 550")).toBeUndefined();
  });
});

describe("fitWidthModels", () => {
  it("najde sklon, kterým cena roste se šířkou", () => {
    // minuty = 2 * šířka^0,6 přesně: sklon 0,6, a bez rozptylu smear 1.
    const solves = Array.from({ length: 40 }, (_, at) => {
      const width = 100 + at * 25;
      return { family: `MTT9_40BB_F${at}_SRP`, board: "742r", depthBB: 40, level: 0, width, minutes: 2 * width ** 0.6 };
    });
    const [model] = fitWidthModels(solves);
    expect(model.depthBB).toBe(40);
    expect(model.slope).toBeCloseTo(0.6, 3);
    expect(model.smear).toBeCloseTo(1, 3);
    expect(model.minWidth).toBe(100);
    expect(model.maxWidth).toBe(1075);
  });

  it("hloubku s málo deskami nebo jedinou šířkou nemodeluje - sklon by byl šum", () => {
    const few = Array.from({ length: 10 }, (_, at) => (
      { family: "MTT9_50BB_X_SRP", board: `b${at}`, depthBB: 50, level: 0, width: 100 + at, minutes: 20 }
    ));
    const flat = Array.from({ length: 40 }, (_, at) => (
      { family: "MTT9_25BB_X_SRP", board: `b${at}`, depthBB: 25, level: 0, width: 300, minutes: 5 + at % 3 }
    ));
    expect(fitWidthModels([...few, ...flat])).toEqual([]);
  });
});

describe("costForFamily", () => {
  const table: BoardCostTable = {
    measuredAt: "",
    source: "",
    solves: 0,
    depths: depthCostsFrom(parseBoardSolves(FRESH)),
    families: familyCostsFrom([
      ...[30, 40, 50].map((minutes) => ({ family: "MTT9_40BB_CO_BB_SRP", board: "x", depthBB: 40, level: 0, minutes })),
      ...[10, 12].map((minutes) => ({ family: "MTT9_40BB_UTG_LJ_SRP", board: "x", depthBB: 40, level: 0, minutes })),
    ]),
    widthModels: [{
      depthBB: 40, boards: 100, intercept: Math.log(2), slope: 0.6, smear: 1.1, r2: 0.3, minWidth: 150, maxWidth: 1300,
    }],
  };

  it("rodina se změřenými deskami má vlastní cenu: plán z mediánu, slib z průměru", () => {
    expect(costForFamily(table, "MTT9_40BB_CO_BB_SRP", 1096)).toEqual({
      planMinutes: 40, promiseMinutes: 40, basis: "rodina",
    });
  });

  it("rodina s méně než třemi deskami a rodina bez měření jdou podle šířky range", () => {
    const estimate = costForFamily(table, "MTT9_40BB_UTG_LJ_SRP", 500);
    expect(estimate?.basis).toBe("šířka range");
    expect(estimate?.planMinutes).toBeCloseTo(2 * 500 ** 0.6, 0);
    expect(estimate?.promiseMinutes).toBeCloseTo(2 * 500 ** 0.6 * 1.1, 0);
    expect(costForFamily(table, "MTT9_40BB_HJ_SB_SRP", 400)?.basis).toBe("šířka range");
  });

  it("šířka mimo změřený rozsah se hlásí jako extrapolace", () => {
    expect(costForFamily(table, "MTT9_40BB_SB_BB_SRP", 2000)?.basis).toBe("šířka range, mimo změřené");
  });

  it("bez šířky nebo bez modelu hloubky zbývá hloubka, a neznámá hloubka cenu nemá", () => {
    expect(costForFamily(table, "MTT9_40BB_HJ_SB_SRP")?.basis).toBe("hloubka");
    expect(costForFamily(table, "MTT9_40BB_HJ_SB_SRP")?.planMinutes).toBe(22.1);
    expect(costForFamily(table, "MTT9_100BB_BTN_BB_SRP", 500)).toBeUndefined();
  });
});
