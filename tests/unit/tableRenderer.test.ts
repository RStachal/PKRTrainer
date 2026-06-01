// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { renderTable } from "../../src/ui/tableRenderer";
import type { Card, Spot, TableState } from "../../src/core/types";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "h" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "OPEN",
  isBvB: false,
};

const spot: Spot = {
  id: "VS_OPEN|BTN|25|AKo|ON",
  context: "VS_OPEN",
  heroPos: "BTN",
  effStack: 25,
  ante: "ON",
  pushFold: false,
  hand: "AKo",
  heroCards,
  tableState,
  answers: [
    { key: "FOLD", label: "Fold" },
    { key: "CALL", label: "Call / Dorovnat" },
    { key: "3BET", label: "3-bet" },
  ],
  correctKeys: ["CALL"],
  strictCorrect: ["CALL"],
  explanation: "Testovací spot.",
  startingPot: 2.5,
};

describe("tableRenderer - DOM vykresleni stolu", () => {
  it("vykresli 9 sedadel, jednoho hrdinu, karty, odznaky a blind/button znacky", () => {
    const root = document.createElement("div");
    renderTable(spot, "ON", root);

    const seats = Array.from(root.querySelectorAll<HTMLElement>(".seat"));
    const positions = seats.map((seat) => seat.dataset.position);

    expect(seats).toHaveLength(9);
    expect(new Set(positions).size).toBe(9);
    expect(root.querySelectorAll(".seat--hero")).toHaveLength(1);
    expect(root.querySelectorAll(".hero-cards .hole-card")).toHaveLength(2);
    expect(root.querySelectorAll(".action-badge").length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".badge-btn")).toHaveLength(1);
    expect(root.querySelectorAll(".badge-sb")).toHaveLength(1);
    expect(root.querySelectorAll(".badge-bb")).toHaveLength(1);
    expect(root.querySelectorAll(".seat--folded").length).toBeGreaterThan(0);

    const pot = root.querySelector<HTMLElement>(".pot");
    expect(pot?.textContent).toBe("Pot: 2.5 BB");
  });
});
