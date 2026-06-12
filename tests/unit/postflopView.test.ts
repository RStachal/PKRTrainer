// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { renderPostflopView } from "../../src/ui/postflopView";
import type { PostflopStrategyResolver } from "../../src/core/postflopGenerator";

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
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(0);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(0);

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    const street = root.querySelector<HTMLSelectElement>(".postflop-street");
    seed!.value = "42";
    street!.value = "RIVER";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

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
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.positionPattern)
      .toMatch(/^(EP_VS_BB|BTN_VS_BB|SB_VS_BB|OOP_RAISER_VS_IP_CALLER|OOP_CALLER_VS_IP_3BETTOR)$/);
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
    const heroSeat = root.querySelector<HTMLElement>(".postflop-seat--hero");
    expect(heroSeat?.style.getPropertyValue("--seat-left")).toMatch(/%$/);
    expect(heroSeat?.style.getPropertyValue("--seat-mobile-left")).toMatch(/%$/);
    expect(root.querySelectorAll(".postflop-table__board .postflop-card")).toHaveLength(5);
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(7);
    expect(root.querySelectorAll(".postflop-texture").length).toBeGreaterThan(0);
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
    expect(smallGeometry?.textContent).toContain("Small 2 BB");
    expect(smallGeometry?.querySelectorAll(".postflop-table__bet-chip")).toHaveLength(2);

    const bigRoot = renderGeneratedSpot(12, "RIVER");
    const bigGeometry = bigRoot.querySelector<HTMLElement>(".postflop-table__bet-geometry");
    expect(bigGeometry?.dataset.recommendedAction).toBe("BET_BIG");
    expect(bigGeometry?.dataset.betSizing).toBe("big");
    expect(bigGeometry?.dataset.betBB).toBe("4.5");
    expect(bigGeometry?.style.getPropertyValue("--bet-size")).toBe("75%");
    expect(bigGeometry?.textContent).toContain("Big 4.5 BB");
    expect(bigGeometry?.querySelectorAll(".postflop-table__bet-chip")).toHaveLength(4);
  });

  it("oddeli zadani situace od postflop otazky a umi se vratit", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderPostflopView(root, { initialSeed: 42, initialStreet: "FLOP" });

    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(false);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(3);
    expect(document.activeElement).toBe(root.querySelector<HTMLButtonElement>(".postflop-action"));
    expect(root.querySelector(".postflop-table")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.seed).toBe("42");

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    seed!.value = "43";
    root.querySelector<HTMLButtonElement>(".postflop-new-spot")?.click();
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
    expect(heroBucket?.textContent).toContain("Hero bucket");
    expect(heroBucket?.textContent).toContain("Compare it against the value, bluff and check lanes.");
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
    expect(result?.textContent).toContain("Heuristic model");
    expect(result?.textContent).not.toContain("StrategyPack");
    expect(result?.textContent).not.toContain("Rule:");
    expect(result?.textContent).not.toContain("Pack:");
    expect(result?.textContent).not.toContain("https://");
    expect(result?.textContent).toContain("Texture match:");
    expect(result?.textContent).toContain("SPR window:");
    expect(result?.textContent).not.toContain("Duvod vyberu:");
    expect(result?.textContent).toContain("Assumption 1:");
    expect(result?.textContent).toContain("Plan");
    expect(result?.textContent ?? "").toMatch(/^[\x00-\x7F]*$/);
    expect(result?.textContent ?? "").not.toMatch(/[ĂĹÄŤĹˇĹľ]|mal[yý]|velk[yý]|stredni|slabsi|silne/i);
  });

  it("zobrazi mixed-action feedback pro hero production bucket bez source citaci", () => {
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_SMALL",
      explanation: "Range bucket fixture prefers a small bet with a protected check mix.",
      source: {
        kind: "STRATEGY_PACK",
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
    expect(heroBucket?.textContent).toContain("Mixed action: Bet small 70% / Check 30%.");
    expect(heroBucket?.textContent).toContain("Your action is part of this bucket mix.");
    expect(heroBucket?.textContent).toContain("Key features: top pair, range advantage.");
    expect(heroBucket?.textContent).not.toContain("internal-test-pack");
    expect(heroBucket?.textContent).not.toContain("internal-test-rule");
    expect(heroBucket?.textContent).not.toContain("https://");
    const result = root.querySelector<HTMLElement>(".postflop-result");
    expect(result?.textContent).toContain("Production model");
    expect(result?.textContent).not.toContain("Heuristic model");
    expect(result?.textContent).not.toContain("internal-test-pack");
    expect(result?.textContent).not.toContain("internal-test-rule");
    expect(result?.textContent).not.toContain("https://");
  });

  it("skryje exact frequency hodnoty pro kvalitativni mixed-action bucket", () => {
    const resolver: PostflopStrategyResolver = (input) => ({
      action: "BET_SMALL",
      explanation: "Qualitative mix fixture.",
      source: {
        kind: "STRATEGY_PACK",
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
    expect(heroBucket?.textContent).toContain("Mixed action: Bet small / Check.");
    expect(heroBucket?.textContent).toContain("Exact frequencies are hidden for this bucket.");
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
    expect(css).toContain(".postflop-seat__role-chip--aggressor");
    expect(css).toContain(".postflop-seat__role-chip--oop");
    expect(css).toContain(".postflop-flopzilla__header-cell--row{position:sticky");
    expect(css).toContain(".postflop-flopzilla__header-cell--corner{top:0;z-index:3;}");
    expect(css).toContain(".postflop-flopzilla__header,.postflop-flopzilla__hint");
    expect(css).toContain(".postflop-range-summary__hero-bucket{align-items:flex-start;flex-direction:column;}");
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
      .toContain("Baseline heuristic");
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
      .toBe("Next Turn");

    root.querySelector<HTMLButtonElement>(".postflop-line-next")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-question-title")?.textContent)
      .toBe("Hand line 2/3");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("TURN");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.streetIndex).toBe("1");
    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    expect(root.querySelector<HTMLButtonElement>(".postflop-line-next")?.textContent)
      .toBe("Next River");

    root.querySelector<HTMLButtonElement>(".postflop-line-next")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-question-title")?.textContent)
      .toBe("Hand line 3/3");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.streetIndex).toBe("2");
    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    const complete = root.querySelector<HTMLElement>(".postflop-line-complete");
    expect(complete?.textContent).toMatch(/^Hand line complete: \d\/3 streets\.$/);
    expect(complete?.dataset.totalStreets).toBe("3");
    expect(completedLines).toHaveLength(1);
    expect(completedLines[0].streets).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(completedLines[0].chosenStreets).toEqual(["FLOP", "RIVER", "TURN"]);
    expect(completedLines[0].completedAt).toBeGreaterThanOrEqual(completedLines[0].startedAt);
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
    expect(result?.textContent).toContain("Heuristic model");
    expect(result?.textContent).toContain("Confidence: low");
    expect(result?.textContent).not.toContain("StrategyPack");
    expect(result?.textContent).not.toContain("Rule:");
    expect(result?.textContent).not.toContain("https://");
    expect(root.querySelector(".postflop-range-summary")).toBeNull();
  });
});
