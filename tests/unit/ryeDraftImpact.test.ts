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
