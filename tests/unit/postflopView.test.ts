// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderPostflopView } from "../../src/ui/postflopView";

describe("postflopView - DOM", () => {
  it("vykresli postflop prototyp a respektuje seed i street", () => {
    const root = document.createElement("div");
    renderPostflopView(root);

    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(0);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(0);

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    const street = root.querySelector<HTMLSelectElement>(".postflop-street");
    seed!.value = "42";
    street!.value = "RIVER";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(root.querySelector(".postflop-new-spot")).not.toBeNull();
    expect(root.querySelector(".postflop-change-situation")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.seed).toBe("42");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.positionPattern)
      .toMatch(/^(EP_VS_BB|BTN_VS_BB|SB_VS_BB|OOP_RAISER_VS_IP_CALLER|OOP_CALLER_VS_IP_3BETTOR)$/);
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent).toContain("SPR");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent).toContain(" vs ");
    expect(root.querySelector(".postflop-table")).not.toBeNull();
    expect(root.querySelector(".postflop-table__rail")).not.toBeNull();
    expect(root.querySelector(".postflop-table__center-label")).not.toBeNull();
    expect(root.querySelectorAll(".postflop-seat")).toHaveLength(9);
    expect(root.querySelectorAll(".postflop-seat--active")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-seat__badge")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-seat__stack-bar")).toHaveLength(2);
    expect(root.querySelectorAll(".postflop-table__board .postflop-card")).toHaveLength(5);
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(7);
    expect(root.querySelectorAll(".postflop-texture").length).toBeGreaterThan(0);
  });

  it("oddeli zadani situace od postflop otazky a umi se vratit", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialSeed: 42, initialStreet: "FLOP" });

    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-controls")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(false);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(3);
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
    expect(root.querySelector(".postflop-card")).toBeNull();
    expect(root.querySelector(".postflop-table")).toBeNull();
    expect(root.querySelector(".postflop-action")).toBeNull();
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
      if (result?.textContent?.includes("Heuristicky model")) break;
    }

    expect(result?.hidden).toBe(false);
    expect(result?.textContent).toContain("Doporu\u010deno");
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
    expect(rangeSummary?.textContent).toContain("Value");
    expect(rangeSummary?.textContent).toContain("Bluffs");
    expect(rangeSummary?.textContent).toContain("Check");
    expect(root.querySelectorAll(".postflop-flopzilla__cell")).toHaveLength(169);
    expect(root.querySelector(".postflop-flopzilla__cell--hero")).not.toBeNull();
    expect(root.querySelector(".postflop-flopzilla__legend")).not.toBeNull();
    expect(result?.textContent).toContain("Value range");
    expect(result?.textContent).toContain("Model");
    expect(result?.textContent).toContain("Heuristicky model");
    expect(result?.textContent).not.toContain("StrategyPack");
    expect(result?.textContent).not.toContain("Rule:");
    expect(result?.textContent).not.toContain("Pack:");
    expect(result?.textContent).not.toContain("https://");
    expect(result?.textContent).toContain("Shoda textur:");
    expect(result?.textContent).toContain("SPR okno:");
    expect(result?.textContent).not.toContain("Duvod vyberu:");
    expect(result?.textContent).toContain("Predpoklad 1:");
    expect(result?.textContent).toContain("Plan");
  });

  it("po odpovedi zavola callback s postflop training spotem", () => {
    const root = document.createElement("div");
    const answered: string[] = [];
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      autoGenerate: true,
      onAnswered: (spot, chosen) => answered.push(`${spot.street}|${spot.actionNode}|${chosen}`),
    });

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expect(answered).toHaveLength(1);
    expect(answered[0]).toContain("FLOP|SINGLE_RAISED_POT_CBET|");
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
      .toContain("Zakladni heuristika");
    expect(root.querySelector<HTMLElement>(".postflop-result")?.textContent)
      .not.toContain("https://");
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
      if (result?.textContent?.includes("Heuristicky model")) break;
    }

    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(result?.textContent).toContain("Heuristicky model");
    expect(result?.textContent).toContain("Jistota: nizka");
    expect(result?.textContent).not.toContain("StrategyPack");
    expect(result?.textContent).not.toContain("Rule:");
    expect(result?.textContent).not.toContain("https://");
    expect(root.querySelector(".postflop-range-summary")).toBeNull();
  });
});
