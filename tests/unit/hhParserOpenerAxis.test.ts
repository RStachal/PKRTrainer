import { describe, expect, it } from "vitest";

import { parseHandHistory } from "../../src/core/hhParser";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import type { RangePack } from "../../src/data/ranges/rangePack";

/**
 * Osa otvírače, krok (c): spot z historie nese skutečnou sedačku protihráče.
 *
 * Drill otvírače losuje jen mezi sedačkami, o kterých knihovna něco tvrdí;
 * historie ho zná. Obrázek, text i klíč do knihovny proto říkají, kdo
 * doopravdy otevřel - a odpověď se zpřesní jen tehdy, když pro tu sedačku
 * knihovna zpřesněný záznam má. Bez něj spadne na obecnou a Question_ID
 * zůstane jako dřív.
 */

// Button na sedadle 8: sedadlo 9 je SB, 1 je BB (hrdina), 7 je CO.
function handHistory(lines: string[]): string {
  return [
    "PokerStars Hand #7: Tournament #1, 10/20",
    "Table 'Test' 9-max Seat #8 is the button",
    "Seat 1: Hero (1000 in chips)",
    "Seat 2: Villain2 (1000 in chips)",
    "Seat 3: Villain3 (1000 in chips)",
    "Seat 4: Villain4 (1000 in chips)",
    "Seat 5: Villain5 (1000 in chips)",
    "Seat 6: Villain6 (1000 in chips)",
    "Seat 7: Villain7 (1000 in chips)",
    "Seat 8: Villain8 (1000 in chips)",
    "Seat 9: Villain9 (1000 in chips)",
    "Villain9: posts small blind 10",
    "Hero: posts big blind 20",
    "*** HOLE CARDS ***",
    "Dealt to Hero [Ks Qs]",
    ...lines,
    "*** SUMMARY ***",
  ].join("\n");
}

const coOpens = handHistory([
  "Villain2: folds", "Villain3: folds", "Villain4: folds", "Villain5: folds", "Villain6: folds",
  "Villain7: raises 40 to 60", "Villain8: folds", "Villain9: folds", "Hero: calls 40",
]);

const sbOpens = handHistory([
  "Villain2: folds", "Villain3: folds", "Villain4: folds", "Villain5: folds", "Villain6: folds",
  "Villain7: folds", "Villain8: folds", "Villain9: raises 40 to 60", "Hero: calls 40",
]);

const generic = { AA: ["3BET"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];
const vsCo = { AA: ["3BET"], KQs: ["3BET"] } as RangePack["records"][number]["lenient"];

function pack(records: RangePack["records"]): RangePack {
  return {
    id: "hh-opener-axis-test",
    version: "2026-09-16",
    createdAt: "2026-09-16",
    verifiedAt: "2026-09-16",
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
      evModel: "CHIP_EV", ante: "OFF", rakeMode: "NONE",
    },
    assumptions: ["test"],
    searchQueries: ["test 1", "test 2", "test 3"],
    sourceEvidence: [
      { title: "test 1", url: "https://example.invalid/1", provider: "test", verifiedAt: "2026-09-16", licenseNote: "test" },
      { title: "test 2", url: "https://example.invalid/2", provider: "test", verifiedAt: "2026-09-16", licenseNote: "test" },
    ],
    records,
  } as unknown as RangePack;
}

const generalOnly = createRangeStoreFromRangePack(pack([
  { position: "BB", bucket: 50, context: "VS_OPEN", lenient: generic, strict: generic },
  { position: "BB", bucket: 50, context: "BVB", lenient: generic, strict: generic },
] as RangePack["records"]));

const withRefined = createRangeStoreFromRangePack(pack([
  { position: "BB", bucket: 50, context: "VS_OPEN", lenient: generic, strict: generic },
  { position: "BB", bucket: 50, context: "VS_OPEN", vsSeat: "CO", lenient: vsCo, strict: vsCo },
] as RangePack["records"]));

describe("spot z historie jmenuje otvírače", () => {
  it("nese skutečnou sedačku a bez zpřesněného záznamu padá na obecnou odpověď s ID jako dřív", () => {
    const result = parseHandHistory(coOpens, { rangeStore: generalOnly, requireLoadedStrategy: true });
    expect(result.spot, result.errors.join("; ")).toBeDefined();
    const spot = result.spot!;
    expect(spot.context).toBe("VS_OPEN");
    expect(spot.tableState.vsSeat).toBe("CO");
    expect(spot.strictCorrect).toEqual(["CALL"]);
    expect(spot.id).toBe("VS_OPEN|BB|50|KQs|OFF");
    expect(spot.explanation).toContain("Proti openu z CO");
  });

  it("se zpřesněným záznamem odpoví zpřesněně a ID nese sedačku", () => {
    const result = parseHandHistory(coOpens, { rangeStore: withRefined, requireLoadedStrategy: true });
    const spot = result.spot!;
    expect(spot.tableState.vsSeat).toBe("CO");
    expect(spot.strictCorrect).toEqual(["3BET"]);
    expect(spot.id).toBe("VS_OPEN|BB|50|KQs|vsCO|OFF");
  });

  it("otevření SB proti BB nese sedačku SB, i když drill ji nelosuje", () => {
    // Parser bere BvB jen bez raise; SB raise je tu `VS_OPEN`. Historie říká
    // pravdu, kam BB proti SB patří, rozhoduje vlastník (bod 253).
    const result = parseHandHistory(sbOpens, { rangeStore: generalOnly, requireLoadedStrategy: true });
    const spot = result.spot!;
    expect(spot.context).toBe("VS_OPEN");
    expect(spot.tableState.vsSeat).toBe("SB");
    expect(spot.id).toBe("VS_OPEN|BB|50|KQs|OFF");
  });
});
