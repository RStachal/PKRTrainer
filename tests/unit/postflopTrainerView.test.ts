// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionEvSet } from "../../src/core/actionEv";
import type { PostflopAction } from "../../src/core/postflopGenerator";
import type { PostflopLineAction } from "../../src/core/postflopLineSimulator";
import type { PostflopActionNode, PostflopTrainingSpot } from "../../src/core/postflopTrainingSpot";
import type { Card } from "../../src/core/types";
import { setAppLanguage } from "../../src/ui/cs";
import { renderPostflopView } from "../../src/ui/postflopView";
import {
  createPostflopTrainerView,
  type PostflopLineContinuation,
} from "../../src/ui/trainer/postflopTrainerView";

/**
 * Nová obrazovka jednoho postflopového spotu (Agents/ui-redesign-plan.md,
 * fáze 1, krok 3b). Vykreslení se zkouší nad ručně složeným spotem, kde je
 * vidět každé číslo; zapojení do panelu nad skutečným rozdáním zvlášť.
 */

const NBSP = " ";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

type Source = PostflopTrainingSpot["explanation"]["source"];

function solverSource(overrides: Record<string, unknown> = {}): Source {
  return {
    kind: "STRATEGY_PACK",
    provenance: "SOLVER_BACKED",
    packId: "test-pack",
    packVersion: "1",
    packVerifiedAt: "2026-10-23",
    ruleId: "TEST__Ks7d2c",
    confidence: "MEDIUM",
    matchedTextures: [],
    sprMin: 6.7,
    sprMax: 6.7,
    positionPattern: "SRP_BTN_VS_BB",
    sourceUrls: [],
    assumptions: [],
    selectionScore: 0,
    tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
    heroBetSizes: {
      BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 },
      BET_BIG: { ratio: 0.75, allIn: false, merged: 1 },
    },
    heroRangeBucket: {
      lane: "VALUE",
      label: "Sázka pro hodnotu",
      action: "BET_SMALL",
      handClass: "AKo",
      features: [],
      actionMix: [
        { action: "BET_SMALL", frequencyPct: 64, visibility: "EXACT" },
        { action: "CHECK", frequencyPct: 36, visibility: "EXACT" },
      ],
    },
    ...overrides,
  } as unknown as Source;
}

function evs(values: Partial<Record<PostflopAction, number>>): ActionEvSet<PostflopAction> {
  return {
    source: "SOLVER",
    unit: "BB",
    values: Object.entries(values).map(([action, evBb]) => ({ action: action as PostflopAction, evBb: evBb! })),
    equivalentThresholdBb: 0.05,
    acceptableThresholdBb: 0.2,
  };
}

function spot(options: {
  actionNode?: PostflopActionNode;
  actions?: readonly PostflopAction[];
  inPosition?: boolean;
  actionEvs?: ActionEvSet<PostflopAction>;
  source?: Source;
} = {}): PostflopTrainingSpot {
  const actions = options.actions ?? ["CHECK", "BET_SMALL", "BET_BIG"];
  return {
    id: "POSTFLOP|FLOP|7|Ks-7d-2c",
    seed: 7,
    street: "FLOP",
    actionNode: options.actionNode ?? "SINGLE_RAISED_POT_CBET",
    heroCards: [card("A", "s"), card("K", "d")],
    board: [card("K", "s"), card("7", "d"), card("2", "c")],
    boardTextures: ["rainbow", "dry"],
    potType: "SINGLE_RAISED",
    potBB: 6,
    effectiveStackBB: 40,
    spr: 6.7,
    heroPosition: "BTN",
    villainPosition: "BB",
    aggressorPosition: "BTN",
    callerPosition: "BB",
    inPosition: options.inPosition ?? true,
    callerType: "BIG_BLIND",
    positionPattern: "SRP_BTN_VS_BB",
    actions: actions.map((action) => ({ action, sizing: action, label: action })),
    recommendedAction: "BET_SMALL",
    ...(options.actionEvs ? { actionEvs: options.actionEvs } : {}),
    explanation: {
      summary: "Na suché desce s horní kartou sázej malou sázkou celou range.",
      valueHands: ["AK", "KQ"],
      bluffHands: [],
      checkHands: ["77"],
      nextStreetPlan: "Na blank runoutech pokračuj v tlaku.",
      source: options.source ?? solverSource(),
    },
  } as unknown as PostflopTrainingSpot;
}

function mount(onAnswered = vi.fn(), onNext = vi.fn(), clock = [1000, 2500]) {
  let tick = 0;
  const view = createPostflopTrainerView(document, {
    onNext,
    onChangeSituation: vi.fn(),
    onAnswered,
    now: () => clock[Math.min(tick++, clock.length - 1)],
  });
  document.body.appendChild(view.element);
  return { view, root: view.element, onAnswered, onNext };
}

const buttons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>(".dx-trainer__actions button")];
const text = (root: HTMLElement, selector: string) => root.querySelector<HTMLElement>(selector)?.textContent ?? null;

afterEach(() => {
  document.body.innerHTML = "";
  setAppLanguage("CZ");
});

describe("nová postflopová obrazovka - otázka", () => {
  it("ukáže desku, check soupeře a akce s velikostí sázky", () => {
    const { view, root } = mount();
    view.show(spot());

    expect(text(root, ".dx-chip")).toBe("Flop");
    expect(text(root, ".dx-trainer__title")).toBe("BTN vs BB · SRP");
    expect(text(root, ".dx-trainer__meta")).toBe("40 BB · pot 6 BB · SPR 6,7 · IP");
    expect(root.querySelectorAll(".dx-table__board .dx-card")).toHaveLength(3);
    expect(root.querySelector<HTMLElement>('.dx-table__seat[data-position="BB"] .dx-table__badge')?.textContent)
      .toBe("CHECK");
    expect(root.querySelectorAll('.dx-table__seat[data-folded="false"]')).toHaveLength(2);
    expect(text(root, ".dx-trainer__situation")).toBe("BB checknul.");

    expect(buttons(root).map((button) => button.querySelector(".dx-trainer__action-label")?.textContent))
      .toEqual(["Check", `Bet 33${NBSP}%`, `Bet 75${NBSP}%`]);
    expect(buttons(root).map((button) => button.querySelector(".dx-btn__hint")?.textContent ?? null))
      .toEqual([null, "2 BB", "4,5 BB"]);
    // Barva je z palety akcí, ne výchozí.
    expect(buttons(root)[1].style.getPropertyValue("--action-accent")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("proti sázce ukáže velikost sázky soupeře na stole, v otázce i na callu", () => {
    const { view, root } = mount();
    view.show(spot({
      actionNode: "FLOP_FACING_BET",
      actions: ["FOLD", "CALL", "RAISE"],
      inPosition: false,
      source: solverSource({ facingBetBB: 2, nodePotBB: 8 }),
    }));
    expect(root.querySelector('.dx-table__seat[data-position="BB"] .dx-table__badge')?.textContent).toBe("BET 2 BB");
    expect(text(root, ".dx-trainer__situation")).toBe("BB vsadil 2 BB.");
    expect(buttons(root)[1].querySelector(".dx-btn__hint")?.textContent).toBe("2 BB");
  });

  it("all-in solveru pojmenuje jako all-in za celý stack", () => {
    const { view, root } = mount();
    view.show(spot({
      source: solverSource({ heroBetSizes: { BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 }, BET_BIG: { ratio: 1, allIn: true, merged: 1 } } }),
    }));
    expect(buttons(root)[2].querySelector(".dx-trainer__action-label")?.textContent).toBe("All-in");
    expect(buttons(root)[2].querySelector(".dx-btn__hint")?.textContent).toBe("40 BB");
  });
});

describe("nová postflopová obrazovka - vyhodnocení", () => {
  it("vyhodnotí odpověď proti EV, ukáže ztrátu, EV akcí a strategii solveru", () => {
    const { view, root, onAnswered } = mount();
    const dealt = spot({ actionEvs: evs({ CHECK: 0.5, BET_SMALL: 0.62, BET_BIG: 0.3 }) });
    view.show(dealt);
    buttons(root)[0].click();

    expect(onAnswered).toHaveBeenCalledWith(dealt, "CHECK", 1500);
    expect(root.querySelector<HTMLElement>(".dx-chip[data-outcome]")?.dataset.outcome).toBe("ACCEPTABLE");
    expect(text(root, ".dx-trainer__loss")).toBe("−0,12 BB");
    const rows = [...root.querySelectorAll<HTMLElement>(".dx-trainer__ev-row")];
    expect(rows.map((row) => row.dataset.action)).toEqual(["BET_SMALL", "CHECK", "BET_BIG"]);
    expect(rows[0].dataset.best).toBe("true");
    expect(rows[1].dataset.chosen).toBe("true");
    expect(root.querySelector(".dx-strategy-bar")?.getAttribute("aria-label"))
      .toBe(`Jak solver hraje ruce jako tvoje: Bet 33${NBSP}% 64${NBSP}%, Check 36${NBSP}%`);
    expect(root.querySelectorAll(".dx-strategy-legend__item")).toHaveLength(2);
    expect(text(root, ".dx-trainer__plan")).toBe("Na suché desce s horní kartou sázej malou sázkou celou range.");
    // Přijatelná odpověď je zásah, stejně jako v preflopu.
    expect(text(root, ".dx-trainer__streak")).toBe("Série 1");
    expect(text(root, ".dx-trainer__tally")).toBe("1 z 1 správně · nejdelší série 1");
    // Doporučená akce je po odpovědi vyznačená, všechny akce zamčené.
    expect(buttons(root).every((button) => button.disabled)).toBe(true);
    expect(buttons(root)[1].dataset.recommended).toBe("true");
  });

  it("akci, kterou solver nepočítal, neposoudí a do skóre nezapočítá", () => {
    const { view, root } = mount();
    view.show(spot({ actionEvs: evs({ CHECK: 0.5, BET_SMALL: 0.62 }) }));
    buttons(root)[2].click();
    expect(root.querySelector<HTMLElement>(".dx-chip[data-outcome]")?.dataset.outcome).toBe("UNSOLVED");
    expect(text(root, ".dx-trainer__tally")).toBe("Zatím bez odpovědí");
    expect(root.querySelector(".dx-trainer__loss")).toBeNull();
  });

  it("bez EV hodnotí podle doporučení a strategii solveru ukáže i tak", () => {
    const { view, root } = mount();
    view.show(spot());
    buttons(root)[1].click();
    expect(root.querySelector<HTMLElement>(".dx-chip[data-outcome]")?.dataset.outcome).toBe("CORRECT");
    expect(root.querySelector(".dx-trainer__ev")).toBeNull();
    expect(root.querySelector(".dx-strategy-bar")).not.toBeNull();
  });

  it("heuristiku za strategii solveru nevydává", () => {
    const { view, root } = mount();
    view.show(spot({ source: solverSource({ provenance: "PUBLIC_HEURISTIC" }) }));
    buttons(root)[0].click();
    expect(root.querySelector(".dx-strategy-bar")).toBeNull();
    expect(text(root, ".dx-trainer__note")).toBe("Pro tenhle spot nemáme EV akcí ani frekvence solveru.");
  });

  it("proti sázce řekne, kolik ekvity call potřebuje", () => {
    const { view, root } = mount();
    view.show(spot({
      actionNode: "FLOP_FACING_BET",
      actions: ["FOLD", "CALL", "RAISE"],
      inPosition: false,
      source: solverSource({ facingBetBB: 2, nodePotBB: 8 }),
    }));
    buttons(root)[1].click();
    expect(text(root, ".dx-trainer__price")).toMatch(new RegExp(`^Call potřebuje aspoň \\d+${NBSP}% ekvity\\.$`));
    // Proti sázce jsou lajny zvýšení a dorovnání.
    const titles = [...root.querySelectorAll(".dx-trainer__hands-title")].map((node) => node.textContent);
    expect(titles.slice(0, 3)).toEqual(["Value raise", "Bluff raise", "Call nebo fold"]);
  });
});

describe("nová postflopová obrazovka - klávesnice", () => {
  it("číslo odpoví, Enter vede na další spot a druhé číslo už nic neudělá", () => {
    const { view, root, onAnswered, onNext } = mount();
    view.show(spot());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    expect(onAnswered).toHaveBeenCalledWith(expect.anything(), "BET_SMALL", 1500);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    expect(onAnswered).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onNext).toHaveBeenCalledTimes(1);
    view.destroy();
    expect(root.isConnected).toBe(true);
  });
});

describe("zapojení do postflopového panelu", () => {
  function renderPanel(onAnswered = vi.fn()): HTMLElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderPostflopView(root, { initialSeed: 1, initialStreet: "FLOP", nextUi: true, onAnswered });
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    return root;
  }

  it("jednotlivý spot kreslí nová obrazovka a odpověď jde do statistik volajícího", () => {
    const onAnswered = vi.fn();
    const root = renderPanel(onAnswered);
    expect(root.querySelector(".dx-trainer")).not.toBeNull();
    expect(root.querySelector(".postflop-actions")).toBeNull();
    expect(root.querySelector<HTMLElement>(".dx-trainer")?.dataset.seed).toBe("1");

    root.querySelector<HTMLButtonElement>(".dx-trainer__actions button")?.click();
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(root.querySelector<HTMLElement>(".dx-trainer__feedback")?.hidden).toBe(false);
  });

  it("„Změnit situaci“ vrátí nastavení a další rozdání obrazovku vrátí i se skóre", () => {
    const root = renderPanel();
    root.querySelector<HTMLButtonElement>(".dx-trainer__actions button")?.click();
    const tally = root.querySelector(".dx-trainer__tally")?.textContent;

    root.querySelector<HTMLButtonElement>(".dx-trainer__change")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(false);
    expect(root.querySelector(".dx-trainer")).toBeNull();

    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    expect(root.querySelector(".dx-trainer")).not.toBeNull();
    expect(root.querySelector(".dx-trainer__tally")?.textContent).toBe(tally);
    expect(root.querySelector<HTMLElement>(".dx-trainer__feedback")?.hidden).toBe(true);
  });

  it("další spot rozdá nový spot ve stejné obrazovce", () => {
    const root = renderPanel();
    const first = root.querySelector<HTMLElement>(".dx-trainer")?.dataset.seed;
    root.querySelector<HTMLButtonElement>(".dx-trainer__actions button")?.click();
    root.querySelector<HTMLButtonElement>(".dx-trainer__next")?.click();
    return vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".dx-trainer__feedback")?.hidden).toBe(true);
      expect(root.querySelector<HTMLElement>(".dx-trainer")?.dataset.seed).not.toBe(first);
    });
  });
});

/**
 * Linka flop → turn → river v nové obrazovce (fáze 1, krok 3c). Linku vede
 * panel; obrazovka kreslí ulici, předchozí ulice a tlačítko, které vede dál.
 */
describe("nová postflopová obrazovka - linka", () => {
  const flopAction = {
    street: "FLOP",
    action: "BET_SMALL",
    potBBAfter: 10,
    sequence: [
      { actor: "HERO", action: "BET_SMALL", amountBB: 2 },
      { actor: "VILLAIN", action: "CALL", amountBB: 2 },
    ],
  } as unknown as PostflopLineAction;

  it("ukáže pořadí ulice a předchozí ulice pozicemi, odpověď nezapíše po ulici", () => {
    const { view, root, onAnswered } = mount();
    const go = vi.fn();
    const answer = vi.fn((): PostflopLineContinuation => ({ kind: "NEXT_STREET", street: "RIVER", go }));
    view.show({ ...spot(), street: "TURN" }, { index: 1, total: 3, priorActions: [flopAction], answer });

    expect(text(root, ".dx-chip")).toBe("Turn 2/3");
    expect(root.dataset.mode).toBe("line");
    expect(root.dataset.lineIndex).toBe("1");
    expect(text(root, ".dx-trainer__line-history")).toBe("Flop: BTN bet 2 BB, BB call 2 BB · pot 10 BB");

    buttons(root)[1].click();
    expect(answer).toHaveBeenCalledWith("BET_SMALL");
    expect(onAnswered).not.toHaveBeenCalled();
    const next = root.querySelector<HTMLButtonElement>(".dx-trainer__next");
    expect(next?.textContent).toContain("Pokračovat: River");
    next?.click();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("na konci řekne, kolik ulic bylo správně, neposouzené zvlášť, a nabídne další linku", () => {
    const { view, root } = mount();
    const again = vi.fn();
    view.show({ ...spot(), street: "RIVER" }, {
      index: 2,
      total: 3,
      priorActions: [],
      answer: () => ({ kind: "COMPLETE", correct: 1, judged: 2, total: 3, again }),
    });
    buttons(root)[0].click();

    const done = root.querySelector<HTMLElement>(".dx-trainer__line-done");
    expect(done?.textContent).toBe("Linka hotová: 1 z 2 správně, 1 neposouzeno.");
    expect(done?.dataset.total).toBe("3");
    const next = root.querySelector<HTMLButtonElement>(".dx-trainer__next");
    expect(next?.textContent).toContain("Další linka");
    next?.click();
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("jednotlivý spot po lince zase hlásí odpověď volajícímu a nese „Další spot“", () => {
    const { view, root, onAnswered } = mount();
    view.show(spot(), { index: 0, total: 3, priorActions: [], answer: () => ({ kind: "NEXT_STREET", street: "TURN", go: vi.fn() }) });
    view.show(spot());
    expect(root.dataset.mode).toBe("single");
    expect(root.dataset.lineIndex).toBeUndefined();
    expect(text(root, ".dx-chip")).toBe("Flop");
    buttons(root)[0].click();
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".dx-trainer__next")?.textContent).toContain("Další spot");
  });

  it("panel vede skutečnou linku od flopu po konec a zapíše ji jednou celou", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const onAnswered = vi.fn();
    const onLineCompleted = vi.fn();
    renderPostflopView(root, { initialSeed: 3, initialStreet: "FLOP", nextUi: true, onAnswered, onLineCompleted });
    const mode = root.querySelector<HTMLSelectElement>(".postflop-mode");
    if (mode === null) throw new Error("chybí volba režimu");
    mode.value = "line";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    return vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".dx-trainer")?.dataset.mode).toBe("line");
    }).then(() => {
      const screen = root.querySelector<HTMLElement>(".dx-trainer")!;
      const total = Number(screen.dataset.lineTotal);
      expect(total).toBeGreaterThanOrEqual(1);
      for (let street = 0; street < 3; street += 1) {
        expect(screen.dataset.lineIndex).toBe(String(street));
        buttons(screen)[0].click();
        const next = screen.querySelector<HTMLButtonElement>(".dx-trainer__next")!;
        if (next.textContent?.includes("Další linka")) break;
        expect(next.textContent).toMatch(/^Pokračovat: (Turn|River)/);
        next.click();
      }
      expect(screen.querySelector(".dx-trainer__line-done")).not.toBeNull();
      expect(onLineCompleted).toHaveBeenCalledTimes(1);
      expect(onAnswered).not.toHaveBeenCalled();
    });
  });
});

describe("nová postflopová obrazovka - matice range", () => {
  it("„Range“ otevře dialog s maticí k desce a Escape ho zavře", () => {
    const { view, root } = mount();
    view.show(spot());
    buttons(root)[0].click();

    const range = root.querySelector<HTMLButtonElement>(".dx-trainer__range");
    expect(range?.textContent).toBe("Range");
    range?.click();
    const dialog = document.querySelector<HTMLElement>(".range-modal");
    expect(dialog?.querySelector(".range-modal__title")?.textContent).toBe("BTN vs BB · Flop");
    // Nová matice (fáze 2): deska nahoře a ruka hráče vybraná v detailu.
    expect(dialog?.querySelectorAll(".dx-range__board .dx-card")).toHaveLength(3);
    expect(dialog?.querySelectorAll(".dx-matrix__cell")).toHaveLength(169);
    expect(dialog?.querySelector<HTMLElement>(".dx-range__detail")?.dataset.hand).toBe("AKo");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".range-modal")).toBeNull();
  });

  it("Enter na buňce v dialogu vybere ruku a spot za dialogem nepřeskočí", () => {
    // Do 3. 11. 2026 klávesnice obrazovky brala Enter i z dialogu a klikla na
    // „Další spot“ za ním (nalezeno E2E fáze 2).
    const { view, root, onNext } = mount();
    view.show(spot());
    buttons(root)[0].click();
    root.querySelector<HTMLButtonElement>(".dx-trainer__range")?.click();

    const cell = document.querySelector<HTMLElement>('.range-modal [data-hand="QJs"]')!;
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(document.querySelector<HTMLElement>(".range-modal .dx-range__detail")?.dataset.hand).toBe("QJs");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onNext).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
