// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { renderPostflopView } from "../../src/ui/postflopView";
import { renderProfileSelector } from "../../src/ui/profileSelector";
import { renderRangeModalButton } from "../../src/ui/rangeModal";
import type { RangeStore } from "../../src/data/rangeStore";
import type { Card, Spot, TableState } from "../../src/core/types";

const FORBIDDEN_SOURCE_TEXT = [
  "https://",
  "http://",
  "GTO Wizard",
  "Upswing",
  "ICMIZER",
  "HoldemResources",
  "GTO Hero",
  "Poker Academy",
  "BBZ Poker",
  "GTO Sims",
  "PokerCoaching",
  "GTOBase",
];

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "s" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "NONE",
  isBvB: false,
};

const spot: Spot = {
  id: "RFI|BTN|25|AKs|OFF",
  context: "RFI",
  heroPos: "BTN",
  effStack: 25,
  ante: "OFF",
  pushFold: false,
  hand: "AKs",
  heroCards,
  tableState,
  answers: [{ key: "OPEN_2X", label: "Raise 2x" }],
  correctKeys: ["OPEN_2X"],
  strictCorrect: ["OPEN_2X"],
  explanation: "Testovaci spot.",
};

const loadedStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => ({
    actions: { AKs: ["OPEN_2X"] },
    strict: { AKs: ["OPEN_2X"] },
  }),
};

describe("UI source citation policy", () => {
  it("nezobrazuje URL ani provider citace v profile selectoru", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const profiles = [
      profileWith(DEFAULT_TRAINING_PROFILE, { tableFormat: "SIX_MAX" }),
      profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "SNG",
        tableFormat: "SIX_MAX",
        blindSpeed: "TURBO",
        evModel: "ICM",
      }),
      profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "CASH",
        tableFormat: "SIX_MAX",
        ante: "OFF",
        rakeMode: "RAKE",
      }),
    ];

    const view = renderProfileSelector(root);
    for (const profile of profiles) {
      view.setProfile(profile);
      expectNoSourceCitation(root.textContent ?? "");
    }
  });

  it("nezobrazuje URL ani provider citace v range modal metadatech", () => {
    const root = document.createElement("div");

    renderRangeModalButton(spot, loadedStore, root);
    root.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    expectNoSourceCitation(document.querySelector<HTMLElement>(".range-modal")?.textContent ?? "");
    document.querySelector<HTMLButtonElement>(".range-modal__close")?.click();
  });

  it("nezobrazuje URL ani provider citace v postflop vysvetleni", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialStreet: "RIVER" });

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expectNoSourceCitation(root.querySelector<HTMLElement>(".postflop-result")?.textContent ?? "");
  });
});

function expectNoSourceCitation(text: string): void {
  for (const forbidden of FORBIDDEN_SOURCE_TEXT) {
    expect(text).not.toContain(forbidden);
  }
  expect(text.toLowerCase()).not.toContain("zdroj");
}
