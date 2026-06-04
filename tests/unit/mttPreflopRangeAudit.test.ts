import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
} from "../../src/core/types";
import {
  auditCurrentMttPreflopProductionPacks,
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
});
