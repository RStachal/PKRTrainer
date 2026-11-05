import { describe, expect, it } from "vitest";
import {
  buildMttPreflopCsvScaffoldDocument,
  inspectMttPreflopCsvScaffold,
  mergeMttPreflopCsvScaffoldChunk,
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

  it("atomically merges a reviewed strategy and action-EV chunk", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const chunk = buildChunk(scaffold.document, [{
      rowIndex: 0,
      values: {
        11: "OPEN_2X",
        12: "OPEN_2X",
        13: "FOLD=0;OPEN_2X=0.2",
        14: "0.01",
        15: "0.05",
        17: "owner-reviewer",
        18: "2026-07-22",
        19: "reviewed, owned solver export",
      },
    }]);

    const result = mergeMttPreflopCsvScaffoldChunk(scaffold.document, chunk, PACK_ID, {
      expectedRows: 3,
    });

    expect(result).toMatchObject({
      valid: true,
      chunkRows: 1,
      matchedRows: 1,
      plannedChangedRows: 1,
      unchangedRows: 0,
      conflictRows: 0,
      errors: [],
      afterProgress: {
        contentTouchedRows: 1,
        strategyCompleteRows: 1,
        strategyPartialRows: 0,
        actionEvCompleteRows: 1,
        actionEvPartialRows: 0,
        reviewCompleteRows: 1,
        notesEditedRows: 1,
      },
    });
    expect(result.document).not.toBeNull();
    expect(scaffold.document).not.toContain("owner-reviewer");

    const repeated = mergeMttPreflopCsvScaffoldChunk(result.document!, chunk, PACK_ID, {
      expectedRows: 3,
    });
    expect(repeated).toMatchObject({
      valid: true,
      matchedRows: 1,
      plannedChangedRows: 0,
      unchangedRows: 1,
      conflictRows: 0,
      errors: [],
    });
    expect(repeated.document).toBe(result.document);
  });

  it("allows action EVs to be added after the reviewed strategy", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const strategyChunk = buildChunk(scaffold.document, [{
      rowIndex: 0,
      values: {
        11: "OPEN_2X",
        12: "OPEN_2X",
        17: "owner-reviewer",
        18: "2026-07-22",
      },
    }]);
    const strategyResult = mergeMttPreflopCsvScaffoldChunk(
      scaffold.document,
      strategyChunk,
      PACK_ID,
      { expectedRows: 3 },
    );
    expect(strategyResult.valid).toBe(true);

    const evChunk = buildChunk(scaffold.document, [{
      rowIndex: 0,
      values: {
        13: "FOLD=0;OPEN_2X=0.2",
        14: "0.01",
        15: "0.05",
      },
    }]);
    const evResult = mergeMttPreflopCsvScaffoldChunk(
      strategyResult.document!,
      evChunk,
      PACK_ID,
      { expectedRows: 3 },
    );

    expect(evResult).toMatchObject({
      valid: true,
      plannedChangedRows: 1,
      conflictRows: 0,
      afterProgress: {
        contentTouchedRows: 1,
        strategyCompleteRows: 1,
        actionEvCompleteRows: 1,
        reviewCompleteRows: 1,
      },
    });
  });

  it("rejects incomplete strategy, action-EV, and reviewer field groups", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const chunk = buildChunk(scaffold.document, [
      { rowIndex: 0, values: { 11: "OPEN_2X" } },
      { rowIndex: 1, values: { 13: "FOLD=0", 14: "0.01" } },
      {
        rowIndex: 2,
        values: { 11: "FOLD", 12: "FOLD", 17: "owner-reviewer" },
      },
    ]);

    const result = mergeMttPreflopCsvScaffoldChunk(scaffold.document, chunk, PACK_ID, {
      expectedRows: 3,
    });

    expect(result.valid).toBe(false);
    expect(result.document).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      "chunk row 2 must populate strictActions and lenientActions together.",
      "chunk row 3 must populate all three action-EV cells together.",
      "chunk row 4 must populate reviewer and reviewedAt together.",
    ]));
  });

  it("blocks the whole merge when one row conflicts", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const seededChunk = buildChunk(scaffold.document, [{
      rowIndex: 0,
      values: { 11: "OPEN_2X", 12: "OPEN_2X" },
    }]);
    const seeded = mergeMttPreflopCsvScaffoldChunk(scaffold.document, seededChunk, PACK_ID, {
      expectedRows: 3,
    });
    expect(seeded.valid).toBe(true);

    const conflictingChunk = buildChunk(scaffold.document, [
      { rowIndex: 1, values: { 11: "FOLD", 12: "FOLD" } },
      { rowIndex: 0, values: { 11: "ALL_IN", 12: "ALL_IN" } },
    ]);
    const result = mergeMttPreflopCsvScaffoldChunk(
      seeded.document!,
      conflictingChunk,
      PACK_ID,
      { expectedRows: 3 },
    );

    expect(result).toMatchObject({
      valid: false,
      matchedRows: 2,
      plannedChangedRows: 1,
      conflictRows: 1,
      document: null,
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "chunk row 3 conflicts with existing strictActions.",
      "chunk row 3 conflicts with existing lenientActions.",
    ]));
  });

  it("rejects a chunk row whose immutable decision identity was changed", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 3 });
    const chunk = buildChunk(scaffold.document, [{
      rowIndex: 0,
      values: { 6: "NOT_A_POSITION", 11: "OPEN_2X", 12: "OPEN_2X" },
    }]);

    const result = mergeMttPreflopCsvScaffoldChunk(scaffold.document, chunk, PACK_ID, {
      expectedRows: 3,
    });

    expect(result).toMatchObject({
      valid: false,
      matchedRows: 0,
      document: null,
    });
    expect(result.errors).toContain("chunk row 2 does not match an immutable workbench decision.");
  });
});

function removeActionEvColumns(document: string): string {
  return document
    .trimEnd()
    .split("\n")
    .map((line) => line.split(",").filter((_, index) => index < 13 || index > 15).join(","))
    .join("\n") + "\n";
}

function buildChunk(
  scaffoldDocument: string,
  edits: readonly { rowIndex: number; values: Readonly<Record<number, string>> }[],
): string {
  const [header, ...body] = scaffoldDocument
    .trimEnd()
    .split("\n")
    .map((line) => line.split(","));
  const rows = edits.map(({ rowIndex, values }) => {
    const row = [...body[rowIndex]];
    for (const [index, value] of Object.entries(values)) row[Number(index)] = value;
    return row;
  });
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
