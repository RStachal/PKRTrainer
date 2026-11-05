// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { generateSpot, opponentSeatCandidates, scenarioCandidates } from "../../src/core/drillEngine";
import { mulberry32 } from "../../src/core/rng";
import type { Spot } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import type { RangePack } from "../../src/data/ranges/rangePack";
import { renderTable } from "../../src/ui/tableRenderer";
import { makeFilters } from "../properties/drillSupport";

/**
 * Osa scénáře, krok (b): spot nese rozložení stacků, pod kterým range platí
 * (rozhodnutí vlastníka 22. 9. 2026: 3a scénář v klíči, 4a jako vrstva, 5b
 * bez ceny).
 *
 * Táž zásada jako u otvírače: **losuje se jen mezi scénáři, pro které má
 * knihovna v té buňce záznam.** Pack bez katalogu scénářů (všechny chipEV
 * packy) žádného kandidáta nedá, `rng()` se nevolá a seedované sekvence
 * zůstávají jako dřív. Pod scénářem se nic neoceňuje: chipEV model by dal
 * chipovou cenu na $EV otázku.
 */

const generic = { AA: ["3BET"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];
const vsBtn = { AA: ["3BET"], KQs: ["3BET"] } as RangePack["records"][number]["lenient"];
const shortBb = { AA: ["3BET"], KQs: ["FOLD"] } as RangePack["records"][number]["lenient"];
const bigBb = { AA: ["CALL"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];

const SHORT = "ICM_75-45-60-30-18-7";
const BIG = "ICM_20-45-60-35-18-75";
const catalog: RangePack["stackSetups"] = {
  [SHORT]: { label: "UTG 75 / HJ 45 / CO 60 / BTN 30 / SB 18 / BB 7 bb", stacksBB: { UTG: 75, HJ: 45, CO: 60, BTN: 30, SB: 18, BB: 7 } },
  [BIG]: { label: "UTG 20 / HJ 45 / CO 60 / BTN 35 / SB 18 / BB 75 bb", stacksBB: { UTG: 20, HJ: 45, CO: 60, BTN: 35, SB: 18, BB: 75 } },
};

function pack(records: RangePack["records"], stackSetups?: RangePack["stackSetups"]): RangePack {
  return {
    id: "scenario-axis-step-b",
    version: "2026-09-22",
    createdAt: "2026-09-22",
    verifiedAt: "2026-09-22",
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
      evModel: "CHIP_EV", ante: "ON", rakeMode: "NONE",
    },
    assumptions: ["test"],
    searchQueries: ["test 1", "test 2", "test 3"],
    sourceEvidence: [
      { title: "test 1", url: "https://example.invalid/1", provider: "test", verifiedAt: "2026-09-22", licenseNote: "test" },
      { title: "test 2", url: "https://example.invalid/2", provider: "test", verifiedAt: "2026-09-22", licenseNote: "test" },
    ],
    ...(stackSetups === undefined ? {} : { stackSetups }),
    records,
  } as unknown as RangePack;
}

const plainRecords = [
  { position: "SB", bucket: 20, context: "VS_OPEN", lenient: generic, strict: generic },
  { position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", lenient: vsBtn, strict: vsBtn },
] as RangePack["records"];
const scenarioRecords = [
  ...plainRecords,
  { position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: SHORT, lenient: shortBb, strict: shortBb },
  { position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: BIG, lenient: bigBb, strict: bigBb },
] as RangePack["records"];

const plain = createRangeStoreFromRangePack(pack(plainRecords));
const withScenarios = createRangeStoreFromRangePack(pack(scenarioRecords, catalog));
const filters = makeFilters({ positions: ["SB"], buckets: [20], ante: "ON" });

function spots(store: typeof plain, count: number, seed = 7): Spot[] {
  const rng = mulberry32(seed);
  const out: Spot[] = [];
  for (let i = 0; i < count; i += 1) {
    const spot = generateSpot(rng, "VS_OPEN", filters, store);
    if (spot !== null) out.push(spot);
  }
  return out;
}

describe("kandidáti na scénář", () => {
  it("jen scénáře se záznamem pro tu sedačku; pack bez katalogu nedá nic", () => {
    expect(scenarioCandidates("VS_OPEN", "SB", 20, "ON", withScenarios, "BTN")).toEqual([BIG, SHORT]);
    expect(scenarioCandidates("VS_OPEN", "SB", 20, "ON", withScenarios, "CO")).toEqual([]);
    expect(scenarioCandidates("VS_OPEN", "SB", 20, "ON", withScenarios)).toEqual([]);
    expect(scenarioCandidates("VS_OPEN", "SB", 20, "ON", plain, "BTN")).toEqual([]);
  });

  it("scénář nemění, kdo je kandidát na otvírače", () => {
    expect(opponentSeatCandidates("VS_OPEN", "SB", 20, "ON", withScenarios))
      .toEqual(opponentSeatCandidates("VS_OPEN", "SB", 20, "ON", plain));
  });
});

describe("spot se scénářem", () => {
  it("nese scénář jen tam, kde záznam je; ID, stůl a odpověď to přiznají; nic se neoceňuje", () => {
    const seen = new Set<string | undefined>();
    for (const spot of spots(withScenarios, 80)) {
      const setup = spot.tableState.stackSetupId;
      seen.add(setup);
      if (setup === undefined) {
        expect(spot.id).not.toContain("|#");
        expect(spot.seatStacks).toBeUndefined();
        continue;
      }
      expect(spot.tableState.vsSeat).toBe("BTN");
      expect([SHORT, BIG]).toContain(setup);
      expect(spot.id).toBe(`VS_OPEN|SB|20|${spot.hand}|vsBTN|#${setup}|ON`);
      expect(spot.seatStacks).toEqual(catalog[setup].stacksBB);
      expect(spot.actionEvs, "pod scénářem bez ceny (5b)").toBeUndefined();
      if (spot.hand === "KQs") expect(spot.strictCorrect).toEqual(setup === SHORT ? ["FOLD"] : ["CALL"]);
    }
    expect(seen.has(SHORT) && seen.has(BIG), "losuje se mezi oběma scénáři").toBe(true);
    expect(seen.has(undefined), "proti kalibrovanému otvírači scénář není").toBe(true);
  });

  it("pack bez scénářů dává tutéž seedovanou sekvenci jako pack, kde scénáře pro tu buňku nejsou", () => {
    // Katalog je, ale záznam pro SB proti BTN ne: kandidát není, rng se nevolá.
    const unrelated = createRangeStoreFromRangePack(pack([
      ...plainRecords,
      { position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: SHORT, lenient: shortBb, strict: shortBb },
    ] as RangePack["records"], catalog));
    const ids = (store: typeof plain): string[] => spots(store, 40, 11).map((spot) => `${spot.id}/${spot.tableState.vsSeat}`);
    expect(ids(unrelated)).toEqual(ids(plain));
    expect(ids(plain).some((id) => id.includes("|#"))).toBe(false);
  });
});

describe("obrázek stolu se scénářem", () => {
  it("každá aktivní sedačka ukazuje svůj stack a střed stolu jmenuje rozložení", () => {
    const spot = spots(withScenarios, 80).find((candidate) => candidate.tableState.stackSetupId === SHORT);
    expect(spot).toBeDefined();
    const root = document.createElement("div");
    renderTable(spot!, "ON", root);
    const stackOf = (position: string): string | undefined => root
      .querySelector<HTMLElement>(`.seat[data-position="${position}"] .seat__stack-value`)?.textContent ?? undefined;
    expect(stackOf("SB")).toBe("18 BB");
    expect(stackOf("BTN")).toBe("30 BB");
    expect(stackOf("BB")).toBe("7 BB");
    const line = root.querySelector<HTMLElement>(".poker-table__scenario")?.textContent ?? "";
    expect(line.startsWith("ICM: ")).toBe(true);
    expect(line).toContain("BTN 30");
    expect(line).toContain("BB 7");
  });

  it("bez scénáře se kreslí efektivní hloubka a žádná řádka scénáře", () => {
    const spot = spots(plain, 1)[0];
    const root = document.createElement("div");
    renderTable(spot, "ON", root);
    expect(root.querySelector(".poker-table__scenario")).toBeNull();
    expect(root.querySelector<HTMLElement>('.seat[data-position="SB"] .seat__stack-value')?.textContent).toBe("20 BB");
  });
});
