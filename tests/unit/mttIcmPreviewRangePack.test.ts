// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { generateSpot } from "../../src/core/drillEngine";
import { mulberry32 } from "../../src/core/rng";
import { SIX_MAX_POSITION_ORDER } from "../../src/core/trainingProfile";
import type { ActionContext, Filters, Position, Spot } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { mttIcmPreviewRangePack } from "../../src/data/ranges/mttIcmPreviewRangePack.generated";
import { allMttPreflopRangePacks, mttPreflopRangePackForProfile, startableMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { validateRangePack } from "../../src/data/ranges/rangePack";
import { renderPreviewMttPreflopRangePackModule } from "../../src/data/ranges/rangeModuleBuilder";
import { isPlayableMttPreflopPreview } from "../../src/data/ranges/trainingCapability";
import { renderTable } from "../../src/ui/tableRenderer";
import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";

/**
 * ICM preview vrstva: 31 schválených mřížek RYE v šestistolovém $EV profilu.
 *
 * Rozhodnutí vlastníka 22. 9. 2026 - 3a (scénář v klíči), 4a (vrstva/preview,
 * profil odpovídá jen tam, kde ví), 5b (bez ceny). Co se tu hlídá, je právě to,
 * co by se jinak tiše rozešlo: že se každý záznam k hráči dostane, že pod
 * scénářem nic neoceňujeme, a že preview zůstane preview.
 */

const pack = mttIcmPreviewRangePack;
const profile = {
  ...DEFAULT_TRAINING_PROFILE,
  tableFormat: "SIX_MAX",
  blindSpeed: "REGULAR",
  street: "PREFLOP",
  evModel: "DOLAR_EV",
  ante: "ON",
  rakeMode: "NONE",
} as typeof DEFAULT_TRAINING_PROFILE;

const filtersFor = (context: ActionContext): Filters => ({
  positions: [], buckets: [], contexts: [context], ante: "ON", scoringMode: "LENIENT",
});

function dealt(): Spot[] {
  const store = createRangeStoreFromRangePack(pack);
  const out: Spot[] = [];
  for (const context of ["VS_OPEN", "VS_3BET", "SQUEEZE"] as ActionContext[]) {
    const rng = mulberry32(2026);
    for (let i = 0; i < 4000; i += 1) {
      const spot = generateSpot(rng, context, filtersFor(context), store);
      if (spot !== null) out.push(spot);
    }
  }
  return out;
}

describe("pack ICM preview", () => {
  it("je platný, nese katalog scénářů a jen šestistolové sedačky", () => {
    expect(validateRangePack(pack)).toEqual([]);
    expect(pack.dimensions).toMatchObject({ tableFormat: "SIX_MAX", evModel: "DOLAR_EV", ante: "ON" });
    expect(pack.confidence).toBe("LOW");
    expect(Object.keys(pack.stackSetups ?? {}).length).toBeGreaterThanOrEqual(6);
    for (const record of pack.records) {
      expect(SIX_MAX_POSITION_ORDER).toContain(record.position);
      expect(SIX_MAX_POSITION_ORDER).toContain(record.vsSeat as Position);
      expect(record.stackSetupId, `${record.position}|${record.bucket}|${record.context}`).toBeDefined();
      expect(record.provenance ?? "").toContain("RYE Rangeviewer 2021");
    }
  });

  it("každý scénář v katalogu kreslí aspoň dvě sedačky a někdo se na něj odkazuje", () => {
    const referenced = new Set(pack.records.map((record) => record.stackSetupId));
    for (const [id, setup] of Object.entries(pack.stackSetups ?? {})) {
      expect(Object.keys(setup.stacksBB).length, id).toBeGreaterThanOrEqual(2);
      expect(setup.label.length, id).toBeGreaterThan(0);
      expect(referenced.has(id), `na ${id} se nikdo neodkazuje`).toBe(true);
    }
  });
});

describe("co z vrstvy dojde k hráči", () => {
  const spots = dealt();

  it("drill se zeptá na každý záznam packu - žádný mrtvý obsah", () => {
    const asked = new Set(spots.map((spot) => (
      `${spot.context}|${spot.heroPos}|${spot.effStack}|vs${spot.tableState.vsSeat}|#${spot.tableState.stackSetupId}`
    )));
    const missed = pack.records.filter((record) => !asked.has(
      `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat}|#${record.stackSetupId}`,
    ));
    expect(missed.map((record) => `${record.context}|${record.position}|${record.bucket}`)).toEqual([]);
    expect(spots.length).toBeGreaterThan(0);
  });

  it("každý spot nese scénář, stacky sedaček a žádnou cenu (5b)", () => {
    for (const spot of spots) {
      expect(spot.tableState.stackSetupId, spot.id).toBeDefined();
      expect(spot.seatStacks, spot.id).toBeDefined();
      expect(spot.actionEvs, `${spot.id} má cenu, ačkoli pod scénářem se neoceňuje`).toBeUndefined();
      expect(spot.id).toContain(`|#${spot.tableState.stackSetupId}|`);
    }
  });

  it("doporučení je vždy mezi nabídnutými akcemi", () => {
    for (const spot of spots) {
      const offered = new Set(spot.answers.map((answer) => answer.key));
      for (const action of spot.strictCorrect) {
        expect(offered.has(action), `${spot.id}: ${action} není na tlačítku`).toBe(true);
      }
    }
  });

  it("text říká rozložení stacků, i když se koš liší od stacku hrdiny", () => {
    const spot = spots.find((candidate) => (
      candidate.seatStacks?.[candidate.heroPos] !== undefined
      && candidate.seatStacks[candidate.heroPos] !== candidate.effStack
    ));
    expect(spot, "aspoň jedna buňka má koš jinde než stack hrdiny").toBeDefined();
    expect(spot!.explanation).toContain("Scénář (ICM):");
    expect(spot!.explanation).toContain(`nejbližší koš hrdinových ${spot!.seatStacks![spot!.heroPos]} BB`);
  });

  it("stůl kreslí stacky scénáře, ne jednotnou hloubku", () => {
    const spot = spots[0];
    const root = document.createElement("div");
    renderTable(spot, "ON", root);
    for (const [position, stackBB] of Object.entries(spot.seatStacks ?? {})) {
      const seat = root.querySelector<HTMLElement>(`.seat[data-position="${position}"]`);
      if (seat === null || seat.dataset.active !== "true") continue;
      expect(seat.querySelector(".seat__stack-value")?.textContent, position).toBe(`${stackBB} BB`);
    }
    expect(root.querySelector(".poker-table__scenario")?.textContent ?? "").toContain("ICM:");
  });
});

describe("preview zůstane preview", () => {
  it("profil SIX_MAX / $EV / ante ON dostane tenhle pack a smí ho hrát jako preview", () => {
    expect(mttPreflopRangePackForProfile(profile)?.id).toBe(pack.id);
    expect(isPlayableMttPreflopPreview(profile)).toBe(true);
    expect(startableMttPreflopRangePack(profile, { status: "PREVIEW", mttReadiness: null })?.id).toBe(pack.id);
  });

  it("produkční cestou neprojde: brána chce pack, který připravenost jmenuje", () => {
    expect(startableMttPreflopRangePack(profile, {
      status: "PRODUCTION",
      mttReadiness: { productionReady: true, packId: "mtt-six-max-regular-preflop-dolar-ev-ante-on-production-v1" },
    })).toBeUndefined();
  });

  it("registr packů ho má právě jednou a nepřebíjí žádný chipEV profil", () => {
    const matching = allMttPreflopRangePacks.filter((candidate) => candidate.id === pack.id);
    expect(matching.length).toBe(1);
    const collisions = allMttPreflopRangePacks.filter((candidate) => (
      candidate.id !== pack.id
      && JSON.stringify(candidate.dimensions) === JSON.stringify(pack.dimensions)
    ));
    expect(collisions.map((candidate) => candidate.id)).toEqual([]);
  });

  it("vykreslení preview modulu odmítne pack, který se nehlásí jako LOW", () => {
    const rendered = renderPreviewMttPreflopRangePackModule({
      ...pack,
      confidence: "HIGH",
      licenseKind: "OWNED_SOLVER_EXPORT",
      licenseNote: "test",
      searchQueries: ["a", "b", "c"],
      records: pack.records.map((record) => ({ ...record, sourceStackBB: record.bucket })),
    } as never);
    expect(rendered.moduleText).toBeNull();
    expect(rendered.errors.some((error) => error.includes("confidence LOW"))).toBe(true);
  });
});
