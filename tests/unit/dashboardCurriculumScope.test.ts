// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createStatsStore, PREFLOP_RESULT_IDENTITY_SCHEMA } from "../../src/persistence/statsStore";
import type { PreflopResultIdentity, ResultRecord } from "../../src/persistence/statsStore";
import { renderDashboard } from "../../src/ui/dashboard";

// The user-visible half of the profile scope. A percentage with no statement of
// which table it describes is worse than no percentage: the player reads it as
// their number and drills accordingly.

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

const ANTE_ON = "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE";
const ANTE_OFF = "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|OFF|NONE";

function identity(profileId: string, index: number): PreflopResultIdentity {
  const parts = profileId.split("|");
  return {
    schema: PREFLOP_RESULT_IDENTITY_SCHEMA,
    scenarioId: `RFI|BTN|25|${index}`,
    profileId,
    gameVariant: parts[0] as PreflopResultIdentity["gameVariant"],
    tableFormat: parts[1] as PreflopResultIdentity["tableFormat"],
    blindSpeed: parts[2] as PreflopResultIdentity["blindSpeed"],
    street: parts[3] as PreflopResultIdentity["street"],
    evModel: parts[4] as PreflopResultIdentity["evModel"],
    ante: parts[5] as PreflopResultIdentity["ante"],
    rakeMode: parts[6] as PreflopResultIdentity["rakeMode"],
    rangePackId: "mtt-pack",
    rangePackVersion: "1.0.0",
    sourceVerifiedAt: "2026-01-01",
    scoringMode: "LENIENT",
  };
}

function answer(profileId: string, index: number, correct: boolean): ResultRecord {
  return {
    qid: `RFI|BTN|25|AKs|${index}`,
    chosen: correct ? "OPEN_2X" : "FOLD",
    correct,
    context: "RFI",
    position: "BTN",
    bucket: 25,
    ts: index,
    identity: identity(profileId, index),
  };
}

function dashboardFor(activeProfileId?: string): HTMLElement {
  const store = createStatsStore(new MemoryStorage());
  for (let index = 1; index <= 8; index += 1) {
    expect(store.record(answer(ANTE_OFF, index, false)).ok).toBe(true);
  }
  for (let index = 9; index <= 16; index += 1) {
    expect(store.record(answer(ANTE_ON, index, true)).ok).toBe(true);
  }
  const root = document.createElement("div");
  renderDashboard({ store, sessionCount: 0, activeProfileId }, root);
  return root;
}

describe("dashboard curriculum scope", () => {
  it("states which profile the plan was measured in and what it left out", () => {
    const scope = dashboardFor(ANTE_OFF).querySelector<HTMLElement>(".preflop-curriculum__scope");

    expect(scope).not.toBeNull();
    expect(scope!.textContent).toContain("8");
  });

  it("offers nothing to drill in a profile the player is not losing in", () => {
    // Eight from eight correct on the ante table. Pooled with the other profile
    // it would read 50% and produce a recommendation for a table they are fine at.
    const panel = dashboardFor(ANTE_ON).querySelector<HTMLElement>(".preflop-curriculum");

    expect(panel!.dataset.scopeProfileId).toBe(ANTE_ON);
    expect(panel!.dataset.scopeSetAside).toBe("8");
    expect(panel!.dataset.available).toBe("false");
    expect(panel!.querySelector(".preflop-curriculum__start")).toBeNull();
  });

  it("still recommends where there is something to fix", () => {
    const panel = dashboardFor(ANTE_OFF).querySelector<HTMLElement>(".preflop-curriculum");

    expect(panel!.dataset.available).toBe("true");
    expect(panel!.querySelector(".preflop-curriculum__start")).not.toBeNull();
  });

  it("falls back to the newest answer rather than to pooling", () => {
    // No active profile given. The old behaviour would have mixed both and found
    // a leak; following the newest answer keeps it inside one profile.
    const panel = dashboardFor().querySelector<HTMLElement>(".preflop-curriculum");

    expect(panel!.dataset.scopeProfileId).toBe(ANTE_ON);
    expect(panel!.dataset.available).toBe("false");
  });
});
