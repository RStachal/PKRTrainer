import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
} from "../../src/core/types";
import {
  auditCurrentMttPreflopProductionPacks,
  buildMttPreflopSpeedDiffReport,
  renderMttPreflopSpeedDiffReport,
} from "../../src/data/ranges/mttPreflopRangeAudit";

const REQUIRED_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

describe("mttPreflopRangeAudit", () => {
  it("audituje soucasne MTT 9-max regular packy jako produkcni baseline", () => {
    const reports = auditCurrentMttPreflopProductionPacks();
    const expectedRecordCount = 487;
    const expectedCellCount = expectedRecordCount * ALL_HAND_CLASSES.length;

    expect(reports).toHaveLength(2);
    expect(reports.map((report) => report.ante)).toEqual(["ON", "OFF"]);

    for (const report of reports) {
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.confidence).toBe("MEDIUM");
      expect(report.recordCount).toBe(expectedRecordCount);
      expect(report.expectedRecordCount).toBe(expectedRecordCount);
      expect(report.normalizedCellCount).toBe(expectedCellCount);
      expect(report.expectedNormalizedCellCount).toBe(expectedCellCount);
      expect(report.totalExplicitHands + report.totalImpliedFolds).toBe(expectedCellCount);
      expect(report.sourceCount).toBeGreaterThanOrEqual(5);
      expect(report.searchQueryCount).toBeGreaterThanOrEqual(4);
      expect(report.coverage.positions).toEqual(POSITION_ORDER);
      expect(report.coverage.stackBuckets).toEqual(STACK_BUCKETS);
      expect(report.coverage.contexts).toEqual(REQUIRED_CONTEXTS);
      expect(report.coverage.missingPositions).toEqual([]);
      expect(report.coverage.missingStackBuckets).toEqual([]);
      expect(report.coverage.missingContexts).toEqual([]);
      expect(report.duplicateRecordKeys).toEqual([]);
      expect(report.invalidHandLabels).toEqual([]);
      expect(report.emptyStrictCells).toBe(0);
      expect(report.emptyLenientCells).toBe(0);
      expect(report.strictHandsMissingLenient).toBe(0);
      expect(Object.values(report.missingRepresentativeActions).flat()).toEqual([]);
    }
  });

  it("hlida representative action nodes proti nechtenemu zuzeni range map", () => {
    const reports = auditCurrentMttPreflopProductionPacks();

    for (const report of reports) {
      expect(report.actionCountsByContext.RFI.OPEN_25X).toBeGreaterThan(0);
      expect(report.actionCountsByContext.VS_LIMP.ISO_25X).toBeGreaterThan(0);
      expect(report.actionCountsByContext.VS_OPEN["3BET"]).toBeGreaterThan(0);
      expect(report.actionCountsByContext.VS_3BET["4BET"]).toBeGreaterThan(0);
      expect(report.actionCountsByContext.VS_4BET.JAM).toBeGreaterThan(0);
      expect(report.actionCountsByContext.SQUEEZE.SQUEEZE).toBeGreaterThan(0);
      expect(report.actionCountsByContext.BVB.OPEN_25X).toBeGreaterThan(0);
      expect(report.actionCountsByContext.PUSH_FOLD.JAM).toBeGreaterThan(0);
      expect(report.actionCountsByContext.VS_ALLIN.CALL_JAM).toBeGreaterThan(0);
    }
  });

  it("audituje regular-vs-turbo diff bez ticheho metadata-only reuse", () => {
    const report = buildMttPreflopSpeedDiffReport();

    expect(report.rows).toHaveLength(4);
    expect(report.comparableRows).toBe(0);
    expect(report.blockedRows).toBe(4);

    const fullRingOn = report.rows.find((row) => (
      row.tableFormat === "FULL_RING_9" && row.ante === "ON"
    ));
    expect(fullRingOn).toMatchObject({
      status: "BLOCKED",
      regularRecordCount: 487,
      turboRecordCount: 0,
      turboPackId: null,
    });
    expect(fullRingOn?.blockers).toContain("Turbo RangePack is missing.");
    expect(fullRingOn?.blockers).toContain("Turbo profile has no dedicated production RangePack.");

    const sixMaxOn = report.rows.find((row) => (
      row.tableFormat === "SIX_MAX" && row.ante === "ON"
    ));
    expect(sixMaxOn).toMatchObject({
      status: "BLOCKED",
      regularRecordCount: 0,
      turboRecordCount: 0,
      regularPackId: "mtt-six-max-regular-preflop-chip-ev-ante-on-candidate-v0",
      turboPackId: "mtt-six-max-turbo-preflop-chip-ev-ante-on-candidate-v0",
    });
    expect(sixMaxOn?.blockers).toContain("Regular RangePack has no records to compare.");
    expect(sixMaxOn?.blockers).toContain("Turbo RangePack has no records to compare.");
    expect(sixMaxOn?.blockers).toContain(
      "Turbo profile is metadata-only; dedicated hand recommendations are not normalized yet.",
    );
    expect(sixMaxOn?.actionDiffs).toEqual([]);
  });

  it("renderuje speed diff audit jako source-free operator report", () => {
    const text = renderMttPreflopSpeedDiffReport(buildMttPreflopSpeedDiffReport());

    expect(text).toContain("MTT preflop regular-vs-turbo diff");
    expect(text).toContain("FULL_RING_9/ante-ON :: BLOCKED");
    expect(text).toContain("SIX_MAX/ante-ON :: BLOCKED");
    expect(text).toContain("Turbo RangePack is missing.");
    expect(text).toContain("metadata-only");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("www.");
  });
});
