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
    expect(root.querySelectorAll(".postflop-card")).toHaveLength(7);
    expect(root.querySelectorAll(".postflop-texture").length).toBeGreaterThan(0);
  });
});
