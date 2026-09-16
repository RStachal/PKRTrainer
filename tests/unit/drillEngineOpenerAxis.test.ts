// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  REJAM_EV_OPENER_BY_HERO, generateSpot, opponentSeatCandidates, positionsForContext,
} from "../../src/core/drillEngine";
import { mulberry32 } from "../../src/core/rng";
import type { Position, Spot, TableState } from "../../src/core/types";
import { createRangeStoreFromRangePack, rangeStore } from "../../src/data/rangeStore";
import type { RangePack } from "../../src/data/ranges/rangePack";
import { buildPreflopExplanation } from "../../src/core/preflopExplanation";
import { renderTable } from "../../src/ui/tableRenderer";
import { makeFilters } from "../properties/drillSupport";

/**
 * Osa otvírače, krok (b): spot jmenuje protihráče (bod 234, rozhodnuto 14. 9.
 * 2026).
 *
 * Do 15. 9. 2026 spot věděl jen, že hrdina čelí otevření. Obrázek dával
 * otvírače na sedačku těsně před hrdinou (u BB tedy na SB), EV počítala s
 * kalibrovaným otvíračem (`REJAM_EV_OPENER_BY_HERO`, u BB s HJ) a range platila
 * proti třetímu. Hráč odpovídal na jinou otázku, než jakou viděl.
 *
 * Pravidlo, které se tu hlídá: **losuje se jen mezi sedačkami, o kterých
 * knihovna něco tvrdí.** Zpřesněný záznam, nebo kalibrovaný otvírač obecného
 * záznamu. Losovat libovolnou sedačku by otázku odtrhlo od odpovědi znovu,
 * jen jinak.
 */

const generic = { AA: ["3BET"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];
const vsBtn = { AA: ["3BET"], KQs: ["3BET"] } as RangePack["records"][number]["lenient"];
const rfi = { AA: ["OPEN_25X"], KQs: ["OPEN_25X"] } as RangePack["records"][number]["lenient"];

function pack(records: RangePack["records"]): RangePack {
  return {
    id: "opener-axis-step-b",
    version: "2026-09-15",
    createdAt: "2026-09-15",
    verifiedAt: "2026-09-15",
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
      evModel: "CHIP_EV", ante: "OFF", rakeMode: "NONE",
    },
    assumptions: ["test"],
    searchQueries: ["test 1", "test 2", "test 3"],
    sourceEvidence: [
      { title: "test 1", url: "https://example.invalid/1", provider: "test", verifiedAt: "2026-09-15", licenseNote: "test" },
      { title: "test 2", url: "https://example.invalid/2", provider: "test", verifiedAt: "2026-09-15", licenseNote: "test" },
    ],
    records,
  } as unknown as RangePack;
}

const store = createRangeStoreFromRangePack(pack([
  { position: "BB", bucket: 20, context: "VS_OPEN", lenient: generic, strict: generic },
  { position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", lenient: vsBtn, strict: vsBtn },
  { position: "HJ", bucket: 20, context: "RFI", lenient: rfi, strict: rfi },
  { position: "UTG", bucket: 20, context: "VS_3BET", lenient: generic, strict: generic },
] as RangePack["records"]));

describe("kandidáti na protihráče", () => {
  it("obecný záznam přidá kalibrovaného otvírače, zpřesněný svou sedačku, nic jiného", () => {
    expect(opponentSeatCandidates("VS_OPEN", "BB", 20, "OFF", store)).toEqual(["HJ", "BTN"]);
  });

  it("čelení 3betu bez zpřesněného záznamu nikoho nejmenuje", () => {
    // EV se tam nepočítá, kalibrovaný protihráč není; jmenovat sedačku by
    // tvrdilo něco, co záznam neříká.
    expect(opponentSeatCandidates("VS_3BET", "UTG", 20, "OFF", store)).toEqual([]);
  });

  it("SB proti BB se losuje jen se zpřesněným záznamem - podle RYE je to VS_OPEN z SB", () => {
    // Rozhodnutí vlastníka 16. 9. 2026: držet RYE. Obecný záznam o SB nic
    // netvrdí (kalibrovaný otvírač BB je HJ), zpřesněný ano.
    const withSb = createRangeStoreFromRangePack(pack([
      { position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "SB", lenient: vsBtn, strict: vsBtn },
    ] as RangePack["records"]));
    expect(opponentSeatCandidates("VS_OPEN", "BB", 20, "OFF", withSb)).toEqual(["SB"]);
    expect(opponentSeatCandidates("VS_OPEN", "BB", 20, "OFF", store)).toEqual(["HJ", "BTN"]);
  });
});

describe("spot s protihráčem", () => {
  const filters = makeFilters({ positions: ["BB"], buckets: [20] });

  function spots(count: number): Spot[] {
    const rng = mulberry32(7);
    const out: Spot[] = [];
    for (let i = 0; i < count; i += 1) {
      const spot = generateSpot(rng, "VS_OPEN", filters, store);
      if (spot !== null) out.push(spot);
    }
    return out;
  }

  it("jmenuje jen kandidáta a ID zpřesní jen zpřesněná odpověď", () => {
    const seen = new Set<Position | undefined>();
    for (const spot of spots(60)) {
      seen.add(spot.tableState.vsSeat);
      expect(["HJ", "BTN"]).toContain(spot.tableState.vsSeat);
      if (spot.tableState.vsSeat === "BTN") {
        // Zpřesněná odpověď je jiná otázka - dostane jiné ID.
        expect(spot.id).toBe(`VS_OPEN|BB|20|${spot.hand}|vsBTN|OFF`);
        if (spot.hand === "KQs") expect(spot.strictCorrect).toEqual(["3BET"]);
      } else {
        // Obecná odpověď pod kalibrovaným otvíračem: ID bajt po bajtu jako dřív.
        expect(spot.id).toBe(`VS_OPEN|BB|20|${spot.hand}|OFF`);
        if (spot.hand === "KQs") expect(spot.strictCorrect).toEqual(["CALL"]);
      }
    }
    expect(seen.has("HJ") && seen.has("BTN"), "losuje se mezi oběma").toBe(true);
  });

  it("vysvětlení říká, kdo otevřel", () => {
    const spot = spots(1)[0];
    expect(spot.explanation).toContain(`Proti openu z ${spot.tableState.vsSeat}:`);
  });
});

describe("dnešní obsah: bez zpřesněných záznamů jmenuje spot kalibrovaného otvírače", () => {
  it("VS_OPEN i SQUEEZE nesou otvírače z REJAM_EV_OPENER_BY_HERO a ID beze změny", () => {
    if (!rangeStore.isLoaded()) return;
    for (const context of ["VS_OPEN", "SQUEEZE"] as const) {
      const rng = mulberry32(11);
      const filters = makeFilters({ contexts: [context] });
      for (let i = 0; i < 80; i += 1) {
        const spot = generateSpot(rng, context, filters, rangeStore);
        if (spot === null) continue;
        expect(spot.tableState.vsSeat).toBe(REJAM_EV_OPENER_BY_HERO[spot.heroPos]);
        expect(spot.id).not.toContain("|vs");
      }
    }
  });

  it("kalibrovaný otvírač sedí před každou sedačkou, na kterou se VS_OPEN ptá", () => {
    for (const hero of positionsForContext("VS_OPEN")) {
      const opener = REJAM_EV_OPENER_BY_HERO[hero];
      expect(opener, hero).toBeDefined();
    }
  });
});

describe("obrázek stolu s jmenovaným otvíračem", () => {
  const tableState: TableState = {
    heroPos: "BB", pushFold: false, effectiveStackBB: 20, limpsBefore: 0, callsBefore: 1,
    facing: "OPEN", isBvB: false, vsSeat: "HJ",
  };
  const spot: Spot = {
    id: "SQUEEZE|BB|20|AKo|OFF", context: "SQUEEZE", heroPos: "BB", effStack: 20, ante: "OFF",
    pushFold: false, hand: "AKo", heroCards: [{ rank: "A", suit: "s" }, { rank: "K", suit: "h" }],
    tableState, answers: [{ key: "FOLD", label: "Fold" }], correctKeys: ["FOLD"], strictCorrect: ["FOLD"],
    explanation: "test", startingPot: 1.5,
  };

  it("otevření je u jmenované sedačky, dorovnání za ní, ostatní před hrdinou složili", () => {
    const root = document.createElement("div");
    renderTable(spot, "OFF", root);
    const badge = (position: string): string | undefined => root
      .querySelector<HTMLElement>(`.seat[data-position="${position}"] .action-badge`)?.dataset.action;
    const active = (position: string): string | undefined => root
      .querySelector<HTMLElement>(`.seat[data-position="${position}"]`)?.dataset.active;
    expect(badge("HJ")).toBe("OPEN_25X");
    expect(badge("CO")).toBe("CALL");
    expect(badge("BTN")).toBeUndefined();
    expect(active("BTN")).toBe("false");
    expect(active("SB")).toBe("false");
    expect(active("UTG")).toBe("false");
    expect(active("HJ")).toBe("true");
    // Do 15. 9. 2026 by otevření sedělo na SB - těsně před hrdinou.
    expect(badge("SB")).toBeUndefined();
  });

  it("bez sedačky se kreslí jako dřív", () => {
    const root = document.createElement("div");
    const { vsSeat: _omit, ...legacy } = tableState;
    renderTable({ ...spot, tableState: legacy }, "OFF", root);
    expect(root.querySelector<HTMLElement>('.seat[data-position="BTN"] .action-badge')?.dataset.action)
      .toBe("OPEN_25X");
    expect(root.querySelector<HTMLElement>('.seat[data-position="SB"] .action-badge')?.dataset.action)
      .toBe("CALL");
  });

  it("vysvětlení bez sedačky zůstává beze změny", () => {
    const text = buildPreflopExplanation({
      context: "VS_OPEN", heroPos: "BB", effStack: 20, hand: "AKo", recommended: ["CALL"],
      tableState: { ...tableState, vsSeat: undefined },
    });
    expect(text.startsWith("Proti openu: BB, 20 BB, AKo.")).toBe(true);
  });
});
