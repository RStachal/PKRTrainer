// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderMatrix } from "../../src/ui/rangeMatrixView";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import type { Spot } from "../../src/core/types";

// The grid shows what to do with every possible holding; that is a picture of the
// deck, not of a range. The owner asked for the range itself and its split by
// action, which is what the composition bar is. These tests pin the two things
// that make it that rather than a second copy of the grid: folds are excluded,
// and the segments are proportional to combinations of what is actually played.

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack to render");
  return createRangeStoreFromRangePack(pack);
}

function render(
  heroPos = "BTN",
  effStack = 40,
  context = "RFI",
): HTMLElement {
  const spot = { heroPos, hand: "A5s", effStack, context, ante: "OFF" } as unknown as Spot;
  const root = document.createElement("div");
  renderMatrix(spot, store(), root);
  return root;
}

describe("range composition bar", () => {
  it("splits the hero's range by action, not the deck", () => {
    const strip = render().querySelector<HTMLElement>(".range-composition");
    expect(strip).not.toBeNull();

    const parts = [...strip!.querySelectorAll<HTMLElement>(".range-composition__part")];
    expect(parts.length).toBeGreaterThan(0);
    // A fold slice would make this the deck again.
    expect(parts.some((part) => part.dataset.action === "FOLD")).toBe(false);

    const combos = parts.reduce((sum, part) => sum + Number(part.dataset.combos), 0);
    expect(combos).toBe(Number(strip!.dataset.rangeCombos));
  });

  it("sizes each segment by combinations so the split is readable", () => {
    const strip = render().querySelector<HTMLElement>(".range-composition")!;
    for (const part of strip.querySelectorAll<HTMLElement>(".range-composition__part")) {
      // jsdom writes the basis back as "0px"; the grow factor is the assertion.
      expect(part.style.flex).toMatch(new RegExp(`^${part.dataset.combos} 0 0`));
    }
    expect(strip.getAttribute("aria-label")).toMatch(/Rozdělení range: /);
  });

  it("shows more than one slice where the spot offers more than one action", () => {
    // Facing an open at 25BB the lojack calls, three-bets and jams, so the bar has
    // something to divide. A push-or-fold spot would pass every other assertion
    // here with one full-width segment and prove nothing.
    const strip = render("LJ", 25, "VS_OPEN").querySelector<HTMLElement>(".range-composition");
    const actions = [...(strip?.querySelectorAll<HTMLElement>(".range-composition__part") ?? [])]
      .map((part) => part.dataset.action);
    expect(new Set(actions).size).toBeGreaterThanOrEqual(3);
  });

  it("states the range width beside the bar", () => {
    const value = render().querySelector<HTMLElement>(".range-width-value");
    expect(value?.textContent).toMatch(/^Vaše range: \d+,\d %$/);
  });
});
