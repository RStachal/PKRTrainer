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
    const expectedRecordCount = 507;
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
      regularRecordCount: 507,
      turboRecordCount: 0,
      turboPackId: null,
    });
    expect(fullRingOn?.blockers).toContain("Turbo RangePack is missing.");
    expect(fullRingOn?.blockers).toContain("Turbo profile has no dedicated production RangePack.");

    const sixMaxOn = report.rows.find((row) => (
      row.tableFormat === "SIX_MAX" && row.ante === "ON"
    ));
    // Six-max regular now carries records derived from the nine-handed pack;
    // turbo does not, and that asymmetry is deliberate. A derived turbo pack
    // would be the derived regular pack relabelled, which is exactly the silent
    // metadata-only reuse this audit exists to catch - it caught it during the
    // change, which is why turbo kept its empty candidate.
    expect(sixMaxOn).toMatchObject({
      status: "BLOCKED",
      // 392, ne 425: od 27. 8. 2026 se nepřenášejí záznamy, kde by první
      // sedačka čelila akci před sebou. Bylo jich 33 (`VS_OPEN|UTG`,
      // `VS_4BET|UTG`, `VS_LIMP|UTG` po jedenácti hloubkách) a popisovaly spot,
      // který u prvního hráče nemůže nastat.
      regularRecordCount: 392,
      turboRecordCount: 0,
      regularPackId: "mtt-six-max-regular-preflop-chip-ev-ante-on-derived-v1",
      turboPackId: "mtt-six-max-turbo-preflop-chip-ev-ante-on-candidate-v0",
    });
    expect(sixMaxOn?.blockers).not.toContain("Regular RangePack has no records to compare.");
    expect(sixMaxOn?.blockers).toContain("Turbo RangePack has no records to compare.");
    // Non-empty now, and that is the point: regular teaches hands turbo has no
    // answer for. When both were empty the diff was empty too, which read as
    // agreement while it only ever meant neither said anything.
    expect(sixMaxOn?.actionDiffs.length).toBeGreaterThan(0);
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
