// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { renderPostflopView } from "../../src/ui/postflopView";
import { solvedStrategySource } from "../../src/data/ranges/solvedStrategySource";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import { loadSolvedFlopPacks } from "../../src/data/ranges/flopSolvedStrategyPacks";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import type { PostflopStrategyResolver } from "../../src/core/postflopGenerator";
import { isPostflopPositionPattern } from "../../src/core/postflopGenerator";

describe("postflopView - DOM", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function renderGeneratedSpot(seed: number, street: "FLOP" | "TURN" | "RIVER" = "FLOP"): HTMLElement {
    const root = document.createElement("div");
    renderPostflopView(root, { initialSeed: seed, initialStreet: street });
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    return root;
  }

  it("vykresli postflop prototyp a respektuje seed i street", () => {
    const root = document.createElement("div");
    renderPostflopView(root);

    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.placeholder)
      .toBe("random");
    expect(root.querySelector<HTMLButtonElement>(".postflop-generate")?.textContent)
      .toBe("Generate spot");
    expect([...root.querySelectorAll<HTMLOptionElement>(".postflop-situation option")]
      .map((option) => option.textContent))
      .toEqual(["We have initiative", "Facing a bet", "No initiative, first to act"]);
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(0);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(0);

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    const street = root.querySelector<HTMLSelectElement>(".postflop-street");
    seed!.value = "42";
    street!.value = "RIVER";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    expect(seed?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(root.querySelector<HTMLButtonElement>(".postflop-new-spot")?.textContent)
      .toBe("New spot");
    expect(root.querySelector<HTMLButtonElement>(".postflop-change-situation")?.textContent)
      .toBe("Change situation");
    expect(root.querySelector<HTMLElement>(".postflop-question-title")?.textContent)
      .toBe("Question");
    expect(root.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.seed).toBe("42");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(isPostflopPositionPattern(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.positionPattern))
      .toBe(true);
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent).toContain("SPR");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent).toContain(" vs ");
    expect(root.querySelector(".postflop-table")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-table")?.dataset.recommendedAction)
      .toMatch(/^(CHECK|BET_SMALL|BET_BIG)$/);
    expect(root.querySelector(".postflop-table__rail")).not.toBeNull();
    expect(root.querySelector(".postflop-table__center-label")).not.toBeNull();
    expect(root.querySelector(".postflop-table__bet-geometry")).not.toBeNull();
    expect(root.querySelectorAll(".postflop-table__chip-stack span")).toHaveLength(3);
    expect(root.querySelectorAll(".postflop-seat")).toHaveLength(9);
    expect(root.querySelectorAll(".postflop-seat--active")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-seat__status")).toHaveLength(9);
    expect(root.querySelectorAll(".postflop-seat__badge")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-seat__role-chip")).toHaveLength(4);
    expect(root.querySelector<HTMLElement>(".postflop-seat--aggressor")?.dataset.actionRole)
      .toBe("aggressor");
    expect(root.querySelector<HTMLElement>(".postflop-seat--caller")?.dataset.actionRole)
      .toBe("caller");
    expect(root.querySelector<HTMLElement>(".postflop-seat--ip")?.dataset.positionRole)
      .toBe("IP");
    expect(root.querySelector<HTMLElement>(".postflop-seat--oop")?.dataset.positionRole)
      .toBe("OOP");
    expect(root.querySelector(".postflop-seat__role-chip--aggressor")?.textContent)
      .toBe("Aggressor");
    expect(root.querySelector(".postflop-seat__role-chip--caller")?.textContent)
      .toBe("Caller");
    expect(root.querySelectorAll(".postflop-seat__stack-bar")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-seat__stack-chip")).toHaveLength(2);
    const heroSeat = root.querySelector<HTMLElement>(".postflop-seat--hero");
    expect(heroSeat?.style.getPropertyValue("--seat-left")).toMatch(/%$/);
    expect(heroSeat?.style.getPropertyValue("--seat-mobile-left")).toMatch(/%$/);
    expect(root.querySelectorAll(".postflop-table__board .postflop-card")).toHaveLength(5);
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(7);
    expect(root.querySelectorAll(".postflop-texture").length).toBeGreaterThan(0);
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

  it("zobrazi pot geometry pro check, small bet a big bet sizing", () => {
    const checkRoot = renderGeneratedSpot(0, "FLOP");
    const checkGeometry = checkRoot.querySelector<HTMLElement>(".postflop-table__bet-geometry");
    expect(checkGeometry?.dataset.recommendedAction).toBe("CHECK");
    expect(checkGeometry?.dataset.betSizing).toBe("check");
    expect(checkGeometry?.dataset.betBB).toBe("0");
    expect(checkGeometry?.style.getPropertyValue("--bet-size")).toBe("0%");
    expect(checkGeometry?.textContent).toContain("Check");
    expect(checkGeometry?.querySelectorAll(".postflop-table__bet-chip")).toHaveLength(0);

    const smallRoot = renderGeneratedSpot(1, "FLOP");
    const smallGeometry = smallRoot.querySelector<HTMLElement>(".postflop-table__bet-geometry");
    expect(smallGeometry?.dataset.recommendedAction).toBe("BET_SMALL");
    expect(smallGeometry?.dataset.betSizing).toBe("small");
    expect(smallGeometry?.dataset.betBB).toBe("2");
    expect(smallGeometry?.style.getPropertyValue("--bet-size")).toBe("33%");
    expect(smallGeometry?.textContent).toContain("Small bet 2 BB");
    expect(smallGeometry?.querySelectorAll(".postflop-table__bet-chip")).toHaveLength(2);

    const bigRoot = renderGeneratedSpot(3, "RIVER");
    const bigGeometry = bigRoot.querySelector<HTMLElement>(".postflop-table__bet-geometry");
    expect(bigGeometry?.dataset.recommendedAction).toBe("BET_BIG");
    expect(bigGeometry?.dataset.betSizing).toBe("big");
    expect(bigGeometry?.dataset.betBB).toBe("4.5");
    expect(bigGeometry?.style.getPropertyValue("--bet-size")).toBe("75%");
    expect(bigGeometry?.textContent).toContain("Big bet 4.5 BB");
    expect(bigGeometry?.querySelectorAll(".postflop-table__bet-chip")).toHaveLength(4);
  });

  it("zobrazi explicitni akci predchoziho hrace v IP c-bet spotu", () => {
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

    const history = root.querySelector<HTMLElement>(".postflop-action-history");
    expect(history).not.toBeNull();
    expect(history?.dataset.actionNode).toBe("SINGLE_RAISED_POT_CBET");
    expect(history?.dataset.previousActor).toBe("BB");
    expect(history?.dataset.previousAction).toBe("CHECK");
    expect(history?.textContent).toContain("Preflop: BTN open raise, BB call.");
    expect(history?.textContent).toContain("Flop: BB checknul, Hero je na tahu.");
    expect(history?.textContent).toContain("Soupeř checknul.");
    const villainSeat = root.querySelector<HTMLElement>('.postflop-seat[data-position="BB"]');
    const heroSeat = root.querySelector<HTMLElement>('.postflop-seat[data-position="BTN"]');
    expect(villainSeat?.dataset.currentAction).toBe("CHECK");
    expect(villainSeat?.textContent).toContain("Check");
    expect(heroSeat?.dataset.currentAction).toBe("TO_ACT");
    expect(heroSeat?.textContent).toContain("To act");
  });

  it("zobrazi predchozi bet soupere ve facing-bet spotu", () => {
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

    const history = root.querySelector<HTMLElement>(".postflop-action-history");
    expect(history?.dataset.previousActor).toBe("BB");
    expect(history?.dataset.previousAction).toBe("BET_SMALL");
    expect(history?.textContent).toContain("Flop: BB betnul, Hero čelí sázce.");
    expect(history?.textContent).toContain("fold, call nebo raise");
    const villainSeat = root.querySelector<HTMLElement>('.postflop-seat[data-position="BB"]');
    const heroSeat = root.querySelector<HTMLElement>('.postflop-seat[data-position="BTN"]');
    expect(villainSeat?.dataset.currentAction).toBe("BET");
    expect(villainSeat?.textContent).toContain("Bet");
    expect(heroSeat?.dataset.currentAction).toBe("TO_ACT");
    expect([...root.querySelectorAll<HTMLButtonElement>(".postflop-action")]
      .map((button) => button.dataset.action))
      .toEqual(["FOLD", "CALL", "RAISE"]);
  });

  it("zobrazi ze OOP hero jedna prvni, kdyz pred nim na streetu neni akce", () => {
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

    const history = root.querySelector<HTMLElement>(".postflop-action-history");
    expect(history?.dataset.previousActor).toBe("");
    expect(history?.dataset.previousAction).toBe("NONE");
    expect(history?.textContent).toContain("Flop: Hero je OOP a jedná první.");
    expect(history?.textContent).toContain("Před vámi na této streetě nebyla žádná akce.");
    const villainSeat = root.querySelector<HTMLElement>('.postflop-seat[data-position="BB"]');
    const heroSeat = root.querySelector<HTMLElement>('.postflop-seat[data-position="SB"]');
    expect(villainSeat?.dataset.currentAction).toBe("none");
    expect(heroSeat?.dataset.currentAction).toBe("TO_ACT");
    expect(heroSeat?.textContent).toContain("To act");
  });

  it("oddeli zadani situace od postflop otazky a umi se vratit", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderPostflopView(root, { initialSeed: 42, initialStreet: "FLOP" });

    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(false);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(3);
    expect(document.activeElement).toBe(root.querySelector<HTMLButtonElement>(".postflop-action"));
    expect(root.querySelector(".postflop-table")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.seed).toBe("42");

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    seed!.value = "43";
    root.querySelector<HTMLButtonElement>(".postflop-new-spot")?.click();
    expect(seed?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.seed).toBe("43");

    root.querySelector<HTMLButtonElement>(".postflop-change-situation")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector<HTMLSelectElement>(".postflop-street"));
    expect(root.querySelector(".postflop-card")).toBeNull();
    expect(root.querySelector(".postflop-table")).toBeNull();
    expect(root.querySelector(".postflop-action")).toBeNull();
  });

  it("podporuje keyboard flow pro postflop action buttons", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderPostflopView(root, { initialSeed: 42, initialStreet: "FLOP" });

    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".postflop-action")];
    expect(buttons).toHaveLength(3);
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);

    buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true }));
    expect(buttons[2].classList.contains("postflop-action--chosen")).toBe(true);
    expect(root.querySelector<HTMLElement>(".postflop-result")?.hidden).toBe(false);
    expect(document.activeElement).toBe(root.querySelector<HTMLElement>(".postflop-result"));
  });

  it("po vyberu akce zobrazi doporuceni a prakticke vysvetleni", () => {
    const root = document.createElement("div");
    renderPostflopView(root);

    let result: HTMLElement | null = null;
    for (let seed = 0; seed < 100; seed += 1) {
      root.querySelector<HTMLInputElement>(".postflop-seed")!.value = String(seed);
      root.querySelector<HTMLSelectElement>(".postflop-street")!.value = "FLOP";
      root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
      root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
      result = root.querySelector<HTMLElement>(".postflop-result");
      if (result?.textContent?.includes("Heuristic model")) break;
    }

    expect(result?.hidden).toBe(false);
    expect(result?.textContent).toContain("Recommended");
    expect(root.querySelectorAll<HTMLButtonElement>(".postflop-action:disabled"))
      .toHaveLength(3);
    expect(root.querySelector(".postflop-action--recommended")).not.toBeNull();
    expect(root.querySelectorAll(".postflop-practical__block")).toHaveLength(5);
    const rangeSummary = root.querySelector<HTMLElement>(".postflop-range-summary");
    expect(rangeSummary).not.toBeNull();
    expect(rangeSummary?.dataset.street).toBe("FLOP");
    expect(rangeSummary?.textContent).toContain("Flop range");
    expect(rangeSummary?.textContent).toContain("Recommended:");
    expect(rangeSummary?.textContent).toContain("Your action:");
    const heroBucket = root.querySelector<HTMLElement>(".postflop-range-summary__hero-bucket");
    expect(heroBucket).not.toBeNull();
    expect(heroBucket?.dataset.heroHand).toMatch(/^[AKQJT98765432]{2}[so]?$/);
    expect(heroBucket?.dataset.heroCategory).toMatch(/^[A-Z_]+$/);
    expect(heroBucket?.dataset.heroCategoryLabel).toMatch(/^[A-Za-z+ ]+$/);
    expect(heroBucket?.dataset.heroLane).toMatch(/^(VALUE|BLUFF|CHECK)$/);
    expect(heroBucket?.dataset.heroLaneLabel).toMatch(/^(Value|Bluffs|Check)$/);
    expect(heroBucket?.textContent).toContain("Hero hand bucket");
    expect(heroBucket?.textContent).toContain("Porovnejte ji s value, bluff a check částí range.");
    expect(rangeSummary?.textContent).toContain("Value");
    expect(rangeSummary?.textContent).toContain("Bluffs");
    expect(rangeSummary?.textContent).toContain("Check");
    expect(root.querySelectorAll(".postflop-flopzilla__cell")).toHaveLength(169);
    expect(root.querySelector(".postflop-flopzilla__cell--hero")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell")
      ?.dataset.lane).toMatch(/^(VALUE|BLUFF|CHECK)$/);
    expect(root.querySelector(".postflop-flopzilla__legend")).not.toBeNull();
    expect(root.querySelector(".postflop-flopzilla__meta")?.textContent).toContain("Hero");
    expect(root.querySelector(".postflop-flopzilla__legend")?.textContent)
      .toContain("Top pair");
    expect(root.querySelector(".postflop-flopzilla__legend")?.textContent)
      .toMatch(/(Flush draw|Backdoor draw|Overcards|Air)/);
    expect(root.querySelectorAll(".postflop-flopzilla__legend-count").length)
      .toBeGreaterThan(3);
    expect(result?.textContent).toContain("Value range");
    expect(result?.textContent).toContain("Model");
    expect(result?.textContent).toContain("Heuristický model");
    expect(result?.textContent).not.toContain("StrategyPack");
    expect(result?.textContent).not.toContain("Rule:");
    expect(result?.textContent).not.toContain("Pack:");
    expect(result?.textContent).not.toContain("https://");
    expect(result?.textContent).toContain("Shoda textury:");
    expect(result?.textContent).toContain("Rozsah SPR:");
    expect(result?.textContent).not.toContain("Duvod vyberu:");
    expect(result?.textContent).toContain("Předpoklad 1:");
    expect(result?.textContent).toContain("Plan");
    expect(result?.textContent ?? "").not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
  });

  it("zobrazi mixed-action feedback pro hero production bucket bez source citaci", () => {
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_SMALL",
      explanation: "Range bucket fixture prefers a small bet with a protected check mix.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-test-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-06-11",
        ruleId: "internal-test-rule",
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 2,
        sprMax: 12,
        positionPattern: input.positionPattern,
        sourceUrls: ["https://example.test/source"],
        assumptions: ["Mixed action fixture."],
        selectionScore: 150,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        heroRangeBucket: {
          lane: "VALUE",
          label: "top pair value",
          action: "BET_SMALL",
          handClass: input.heroHand ?? "AKo",
          features: ["top pair", "range advantage"],
          actionMix: [
            { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
            { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
          ],
        },
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const heroBucket = root.querySelector<HTMLElement>(".postflop-range-summary__hero-bucket");
    expect(heroBucket).not.toBeNull();
    expect(heroBucket?.dataset.rangeBucketLane).toBe("VALUE");
    expect(heroBucket?.dataset.rangeBucketAction).toBe("BET_SMALL");
    expect(heroBucket?.dataset.rangeBucketMixed).toBe("true");
    expect(heroBucket?.textContent).toContain("Mix akcí: Bet small 70% / Check 30%.");
    expect(heroBucket?.textContent).toContain("Vaše akce je součástí mixu tohoto bucketu.");
    expect(heroBucket?.textContent).toContain("Hlavní vlastnosti: top pair, range advantage.");
    expect(heroBucket?.textContent).not.toContain("internal-test-pack");
    expect(heroBucket?.textContent).not.toContain("internal-test-rule");
    expect(heroBucket?.textContent).not.toContain("https://");
    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).toContain("Produkční model");
    expect(result?.textContent).not.toContain("Heuristický model");
    expect(result?.textContent).not.toContain("internal-test-pack");
    expect(result?.textContent).not.toContain("internal-test-rule");
    expect(result?.textContent).not.toContain("https://");
  });

  it("zobrazi solveny SPR a varuje, kdyz je zobrazeny spot daleko od nej", () => {
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_BIG",
      explanation: "SPR fidelity fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-fidelity-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-07-25",
        ruleId: "internal-fidelity-rule",
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 0,
        sprMax: 25,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["SPR fidelity fixture."],
        selectionScore: 100,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        sprFidelity: { shownSpr: 20, solvedSpr: 4, ratio: 5, band: "MISMATCH" },
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).toContain("Solveno na SPR 4");
    expect(result?.textContent).toContain("Zobrazené SPR je 5x solveného");
  });

  it("rekne hraci, kdyz je pravidlo poskladane ze dvou solverovych stromu", () => {
    // Some families were solved partly on a reduced tree that has no turn or
    // river raise, so their aggregates blend two different games. The release
    // gate has said so to operators since it was found; the player training the
    // spot was told nothing, while being told plainly about SPR distance.
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_BIG",
      explanation: "Tree integrity fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-integrity-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-07-29",
        ruleId: "internal-integrity-rule",
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 0,
        sprMax: 25,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["Tree integrity fixture."],
        selectionScore: 100,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        treeIntegrity: "MIXED_TREES",
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).toContain("ze dvou solverových stromů");
    expect(result?.textContent).toContain("turnu a riveru ber orientačně");
  });

  it("rekne all-in tam, kde solver za tim tlacitkem opravdu shoveuje", () => {
    // In ten of thirteen shipped families the only bet behind BET_BIG is the
    // solver's all-in, and the button rendered a fixed 75 percent of pot - "big
    // bet 4 BB" for a 65 BB shove. Grading was never affected; what the player
    // was reading while practising sizing was.
    const resolver: PostflopStrategyResolver = (input) => ({
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
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    // Matched in both languages: an earlier case in this file switches the UI to
    // English and the setting persists, so a Czech-only assertion would be
    // testing the language rather than the sizing.
    const geometry = root.querySelector<HTMLElement>("[data-bet-sizing]");
    expect(geometry?.textContent).toContain("All-in");
    expect(geometry?.textContent).not.toMatch(/Velký bet|Big bet/);
  });

  it("nechá velky bet velkym betem, kdyz za nim opravdu bet je", () => {
    // The control: pot 157 puts this family's half-pot bet over the normalizer's
    // chip threshold, so its BET_BIG is a real bet and must not read as a shove.
    const resolver: PostflopStrategyResolver = (input) => ({
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
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    const geometry = root.querySelector<HTMLElement>("[data-bet-sizing]");
    expect(geometry?.textContent).toMatch(/Velký bet|Big bet/);
    expect(geometry?.textContent).not.toContain("All-in");
  });

  it("nevydava popis rozdane desky za shodu textury", () => {
    // Eighteen of the nineteen shipped rules declare every texture in the
    // taxonomy, so "Texture match: paired, low, dry" was the intersection of the
    // board's own textures with everything - a description of the board dealt,
    // presented as evidence the strategy was chosen for it.
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_BIG",
      explanation: "Texture agnostic fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-texture-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-07-29",
        ruleId: "internal-texture-rule",
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 0,
        sprMax: 25,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["Texture agnostic fixture."],
        selectionScore: 100,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        textureCoverage: { covered: 13, total: 13 },
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).toContain("pro všechny textury desky v tomto pásmu");
    expect(result?.textContent).not.toContain("Shoda textury");
  });

  it("rekne, kolik textur pravidlo pokryva, kdyz nepokryva vsechny", () => {
    // Twelve of thirteen is not a match either, and saying so as a fraction
    // needs no threshold for anyone to argue about. A genuinely narrow rule -
    // what a finer pilot would ship - reads as narrow by the same line.
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_BIG",
      explanation: "Texture specific fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-texture-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-07-29",
        ruleId: "internal-texture-rule",
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 0,
        sprMax: 25,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["Texture specific fixture."],
        selectionScore: 100,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        textureCoverage: { covered: 4, total: 13 },
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).toContain("Pokrývá 4 z 13 textur desky");
    expect(result?.textContent).toContain("Tahle deska odpovídá:");
    expect(result?.textContent).not.toContain("pro všechny textury desky");
  });

  it("mlci o integrite stromu, kdyz je pravidlo z jednoho stromu", () => {
    // The caveat must be absent rather than reassuring: a line saying "one tree"
    // on every clean spot would train the eye to skip it on the spots that matter.
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_BIG",
      explanation: "Uniform tree fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-integrity-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-07-29",
        ruleId: "internal-integrity-rule",
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 0,
        sprMax: 25,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["Uniform tree fixture."],
        selectionScore: 100,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).not.toContain("solverových stromů");
  });

  it("zobrazi EV vsech akci a oznaci obe solverove rovnocenne volby", () => {
    const resolver: PostflopStrategyResolver = (input) => ({
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
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    expect(root.querySelector<HTMLElement>(".action-ev")?.dataset.available).toBe("true");
    expect(root.querySelectorAll(".action-ev__row")).toHaveLength(3);
    expect(root.querySelectorAll(".action-ev__row--best")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-action--recommended")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-action .action-ev-bubble:not([hidden])"))
      .toHaveLength(3);
    expect(root.querySelectorAll(".postflop-action .action-ev-bubble--best"))
      .toHaveLength(2);
    expect(root.querySelectorAll(".postflop-action .action-ev-bubble--chosen"))
      .toHaveLength(1);
    expect(root.querySelector<HTMLElement>(
      '.postflop-action[data-action="CHECK"] .action-ev-bubble',
    )?.textContent).toBe("EV +0.204 BB");
    expect(root.querySelector<HTMLElement>('.action-ev__row[data-action="CHECK"]')?.textContent)
      .toContain("-0.006 BB");
    expect(root.querySelector<HTMLElement>(".postflop-result__summary")?.textContent)
      .toContain("Stejně dobrá akce.");
  });

  it("skryje exact frequency hodnoty pro kvalitativni mixed-action bucket", () => {
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_SMALL",
      explanation: "Qualitative mix fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-qual-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-06-11",
        ruleId: "internal-qual-rule",
        confidence: "MEDIUM",
        matchedTextures: input.textures,
        sprMin: 2,
        sprMax: 12,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["Qualitative mixed action fixture."],
        selectionScore: 120,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        heroRangeBucket: {
          lane: "BLUFF",
          label: "backdoor bluff",
          action: "BET_SMALL",
          handClass: input.heroHand ?? "QJs",
          features: ["backdoor equity"],
          actionMix: [
            { action: "BET_SMALL", frequencyPct: 70, visibility: "QUALITATIVE" },
            { action: "CHECK", frequencyPct: 30, visibility: "QUALITATIVE" },
          ],
        },
      },
    });
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 9,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="BET_SMALL"]')?.click();

    const heroBucket = root.querySelector<HTMLElement>(".postflop-range-summary__hero-bucket");
    expect(heroBucket?.textContent).toContain("Mix akcí: Bet small / Check.");
    expect(heroBucket?.textContent).toContain("Přesné frekvence jsou pro tento bucket skryté.");
    expect(heroBucket?.textContent).not.toContain("70%");
    expect(heroBucket?.textContent).not.toContain("30%");
    expect(heroBucket?.textContent).not.toContain("internal-qual-pack");
    expect(heroBucket?.textContent).not.toContain("internal-qual-rule");
  });

  it("pouzije production range bucket lane pro Flopzilla hero bunku", () => {
    const resolver: PostflopStrategyResolver = (input) => {
      const heroHand = input.heroHand ?? "AKo";
      return {
        action: "CHECK",
        explanation: "Production lane fixture.",
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "internal-lane-pack",
          packVersion: "v1",
          packVerifiedAt: "2026-06-12",
          ruleId: "internal-lane-rule",
          confidence: "HIGH",
          matchedTextures: input.textures,
          sprMin: 2,
          sprMax: 12,
          positionPattern: input.positionPattern,
          sourceUrls: ["https://example.test/lane-source"],
          assumptions: ["Production lane fixture."],
          selectionScore: 160,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
          rangeBuckets: [
            {
              lane: "CHECK",
              label: "protected check",
              action: "CHECK",
              handClasses: [heroHand],
              features: ["showdown value"],
            },
          ],
          heroRangeBucket: {
            lane: "CHECK",
            label: "protected check",
            action: "CHECK",
            handClass: heroHand,
            features: ["showdown value"],
          },
        },
      };
    };
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      strategyResolver: resolver,
    });

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CHECK"]')?.click();

    const heroBucket = root.querySelector<HTMLElement>(".postflop-range-summary__hero-bucket");
    const heroCell = root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero");
    expect(heroBucket?.dataset.rangeBucketLane).toBe("CHECK");
    expect(heroCell?.dataset.lane).toBe("CHECK");
    expect(heroCell?.dataset.laneSource).toBe("production");
    expect(heroCell?.classList.contains("postflop-flopzilla__cell--production-lane")).toBe(true);
    expect(root.textContent).not.toContain("internal-lane-pack");
    expect(root.textContent).not.toContain("internal-lane-rule");
    expect(root.textContent).not.toContain("https://");
  });

  it("umi filtrovat Flopzilla matrix podle value/bluff/check lane", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialSeed: 42, initialStreet: "FLOP", autoGenerate: true });

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    const valueLane = root.querySelector<HTMLElement>(
      '.postflop-range-summary__lane[data-lane="VALUE"]',
    );
    expect(valueLane).not.toBeNull();
    expect(valueLane?.getAttribute("role")).toBe("button");
    expect(valueLane?.getAttribute("aria-pressed")).toBe("false");

    valueLane!.click();

    expect(root.querySelector<HTMLElement>(".postflop-range-summary")?.dataset.activeLane)
      .toBe("VALUE");
    expect(valueLane?.classList.contains("postflop-range-summary__lane--active")).toBe(true);
    expect(valueLane?.getAttribute("aria-pressed")).toBe("true");
    const cells = [...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")];
    expect(cells.some((cell) => cell.dataset.lane !== "VALUE" &&
      cell.classList.contains("postflop-flopzilla__cell--muted"))).toBe(true);
    expect(cells.every((cell) => cell.dataset.lane === "VALUE" ||
      cell.classList.contains("postflop-flopzilla__cell--muted"))).toBe(true);

    valueLane!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(valueLane?.classList.contains("postflop-range-summary__lane--active")).toBe(false);
    expect(valueLane?.getAttribute("aria-pressed")).toBe("false");
    expect(cells.some((cell) => cell.classList.contains("postflop-flopzilla__cell--muted")))
      .toBe(false);
  });

  it("drzi premium Flopzilla matrix styling vcetne mobile scroll pravidel", () => {
    const root = document.createElement("div");
    renderPostflopView(root);

    const css = root.querySelector("style")?.textContent ?? "";
    expect(css).toContain(".postflop-flopzilla{border:1px solid rgba(123,211,255,.18)");
    expect(css).toContain("linear-gradient(180deg,rgba(12,20,32,.94)");
    expect(css).toContain(".postflop-flopzilla__legend-count");
    expect(css).toContain(".postflop-range-summary__hero-bucket");
    expect(css).toContain(".postflop-flopzilla__cell--muted");
    expect(css).toContain(".postflop-flopzilla__cell--production-lane");
    expect(css).toContain(".postflop-flopzilla__legend-item--active");
    expect(css).toContain(".postflop-range-summary__lane--active");
    expect(css).toContain(".postflop-table__bet-geometry");
    expect(css).toContain(".postflop-table__bet-fill");
    expect(css).toContain(".postflop-table__bet-geometry--big");
    expect(css).toContain(".action-ev-bubble--best");
    expect(css).toContain('.postflop-action[data-ev-available="true"]:disabled');
    expect(css).toContain(".postflop-seat__role-chip--aggressor");
    expect(css).toContain(".postflop-seat__role-chip--oop");
    expect(css).toContain(".postflop-seat__current-action--to-act");
    expect(css).toContain(".postflop-seat__current-action--acted");
    expect(css).toContain(".postflop-flopzilla__header-cell--row{position:sticky");
    expect(css).toContain(".postflop-flopzilla__header-cell--corner{top:0;z-index:3;}");
    expect(css).toContain(".postflop-flopzilla__header,.postflop-flopzilla__hint");
    expect(css).toContain(".postflop-range-summary__hero-bucket{align-items:flex-start;flex-direction:column;}");
    expect(css).toContain("@media (max-width:640px)");
    expect(css).toContain(".postflop-table{aspect-ratio:auto;min-height:560px;max-width:390px;margin-bottom:54px;}");
    expect(css).toContain(".postflop-seat{left:var(--seat-mobile-left);top:var(--seat-mobile-top)");
    expect(css).toContain(".postflop-table__board .postflop-card{width:36px;height:48px;font-size:16px;}");
    expect(css).toContain(".postflop-flopzilla__matrix,.postflop-flopzilla__legend,.postflop-flopzilla__detail{min-width:476px;}");
    expect(css).toContain(".postflop-flopzilla__matrix{gap:1px;padding:4px;}");
    expect(css).toContain(".postflop-flopzilla__cell{min-height:21px;border-radius:4px;font-size:8px;}");
  });

  it("po odpovedi zavola callback s postflop training spotem", () => {
    const root = document.createElement("div");
    const answered: Array<{ summary: string; responseMs?: number }> = [];
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      onAnswered: (spot, chosen, responseMs) => {
        answered.push({
          summary: `${spot.street}|${spot.actionNode}|${chosen}`,
          responseMs,
        });
      },
    });

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expect(answered).toHaveLength(1);
    expect(answered[0].summary).toContain("FLOP|SINGLE_RAISED_POT_CBET|");
    expect(answered[0].responseMs).toEqual(expect.any(Number));
    expect(answered[0].responseMs).toBeGreaterThanOrEqual(0);
  });

  it("respektuje vstupni postflop pozicni kontext", () => {
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

    const meta = root.querySelector<HTMLElement>(".postflop-meta");
    expect(meta?.dataset.positionPattern).toBe("OOP_RAISER_VS_IP_CALLER");
    expect(meta?.textContent).toContain("LJ vs HJ");
    expect(meta?.textContent).toContain("(OOP)");
    expect(meta?.textContent).not.toContain("BTN vs BB");
    expect(root.querySelector<HTMLElement>(".postflop-table")?.dataset.heroPosition).toBe("LJ");
    expect(root.querySelector<HTMLElement>(".postflop-table")?.dataset.villainPosition).toBe("HJ");
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="LJ"]')
      ?.classList.contains("postflop-seat--hero")).toBe(true);
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="HJ"]')
      ?.classList.contains("postflop-seat--villain")).toBe(true);
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="LJ"]')
      ?.dataset.actionRole).toBe("aggressor");
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="LJ"]')
      ?.dataset.positionRole).toBe("OOP");
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="LJ"]')
      ?.textContent).toContain("Aggressor");
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="HJ"]')
      ?.dataset.actionRole).toBe("caller");
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="HJ"]')
      ?.dataset.positionRole).toBe("IP");
    expect(root.querySelector<HTMLElement>('.postflop-seat[data-position="HJ"]')
      ?.textContent).toContain("Caller");
  });

  it("respektuje vstupni 3bet pot kontext", () => {
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

    const meta = root.querySelector<HTMLElement>(".postflop-meta");
    expect(meta?.dataset.potType).toBe("THREE_BET_POT");
    expect(meta?.dataset.actionNode).toBe("THREE_BET_POT_CBET");
    expect(meta?.dataset.positionPattern).toBe("OOP_CALLER_VS_IP_3BETTOR");
    expect(meta?.textContent).toContain("3bet pot");
    expect(meta?.textContent).toContain("pot 18 BB");

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    expect(answered[0]).toContain("THREE_BET_POT|THREE_BET_POT_CBET|");
    expect(root.querySelector<HTMLElement>(".postflop-result")?.textContent)
      .toContain("Základní heuristika");
    expect(root.querySelector<HTMLElement>(".postflop-result")?.textContent)
      .not.toContain("https://");
  });

  it("umi projit celou postflop hand line flop-turn-river", () => {
    const root = document.createElement("div");
    const singleStreetAnswers: string[] = [];
    const completedLines: Array<{
      streets: string[];
      chosenStreets: string[];
      startedAt: number;
      completedAt: number;
    }> = [];

    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      onAnswered: (spot, chosen) => singleStreetAnswers.push(`${spot.street}:${chosen}`),
      onLineCompleted: (line, chosenByStreet, startedAt, completedAt) => {
        completedLines.push({
          streets: line.streets.map((street) => street.street),
          chosenStreets: Object.keys(chosenByStreet).sort(),
          startedAt,
          completedAt,
        });
      },
    });

    root.querySelector<HTMLSelectElement>(".postflop-mode")!.value = "line";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    expect(root.querySelector<HTMLElement>(".postflop-question-title")?.textContent)
      .toBe("Hand line 1/3");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.mode).toBe("line");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("FLOP");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.streetIndex).toBe("0");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.streetTotal).toBe("3");

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    expect(singleStreetAnswers).toHaveLength(0);
    expect(root.querySelector<HTMLButtonElement>(".postflop-line-next")?.textContent)
      .toBe("Next: Turn");

    root.querySelector<HTMLButtonElement>(".postflop-line-next")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-question-title")?.textContent)
      .toBe("Hand line 2/3");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("TURN");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.streetIndex).toBe("1");
    const turnHistory = root.querySelector<HTMLElement>(".postflop-action-history");
    expect(turnHistory?.dataset.lineHistoryCount).toBe("1");
    expect(turnHistory?.textContent).toContain("Dosavadní hand line - Flop:");
    expect(turnHistory?.textContent).toMatch(/Hero|Soupeř/);
    expect(turnHistory?.textContent).not.toContain("StrategyPack");
    expect(turnHistory?.textContent).not.toContain("https://");
    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    expect(root.querySelector<HTMLButtonElement>(".postflop-line-next")?.textContent)
      .toBe("Next: River");

    root.querySelector<HTMLButtonElement>(".postflop-line-next")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-question-title")?.textContent)
      .toBe("Hand line 3/3");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.streetIndex).toBe("2");
    expect(root.querySelector<HTMLElement>(".postflop-action-history")?.dataset.lineHistoryCount)
      .toBe("2");
    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    const complete = root.querySelector<HTMLElement>(".postflop-line-complete");
    expect(complete?.textContent).toMatch(/^Hand line complete: \d\/3 streets\.$/);
    expect(complete?.dataset.totalStreets).toBe("3");
    expect(completedLines).toHaveLength(1);
    expect(completedLines[0].streets).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(completedLines[0].chosenStreets).toEqual(["FLOP", "RIVER", "TURN"]);
    expect(completedLines[0].completedAt).toBeGreaterThanOrEqual(completedLines[0].startedAt);
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
    expect(root.querySelector(".postflop-meta")).toBeNull();
    releasePreparation();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("FLOP");
    });
  });

  it("vetvi hand line pres facing-bet akce bez source detailu v UI", () => {
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

    expect([...root.querySelectorAll<HTMLButtonElement>(".postflop-action")]
      .map((button) => button.dataset.action))
      .toEqual(["FOLD", "CALL", "RAISE"]);
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("FLOP_FACING_BET");

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="CALL"]')?.click();
    expect(root.querySelector<HTMLButtonElement>(".postflop-line-next")?.textContent)
      .toBe("Next: Turn");
    expect(root.querySelector<HTMLElement>(".postflop-result")?.textContent)
      .not.toContain("https://");

    root.querySelector<HTMLButtonElement>(".postflop-line-next")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("TURN_FACING_BET");
    expect([...root.querySelectorAll<HTMLButtonElement>(".postflop-action")]
      .map((button) => button.dataset.action))
      .toEqual(["FOLD", "CALL", "RAISE"]);

    root.querySelector<HTMLButtonElement>('.postflop-action[data-action="FOLD"]')?.click();

    const complete = root.querySelector<HTMLElement>(".postflop-line-complete");
    expect(complete?.textContent).toBe("Hand line complete: 1/2 streets.");
    expect(complete?.dataset.totalStreets).toBe("2");
    expect(completedLines).toEqual([{
      streets: ["FLOP", "TURN"],
      actions: ["CALL", "FOLD"],
      total: 2,
    }]);
  });

  it("umi zvolit facing-bet situaci bez interniho action-node identifikatoru", () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "RIVER",
    });

    root.querySelector<HTMLSelectElement>(".postflop-situation")!.value = "facing-bet";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_FACING_BET");
    expect([...root.querySelectorAll<HTMLButtonElement>(".postflop-action")]
      .map((button) => button.dataset.action))
      .toEqual(["FOLD", "CALL", "RAISE"]);
    expect(root.textContent).not.toContain("RIVER_FACING_BET");
  });

  it.each([
    {
      street: "FLOP",
      actionNode: "SINGLE_RAISED_POT_CBET",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    },
    {
      street: "FLOP",
      actionNode: "FLOP_FACING_BET",
      actions: ["FOLD", "CALL", "RAISE"],
    },
    {
      street: "TURN",
      actionNode: "TURN_BARREL",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    },
    {
      street: "TURN",
      actionNode: "TURN_FACING_BET",
      actions: ["FOLD", "CALL", "RAISE"],
    },
    {
      street: "RIVER",
      actionNode: "RIVER_PRESSURE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    },
    {
      street: "RIVER",
      actionNode: "RIVER_FACING_BET",
      actions: ["FOLD", "CALL", "RAISE"],
    },
  ] as const)("vykresli single-spot UI pro $actionNode bez source uniků", ({ street, actionNode, actions }) => {
    const root = document.createElement("div");

    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: street,
      initialActionNode: actionNode,
      autoGenerate: true,
    });

    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe(actionNode);
    expect([...root.querySelectorAll<HTMLButtonElement>(".postflop-action")]
      .map((button) => button.dataset.action))
      .toEqual(actions);

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    const visibleText = root.textContent ?? "";
    expect(visibleText).not.toContain("https://");
    expect(visibleText).not.toContain("StrategyPack");
    expect(visibleText).not.toContain("Rule:");
  });

  it("umi zobrazit source-free model detail pro river pressure spot", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialStreet: "RIVER", autoGenerate: true });

    let result: HTMLElement | null = null;
    for (let seed = 0; seed < 200; seed += 1) {
      root.querySelector<HTMLInputElement>(".postflop-seed")!.value = String(seed);
      root.querySelector<HTMLSelectElement>(".postflop-street")!.value = "RIVER";
      root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
      root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
      result = root.querySelector<HTMLElement>(".postflop-result");
      if (result?.textContent?.includes("Heuristic model")) break;
    }

    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(result?.textContent).toContain("Heuristický model");
    expect(result?.textContent).toContain("Spolehlivost: nízká");
    expect(result?.textContent).not.toContain("StrategyPack");
    expect(result?.textContent).not.toContain("Rule:");
    expect(result?.textContent).not.toContain("https://");
    expect(root.querySelector(".postflop-range-summary")).toBeNull();
  });

  it("akci, kterou rozbor nepočítal, neoznačí za chybu", () => {
    // Resolver se podstrkuje schválně. První verze tohohle testu procházela
    // vzorek dvou set padesáti seedů a hledala nespočítanou akci ve skutečném
    // obsahu - **nenašla ani jednu a tiše neotestovala nic**, protože tabulka EV
    // se stahuje na pozadí a v synchronním testu nikdy nedorazí. Test, který se
    // nemůže dostat ke stavu, který má hlídat, je horší než žádný.
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 7,
      initialStreet: "RIVER",
      // Sada zná dvě akce ze tří: RAISE solver na tomhle uzlu nepočítal.
      strategyResolver: () => ({
        action: "CHECK",
        explanation: "Vyřešený river.",
        actionEvs: {
          source: "SOLVED_TREE",
          unit: "BB",
          equivalentThresholdBb: 0.1,
          acceptableThresholdBb: 0.3,
          // Akce musí být z těch, které uzel nabízí, jinak sadu zamítne brána
          // dřív, než se k třetímu stavu vůbec dojde.
          values: [
            { action: "CHECK", evBb: 3.4 },
            { action: "BET_SMALL", evBb: 1.1 },
          ],
        },
        // Úplný zdroj přes tutéž funkci, jakou používají resolvery. Dřív tu
        // stálo šest polí protlačených přes `as never` - tedy obcházení
        // kontraktu, který vyžaduje šestnáct, a renderer na tom padal. Test,
        // který si vyrobí nemožný stav, hlásí vadu, která v produktu není.
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

    // Nespočítaná akce se hledá, ne předpokládá: který uzel se rozdá, závisí na
    // seedu, a napevno zvolené RAISE se na riverových uzlech téhle konfigurace
    // vůbec nenabízí.
    const known = new Set(["CHECK", "BET_SMALL"]);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".postflop-action")];
    const unsolvedAction = buttons.find((button) => !known.has(button.dataset.action ?? ""));
    expect(unsolvedAction, "spot nenabídl akci mimo vloženou sadu").toBeDefined();
    unsolvedAction!.click();

    const result = root.querySelector<HTMLElement>(".postflop-result")!;
    expect(result.classList.contains("postflop-result--unsolved")).toBe(true);
    expect(result.classList.contains("postflop-result--wrong"), "nesmí to být chyba").toBe(false);
    expect(result.classList.contains("postflop-result--correct")).toBe(false);
    // Sada běží v anglické lokalizaci; česká věta zní „Tuhle akci rozbor
    // nepočítal". Klíčové je, že verdikt nemluví o chybě.
    expect(result.textContent).toContain("not solved");
    // A u nespočítané akce musí být vidět, že hodnota chybí.
    expect(unsolvedAction!.dataset.evAvailable).toBe("unsolved");
  });

  // Vlastní strop: tenhle jediný test načítá **všechny tři sady packů** (48
  // flopových rodin, 32 turnových, 17 riverových) a to je jeho podstata, ne
  // režie - bez načteného obsahu by vyřešený resolver neodpověděl a test by
  // ověřoval heuristiku. Globálních 20 s na to nestačí.
  it("vyřešený spot vykreslí celé vysvětlení, ne jen půlku", { timeout: 90_000 }, async () => {
    // Tohle byla nejzávažnější vada téhle relace a **byla latentní**: všechny tři
    // vyřešené resolvery skládaly zdroj ze šesti polí a protlačily ho přes
    // `as PostflopRecommendation`, ačkoli kontrakt jich chce šestnáct.
    // Přetypování umlčelo kompilátor a renderer pak volal `.map()` nad
    // `undefined`. Dokud se vyřešený obsah rozdával náhodnou deskou, resolver
    // skoro nikdy neodpověděl a cesta se nespustila; katalogy ji zpřístupnily.
    //
    // Změřeno před opravou: **18 z 18 spotů mělo nula bloků vysvětlení**.
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP");
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER");

    for (const street of ["FLOP", "TURN", "RIVER"] as const) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const root = document.createElement("div");
        renderPostflopView(root, { initialSeed: seed, initialStreet: street });
        root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
        root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
        const blocks = root.querySelectorAll(".postflop-practical__block");
        expect(blocks.length, `${street} seed ${seed}: vysvětlení se nevykreslilo`)
          .toBeGreaterThan(0);
      }
    }
  });
});
