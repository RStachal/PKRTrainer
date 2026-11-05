// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionKey, HandLabel, Spot } from "../../src/core/types";
import type { RangeEntry, RangeKey, RangeStore } from "../../src/data/rangeStore";
import { setAppLanguage } from "../../src/ui/cs";
import { RANGE_MATRIX_COLORS } from "../../src/ui/rangeMatrixView";
import { openPreflopRange, preflopRangeContent } from "../../src/ui/trainer/preflopRange";

/**
 * Preflopová range v novém GUI (Agents/ui-redesign-plan.md, fáze 2). Pack
 * nese doporučené akce, ne frekvence, takže buňka má plnou barvu akce.
 */

const NBSP = " ";

function entry(actions: Partial<Record<HandLabel, ActionKey[]>>, extra: Partial<RangeEntry> = {}): RangeEntry {
  return {
    actions: actions as Record<HandLabel, ActionKey[]>,
    strict: actions as Record<HandLabel, ActionKey[]>,
    ...extra,
  };
}

function store(record: RangeEntry | undefined, loaded = true): RangeStore & { lookup: ReturnType<typeof vi.fn> } {
  return { isLoaded: () => loaded, lookup: vi.fn((_key: RangeKey) => record) };
}

function spot(tableState: Record<string, unknown> = {}): Spot {
  return {
    hand: "AKo",
    heroPos: "CO",
    effStack: 20,
    context: "RFI",
    ante: "ON",
    tableState: { heroPos: "CO", ...tableState },
  } as unknown as Spot;
}

const RFI = entry({
  AA: ["OPEN_25X"],
  KK: ["OPEN_25X"],
  AKs: ["OPEN_25X", "JAM"],
  AKo: ["OPEN_25X"],
  "72o": [],
});

afterEach(() => {
  document.body.innerHTML = "";
  setAppLanguage("CZ");
});

describe("preflopová range v novém GUI", () => {
  it("obarví ruce podle akce a fold také, bez prázdných buněk", () => {
    const root = preflopRangeContent(document, spot(), store(RFI));
    const at = (hand: string) => root.querySelector<HTMLElement>(`[data-hand="${hand}"]`)!;
    expect(root.querySelectorAll(".dx-matrix__cell")).toHaveLength(169);
    expect(at("AA").style.getPropertyValue("--action-accent")).toBe(RANGE_MATRIX_COLORS.OPEN);
    // Víc přijatelných akcí: barvu dá ta nejagresivnější, jako ve staré matici.
    expect(at("AKs").style.getPropertyValue("--action-accent")).toBe(RANGE_MATRIX_COLORS.JAM);
    expect(at("72o").style.getPropertyValue("--action-accent")).toBe(RANGE_MATRIX_COLORS.FOLD);
    expect(root.querySelectorAll("[data-empty]")).toHaveLength(0);
    expect(at("AKs").getAttribute("aria-label")).toBe("AKs: Raise 2.5x / All-in");
  });

  it("souhrn řekne, kolik rukou se hraje, a legenda zvýrazní akci", () => {
    const root = preflopRangeContent(document, spot(), store(RFI));
    // AA 6 + KK 6 + AKs 4 + AKo 12 = 28 kombinací z 1 326.
    expect(root.querySelector(".dx-range__summary .dx-trainer__note")?.textContent)
      .toBe(`Hraješ 2,1${NBSP}% rukou (28 z 1${NBSP}326 kombinací), zbytek je fold.`);
    const keys = [...root.querySelectorAll<HTMLButtonElement>(".dx-range__key")];
    expect(keys.map((key) => key.dataset.group)).toEqual(["OPEN", "JAM", "FOLD"]);
    expect(keys[0].querySelector(".dx-range__value")?.textContent).toBe(`86${NBSP}%`);
    expect(keys[2].querySelector(".dx-range__value")).toBeNull();

    keys[1].click();
    expect(keys[1].getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector<HTMLElement>('[data-hand="AKs"]')?.dataset.muted).toBeUndefined();
    expect(root.querySelector<HTMLElement>('[data-hand="AA"]')?.dataset.muted).toBe("true");
    keys[1].click();
    expect(root.querySelectorAll("[data-muted]")).toHaveLength(0);
  });

  it("detail ukáže ruku hráče hned, s doporučením a EV akcí", () => {
    const withEv = entry(
      { AKo: ["OPEN_25X"] },
      {
        actionEvs: {
          AKo: {
            source: "SOLVED_TREE",
            unit: "BB",
            values: [{ action: "FOLD", evBb: 0 }, { action: "OPEN_25X", evBb: 1.43 }],
            equivalentThresholdBb: 0.05,
            acceptableThresholdBb: 0.2,
          },
        },
      },
    );
    const root = preflopRangeContent(document, spot(), store(withEv));
    const detail = root.querySelector<HTMLElement>(".dx-range__detail")!;
    expect(detail.dataset.hand).toBe("AKo");
    expect(detail.querySelector(".dx-range__title")?.textContent).toBe("AKo · tvoje ruka");
    expect(detail.querySelector(".dx-range__line")?.textContent).toBe("Doporučeno: Raise 2.5x");
    const rows = [...detail.querySelectorAll<HTMLElement>(".dx-trainer__ev-row")];
    expect(rows.map((row) => row.dataset.action)).toEqual(["OPEN_25X", "FOLD"]);
    // Vyřešený strom nese desetiny.
    expect(rows[0].querySelector(".dx-trainer__ev-value")?.textContent).toBe("+1,4 BB");
    expect(rows[0].dataset.best).toBe("true");

    root.querySelector<HTMLElement>('[data-hand="AKs"]')!.click();
    expect(detail.dataset.hand).toBe("AKs");
    expect(detail.querySelector(".dx-range__line")?.textContent).toBe("Doporučeno: Fold");
  });

  it("víc přijatelných akcí: detail je rozliší", () => {
    const record = entry({}, {
      actions: { AKs: ["OPEN_25X", "JAM"] } as Record<HandLabel, ActionKey[]>,
      strict: { AKs: ["OPEN_25X"] } as Record<HandLabel, ActionKey[]>,
    });
    const root = preflopRangeContent(document, spot(), store(record));
    root.querySelector<HTMLElement>('[data-hand="AKs"]')!.click();
    const lines = [...root.querySelectorAll(".dx-range__detail .dx-range__line")].map((line) => line.textContent);
    expect(lines).toEqual(["Doporučeno: Raise 2.5x", "Také správně: All-in"]);
  });

  it("bere tentýž záznam, podle kterého se odpověď hodnotila, i se scénářem a dorovnávajícími", () => {
    const fake = store(RFI);
    preflopRangeContent(document, spot({ vsSeat: "UTG", stackSetupId: "icm-a", flatCallers: ["BU"] }), fake);
    expect(fake.lookup).toHaveBeenCalledWith({
      position: "CO",
      bucket: 20,
      context: "RFI",
      ante: "ON",
      vsSeat: "UTG",
      stackSetupId: "icm-a",
      flatCallers: ["BU"],
    });
  });

  it("řekne, když range proti sedačce není zpřesněná", () => {
    const root = preflopRangeContent(document, spot({ vsSeat: "UTG" }), store(RFI));
    const notes = [...root.querySelectorAll(".dx-range__side > .dx-trainer__note")].map((note) => note.textContent);
    expect(notes).toContain("Obecná range: zpřesněnou proti UTG tu nemáme.");
  });

  it("bez dat range nespadne a řekne to", () => {
    const root = preflopRangeContent(document, spot(), store(undefined));
    expect(root.getAttribute("role")).toBe("status");
    expect(root.textContent).toBe("Pro tenhle spot nejsou dostupná data range.");
    expect(preflopRangeContent(document, spot(), store(RFI, false)).getAttribute("role")).toBe("status");
  });

  it("dialog má titulek spotu a zavře se Escapem", () => {
    openPreflopRange(document, spot(), store(RFI));
    const dialog = document.querySelector<HTMLElement>(".range-modal");
    expect(dialog?.querySelector(".range-modal__title")?.textContent).toBe("RFI CO 20 BB");
    expect(dialog?.querySelectorAll(".dx-matrix__cell")).toHaveLength(169);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".range-modal")).toBeNull();
  });
});
