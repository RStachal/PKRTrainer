// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { PostflopTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import {
  bridgePostflopResultRecordToStatsV2,
  breakdownPostflopStats,
  buildPostflopResultRecord,
  isJudgedPostflopRecord,
  isPostflopResultRecord,
  isPostflopStatsV2BridgeRecord,
  normalizePostflopStatsV2BridgeRecord,
  type PostflopStatsV2BridgeRecord,
} from "../../src/persistence/postflopResultRecord";
import { createStatsStore } from "../../src/persistence/statsStore";
import { renderDashboard } from "../../src/ui/dashboard";

/**
 * Neposouzená odpověď není chyba (fáze 1 redesignu, 3. 11. 2026).
 *
 * Akce, kterou vyřešený obsah nemodeluje, dostávala `correct: false` a nic dál
 * `unsolved` nečetlo, přestože `postflopScoring.ts` výslovně říká, že to
 * statistika rozlišit musí. Na riveru to v srpnu 2026 postihlo 104 z 300 spotů:
 * hráč dostal do úspěšnosti chybu za to, co nikdo nespočítal.
 */
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number { return this.items.size; }
  clear(): void { this.items.clear(); }
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.items.keys())[index] ?? null; }
  removeItem(key: string): void { this.items.delete(key); }
  setItem(key: string, value: string): void { this.items.set(key, value); }
}

/** Spot, jehož vyřešený obsah zná jen check a malý bet - velký bet ne. */
function spotWithoutBigBet(): PostflopTrainingSpot {
  const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
    seed: 11,
    street: "FLOP",
    positionContext: {
      heroPosition: "BTN",
      villainPosition: "BB",
      aggressorPosition: "BTN",
      callerPosition: "BB",
      inPosition: true,
      callerType: "BIG_BLIND",
      positionPattern: "BTN_VS_BB",
    },
  }));
  return {
    ...spot,
    recommendedAction: "CHECK",
    actionEvs: {
      source: "SOLVED_TREE",
      unit: "BB",
      values: [
        { action: "CHECK", evBb: 1.2 },
        { action: "BET_SMALL", evBb: 1.1 },
      ],
      equivalentThresholdBb: 0.05,
      acceptableThresholdBb: 0.25,
    },
  };
}

describe("neposouzená postflopová odpověď ve statistice", () => {
  it("záznam ji nese a most do statistik v2 ji nepřepíše", () => {
    const spot = spotWithoutBigBet();
    const record = buildPostflopResultRecord(spot, "BET_BIG", 10);
    expect(record.correct).toBe(false);
    expect(record.unsolved).toBe(true);
    expect(isPostflopResultRecord(record)).toBe(true);

    const bridge = bridgePostflopResultRecordToStatsV2(record);
    expect(bridge.unsolved).toBe(true);
    expect(isPostflopStatsV2BridgeRecord(bridge)).toBe(true);
    expect(normalizePostflopStatsV2BridgeRecord(bridge).unsolved).toBe(true);
    expect(isJudgedPostflopRecord(bridge)).toBe(false);
  });

  it("posouzená odpověď pole nemá - ani špatná", () => {
    const record = buildPostflopResultRecord(spotWithoutBigBet(), "BET_SMALL", 10);
    expect(record.unsolved).toBeUndefined();
    expect(isJudgedPostflopRecord(bridgePostflopResultRecordToStatsV2(record))).toBe(true);
  });

  it("validátor nevezme jinou hodnotu než true - import nesmí propašovat nesmysl", () => {
    const bridge = bridgePostflopResultRecordToStatsV2(buildPostflopResultRecord(spotWithoutBigBet(), "BET_BIG", 10));
    expect(isPostflopStatsV2BridgeRecord({ ...bridge, unsolved: false })).toBe(false);
    expect(isPostflopStatsV2BridgeRecord({ ...bridge, unsolved: "ano" })).toBe(false);
  });

  it("rozpad úspěšnosti ji nepočítá ani do celku, ani do správných", () => {
    const spot = spotWithoutBigBet();
    const judged = bridgePostflopResultRecordToStatsV2(buildPostflopResultRecord(spot, "CHECK", 1));
    const unsolved = bridgePostflopResultRecordToStatsV2(buildPostflopResultRecord(spot, "BET_BIG", 2));
    expect(breakdownPostflopStats([judged, unsolved], "street")).toEqual([
      { key: "FLOP", total: 1, correct: 1, rate: 100 },
    ]);
  });

  it("přehled ji nepočítá do úspěšnosti a řekne, kolik takových je", () => {
    const spot = spotWithoutBigBet();
    const judged: PostflopStatsV2BridgeRecord = bridgePostflopResultRecordToStatsV2(
      buildPostflopResultRecord(spot, "CHECK", 1),
    );
    const unsolved = bridgePostflopResultRecordToStatsV2(buildPostflopResultRecord(spot, "BET_BIG", 2));
    const root = document.createElement("div");
    renderDashboard({
      store: createStatsStore(new MemoryStorage()),
      sessionCount: 2,
      postflopRecords: [judged, unsolved],
    }, root);

    const breakdowns = root.querySelector<HTMLElement>(".postflop-breakdowns");
    expect(breakdowns?.dataset.total).toBe("2");
    expect(breakdowns?.dataset.unsolved).toBe("1");
    expect(root.querySelector(".postflop-breakdowns__unsolved")?.textContent).toMatch(/1/);
    const flow = root.querySelector<HTMLElement>('[data-dim="flowMode"] [data-group="SINGLE_SPOT"]');
    expect(flow?.dataset.total).toBe("1");
    expect(flow?.dataset.rate).toBe("100");
  });
});
