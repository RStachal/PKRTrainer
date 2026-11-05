// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { CS } from "../../src/ui/cs";
import { renderFilters } from "../../src/ui/filters";

// Nine positions, thirteen depths and five contexts are 27 checkboxes standing
// between opening the app and playing a hand. The owner asked for them folded up
// by type. What has to survive that is the reading of filter state: the inputs
// keep their classes and stay in the DOM whether a group is open or shut, so
// nothing downstream needs to know the groups collapse at all.
//
// Summary wording is asserted through the catalog rather than as literals: the
// suite runs in English and the app ships in Czech, so hard-coded strings would
// pin the language instead of the behaviour.

function render(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  renderFilters(root, { onStart: () => undefined });
  return root;
}

function group(root: HTMLElement, index: number): HTMLElement {
  const groups = root.querySelectorAll<HTMLElement>(".filter-disclosure");
  const found = groups[index];
  if (found === undefined) throw new Error(`no filter group at ${index}`);
  return found;
}

describe("collapsible filter groups", () => {
  it("folds each type into its own group, closed to start with", () => {
    const root = render();
    const groups = root.querySelectorAll<HTMLElement>(".filter-disclosure");
    expect(groups.length).toBe(3);
    for (const item of groups) {
      expect(item.dataset.open).toBe("false");
      expect(item.querySelector<HTMLElement>(".filter-group")?.hidden).toBe(true);
    }
  });

  it("keeps every checkbox readable while the group is shut", () => {
    const root = render();
    // The counts the read path depends on, taken with all three groups closed.
    expect(root.querySelectorAll(".filter-position").length).toBe(9);
    expect(root.querySelectorAll(".filter-bucket").length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".filter-context").length).toBeGreaterThan(0);
  });

  it("opens and closes on the header", () => {
    const root = render();
    const positions = group(root, 0);
    const toggle = positions.querySelector<HTMLButtonElement>(".filter-disclosure__toggle")!;

    toggle.click();
    expect(positions.dataset.open).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(positions.querySelector<HTMLElement>(".filter-group")?.hidden).toBe(false);

    toggle.click();
    expect(positions.dataset.open).toBe("false");
  });

  it("starts in GTO, with the opponent offered only in REAL", () => {
    const root = render();
    const mode = root.querySelector<HTMLSelectElement>(".filter-mode")!;
    const select = root.querySelector<HTMLSelectElement>(".filter-opponent")!;
    const opponentItem = root.querySelector<HTMLElement>(".filter-opponent-item")!;
    // GTO is the default and the honest one: the shipped ranges are a baseline
    // against nobody in particular (Agents/plan-gto-real-2026-11.md, 3.1).
    expect(mode.value).toBe("GTO");
    expect(opponentItem.hidden).toBe(true);
    // Live table plus the five player types the owner named.
    expect([...select.options].map((option) => option.value)).toEqual(["", "SHARK", "EAGLE", "ROCK", "DICE", "WHALE"]);

    mode.value = "REAL";
    mode.dispatchEvent(new Event("change"));
    expect(opponentItem.hidden).toBe(false);
  });

  it("turns the picked player type into filters and into the style the shove EV reads", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const view = renderFilters(root, { onStart: () => undefined });
    expect(view.getFilters().trainingMode).toBeUndefined();
    expect(view.getFilters().opponentStyle).toBeUndefined();

    const mode = root.querySelector<HTMLSelectElement>(".filter-mode")!;
    const select = root.querySelector<HTMLSelectElement>(".filter-opponent")!;
    mode.value = "REAL";
    expect(view.getFilters()).toMatchObject({ trainingMode: "REAL" });
    expect(view.getFilters().villainFocus).toBeUndefined();
    // Live table: no single opponent, so the shove is priced as before.
    expect(view.getFilters().opponentStyle).toBeUndefined();

    select.value = "WHALE";
    expect(view.getFilters()).toMatchObject({ trainingMode: "REAL", villainFocus: "WHALE", opponentStyle: "LOOSE_PASSIVE" });

    // A type picked while in GTO does not leak: GTO prices against equilibrium.
    mode.value = "GTO";
    expect(view.getFilters().villainFocus).toBeUndefined();
    expect(view.getFilters().opponentStyle).toBeUndefined();

    view.setFilters({ ...view.getFilters(), trainingMode: "REAL", villainFocus: "ROCK" });
    expect(mode.value).toBe("REAL");
    expect(select.value).toBe("ROCK");
    expect(root.querySelector<HTMLElement>(".filter-opponent-item")!.hidden).toBe(false);
  });

  it("names the picks on the header rather than counting them", () => {
    const root = render();
    const positions = group(root, 0);
    const summary = positions.querySelector<HTMLElement>(".filter-disclosure__summary")!;
    const inputs = [...positions.querySelectorAll<HTMLInputElement>(".filter-position")];

    positions.querySelector<HTMLButtonElement>(".filter-bulk-none")!.click();
    expect(summary.textContent).toBe(CS.filters.noneSelected);

    positions.querySelector<HTMLButtonElement>(".filter-bulk-all")!.click();
    expect(summary.textContent).toBe(CS.filters.allSelected(9));

    // Two picks are worth naming; a player reading "LJ, HJ" knows what they are
    // drilling, where "2 z 9" makes them open the group to find out.
    for (const input of inputs) input.checked = false;
    inputs[0].checked = true;
    inputs[1].checked = true;
    inputs[1].dispatchEvent(new Event("change"));
    expect(summary.textContent).toBe(`${inputs[0].dataset.position}, ${inputs[1].dataset.position}`);

    // Past four the list stops being readable and the count is the better answer.
    for (const input of inputs.slice(0, 6)) input.checked = true;
    inputs[5].dispatchEvent(new Event("change"));
    expect(summary.textContent).toBe(CS.filters.someSelected(6, 9));
  });
});
