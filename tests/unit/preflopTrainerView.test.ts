// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { grade } from "../../src/core/scoring";
import { emptySessionScore, recordAnswer } from "../../src/core/sessionScore";
import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import type { ActionKey, Card, Spot, TableState } from "../../src/core/types";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { createStatsStore } from "../../src/persistence/statsStore";
import { createPreflopSession, type PreflopSession } from "../../src/training/preflopSession";
import { setAppLanguage } from "../../src/ui/cs";
import { createPreflopTrainerView } from "../../src/ui/trainer/preflopTrainerView";
import { makeFilters } from "../properties/drillSupport";

/**
 * Nová obrazovka preflopového tréninku (Agents/ui-redesign-plan.md, fáze 1,
 * krok 2). Vykreslení se zkouší nad zástupnou relací s pevným spotem, zapojení
 * na skutečný řadič a pack zvlášť.
 */

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const heroCards: [Card, Card] = [
  { rank: "9", suit: "s" },
  { rank: "6", suit: "s" },
];

const tableState: TableState = {
  heroPos: "CO",
  pushFold: false,
  effectiveStackBB: 30,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "NONE",
  isBvB: false,
};

function spot(id: string, withEv: boolean): Spot {
  return {
    id,
    context: "RFI",
    heroPos: "CO",
    effStack: 30,
    ante: "ON",
    pushFold: false,
    hand: "96s",
    heroCards,
    tableState,
    answers: [
      { key: "OPEN_25X", label: "Raise 2.5x" },
      { key: "LIMP", label: "Limp / Check" },
      { key: "FOLD", label: "Fold" },
    ],
    correctKeys: ["FOLD"],
    strictCorrect: ["FOLD"],
    explanation: "Testovací spot.",
    startingPot: 2.5,
    ...(withEv
      ? {
        actionEvs: {
          source: "SOLVER" as const,
          unit: "BB" as const,
          values: [
            { action: "OPEN_25X" as ActionKey, evBb: -0.22 },
            { action: "LIMP" as ActionKey, evBb: -0.6 },
            { action: "FOLD" as ActionKey, evBb: 0 },
          ],
          equivalentThresholdBb: 0.1,
          acceptableThresholdBb: 0.3,
        },
      }
      : {}),
  };
}

/** Zástupná relace: pevné spoty, hodnocení skutečným `grade`. */
function stubSession(spots: Spot[]): PreflopSession & { answers: ActionKey[] } {
  let index = 0;
  let answered = false;
  let score = emptySessionScore();
  const answers: ActionKey[] = [];
  return {
    answers,
    start: () => ({ kind: "STARTED", seed: 1, spot: spots[0] }),
    answer(chosen) {
      if (answered) return null;
      answered = true;
      answers.push(chosen);
      const current = spots[index];
      const result = grade(current, chosen, "LENIENT");
      score = recordAnswer(score, result.correct);
      return { spot: current, chosen, grade: result, hit: result.correct, saved: true, score };
    },
    next() {
      index += 1;
      answered = false;
      return spots[index] ?? null;
    },
    stop() {},
    get spot() { return spots[index] ?? null; },
    get filters() { return makeFilters({ ante: "ON" }); },
    get profile() { return null; },
    get rangeStore() { return null; },
    get answered() { return answered; },
    get score() { return score; },
  };
}

function mount(session: PreflopSession) {
  const callbacks = {
    onAnswered: vi.fn(),
    onChangeSituation: vi.fn(),
    onSessionEnded: vi.fn(),
  };
  const view = createPreflopTrainerView(document, { session, title: (current) => current.id, ...callbacks });
  document.body.appendChild(view.element);
  return { view, ...callbacks };
}

const actionButtons = () => [...document.querySelectorAll<HTMLButtonElement>(".dx-trainer__actions button")];
const feedback = () => document.querySelector<HTMLElement>(".dx-trainer__feedback")!;
const key = (value: string, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.innerHTML = "";
  setAppLanguage("CZ");
});

describe("obrazovka preflopového tréninku", () => {
  it("ukáže otázku: titulek, akce v barvách akcí a skryté vyhodnocení", () => {
    const session = stubSession([spot("A", true)]);
    const { view } = mount(session);
    view.show(spot("A", true));

    expect(document.querySelector(".dx-trainer__title")?.textContent).toBe("A");
    expect(actionButtons().map((button) => button.dataset.action)).toEqual(["OPEN_25X", "LIMP", "FOLD"]);
    for (const button of actionButtons()) {
      expect(button.style.getPropertyValue("--action-accent")).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(feedback().hidden).toBe(true);
    expect(document.querySelector(".dx-trainer__streak")?.textContent).toBe("Série 0");
    // Karty hráče stojí přímo u akcí, protože na mobilu panel zakryje spodek stolu.
    const cards = [...document.querySelectorAll(".dx-trainer__prompt .dx-card")];
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["piková devítka", "piková šestka"]);
  });

  it("po odpovědi ukáže verdikt EV, ztrátu a EV akcí od nejlepší", () => {
    const session = stubSession([spot("A", true)]);
    const { view, onAnswered } = mount(session);
    view.show(spot("A", true));
    actionButtons()[0].click();

    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(feedback().hidden).toBe(false);
    // Raise ztrácí 0,22 BB proti foldu: nad prahem 0,1, pod 0,3 => přijatelná.
    expect(feedback().querySelector(".dx-chip")?.getAttribute("data-outcome")).toBe("ACCEPTABLE");
    expect(feedback().querySelector(".dx-trainer__loss")?.textContent).toBe("−0,22 BB");
    const rows = [...feedback().querySelectorAll<HTMLElement>(".dx-trainer__ev-row")];
    expect(rows.map((row) => row.dataset.action)).toEqual(["FOLD", "OPEN_25X", "LIMP"]);
    expect(rows.map((row) => row.dataset.chosen)).toEqual(["false", "true", "false"]);
    expect(rows[0].dataset.best).toBe("true");
    expect(feedback().querySelector(".dx-trainer__plan")?.textContent).toMatch(/^Plán: /);
  });

  it("zamkne akce, označí volbu i doporučení a přesune zaměření na další spot", () => {
    const session = stubSession([spot("A", true)]);
    const { view } = mount(session);
    view.show(spot("A", true));
    actionButtons()[0].click();

    expect(actionButtons().every((button) => button.disabled)).toBe(true);
    expect(actionButtons()[0].getAttribute("aria-pressed")).toBe("true");
    expect(actionButtons()[2].dataset.recommended).toBe("true");
    expect(document.activeElement?.classList.contains("dx-trainer__next")).toBe(true);
  });

  it("spot bez EV hodnotí podle range a přizná, že EV nemá", () => {
    const session = stubSession([spot("A", false)]);
    const { view } = mount(session);
    view.show(spot("A", false));
    actionButtons()[2].click();

    expect(feedback().querySelector(".dx-chip")?.getAttribute("data-outcome")).toBe("CORRECT");
    expect(feedback().querySelector(".dx-trainer__loss")).toBeNull();
    expect(feedback().querySelector(".dx-trainer__ev")).toBeNull();
    expect(feedback().querySelector(".dx-trainer__note")).not.toBeNull();
  });

  it("číslo odpoví, Enter mimo tlačítko vede na další spot", () => {
    const session = stubSession([spot("A", true), spot("B", true)]);
    const { view } = mount(session);
    view.show(spot("A", true));

    key("3");
    expect(session.answers).toEqual(["FOLD"]);
    key("2");
    expect(session.answers).toEqual(["FOLD"]);

    key("Enter");
    expect(document.querySelector(".dx-trainer__title")?.textContent).toBe("B");
    expect(feedback().hidden).toBe(true);
  });

  it("Enter na tlačítku nechá prohlížeči, aby spot nepřeskočil", () => {
    const session = stubSession([spot("A", true), spot("B", true)]);
    const { view } = mount(session);
    view.show(spot("A", true));
    actionButtons()[2].click();

    const next = document.querySelector<HTMLButtonElement>(".dx-trainer__next")!;
    key("Enter", next);
    expect(document.querySelector(".dx-trainer__title")?.textContent).toBe("A");
  });

  it("skrytá obrazovka klávesy ignoruje", () => {
    const session = stubSession([spot("A", true)]);
    const { view } = mount(session);
    view.show(spot("A", true));
    view.element.hidden = true;
    key("1");
    expect(session.answers).toEqual([]);
  });

  it("konec sekvence a změnu situace předá dál", () => {
    const session = stubSession([spot("A", true)]);
    const { view, onSessionEnded, onChangeSituation } = mount(session);
    view.show(spot("A", true));
    actionButtons()[2].click();
    document.querySelector<HTMLButtonElement>(".dx-trainer__next")!.click();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);

    document.querySelector<HTMLButtonElement>(".dx-trainer__change")!.click();
    expect(onChangeSituation).toHaveBeenCalledTimes(1);
  });

  it("v angličtině mluví anglicky", () => {
    setAppLanguage("EN");
    const session = stubSession([spot("A", true)]);
    const { view } = mount(session);
    view.show(spot("A", true));
    actionButtons()[0].click();
    expect(document.querySelector(".dx-trainer__next")?.textContent).toContain("Next spot");
    expect(feedback().querySelector(".dx-trainer__loss")?.textContent).toBe("−0.22 BB");
  });

  it("se skutečným řadičem zapíše odpověď do statistik", () => {
    const store = createStatsStore(new MemoryStorage());
    const session = createPreflopSession(store);
    const started = session.start(
      makeFilters({ ante: "ON", positions: ["CO"], contexts: ["RFI"] }),
      42,
      { ...DEFAULT_TRAINING_PROFILE, ante: "ON", street: "PREFLOP" },
      currentMttPreflopRangePack("ON"),
    );
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    const { view } = mount(session);
    view.show(started.spot);
    key("1");

    expect(store.events()).toHaveLength(1);
    expect(store.events()[0].qid).toBe(started.spot.id);
    expect(document.querySelector(".dx-trainer__streak")?.textContent).toMatch(/^Série [01]$/);
  });
});
