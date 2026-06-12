import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import type { Card, Spot } from "../../src/core/types";
import { KEY_HH_REVIEWS } from "../../src/persistence/keys";
import {
  buildHHPostflopReviewRecord,
  buildHHPreflopReviewRecord,
  createHHReviewStore,
  isHHReviewRecord,
} from "../../src/persistence/hhReviewStore";

class MemoryStorage implements Storage {
  protected readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

class FailingWriteStorage extends MemoryStorage {
  failWrites = false;

  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("quota exceeded");
    super.setItem(key, value);
  }
}

const heroCards: [Card, Card] = [
  { rank: "K", suit: "s" },
  { rank: "Q", suit: "s" },
];

const preflopSpot: Spot = {
  id: "RFI|BTN|50|KQs|OFF",
  context: "RFI",
  heroPos: "BTN",
  effStack: 50,
  ante: "OFF",
  pushFold: false,
  hand: "KQs",
  heroCards,
  tableState: {
    heroPos: "BTN",
    pushFold: false,
    limpsBefore: 0,
    callsBefore: 0,
    facing: "NONE",
    isBvB: false,
  },
  answers: [{ key: "OPEN_25X", label: "Raise 2.5x" }],
  correctKeys: ["OPEN_25X"],
  strictCorrect: ["OPEN_25X"],
  explanation: "Review fixture.",
};

describe("hhReviewStore", () => {
  it("uklada HH review oddelene od drill statistik", () => {
    const storage = new MemoryStorage();
    const store = createHHReviewStore(storage);
    const preflop = buildHHPreflopReviewRecord(preflopSpot, "OPEN_25X", true, 100);
    const flop = buildHHPostflopReviewRecord(postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 1,
      street: "FLOP",
      heroCards,
      board: [
        { rank: "A", suit: "h" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
      ],
      positionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
    })), 100);

    expect(store.replaceAll([preflop, flop]).ok).toBe(true);

    const raw = storage.getItem(KEY_HH_REVIEWS);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "[]") as unknown[];
    expect(parsed).toHaveLength(2);
    expect(parsed.every(isHHReviewRecord)).toBe(true);
    expect(parsed[0]).toMatchObject({
      street: "PREFLOP",
      savedToDrillStats: false,
      chosen: "OPEN_25X",
      correct: true,
    });
    expect(parsed[1]).toMatchObject({
      street: "FLOP",
      savedToDrillStats: false,
      board: ["Ah", "7d", "2c"],
      positionPattern: "BTN_VS_BB",
    });
    expect(store.events()).toEqual(parsed);
  });

  it("pri selhani zapisu ponecha predchozi review log beze zmeny", () => {
    const storage = new FailingWriteStorage();
    const store = createHHReviewStore(storage);
    const first = buildHHPreflopReviewRecord(preflopSpot, "OPEN_25X", true, 100);
    const second = buildHHPreflopReviewRecord(preflopSpot, undefined, undefined, 200);

    expect(store.record(first).ok).toBe(true);
    const prior = storage.getItem(KEY_HH_REVIEWS);
    storage.failWrites = true;

    const result = store.record(second);

    expect(result.ok).toBe(false);
    expect(storage.getItem(KEY_HH_REVIEWS)).toBe(prior);
    expect(store.events()).toEqual([first]);
  });
});
