import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";

import { generatePostflopSpot } from "../src/core/postflopGenerator.ts";
import { postflopSpotToTrainingSpot } from "../src/core/postflopTrainingSpot.ts";
import type { Card, Spot, TableState } from "../src/core/types.ts";
import type { RangeStore } from "../src/data/rangeStore.ts";
import { renderMatrix } from "../src/ui/rangeMatrixView.ts";
import { renderPostflopRangeMatrix } from "../src/ui/postflopRangeMatrixView.ts";
import { renderTable } from "../src/ui/tableRenderer.ts";

const ITERATIONS = numberFromEnv("RENDER_PROFILE_ITERATIONS", 40);
const WARN_AVG_MS = numberFromEnv("RENDER_PROFILE_WARN_AVG_MS", 35);

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "s" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  // Povinné pole, které tu chybělo. `TableState` ho zavedl místo dřívějšího
  // `shortStack: boolean`, protože jediný příznak sléval tři různé hloubky, ve
  // kterých shove končí. Profiler bez něj stavěl neplatný stav a jen díky
  // nekontrolovanému `scripts/` to nikdo neviděl.
  effectiveStackBB: 100,
  limpsBefore: 0,
  callsBefore: 1,
  facing: "OPEN",
  isBvB: false,
};

const spot: Spot = {
  id: "VS_OPEN|BTN|25|AKs|ON",
  context: "VS_OPEN",
  heroPos: "BTN",
  effStack: 25,
  ante: "ON",
  pushFold: false,
  hand: "AKs",
  heroCards,
  tableState,
  answers: [
    { key: "FOLD", label: "Fold" },
    { key: "CALL", label: "Call" },
    { key: "3BET", label: "3-bet" },
  ],
  correctKeys: ["CALL"],
  strictCorrect: ["CALL"],
  explanation: "Profile fixture.",
  startingPot: 2.5,
};

const rangeStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => ({
    actions: {
      AA: ["3BET"],
      KK: ["3BET"],
      QQ: ["3BET"],
      JJ: ["CALL"],
      AKs: ["CALL"],
      AQs: ["CALL"],
      AKo: ["CALL"],
      T9s: ["CALL"],
    },
    strict: {
      AA: ["3BET"],
      KK: ["3BET"],
      QQ: ["3BET"],
      JJ: ["CALL"],
      AKs: ["CALL"],
      AQs: ["CALL"],
      AKo: ["CALL"],
      T9s: ["CALL"],
    },
  }),
};

const postflopSpot = postflopSpotToTrainingSpot(generatePostflopSpot({
  seed: 1788246284,
  street: "FLOP",
  heroCards,
}));

console.log("\n=== Render profile ===");
console.log(`iterations: ${ITERATIONS}`);
console.log(`warn avg threshold: ${WARN_AVG_MS} ms`);

profile("preflop range matrix 13x13", () => {
  const root = document.createElement("div");
  renderMatrix(spot, rangeStore, root);
});

profile("preflop table", () => {
  const root = document.createElement("div");
  renderTable(spot, "ON", root);
});

profile("postflop Flopzilla matrix 13x13", () => {
  const root = document.createElement("div");
  renderPostflopRangeMatrix(postflopSpot, root);
});

function profile(name: string, run: () => void): void {
  const samples: number[] = [];
  run();

  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }

  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const status = avg > WARN_AVG_MS ? "WARN" : "OK";
  console.log(
    `${name}: ${status} avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms`,
  );
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}
