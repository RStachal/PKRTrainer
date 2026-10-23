import { describe, expect, it } from "vitest";

import { draftLanding, seatCollisions, type DraftRecord } from "../../scripts/lib/ryeDraftImpact.mts";

/**
 * Srážky v jedné buňce: kdo přistane a kdo ne.
 *
 * Tyhle testy vznikly 1. 10. 2026 **po** chybě, kterou nic nehlídalo. Stránka ke
 * kontrole tvrdila u id 138, 139 i 140 „do téhle buňky míří víc mřížek, ale
 * tahle je jediná chipEV" - u všech tří naráz, přestože všechny tři chipEV jsou.
 * Příčina: `resolved` počítal **rozložení stacků**, ne mřížky, takže tři mřížky
 * rodiny MUL daly `setups = ["MUL"]` a podmínka je prohlásila za rozhodnuté.
 * `seatCollisions` do té doby neměl test vůbec.
 */

/** Nejmenší záznam, který `seatCollisions` potřebuje. */
function record(
  sourceFile: string,
  stackSetupId: string,
  strict: Record<string, string[]>,
): DraftRecord {
  return {
    position: "BTN",
    bucket: 20,
    context: "SQUEEZE",
    vsSeat: "UTG",
    stackSetupId,
    sourceStackBB: 20,
    strict,
    lenient: strict,
    notes: [],
    sourceFile,
  } as DraftRecord;
}

describe("srážky mřížek v jedné buňce", () => {
  it("tři chipEV mřížky téhož rozložení se nerozhodují odhadem", () => {
    // Přesně tvar id 138/139/140: všechny MUL, všechny chipEV, liší se v radě.
    const collisions = seatCollisions([
      record("MUL-20BB-BTN-vs-EP_CO.html", "MUL", { AA: ["JAM"], KK: ["JAM"], QQ: ["CALL"] }),
      record("MUL-20BB-BTN-vs-EP_MP.html", "MUL", { AA: ["JAM"], KK: ["CALL"], QQ: ["CALL"] }),
      record("MUL-20BB-BTN-vs-EP_EP.html", "MUL", { AA: ["JAM"], KK: ["JAM"], QQ: ["JAM"] }),
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].chipEvGrids).toBe(3);
    expect(collisions[0].resolved).toBe(false);
    expect(collisions[0].chipEvSetup).toBeUndefined();
  });

  it("žádná ze tří netvrdí, že přistane sama", () => {
    const records = [
      record("MUL-a.html", "MUL", { AA: ["JAM"], KK: ["JAM"] }),
      record("MUL-b.html", "MUL", { AA: ["JAM"], KK: ["CALL"] }),
      record("MUL-c.html", "MUL", { AA: ["CALL"], KK: ["JAM"] }),
    ];
    const collisions = seatCollisions(records);
    for (const row of records) expect(draftLanding(row, collisions)).toBe("SRÁŽKA");
  });

  it("jediná chipEV mřížka vedle scénářů ICM přistane", () => {
    const mul = record("MUL-20BB-BTN-vs-EP_CO.html", "MUL", { AA: ["JAM"], KK: ["JAM"] });
    const collisions = seatCollisions([
      mul,
      record("ICM3-btn20bb.html", "ICM_30-45-60-75-18-20", { AA: ["JAM"], KK: ["CALL"] }),
    ]);
    expect(collisions[0].chipEvGrids).toBe(1);
    expect(collisions[0].resolved).toBe(true);
    expect(draftLanding(mul, collisions)).toBe("PŘISTANE");
  });

  it("mřížky, které se na každé ruce shodnou, se za srážku nepočítají", () => {
    // Shoda není srážka: `MUL-20BB-CO-vs-EP_EP` a `-vs-EP_MP` jsou do posledního
    // políčka totožné (naměřeno 29. 9. 2026, 0 tříd rozdílu) a nemá smysl o nich
    // vlastníka obtěžovat.
    const collisions = seatCollisions([
      record("MUL-x.html", "MUL", { AA: ["JAM"], KK: ["JAM"] }),
      record("MUL-y.html", "MUL", { AA: ["JAM"], KK: ["JAM"] }),
    ]);
    expect(collisions).toHaveLength(0);
  });

  it("prázdná ruka v jedné mřížce není neshoda", () => {
    // Ruka mimo jednu range a v druhé je jiná otázka než dvě různá doporučení
    // pro tutéž ruku.
    const collisions = seatCollisions([
      record("MUL-x.html", "MUL", { AA: ["JAM"], KK: [] }),
      record("MUL-y.html", "MUL", { AA: ["JAM"], KK: ["JAM"] }),
    ]);
    expect(collisions).toHaveLength(0);
  });
});

describe("dorovnávající v klíči buňky", () => {
  /**
   * Rozhodnutí 4a z 1. 10. 2026.
   *
   * Změřeno před a po: srážek bylo **8 buněk a 76 tříd v rozporu**, z toho 7 byl
   * tenhle případ. Po zavedení dorovnávajícího do klíče zbývá **1 buňka a 8 tříd**,
   * a ta zbylá je jiná věc - dva scénáře ICM lišící se rozložením stacků, které
   * do chipEV packu nejdou vůbec.
   */
  const withFlat = (file: string, flatCallers: string[] | undefined, strict: Record<string, string[]>): DraftRecord => ({
    ...record(file, "MUL", strict),
    ...(flatCallers === undefined ? {} : { flatCallers }),
  });

  it("mřížky lišící se jen dorovnávajícím se už nesrazí", () => {
    // Měřeno na mřížkách z 1. 10.: BTN na 100 bb squeezuje 67 kombinací proti
    // flatu z EP, 84 proti MP a 102 proti CO. Jedna odpověď pro všechny tři by
    // učila squeezovat do nejtěsnějšího flatu o polovinu víc, než zdroj říká.
    const collisions = seatCollisions([
      withFlat("MUL-100BB-BTN-vs-EP_EP.html", ["EP"], { AA: ["SQUEEZE"], QQ: ["CALL"] }),
      withFlat("MUL-100BB-BTN-vs-EP_MP.html", ["MP"], { AA: ["SQUEEZE"], QQ: ["SQUEEZE"] }),
      withFlat("MUL-100BB-BTN-vs-EP_CO.html", ["CO"], { AA: ["SQUEEZE"], QQ: ["JAM"] }),
    ]);
    expect(collisions).toHaveLength(0);
  });

  it("dva dorovnávající jsou jiná buňka než jeden", () => {
    // Seznam, ne jedno pole: `SQU-40BBMais-BB-vs-CO-BU-SB` má dorovnávající dva
    // a vlastník na to v T4 výslovně upozornil. V korpusu je takových záznamů 14.
    const collisions = seatCollisions([
      withFlat("SQU-a.html", ["BU"], { AA: ["SQUEEZE"], QQ: ["CALL"] }),
      withFlat("SQU-b.html", ["BU", "SB"], { AA: ["SQUEEZE"], QQ: ["FOLD"] }),
    ]);
    expect(collisions).toHaveLength(0);
  });

  it("stejní dorovnávající se srazí dál - klíč nesmí srážku schovat", () => {
    // Opačný směr, a je důležitější: kdyby klíč rozlišoval něco, co se ve
    // skutečnosti neliší, srážka by zmizela z hlášení a mřížka by přistála
    // podle ničeho. Tohle je ta kontrola, že se 4a neopravilo zametením.
    const collisions = seatCollisions([
      withFlat("MUL-x.html", ["MP"], { AA: ["SQUEEZE"], QQ: ["CALL"] }),
      withFlat("MUL-y.html", ["MP"], { AA: ["SQUEEZE"], QQ: ["JAM"] }),
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].disagreeing).toBe(1);
    expect(collisions[0].cell).toContain("flatMP");
  });

  it("nikdo nedorovnal je jiná odpověď než nevíme, kdo dorovnal", () => {
    // `—` znamená „otevření nikdo nedorovnal", tedy odpověď. `?` znamená, že
    // jméno nabízí dvě rozestavení (`SQU-40BBMais-MP-vs-EP-EP-or-EP-MP`), takže
    // se neví, kterému by záznam odpovídal - a nesmí se srazit s jmenovaným.
    const collisions = seatCollisions([
      withFlat("F3B-heads-up.html", [], { AA: ["3BET"], QQ: ["CALL"] }),
      withFlat("SQU-or.html", undefined, { AA: ["3BET"], QQ: ["FOLD"] }),
    ]);
    expect(collisions).toHaveLength(0);
  });
});
