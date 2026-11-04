// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BlindSpeed,
  EvModel,
  TableFormat,
} from "../../src/core/trainingProfile";
import type { AnteMode } from "../../src/core/types";
import type { PostflopAction, PostflopPotType } from "../../src/core/postflopGenerator";
import type { PostflopActionNode } from "../../src/core/postflopTrainingSpot";
import { renderPostflopView } from "../../src/ui/postflopView";

interface MttHandLineScenario {
  name: string;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  ante: AnteMode;
  seed: number;
  potType?: PostflopPotType;
  actionNode?: PostflopActionNode;
  actions: readonly PostflopAction[];
  expectedStreets: readonly string[];
  expectedActions: readonly PostflopAction[];
}

const scenarios: readonly MttHandLineScenario[] = [
  {
    name: "9-max regular chipEV ante-on SRP barrel line",
    tableFormat: "FULL_RING_9",
    blindSpeed: "REGULAR",
    evModel: "CHIP_EV",
    ante: "ON",
    seed: 42,
    actions: ["CHECK", "CHECK", "CHECK"],
    expectedStreets: ["FLOP", "TURN", "RIVER"],
    expectedActions: ["CHECK", "CHECK", "CHECK"],
  },
  {
    name: "9-max turbo $EV no-ante 3bet line",
    tableFormat: "FULL_RING_9",
    blindSpeed: "TURBO",
    evModel: "DOLAR_EV",
    ante: "OFF",
    seed: 101,
    potType: "THREE_BET_POT",
    actions: ["BET_SMALL", "BET_SMALL", "BET_BIG"],
    expectedStreets: ["FLOP", "TURN", "RIVER"],
    expectedActions: ["BET_SMALL", "BET_SMALL", "BET_BIG"],
  },
  {
    name: "6-max regular chipEV ante-on facing-bet call-fold branch",
    tableFormat: "SIX_MAX",
    blindSpeed: "REGULAR",
    evModel: "CHIP_EV",
    ante: "ON",
    seed: 42,
    actionNode: "FLOP_FACING_BET",
    actions: ["CALL", "FOLD"],
    expectedStreets: ["FLOP", "TURN"],
    expectedActions: ["CALL", "FOLD"],
  },
  {
    name: "6-max turbo $EV no-ante river pressure line",
    tableFormat: "SIX_MAX",
    blindSpeed: "TURBO",
    evModel: "DOLAR_EV",
    ante: "OFF",
    seed: 202,
    actions: ["BET_BIG", "CHECK", "BET_BIG"],
    expectedStreets: ["FLOP", "TURN", "RIVER"],
    expectedActions: ["BET_BIG", "CHECK", "BET_BIG"],
  },
];

describe("MTT hand-line QA matrix", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(scenarios)("$name", async (scenario) => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const completed: Array<{
      streets: readonly string[];
      actions: readonly PostflopAction[];
      total: number;
    }> = [];

    renderPostflopView(root, {
      initialSeed: scenario.seed,
      initialStreet: "FLOP",
      initialPotType: scenario.potType,
      initialActionNode: scenario.actionNode,
      onLineCompleted: (line) => {
        completed.push({
          streets: line.streets.map((street) => street.street),
          actions: line.actionHistory.map((action) => action.action),
          total: line.streets.length,
        });
      },
    });

    root.querySelector<HTMLSelectElement>(".postflop-mode")!.value = "line";
    root.querySelector<HTMLButtonElement>(".postflop-generate")?.click();
    // Od 4. 11. 2026 jen nová obrazovka; linka se rozdává asynchronně.
    await vi.waitFor(() => {
      expect(root.querySelector(TRAINER)).not.toBeNull();
    }, { timeout: 20000 });
    const screen = root.querySelector<HTMLElement>(TRAINER)!;

    scenario.actions.forEach((action, index) => {
      expect(screen.dataset.lineIndex).toBe(String(index));
      expect(screen.dataset.street).toBe(scenario.expectedStreets[index]);
      expect(screen.dataset.mode).toBe("line");
      clickAction(root, action);

      if (index < scenario.actions.length - 1) {
        screen.querySelector<HTMLButtonElement>(".dx-trainer__next")?.click();
      }
    });

    expect(completed).toEqual([{
      streets: scenario.expectedStreets,
      actions: scenario.expectedActions,
      total: scenario.expectedStreets.length,
    }]);
    expect(screen.querySelector<HTMLElement>(".dx-trainer__line-done")?.dataset.total)
      .toBe(String(scenario.expectedStreets.length));
    expect(root.textContent).not.toMatch(/\bhttps?:\/\//i);
    expect(root.textContent).not.toMatch(/\b(?:StrategyPack|RangePack)\b/);
    expect(root.textContent).not.toMatch(/\bmtt-[a-z0-9-]+/i);
    expect(root.textContent).not.toMatch(/\b(?:FULL_RING_9|SIX_MAX|CHIP_EV|DOLAR_EV)\b/);
  });
});

const TRAINER = ".postflop-output .dx-trainer";

function clickAction(root: HTMLElement, action: PostflopAction): void {
  const button = root.querySelector<HTMLButtonElement>(`${TRAINER} .dx-trainer__actions button[data-action="${action}"]`);
  expect(button, `Expected action button ${action}`).not.toBeNull();
  button?.click();
}
