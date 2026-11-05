// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { flatCallerCandidates, generateSpot, scenarioCandidates } from "../../src/core/drillEngine";
import { mulberry32 } from "../../src/core/rng";
import type { Spot } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import type { RangePack } from "../../src/data/ranges/rangePack";
import { renderTable } from "../../src/ui/tableRenderer";
import { makeFilters } from "../properties/drillSupport";

/**
 * Osa dorovnávajícího v drillu (rozhodnutí vlastníka 4a, 1. 10. 2026).
 *
 * Táž zásada jako u otvírače a scénáře: **losuje se jen mezi tím, o čem
 * knihovna něco tvrdí.** Losovat libovolnou sedačku před hrdinou by znamenalo,
 * že otázka řekne „CO dorovnal" a odpověď se vezme z range proti MP - hráč by
 * odpovídal na jinou otázku než range (bod 234, jen o osu dál).
 *
 * Že na dorovnávajícím záleží, je změřené na mřížkách zdroje: BTN na 100 bb
 * squeezuje 67 kombinací proti flatu z EP, 84 proti MP a 102 proti CO.
 *
 * Vlastník k tomu v T4 přidal, že drill rozdanou sedačku musí **ukázat** - proto
 * je tu i test na obrázek stolu.
 */

const generic = { AA: ["SQUEEZE"], KQs: ["FOLD"] } as RangePack["records"][number]["lenient"];
const vsCo = { AA: ["SQUEEZE"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];
const viaBtn = { AA: ["SQUEEZE"], KQs: ["SQUEEZE"] } as RangePack["records"][number]["lenient"];
const viaHjBtn = { AA: ["JAM"], KQs: ["FOLD"] } as RangePack["records"][number]["lenient"];

function pack(records: RangePack["records"]): RangePack {
  return {
    id: "flat-caller-axis",
    version: "2026-10-08",
    createdAt: "2026-10-08",
    verifiedAt: "2026-10-08",
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
      evModel: "CHIP_EV", ante: "ON", rakeMode: "NONE",
    },
    assumptions: ["test"],
    searchQueries: ["test 1", "test 2", "test 3"],
    sourceEvidence: [
      { title: "t1", url: "https://example.invalid/1", provider: "t", verifiedAt: "2026-10-08", licenseNote: "t" },
      { title: "t2", url: "https://example.invalid/2", provider: "t", verifiedAt: "2026-10-08", licenseNote: "t" },
    ],
    records,
  } as unknown as RangePack;
}

/** Hrdina na BB, otvírač CO: mezi nimi leží BTN, takže dorovnat může on. */
const plainRecords = [
  { position: "BB", bucket: 20, context: "SQUEEZE", lenient: generic, strict: generic },
  { position: "BB", bucket: 20, context: "SQUEEZE", vsSeat: "CO", lenient: vsCo, strict: vsCo },
] as RangePack["records"];

const withFlat = [
  ...plainRecords,
  { position: "BB", bucket: 20, context: "SQUEEZE", vsSeat: "CO", flatCallers: ["BTN"], lenient: viaBtn, strict: viaBtn },
] as RangePack["records"];

/** Hrdina na BB, otvírač LJ: dvojice dorovnávajících, jaká je v korpusu dvanáctkrát. */
const withPair = [
  { position: "BB", bucket: 20, context: "SQUEEZE", lenient: generic, strict: generic },
  { position: "BB", bucket: 20, context: "SQUEEZE", vsSeat: "LJ", lenient: vsCo, strict: vsCo },
  { position: "BB", bucket: 20, context: "SQUEEZE", vsSeat: "LJ", flatCallers: ["HJ", "BTN"], lenient: viaHjBtn, strict: viaHjBtn },
] as RangePack["records"];

const plain = createRangeStoreFromRangePack(pack(plainRecords));
const flat = createRangeStoreFromRangePack(pack(withFlat));
const pair = createRangeStoreFromRangePack(pack(withPair));
const filters = makeFilters({ positions: ["BB"], buckets: [20], ante: "ON" });

function spots(store: typeof plain, count: number, seed = 11): Spot[] {
  const rng = mulberry32(seed);
  const out: Spot[] = [];
  for (let i = 0; i < count; i += 1) {
    const spot = generateSpot(rng, "SQUEEZE", filters, store);
    if (spot !== null) out.push(spot);
  }
  return out;
}

describe("kandidáti na dorovnávajícího", () => {
  it("jen kombinace se záznamem pro tu sedačku; pack bez osy nedá nic", () => {
    expect(flatCallerCandidates("SQUEEZE", "BB", 20, "ON", flat, "CO")).toEqual([["BTN"]]);
    // Jiný otvírač tu kombinaci nemá.
    expect(flatCallerCandidates("SQUEEZE", "BB", 20, "ON", flat, "LJ")).toEqual([]);
    // Pack bez té osy nedá kandidáta, takže se `rng()` nezavolá.
    expect(flatCallerCandidates("SQUEEZE", "BB", 20, "ON", plain, "CO")).toEqual([]);
  });

  it("dvojice dorovnávajících je jeden kandidát, ne dva", () => {
    // Dvanáct ze čtyřiceti čtyř záznamů korpusu má dorovnávající dva, takže
    // zkoušení po jedné sedačce by je minulo - proto katalog kombinací.
    expect(flatCallerCandidates("SQUEEZE", "BB", 20, "ON", pair, "LJ")).toEqual([["HJ", "BTN"]]);
  });

  it("osa nemění, kdo je kandidát na scénář", () => {
    expect(scenarioCandidates("SQUEEZE", "BB", 20, "ON", flat, "CO"))
      .toEqual(scenarioCandidates("SQUEEZE", "BB", 20, "ON", plain, "CO"));
  });
});

describe("spot s dorovnávajícím", () => {
  it("nese osu, kde záznam je; ID, stůl i odpověď to přiznají", () => {
    const seen = new Set<string | undefined>();
    for (const spot of spots(flat, 60)) {
      const named = spot.tableState.flatCallers?.join("+");
      seen.add(named);
      if (named === undefined) {
        expect(spot.id).not.toContain("|@");
        continue;
      }
      expect(named).toBe("BTN");
      expect(spot.tableState.vsSeat).toBe("CO");
      expect(spot.id).toBe(`SQUEEZE|BB|20|${spot.hand}|vsCO|@BTN|ON`);
      // Zpřesněná odpověď je jiná odpověď: proti BTN se KQs squeezuje, bez osy
      // dorovnává. Kdyby se tyhle dvě slily, hráč by se učil jednu za druhou.
      if (spot.hand === "KQs") expect(spot.strictCorrect).toEqual(["SQUEEZE"]);
    }
    expect(seen.has("BTN"), "osa se někdy rozdá").toBe(true);
  });

  it("počet dorovnávajících sedí na jejich jména", () => {
    /*
     * `pickCallsBefore` losuje 1 az 7 callerů a o jménech neví nic. Bez téhle
     * vazby by stůl u záznamu `@HJ+BTN` nakreslil třeba pět callerů k range,
     * která platí pro dva - a hráč by odpovídal na jinou situaci, než jakou vidí.
     */
    for (const spot of spots(pair, 40)) {
      const named = spot.tableState.flatCallers;
      if (named === undefined) continue;
      expect(spot.tableState.callsBefore).toBe(named.length);
      expect(named).toEqual(["HJ", "BTN"]);
    }
  });

  it("pack bez té osy dává tutéž seedovanou sekvenci jako dřív", () => {
    /*
     * Tohle je ta vlastnost, na které stojí zpětná kompatibilita: když osa není,
     * `rng()` se o ni nezavolá a seedovaná sekvence zůstane bajt po bajtu táž.
     * Jinak by se rozsypaly property testy i uložená historie hráče.
     */
    const bez = spots(plain, 25).map((spot) => spot.id);
    const unrelated = createRangeStoreFromRangePack(pack([
      ...plainRecords,
      // Osa je v packu, ale pro **jinou** buňku, takže pro tuhle není kandidát.
      { position: "SB", bucket: 20, context: "SQUEEZE", vsSeat: "CO", flatCallers: ["BTN"], lenient: viaBtn, strict: viaBtn },
    ] as RangePack["records"]));
    expect(spots(unrelated, 25).map((spot) => spot.id)).toEqual(bez);
  });
});

describe("stůl ukazuje, kdo dorovnal", () => {
  it("call se kreslí na jmenovanou sedačku, ne za otvírače", () => {
    /*
     * Vlastníkovo T4: „drill rozdá konkrétní sedačku mezi otvíračem a hrdinou
     * **a ukáže ji**". Renderer dorovnání dosud rozmisťoval mechanicky - sedačky
     * těsně za otvíračem - takže u záznamu `vsLJ @HJ+BTN` by nakreslil call na
     * HJ a CO. CO by přitom podle zdroje složilo a BTN dorovnalo, tedy obrázek
     * by popíral range, kterou spot učí.
     */
    const spot = spots(pair, 40).find((row) => row.tableState.flatCallers !== undefined);
    expect(spot, "aspoň jeden spot s osou").toBeDefined();
    if (spot === undefined) return;
    const root = document.createElement("div");
    renderTable(spot, "ON", root);
    const actionOf = (position: string): string | undefined => root
      .querySelector<HTMLElement>(`.seat[data-position="${position}"] .action-badge`)
      ?.dataset.action;
    const stateOf = (position: string): string | undefined => root
      .querySelector<HTMLElement>(`.seat[data-position="${position}"] .seat__status`)
      ?.dataset.state;
    // Otvírač nese akční klíč s velikostí (`OPEN_25X`), ne `OPEN` - odznak jmenuje
    // konkrétní sázku, protože bez velikosti by to nebyla odpověď.
    expect(actionOf("LJ"), "otvírač").toMatch(/^OPEN/);
    expect(actionOf("HJ"), "jmenovaný dorovnávající").toBe("CALL");
    expect(actionOf("BTN"), "druhý jmenovaný dorovnávající").toBe("CALL");
    // CO leží mezi nimi a nedorovnalo: musí být složené, ne označené callem.
    expect(actionOf("CO"), "CO podle zdroje složilo").toBeUndefined();
    expect(stateOf("CO")).toBe("folded");
  });

  it("bez osy se dorovnání kreslí jako dřív", () => {
    // Spot bez jmenovaných dorovnávajících se nesmí hnout: callery rozmístí
    // podle počtu, tedy těsně za otvírače.
    const spot = spots(plain, 30).find((row) => row.tableState.callsBefore > 0
      && row.tableState.vsSeat !== undefined && row.tableState.flatCallers === undefined);
    expect(spot).toBeDefined();
    if (spot === undefined) return;
    const root = document.createElement("div");
    renderTable(spot, "ON", root);
    const calls = root.querySelectorAll('.action-badge[data-action="CALL"]').length;
    expect(calls, "dorovnání se pořád kreslí").toBeGreaterThan(0);
  });
});
