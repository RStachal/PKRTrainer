import { describe, expect, it } from "vitest";
import {
  buildMttPreflopCsvScaffoldDocument,
  inspectMttPreflopCsvScaffold,
} from "../../src/data/ranges/mttPreflopCsvScaffold.ts";

const PACK_ID = "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1";

describe("MTT preflop CSV scaffold contract", () => {
  it("recognizes a current blank action-EV scaffold", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const inspection = inspectMttPreflopCsvScaffold(scaffold.document, PACK_ID, { expectedRows: 3 });

    expect(inspection).toMatchObject({
      schema: "CURRENT_ACTION_EV",
      current: true,
      actionEvColumnsPresent: true,
      sourceSafeBlank: true,
      structureSafe: true,
      structuralErrors: [],
      refreshableBlank: false,
      stale: false,
      bodyRows: 3,
      errors: [],
      progress: {
        measurable: true,
        contentTouchedRows: 0,
        strategyCompleteRows: 0,
        strategyPartialRows: 0,
        actionEvCompleteRows: 0,
        actionEvPartialRows: 0,
        reviewCompleteRows: 0,
        reviewPartialRows: 0,
        sourceReferenceRows: 0,
        notesEditedRows: 0,
      },
    });
  });

  it("recognizes only an exact untouched legacy scaffold as refreshable", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const legacy = removeActionEvColumns(scaffold.document);
    const inspection = inspectMttPreflopCsvScaffold(legacy, PACK_ID, { expectedRows: 3 });

    expect(inspection).toMatchObject({
      schema: "LEGACY_NO_ACTION_EV",
      current: false,
      actionEvColumnsPresent: false,
      sourceSafeBlank: true,
      structureSafe: true,
      structuralErrors: [],
      refreshableBlank: true,
      stale: true,
      bodyRows: 3,
      errors: [],
      progress: {
        measurable: true,
        contentTouchedRows: 0,
        strategyCompleteRows: 0,
        strategyPartialRows: 0,
        actionEvCompleteRows: 0,
        actionEvPartialRows: 0,
      },
    });
  });

  it("protects a legacy scaffold containing any human strategy edit", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const edited = removeActionEvColumns(scaffold.document).replace(
      ",AA,,,,,,fill strictActions",
      ",AA,OPEN_2X,OPEN_2X,,,,fill strictActions",
    );
    const inspection = inspectMttPreflopCsvScaffold(edited, PACK_ID, { expectedRows: 3 });

    expect(inspection).toMatchObject({
      schema: "LEGACY_NO_ACTION_EV",
      sourceSafeBlank: false,
      structureSafe: true,
      refreshableBlank: false,
      stale: true,
    });
    expect(inspection.errors[0]).toContain("differs from the generated blank scaffold");
    expect(inspection.progress).toMatchObject({
      contentTouchedRows: 1,
      strategyCompleteRows: 1,
      strategyPartialRows: 0,
    });
  });

  it("treats an EV-only edit as nonblank human work", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const edited = scaffold.document.replace(
      ",AA,,,,,,,,,fill strictActions",
      ",AA,,,FOLD=0;OPEN_2X=0.2,0.01,0.05,,,,fill strictActions",
    );
    const inspection = inspectMttPreflopCsvScaffold(edited, PACK_ID, { expectedRows: 3 });

    expect(inspection).toMatchObject({
      schema: "CURRENT_ACTION_EV",
      current: true,
      sourceSafeBlank: false,
      structureSafe: true,
      refreshableBlank: false,
      stale: false,
    });
    expect(inspection.progress).toMatchObject({
      contentTouchedRows: 1,
      actionEvCompleteRows: 1,
      actionEvPartialRows: 0,
    });
  });

  it("measures partial work without treating populated cells as validated strategy", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const rows = scaffold.document.trimEnd().split("\n").map((line) => line.split(","));
    rows[1][11] = "OPEN_2X";
    rows[1][12] = "OPEN_2X";
    rows[1][13] = "FOLD=0;OPEN_2X=0.2";
    rows[1][14] = "0.01";
    rows[1][15] = "0.05";
    rows[1][16] = "owned-export";
    rows[1][17] = "owner";
    rows[1][18] = "2026-07-22";
    rows[2][11] = "FOLD";
    rows[2][13] = "FOLD=0";
    rows[2][17] = "owner";
    rows[2][19] = "review pending";
    rows[3][16] = "owned-export";

    const inspection = inspectMttPreflopCsvScaffold(
      `${rows.map((row) => row.join(",")).join("\n")}\n`,
      PACK_ID,
      { expectedRows: 3 },
    );

    expect(inspection.sourceSafeBlank).toBe(false);
    expect(inspection.structureSafe).toBe(true);
    expect(inspection.progress).toEqual({
      measurable: true,
      contentTouchedRows: 3,
      strategyCompleteRows: 1,
      strategyPartialRows: 1,
      actionEvCompleteRows: 1,
      actionEvPartialRows: 1,
      reviewCompleteRows: 1,
      reviewPartialRows: 1,
      sourceReferenceRows: 2,
      notesEditedRows: 1,
    });
  });

  it("refuses a truncated blank legacy file", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 2 });
    const inspection = inspectMttPreflopCsvScaffold(removeActionEvColumns(scaffold.document), PACK_ID, {
      expectedRows: 3,
    });

    expect(inspection.sourceSafeBlank).toBe(false);
    expect(inspection.structureSafe).toBe(false);
    expect(inspection.refreshableBlank).toBe(false);
    expect(inspection.errors).toContain("blank scaffold row count is 2; expected 3.");
    expect(inspection.structuralErrors).toContain("scaffold row count is 2; expected 3.");
  });
});

function removeActionEvColumns(document: string): string {
  return document
    .trimEnd()
    .split("\n")
    .map((line) => line.split(",").filter((_, index) => index < 13 || index > 15).join(","))
    .join("\n") + "\n";
}
