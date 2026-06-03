// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderPostflopView } from "../../src/ui/postflopView";

describe("postflopView - DOM", () => {
  it("vykresli postflop prototyp a respektuje seed i street", () => {
    const root = document.createElement("div");
    renderPostflopView(root);

    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(5);
    expect(root.querySelectorAll(".postflop-action")).toHaveLength(3);

    const seed = root.querySelector<HTMLInputElement>(".postflop-seed");
    const street = root.querySelector<HTMLSelectElement>(".postflop-street");
    seed!.value = "42";
    street!.value = "RIVER";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();

    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.seed).toBe("42");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.positionPattern)
      .toMatch(/^(EP_VS_BB|BTN_VS_BB|SB_VS_BB|OOP_RAISER_VS_IP_CALLER)$/);
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent).toContain("SPR");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent).toContain(" vs ");
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(7);
    expect(root.querySelectorAll(".postflop-texture").length).toBeGreaterThan(0);
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
      if (result?.textContent?.includes("Heuristicky StrategyPack")) break;
    }

    expect(result?.hidden).toBe(false);
    expect(result?.textContent).toContain("Doporu\u010deno");
    expect(root.querySelectorAll<HTMLButtonElement>(".postflop-action:disabled"))
      .toHaveLength(3);
    expect(root.querySelector(".postflop-action--recommended")).not.toBeNull();
    expect(root.querySelectorAll(".postflop-practical__block")).toHaveLength(5);
    expect(result?.textContent).toContain("Value range");
    expect(result?.textContent).toContain("Model");
    expect(result?.textContent).toContain("Heuristicky StrategyPack");
    expect(result?.textContent).not.toContain("Pack:");
    expect(result?.textContent).not.toContain("https://");
    expect(result?.textContent).toContain("Shoda textur:");
    expect(result?.textContent).toContain("SPR rule:");
    expect(result?.textContent).toContain("Duvod vyberu:");
    expect(result?.textContent).toContain("Predpoklad 1:");
    expect(result?.textContent).toContain("Pl\u00e1n");
  });

  it("po odpovedi zavola callback s postflop training spotem", () => {
    const root = document.createElement("div");
    const answered: string[] = [];
    renderPostflopView(root, {
      initialSeed: 42,
      initialStreet: "FLOP",
      onAnswered: (spot, chosen) => answered.push(`${spot.street}|${spot.actionNode}|${chosen}`),
    });

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expect(answered).toHaveLength(1);
    expect(answered[0]).toContain("FLOP|SINGLE_RAISED_POT_CBET|");
  });

  it("umi zobrazit StrategyPack evidence pro river pressure spot", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialStreet: "RIVER" });

    let result: HTMLElement | null = null;
    for (let seed = 0; seed < 200; seed += 1) {
      root.querySelector<HTMLInputElement>(".postflop-seed")!.value = String(seed);
      root.querySelector<HTMLSelectElement>(".postflop-street")!.value = "RIVER";
      root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
      root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
      result = root.querySelector<HTMLElement>(".postflop-result");
      if (result?.textContent?.includes("Heuristicky StrategyPack")) break;
    }

    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(result?.textContent).toContain("Heuristicky StrategyPack");
    expect(result?.textContent).toContain("Jistota: LOW");
    expect(result?.textContent).not.toContain("https://");
  });
});
