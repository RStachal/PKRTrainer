import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import { buildStatsV2KpiModel } from "../../src/persistence/statsV2Analytics";

// Streaks and the recent window are claims about time, and the KPI model read
// them off array position. Two other places in this codebase that need
// chronology - the accuracy trend and the study recommendations - both sort by
// ts first, so the inconsistency was already visible.
//
// It matters because import replaces the whole store with the order of the file
// it was given. The app offers export and import as the way to move stats between
// devices and has no merge, so combining two devices means pasting two exports
// together by hand, and nothing puts the result back in time order.

function answer(ts: number, correct: boolean, responseMs?: number): ResultRecord {
  return {
    qid: `RFI|BTN|25|AKs|${ts}`,
    chosen: correct ? "OPEN_2X" : "FOLD",
    correct,
    context: "RFI",
    position: "BTN",
    bucket: 25,
    ts,
    ...(responseMs === undefined ? {} : { responseMs }),
  };
}

// Two devices, pasted one after the other: device A's whole history, then
// device B's. In time order the player's last three answers are all correct.
const shuffled = migrateResultRecordsToV2([
  answer(10, true),
  answer(20, true),
  answer(30, true),
  answer(1, false),
  answer(2, false),
  answer(3, false),
]);

const chronological = migrateResultRecordsToV2([
  answer(1, false),
  answer(2, false),
  answer(3, false),
  answer(10, true),
  answer(20, true),
  answer(30, true),
]);

describe("statsV2 KPI chronology", () => {
  it("counts the current streak from the newest answer, not the last array slot", () => {
    expect(buildStatsV2KpiModel(shuffled).currentStreak).toBe(3);
  });

  it("gives the same model whatever order the records arrive in", () => {
    // The strongest form of the property: order is not information.
    expect(buildStatsV2KpiModel(shuffled)).toEqual(buildStatsV2KpiModel(chronological));
  });

  it("fills the recent window with the newest answers", () => {
    const model = buildStatsV2KpiModel(shuffled, { recentWindowSize: 3 });
    expect(model.recentTotal).toBe(3);
    expect(model.recentCorrect).toBe(3);
    expect(model.recentRate).toBe(100);
  });

  it("averages response time over the newest answers too", () => {
    const timed = migrateResultRecordsToV2([
      answer(10, true, 500),
      answer(1, false, 4000),
    ]);
    const model = buildStatsV2KpiModel(timed, { recentWindowSize: 1 });
    expect(model.recentAvgResponseMs).toBe(500);
    expect(model.avgResponseMs).toBe(2250);
  });

  it("keeps the best streak a property of the whole history", () => {
    // Best streak does not depend on the window, only on the order, so it is the
    // clearest signal that the reordering happened at all.
    expect(buildStatsV2KpiModel(shuffled).bestStreak).toBe(3);
  });

  it("leaves an already-ordered store untouched", () => {
    const model = buildStatsV2KpiModel(chronological);
    expect(model.currentStreak).toBe(3);
    expect(model.total).toBe(6);
    expect(model.lifetimeRate).toBe(50);
  });
});
