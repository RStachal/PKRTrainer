// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CS } from "../../src/ui/cs";
import { renderFilters } from "../../src/ui/filters";
import { archetypeName } from "../../src/ui/villainText";

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
  // The start screen remembers the mode, and a test must not inherit the last one.
  beforeEach(() => localStorage.clear());

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
    const opponents = root.querySelector<HTMLElement>(".dx-opponents")!;
    // GTO is the default and the honest one: the shipped ranges are a baseline
    // against nobody in particular (Agents/plan-gto-real-2026-11.md, 3.1).
    expect(root.querySelector<HTMLInputElement>('.filter-mode[value="GTO"]')!.checked).toBe(true);
    expect(root.querySelector('.dx-mode[data-mode="GTO"]')?.getAttribute("data-selected")).toBe("true");
    expect(opponents.hidden).toBe(true);
    // Live table plus the five player types the owner named.
    expect([...root.querySelectorAll<HTMLInputElement>(".filter-opponent")].map((input) => input.value))
      .toEqual(["", "SHARK", "EAGLE", "ROCK", "DICE", "WHALE"]);

    root.querySelector<HTMLInputElement>('.filter-mode[value="REAL"]')!.click();
    expect(opponents.hidden).toBe(false);
    expect(root.querySelector('.dx-mode[data-mode="REAL"]')?.getAttribute("data-selected")).toBe("true");
    expect(root.querySelector('.dx-mode[data-mode="GTO"]')?.getAttribute("data-selected")).toBe("false");
  });

  it("turns the picked player type into filters and into the style the shove EV reads", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const view = renderFilters(root, { onStart: () => undefined });
    expect(view.getFilters().trainingMode).toBeUndefined();
    expect(view.getFilters().opponentStyle).toBeUndefined();

    const mode = (value: string) => root.querySelector<HTMLInputElement>(`.filter-mode[value="${value}"]`)!;
    const opponent = (value: string) => root.querySelector<HTMLInputElement>(`.filter-opponent[value="${value}"]`)!;
    mode("REAL").click();
    expect(view.getFilters()).toMatchObject({ trainingMode: "REAL" });
    expect(view.getFilters().villainFocus).toBeUndefined();
    // Live table: no single opponent, so the shove is priced as before.
    expect(view.getFilters().opponentStyle).toBeUndefined();

    opponent("WHALE").click();
    expect(view.getFilters()).toMatchObject({ trainingMode: "REAL", villainFocus: "WHALE", opponentStyle: "LOOSE_PASSIVE" });
    expect(root.querySelector(".dx-opponents__hint")?.textContent).toContain(archetypeName("WHALE"));

    // A type picked while in GTO does not leak: GTO prices against equilibrium.
    mode("GTO").click();
    expect(view.getFilters().trainingMode).toBeUndefined();
    expect(view.getFilters().villainFocus).toBeUndefined();
    expect(view.getFilters().opponentStyle).toBeUndefined();
    // Back in REAL the picked type is where it was left.
    mode("REAL").click();
    expect(view.getFilters().villainFocus).toBe("WHALE");

    view.setFilters({ ...view.getFilters(), trainingMode: "REAL", villainFocus: "ROCK" });
    expect(mode("REAL").checked).toBe(true);
    expect(opponent("ROCK").checked).toBe(true);
    expect(root.querySelector<HTMLElement>(".dx-opponents")!.hidden).toBe(false);
  });

  it("remembers the mode and the opponent between visits", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    // In the document: a radio outside it fires no change event, per the HTML spec.
    const first = document.createElement("div");
    document.body.appendChild(first);
    renderFilters(first, { onStart: () => undefined }, { storage });
    first.querySelector<HTMLInputElement>('.filter-mode[value="REAL"]')!.click();
    first.querySelector<HTMLInputElement>('.filter-opponent[value="DICE"]')!.click();

    const second = document.createElement("div");
    const view = renderFilters(second, { onStart: () => undefined }, { storage });
    expect(view.getFilters()).toMatchObject({ trainingMode: "REAL", villainFocus: "DICE" });
    expect(second.querySelector<HTMLElement>(".dx-opponents")!.hidden).toBe(false);
  });

  it.each(["{broken-json", "null", "[]", '{"mode":"GTO","focus":"WHALE"}', '{"mode":"NOPE"}'])(
    "falls back to GTO on the stored choice %s",
    (stored) => {
      const storage = { getItem: () => stored, setItem: () => undefined };
      const root = document.createElement("div");
      const view = renderFilters(root, { onStart: () => undefined }, { storage });
      expect(view.getFilters().trainingMode).toBeUndefined();
      expect(view.getFilters().villainFocus).toBeUndefined();
      expect(root.querySelector<HTMLElement>(".dx-opponents")!.hidden).toBe(true);
    },
  );

  it("ignores an unknown stored opponent, and storage that refuses to work", () => {
    const unknown = document.createElement("div");
    const view = renderFilters(unknown, { onStart: () => undefined }, {
      storage: { getItem: () => '{"mode":"REAL","focus":"PIRATE"}', setItem: () => undefined },
    });
    expect(view.getFilters()).toMatchObject({ trainingMode: "REAL" });
    expect(view.getFilters().villainFocus).toBeUndefined();

    const refusing = document.createElement("div");
    document.body.appendChild(refusing);
    const setItem = vi.fn(() => { throw new Error("full"); });
    const fine = renderFilters(refusing, { onStart: () => undefined }, {
      storage: { getItem: () => { throw new Error("denied"); }, setItem },
    });
    expect(fine.getFilters().trainingMode).toBeUndefined();
    refusing.querySelector<HTMLInputElement>('.filter-mode[value="REAL"]')!.click();
    expect(setItem).toHaveBeenCalled();
    expect(fine.getFilters()).toMatchObject({ trainingMode: "REAL" });
  });

  it("puts the mode, the street and the start up front, the rest behind Settings", () => {
    const root = render();
    const start = root.querySelector<HTMLElement>(".dx-start")!;
    const settings = root.querySelector<HTMLDetailsElement>(".filters__settings")!;
    for (const selector of [".dx-modes", ".dx-seg", ".filter-start", ".filter-empty-warning", ".profile-selector__note"]) {
      expect(start.querySelector(selector), selector).not.toBeNull();
    }
    for (const selector of [".profile-variant", ".filter-position", ".filter-seed", ".filter-scoring"]) {
      expect(settings.querySelector(selector), selector).not.toBeNull();
    }
    expect(settings.open).toBe(false);
  });

  it("opens Settings on request, for Change situation", () => {
    const root = document.createElement("div");
    const view = renderFilters(root, { onStart: () => undefined }, { storage: null });
    view.openSettings();
    expect(root.querySelector<HTMLDetailsElement>(".filters__settings")!.open).toBe(true);
  });

  it("keeps the street switch and the profile select in step", () => {
    const root = document.createElement("div");
    const view = renderFilters(root, { onStart: () => undefined }, { storage: null });
    const option = (value: string) => root.querySelector<HTMLButtonElement>(`.dx-seg__option[data-value="${value}"]`)!;
    const select = root.querySelector<HTMLSelectElement>(".profile-street")!;
    const note = root.querySelector<HTMLElement>(".profile-selector__note")!;
    const preflopNote = note.textContent;

    option("FLOP").click();
    expect(view.getProfile().street).toBe("FLOP");
    expect(select.value).toBe("FLOP");
    expect(note.textContent).not.toBe(preflopNote);

    select.value = "RIVER";
    select.dispatchEvent(new Event("change"));
    expect(option("RIVER").getAttribute("aria-checked")).toBe("true");

    view.setProfile({ ...view.getProfile(), street: "TURN" });
    expect(option("TURN").getAttribute("aria-checked")).toBe("true");
  });

  it("hides the street switch where only preflop can be played", () => {
    const root = document.createElement("div");
    renderFilters(root, { onStart: () => undefined }, { storage: null });
    const variant = root.querySelector<HTMLSelectElement>(".profile-variant")!;
    const street = root.querySelector<HTMLElement>(".dx-start .dx-seg")!;
    expect(street.hidden).toBe(false);

    variant.value = "SNG";
    variant.dispatchEvent(new Event("change"));
    expect(street.hidden).toBe(true);
    expect(root.querySelector('.dx-seg__option[data-value="PREFLOP"]')?.getAttribute("aria-checked")).toBe("true");
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
