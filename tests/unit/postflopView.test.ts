// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setAppLanguage } from "../../src/ui/cs";
import { renderPostflopView } from "../../src/ui/postflopView";
import { solvedStrategySource } from "../../src/data/ranges/solvedStrategySource";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import { loadSolvedFlopPacks } from "../../src/data/ranges/flopSolvedStrategyPacks";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import type { PostflopRecommendationSource, PostflopStrategyResolver } from "../../src/core/postflopGenerator";
import { isPostflopPositionPattern } from "../../src/core/postflopGenerator";

/**
 * Postflopový panel: zadání situace, rozdání a vyhodnocení.
 *
 * Od 4. 11. 2026 kreslí otázku i vyhodnocení jen nová obrazovka (klasické GUI
 * smazáno). Její vlastní vykreslení hlídá `postflopTrainerView.test.ts`; tady
 * zůstává, co patří panelu - volby situace, seed, upozornění, kontext pozic a
 * typu potu, linka - a poctivé poznámky modelu, které panel hráči dává v
 * „Podrobnostech“ (SPR, strom, pokrytí textur).
 */
type PackSource = Extract<PostflopRecommendationSource, { kind: "STRATEGY_PACK" }>;

const TRAINER = ".postflop-output .dx-trainer";
const ACTION = `${TRAINER} .dx-trainer__actions button`;

/** Rozdání je asynchronní (příprava ulice, tabulka EV), čeká se na tlačítka. */
async function dealt(root: HTMLElement): Promise<HTMLElement> {
  await vi.waitFor(() => {
    expect(root.querySelector(ACTION)).not.toBeNull();
  }, { timeout: 20000 });
  return root.querySelector<HTMLElement>(TRAINER)!;
}

function actions(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLButtonElement>(ACTION)].map((button) => button.dataset.action ?? "");
}

function answer(root: HTMLElement, action?: string): void {
  const selector = action === undefined ? ACTION : `${ACTION}[data-action="${action}"]`;
  const target = root.querySelector<HTMLButtonElement>(selector);
  expect(target, selector).not.toBeNull();
  target!.click();
}

function feedbackText(root: HTMLElement): string {
  return root.querySelector<HTMLElement>(`${TRAINER} .dx-trainer__feedback`)?.textContent ?? "";
}

/** Poznámky modelu v „Podrobnostech“ vyhodnocení. */
function modelNotes(root: HTMLElement): string {
  return root.querySelector<HTMLElement>(`${TRAINER} .dx-trainer__notes`)?.textContent ?? "";
}

async function renderAnswered(
  source: Partial<PackSource>,
  options: { action?: string; seed?: number; chosen?: string } = {},
): Promise<HTMLElement> {
  const resolver: PostflopStrategyResolver = (input) => ({
    action: (options.action ?? "BET_BIG") as never,
    explanation: "Fixture.",
    source: {
      kind: "STRATEGY_PACK",
      provenance: "SOLVER_BACKED",
      packId: "internal-test-pack",
      packVersion: "v1",
      packVerifiedAt: "2026-07-29",
      ruleId: "internal-test-rule",
      confidence: "HIGH",
      matchedTextures: input.textures,
      sprMin: 0,
      sprMax: 25,
      positionPattern: input.positionPattern,
      sourceUrls: [],
      assumptions: ["Fixture."],
      selectionScore: 100,
      tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
      ...source,
    } as PackSource,
  });
  const root = document.createElement("div");
  renderPostflopView(root, {
    initialSeed: options.seed ?? 7,
    initialStreet: "FLOP",
    autoGenerate: true,
    strategyResolver: resolver,
  });
  await dealt(root);
  answer(root, options.chosen ?? "CHECK");
  return root;
}

describe("postflopView - panel", () => {
  beforeEach(() => {
    setAppLanguage("CZ");
  });

  afterEach(() => {
    document.querySelector<HTMLButtonElement>(".range-modal__close")?.click();
    document.body.innerHTML = "";
    setAppLanguage("CZ");
  });

  it("vykresli zadani situace a po rozdani otazku se seedem i ulici", async () => {
    const root = document.createElement("div");
    renderPostflopView(root);

    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.placeholder).toBe("random");
    expect(root.querySelectorAll(".postflop-situation option")).toHaveLength(3);
    expect(root.querySelector(ACTION)).toBeNull();

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    const street = root.querySelector<HTMLSelectElement>(".postflop-street");
    seed!.value = "42";
    street!.value = "RIVER";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    const screen = await dealt(root);

    // Seed je jednorázový: další spot už má být jiný.
    expect(seed?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(screen.dataset.seed).toBe("42");
    expect(screen.dataset.street).toBe("RIVER");
    expect(screen.dataset.actionNode).toBe("RIVER_PRESSURE");
    expect(isPostflopPositionPattern(screen.dataset.positionPattern)).toBe(true);
    expect(screen.querySelector(".dx-trainer__meta")?.textContent).toContain("SPR");
    expect(screen.querySelector(".dx-trainer__title")?.textContent).toContain(" vs ");
    expect(screen.querySelectorAll(".dx-table__board .dx-card")).toHaveLength(5);
    expect(root.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
  });

  it("zobrazi source-free runtime notice pro solver pilot rezim", () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      runtimeNotice: {
        kind: "SCOPED_PILOT",
        text: "Solverový pilot je aktivní pro vybrané flop situace. Jde o úzký pilotní režim, ne kompletní postflop production coverage.",
      },
    });

    const notice = root.querySelector<HTMLElement>(".postflop-runtime-notice");
    expect(notice).not.toBeNull();
    expect(notice?.dataset.kind).toBe("SCOPED_PILOT");
    expect(notice?.getAttribute("role")).toBe("status");
    expect(notice?.textContent).toContain("Solverový pilot");
    expect(notice?.textContent).not.toMatch(/https?:|www\.|source|zdroj|RangePack|StrategyPack|mtt-/i);
  });

  it("vykresli deep-stack notice jako alert, kdyz je hloubka za solvenym SPR", () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      runtimeNotice: {
        kind: "DEEP_STACK_UNCOVERED",
        text: "Tato hloubka stacku je za solvenutým rozsahem SPR (do SPR 20) pro tento typ potu.",
      },
    });

    const notice = root.querySelector<HTMLElement>(".postflop-runtime-notice");
    expect(notice?.dataset.kind).toBe("DEEP_STACK_UNCOVERED");
    // A depth with no solver-backed strategy must alert, not sit as quiet status.
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(notice?.textContent).toContain("za solvenutým rozsahem SPR");
  });

  it("neprozradí doporučenou akci před odpovědí", async () => {
    // Doporučení se na tlačítkách vyznačí až po odpovědi; dřív by hráči řeklo
    // odpověď dřív, než ji dá.
    const root = document.createElement("div");
    renderPostflopView(root, { initialSeed: 1, initialStreet: "FLOP", autoGenerate: true });
    await dealt(root);
    expect(root.querySelector(`${ACTION}[data-recommended]`)).toBeNull();
    answer(root);
    expect(root.querySelector(`${ACTION}[data-recommended="true"]`)).not.toBeNull();
  });

  it("zobrazi check soupere v IP c-bet spotu", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      initialActionNode: "SINGLE_RAISED_POT_CBET",
      initialPositionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
      autoGenerate: true,
    });
    const screen = await dealt(root);

    expect(screen.dataset.actionNode).toBe("SINGLE_RAISED_POT_CBET");
    expect(screen.querySelector(".dx-trainer__situation")?.textContent).toBe("BB checknul.");
    expect(screen.querySelector<HTMLElement>('.dx-table__seat[data-position="BB"] .dx-table__badge')
      ?.dataset.action).toBe("CHECK");
    expect(screen.querySelector<HTMLElement>('.dx-table__seat[data-position="BTN"]')?.dataset.hero)
      .toBe("true");
    expect(actions(root)).toEqual(["CHECK", "BET_SMALL", "BET_BIG"]);
  });

  it("zobrazi predchozi bet soupere ve facing-bet spotu", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      initialActionNode: "FLOP_FACING_BET",
      initialPositionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
      autoGenerate: true,
    });
    const screen = await dealt(root);

    expect(screen.querySelector(".dx-trainer__situation")?.textContent).toMatch(/^BB vsadil/);
    expect(screen.querySelector<HTMLElement>('.dx-table__seat[data-position="BB"] .dx-table__badge')
      ?.dataset.action).toBe("BET");
    expect(actions(root)).toEqual(["FOLD", "CALL", "RAISE"]);
  });

  it("zobrazi ze OOP hero jedna prvni, kdyz pred nim na streetu neni akce", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      initialActionNode: "SINGLE_RAISED_POT_CBET",
      initialPositionContext: {
        heroPosition: "SB",
        villainPosition: "BB",
        aggressorPosition: "SB",
        callerPosition: "BB",
        inPosition: false,
        callerType: "BIG_BLIND",
        positionPattern: "SB_VS_BB",
      },
      autoGenerate: true,
    });
    const screen = await dealt(root);

    expect(screen.querySelector(".dx-trainer__situation")?.textContent).toBe("Jednáš první.");
    expect(screen.querySelector('.dx-table__seat[data-position="BB"] .dx-table__badge')).toBeNull();
    expect(screen.querySelector(".dx-trainer__meta")?.textContent).toContain("OOP");
  });

  it("„Změnit situaci“ vrati zadani se zamerenou volbou ulice a dalsi spot vezme novy seed", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderPostflopView(root, { initialSeed: 42, initialStreet: "FLOP" });

    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    const screen = await dealt(root);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(false);
    expect(actions(root)).toHaveLength(3);
    expect(document.activeElement).toBe(root.querySelector(ACTION));
    expect(screen.dataset.seed).toBe("42");
    // Lepkavý dok nesmí na telefonu přejet hlavičku: drží ho obal bez ní.
    expect(screen.querySelector(".dx-trainer__play .dx-trainer__dock")).not.toBeNull();
    expect(screen.querySelector(".dx-trainer__play .dx-trainer__change")).toBeNull();

    answer(root);
    root.querySelector<HTMLInputElement>(".postflop-seed")!.value = "43";
    root.querySelector<HTMLButtonElement>(`${TRAINER} .dx-trainer__next`)?.click();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(TRAINER)?.dataset.seed).toBe("43");
    });
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("");

    root.querySelector<HTMLButtonElement>(`${TRAINER} .dx-trainer__change`)?.click();
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector(".postflop-street"));
    expect(root.querySelector(ACTION)).toBeNull();
  });

  it("pomalé rozdání nepřepíše novější spot ani „Změnit situaci“", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const gates: Array<() => void> = [];
    let slow = false;
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      beforeGenerate: () => (slow ? new Promise<void>((resolve) => { gates.push(resolve); }) : undefined),
    });
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    await dealt(root);
    answer(root);
    slow = true;

    // Dvakrát „Další spot“, než první rozdání doběhne: zůstane to druhé.
    const seed = root.querySelector<HTMLInputElement>(".postflop-seed")!;
    const next = root.querySelector<HTMLButtonElement>(`${TRAINER} .dx-trainer__next`)!;
    seed.value = "43";
    next.click();
    seed.value = "44";
    next.click();
    gates[1]();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(TRAINER)?.dataset.seed).toBe("44");
    });
    gates[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector<HTMLElement>(TRAINER)?.dataset.seed).toBe("44");

    // „Změnit situaci“, zatímco se rozdává: zadání zůstane na obrazovce.
    answer(root);
    root.querySelector<HTMLButtonElement>(`${TRAINER} .dx-trainer__next`)?.click();
    root.querySelector<HTMLButtonElement>(`${TRAINER} .dx-trainer__change`)?.click();
    gates[2]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(root.querySelector(ACTION)).toBeNull();
  });

  it("po odpovedi zavola callback s postflop training spotem a dobou odpovedi", async () => {
    const root = document.createElement("div");
    const answered: Array<{ summary: string; responseMs?: number }> = [];
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      onAnswered: (spot, chosen, responseMs) => {
        answered.push({ summary: `${spot.street}|${spot.actionNode}|${chosen}`, responseMs });
      },
    });
    await dealt(root);
    answer(root);

    expect(answered).toHaveLength(1);
    expect(answered[0].summary).toContain("FLOP|SINGLE_RAISED_POT_CBET|");
    expect(answered[0].responseMs).toEqual(expect.any(Number));
    expect(answered[0].responseMs).toBeGreaterThanOrEqual(0);
  });

  it("respektuje vstupni postflop pozicni kontext", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 1788246284,
      initialStreet: "FLOP",
      autoGenerate: true,
      initialPositionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        aggressorPosition: "LJ",
        callerPosition: "HJ",
        inPosition: false,
        callerType: "IN_POSITION_CALLER",
        positionPattern: "OOP_RAISER_VS_IP_CALLER",
      },
    });
    const screen = await dealt(root);

    expect(screen.dataset.positionPattern).toBe("OOP_RAISER_VS_IP_CALLER");
    expect(screen.querySelector(".dx-trainer__title")?.textContent).toMatch(/^LJ vs HJ · /);
    expect(screen.querySelector(".dx-trainer__meta")?.textContent).toContain("OOP");
    expect(screen.querySelector<HTMLElement>('.dx-table__seat[data-position="LJ"]')?.dataset.hero)
      .toBe("true");
    expect(screen.querySelector<HTMLElement>('.dx-table__seat[data-position="HJ"]')?.dataset.folded)
      .toBe("false");
    expect(screen.querySelector<HTMLElement>('.dx-table__seat[data-position="BTN"]')?.dataset.folded)
      .toBe("true");
  });

  it("respektuje vstupni 3bet pot kontext", async () => {
    const root = document.createElement("div");
    const answered: string[] = [];
    renderPostflopView(root, {
      initialSeed: 1788246284,
      initialStreet: "FLOP",
      autoGenerate: true,
      initialPotType: "THREE_BET_POT",
      initialPotBB: 18,
      initialEffectiveStackBB: 40,
      initialPositionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        aggressorPosition: "HJ",
        callerPosition: "LJ",
        inPosition: false,
        callerType: "OUT_OF_POSITION_CALLER",
        positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      },
      onAnswered: (spot, chosen) => answered.push(`${spot.potType}|${spot.actionNode}|${chosen}`),
    });
    const screen = await dealt(root);

    expect(screen.dataset.potType).toBe("THREE_BET_POT");
    expect(screen.dataset.actionNode).toBe("THREE_BET_POT_CBET");
    expect(screen.dataset.positionPattern).toBe("OOP_CALLER_VS_IP_3BETTOR");
    expect(screen.querySelector(".dx-trainer__title")?.textContent).toBe("LJ vs HJ · 3bet pot");
    expect(screen.querySelector(".dx-trainer__meta")?.textContent).toContain("pot 18 BB");

    answer(root);
    expect(answered[0]).toContain("THREE_BET_POT|THREE_BET_POT_CBET|");
    expect(feedbackText(root)).not.toContain("https://");
  });

  it("pred production hand line pocka na asynchronni pripravu street rodiny", async () => {
    const root = document.createElement("div");
    let releasePreparation = (): void => {};
    const preparation = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    const modes: string[] = [];

    renderPostflopView(root, {
      initialSeed: 42,
      beforeGenerate: async (mode) => {
        modes.push(mode);
        await preparation;
      },
    });

    root.querySelector<HTMLSelectElement>(".postflop-mode")!.value = "line";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    expect(modes).toEqual(["line"]);
    expect(root.querySelector(TRAINER)).toBeNull();
    releasePreparation();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(TRAINER)?.dataset.street).toBe("FLOP");
    });
    expect(root.querySelector<HTMLElement>(TRAINER)?.dataset.mode).toBe("line");
  });

  it("vetvi hand line pres facing-bet akce bez source detailu v UI", async () => {
    const root = document.createElement("div");
    const completedLines: Array<{ streets: string[]; actions: string[]; total: number }> = [];

    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      initialActionNode: "FLOP_FACING_BET",
      onLineCompleted: (line) => {
        completedLines.push({
          streets: line.streets.map((street) => street.street),
          actions: line.actionHistory.map((action) => action.action),
          total: line.streets.length,
        });
      },
    });

    root.querySelector<HTMLSelectElement>(".postflop-mode")!.value = "line";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    const screen = await dealt(root);

    expect(actions(root)).toEqual(["FOLD", "CALL", "RAISE"]);
    expect(screen.dataset.actionNode).toBe("FLOP_FACING_BET");

    answer(root, "CALL");
    const next = screen.querySelector<HTMLButtonElement>(".dx-trainer__next");
    // Tlačítko nese i klávesovou nápovědu („Enter“).
    expect(next?.textContent).toMatch(/^Pokračovat: Turn/);
    expect(feedbackText(root)).not.toContain("https://");

    next!.click();
    expect(screen.dataset.actionNode).toBe("TURN_FACING_BET");
    expect(screen.querySelector(".dx-trainer__line-history")?.textContent).toBeTruthy();
    expect(actions(root)).toEqual(["FOLD", "CALL", "RAISE"]);

    answer(root, "FOLD");

    const done = screen.querySelector<HTMLElement>(".dx-trainer__line-done");
    expect(done?.dataset.total).toBe("2");
    expect(completedLines).toEqual([{
      streets: ["FLOP", "TURN"],
      actions: ["CALL", "FOLD"],
      total: 2,
    }]);
  });

  it("umi zvolit facing-bet situaci bez interniho action-node identifikatoru", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "RIVER",
    });

    root.querySelector<HTMLSelectElement>(".postflop-situation")!.value = "facing-bet";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    const screen = await dealt(root);

    expect(screen.dataset.actionNode).toBe("RIVER_FACING_BET");
    expect(actions(root)).toEqual(["FOLD", "CALL", "RAISE"]);
    expect(root.textContent).not.toContain("RIVER_FACING_BET");
  });

  it.each([
    { street: "FLOP", actionNode: "SINGLE_RAISED_POT_CBET", actions: ["CHECK", "BET_SMALL", "BET_BIG"] },
    { street: "FLOP", actionNode: "FLOP_FACING_BET", actions: ["FOLD", "CALL", "RAISE"] },
    { street: "TURN", actionNode: "TURN_BARREL", actions: ["CHECK", "BET_SMALL", "BET_BIG"] },
    { street: "TURN", actionNode: "TURN_FACING_BET", actions: ["FOLD", "CALL", "RAISE"] },
    { street: "RIVER", actionNode: "RIVER_PRESSURE", actions: ["CHECK", "BET_SMALL", "BET_BIG"] },
    { street: "RIVER", actionNode: "RIVER_FACING_BET", actions: ["FOLD", "CALL", "RAISE"] },
  ] as const)("vykresli single-spot UI pro $actionNode bez source uniků", async ({ street, actionNode, actions: expected }) => {
    const root = document.createElement("div");

    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: street,
      initialActionNode: actionNode,
      autoGenerate: true,
    });
    const screen = await dealt(root);

    expect(screen.dataset.actionNode).toBe(actionNode);
    expect(actions(root)).toEqual(expected);

    answer(root);
    const visibleText = root.textContent ?? "";
    expect(visibleText).not.toContain("https://");
    expect(visibleText).not.toContain("StrategyPack");
    expect(visibleText).not.toContain("Rule:");
  });
});

/**
 * Co hráči o modelu řekne vyhodnocení v „Podrobnostech“. Každá z těch vět byla
 * opravou: bez nich by spot předstíral víc, než za ním je.
 */
describe("postflopView - poznámky modelu", () => {
  beforeEach(() => {
    setAppLanguage("CZ");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setAppLanguage("CZ");
  });

  it("heuristický model řekne, že je heuristický, a nic neprozradí o zdroji", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialSeed: 42, initialStreet: "RIVER", autoGenerate: true });
    const screen = await dealt(root);
    answer(root);

    expect(screen.dataset.actionNode).toBe("RIVER_PRESSURE");
    const notes = modelNotes(root);
    expect(notes).toContain("Heuristický model");
    expect(notes).toContain("Spolehlivost: nízká");
    expect(notes).toContain("Rozsah SPR:");
    expect(notes).toContain("Předpoklad 1:");
    expect(feedbackText(root)).not.toMatch(/StrategyPack|Rule:|Pack:|https:\/\//);
    expect(feedbackText(root)).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
  });

  it("produkční mix ukáže jako strategii solveru bez interních id", async () => {
    const root = await renderAnswered({
      sprMin: 2,
      sprMax: 12,
      sourceUrls: ["https://example.test/source"],
      heroRangeBucket: {
        lane: "VALUE",
        label: "top pair value",
        action: "BET_SMALL",
        handClass: "AKo",
        features: ["top pair", "range advantage"],
        actionMix: [
          { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
          { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
        ],
      },
    }, { action: "BET_SMALL", seed: 42 });

    const strategy = root.querySelector<HTMLElement>(`${TRAINER} .dx-trainer__strategy`);
    expect(strategy?.querySelector(".dx-strategy-bar")?.getAttribute("aria-label")).toContain("70");
    expect(modelNotes(root)).toContain("Produkční model");
    expect(modelNotes(root)).not.toContain("Heuristický model");
    expect(root.textContent).not.toMatch(/internal-test-pack|internal-test-rule|https:\/\//);
  });

  it("kvalitativni mix neukaze presne frekvence", async () => {
    const root = await renderAnswered({
      confidence: "MEDIUM",
      heroRangeBucket: {
        lane: "BLUFF",
        label: "backdoor bluff",
        action: "BET_SMALL",
        handClass: "QJs",
        features: ["backdoor equity"],
        actionMix: [
          { action: "BET_SMALL", frequencyPct: 70, visibility: "QUALITATIVE" },
          { action: "CHECK", frequencyPct: 30, visibility: "QUALITATIVE" },
        ],
      },
    }, { action: "BET_SMALL", seed: 9, chosen: "BET_SMALL" });

    expect(root.querySelector(`${TRAINER} .dx-trainer__strategy`)).toBeNull();
    expect(feedbackText(root)).not.toMatch(/70\s?%|30\s?%/);
  });

  it("zobrazi solveny SPR a varuje, kdyz je zobrazeny spot daleko od nej", async () => {
    const root = await renderAnswered({
      sprFidelity: { shownSpr: 20, solvedSpr: 4, ratio: 5, band: "MISMATCH" },
    });
    expect(modelNotes(root)).toContain("Solveno na SPR 4");
    expect(modelNotes(root)).toContain("Zobrazené SPR je 5x solveného");
  });

  it("rekne hraci, kdyz je pravidlo poskladane ze dvou solverovych stromu", async () => {
    // Some families were solved partly on a reduced tree that has no turn or
    // river raise, so their aggregates blend two different games.
    const root = await renderAnswered({ treeIntegrity: "MIXED_TREES" });
    expect(modelNotes(root)).toContain("ze dvou solverových stromů");
    expect(modelNotes(root)).toContain("turnu a riveru ber orientačně");
  });

  it("mlci o integrite stromu, kdyz je pravidlo z jednoho stromu", async () => {
    // The caveat must be absent rather than reassuring: a line saying "one tree"
    // on every clean spot would train the eye to skip it on the spots that matter.
    const root = await renderAnswered({});
    expect(modelNotes(root)).not.toContain("solverových stromů");
  });

  it("nevydava popis rozdane desky za shodu textury", async () => {
    // Pravidlo, které deklaruje všechny textury, nemá „shodu“ s deskou: byl by to
    // jen popis rozdané desky vydávaný za důvod výběru strategie.
    const root = await renderAnswered({ textureCoverage: { covered: 13, total: 13 } });
    expect(modelNotes(root)).toContain("pro všechny textury desky v tomto pásmu");
    expect(modelNotes(root)).not.toContain("Shoda textury");
  });

  it("rekne, kolik textur pravidlo pokryva, kdyz nepokryva vsechny", async () => {
    const root = await renderAnswered({ textureCoverage: { covered: 4, total: 13 } });
    expect(modelNotes(root)).toContain("Pokrývá 4 z 13 textur desky");
    expect(modelNotes(root)).toContain("Tahle deska odpovídá:");
    expect(modelNotes(root)).not.toContain("pro všechny textury desky");
  });

  it("rekne all-in tam, kde solver za tim tlacitkem opravdu shoveuje", async () => {
    // V deseti ze třinácti rodin je jediná sázka za BET_BIG all-in solveru, a
    // tlačítko dřív hlásilo pevných 75 % potu.
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: (input) => ({
        action: "BET_BIG",
        explanation: "All-in sizing fixture.",
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "internal-sizing-pack",
          packVersion: "v1",
          packVerifiedAt: "2026-07-30",
          ruleId: "mtt9_100bb_co_bb_srp_cbet_highspr-check-aggregate",
          confidence: "HIGH",
          matchedTextures: input.textures,
          sprMin: 0,
          sprMax: 25,
          positionPattern: input.positionPattern,
          sourceUrls: [],
          assumptions: ["All-in sizing fixture."],
          selectionScore: 100,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        },
      }),
    });
    await dealt(root);
    const big = root.querySelector<HTMLElement>(`${ACTION}[data-action="BET_BIG"] .dx-trainer__action-label`);
    expect(big?.textContent).toBe("All-in");
  });

  it("nechá velky bet velkym betem, kdyz za nim opravdu bet je", async () => {
    // Kontrola: pot 157 dá téhle rodině půlpotovou sázku nad prahem, takže její
    // BET_BIG je skutečná sázka a nesmí se číst jako shove.
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: (input) => ({
        action: "BET_BIG",
        explanation: "Real big bet fixture.",
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "internal-sizing-pack",
          packVersion: "v1",
          packVerifiedAt: "2026-07-30",
          ruleId: "mtt9_80bb_co_btn_3bp_midspr-check-aggregate",
          confidence: "HIGH",
          matchedTextures: input.textures,
          sprMin: 0,
          sprMax: 25,
          positionPattern: input.positionPattern,
          sourceUrls: [],
          assumptions: ["Real big bet fixture."],
          selectionScore: 100,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        },
      }),
    });
    await dealt(root);
    const big = root.querySelector<HTMLElement>(`${ACTION}[data-action="BET_BIG"] .dx-trainer__action-label`);
    expect(big?.textContent).not.toBe("All-in");
    expect(big?.textContent).toMatch(/^Bet \d/);
  });

  it("obě solverově rovnocenné volby vyznačí jako doporučené", async () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: (input) => ({
        action: "BET_BIG",
        actionEvs: {
          source: "SOLVER",
          unit: "BB",
          equivalentThresholdBb: 0.01,
          acceptableThresholdBb: 0.05,
          values: [
            { action: "CHECK", evBb: 0.204 },
            { action: "BET_SMALL", evBb: 0.1 },
            { action: "BET_BIG", evBb: 0.21 },
          ],
        },
        explanation: "Reviewed action EV fixture.",
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "internal-action-ev-pack",
          packVersion: "v1",
          packVerifiedAt: "2026-07-16",
          ruleId: "internal-action-ev-rule",
          confidence: "HIGH",
          matchedTextures: input.textures,
          sprMin: 1,
          sprMax: 20,
          positionPattern: input.positionPattern,
          sourceUrls: [],
          assumptions: ["Reviewed solver EV fixture."],
          selectionScore: 200,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        },
      }),
    });
    await dealt(root);
    answer(root, "CHECK");

    expect(root.querySelectorAll(`${ACTION}[data-recommended="true"]`)).toHaveLength(2);
    expect(root.querySelectorAll(`${TRAINER} .dx-trainer__ev-row`)).toHaveLength(3);
    expect(root.querySelector<HTMLElement>(`${TRAINER} .dx-trainer__verdict .dx-chip`)?.dataset.outcome)
      .toBe("EQUIVALENT");
  });

  it("akci, kterou rozbor nepočítal, neoznačí za chybu", async () => {
    // Resolver se podstrkuje schválně: ve skutečném obsahu se nespočítaná akce
    // v synchronním testu nikdy neobjeví a test by tiše neověřil nic.
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "RIVER",
      // Sada zná dvě akce ze tří.
      strategyResolver: () => ({
        action: "CHECK",
        explanation: "Vyřešený river.",
        actionEvs: {
          source: "SOLVED_TREE",
          unit: "BB",
          equivalentThresholdBb: 0.1,
          acceptableThresholdBb: 0.3,
          values: [
            { action: "CHECK", evBb: 3.4 },
            { action: "BET_SMALL", evBb: 1.1 },
          ],
        },
        // Úplný zdroj přes tutéž funkci, jakou používají resolvery: test, který si
        // vyrobí nemožný stav, hlásí vadu, která v produktu není.
        source: solvedStrategySource({
          packId: "test-pack",
          packVersion: "v1",
          packVerifiedAt: "2026-08-24",
          confidence: "MEDIUM",
          assumptions: [],
          positionPattern: "SRP_BTN_VS_BB",
          ruleId: "test",
          potBB: 20,
          stackBehindBB: 40,
        }),
      }) as never,
    });
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    await dealt(root);

    // Nespočítaná akce se hledá, ne předpokládá: který uzel se rozdá, závisí na seedu.
    const known = new Set(["CHECK", "BET_SMALL"]);
    const unsolved = actions(root).find((action) => !known.has(action));
    expect(unsolved, "spot nenabídl akci mimo vloženou sadu").toBeDefined();
    answer(root, unsolved);

    expect(root.querySelector<HTMLElement>(`${TRAINER} .dx-trainer__verdict .dx-chip`)?.dataset.outcome)
      .toBe("UNSOLVED");
    expect(feedbackText(root)).toContain("Tuhle akci rozbor nepočítal");
  });

  // Vlastní strop: test načítá **všechny tři sady packů** a to je jeho podstata -
  // bez načteného obsahu by vyřešený resolver neodpověděl a test by ověřoval
  // heuristiku. Globálních 20 s na to nestačí.
  it("vyřešený spot vykreslí celé vysvětlení, ne jen půlku", { timeout: 90_000 }, async () => {
    // Vyřešené resolvery kdysi skládaly zdroj ze šesti polí z šestnácti a
    // přetypování umlčelo kompilátor; renderer pak volal `.map()` nad `undefined`.
    // Změřeno před opravou: 18 z 18 spotů mělo nula bloků vysvětlení.
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP");
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER");

    for (const street of ["FLOP", "TURN", "RIVER"] as const) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const root = document.createElement("div");
        renderPostflopView(root, { initialSeed: seed, initialStreet: street });
        root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
        await dealt(root);
        answer(root);
        const notes = root.querySelectorAll(`${TRAINER} .dx-trainer__notes li`);
        expect(notes.length, `${street} seed ${seed}: vysvětlení se nevykreslilo`).toBeGreaterThan(0);
        expect(root.querySelector(`${TRAINER} .dx-trainer__plan`)?.textContent, `${street} seed ${seed}`)
          .toBeTruthy();
      }
    }
  });
});
