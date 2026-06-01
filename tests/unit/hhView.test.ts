// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { renderHHView } from "../../src/ui/hhView";

const validHh = [
  "PokerStars Hand #1: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #1 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain2: posts small blind 10",
  "Villain3: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ah Kd]",
  "Hero: folds",
  "*** SUMMARY ***",
].join("\n");

describe("hhView - DOM import", () => {
  it("zobrazi chyby a necitelna pole pro prazdny vstup bez padu", () => {
    const root = document.createElement("div");
    renderHHView(root);

    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const errors = root.querySelector<HTMLElement>(".hh-errors");
    const unreadable = root.querySelector<HTMLElement>(".hh-unreadable");
    expect(errors?.hidden).toBe(false);
    expect(errors?.textContent).toContain("prázdný");
    expect(unreadable?.hidden).toBe(false);
    expect(unreadable?.textContent).toContain("pozice");
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("vykresli kompatibilni HH jako stul a zavola callback", () => {
    const root = document.createElement("div");
    const importedIds: string[] = [];
    renderHHView(root, { onSpotBuilt: (spot) => importedIds.push(spot.id) });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    expect(root.querySelector(".poker-table")).not.toBeNull();
    expect(root.querySelectorAll(".seat")).toHaveLength(9);
    expect(root.querySelectorAll(".hole-card")).toHaveLength(2);
    expect(importedIds).toHaveLength(1);
    expect(importedIds[0]).toContain("HJ|50|AKo");
  });
});
