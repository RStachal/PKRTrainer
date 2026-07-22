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
      refreshableBlank: false,
      stale: false,
      bodyRows: 3,
      errors: [],
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
      refreshableBlank: true,
      stale: true,
      bodyRows: 3,
      errors: [],
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
      refreshableBlank: false,
      stale: true,
    });
    expect(inspection.errors[0]).toContain("differs from the generated blank scaffold");
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
      refreshableBlank: false,
      stale: false,
    });
  });

  it("refuses a truncated blank legacy file", () => {
    const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID, { maxRows: 2 });
    const inspection = inspectMttPreflopCsvScaffold(removeActionEvColumns(scaffold.document), PACK_ID, {
      expectedRows: 3,
    });

    expect(inspection.sourceSafeBlank).toBe(false);
    expect(inspection.refreshableBlank).toBe(false);
    expect(inspection.errors).toContain("blank scaffold row count is 2; expected 3.");
  });
});

function removeActionEvColumns(document: string): string {
  return document
    .trimEnd()
    .split("\n")
    .map((line) => line.split(",").filter((_, index) => index < 13 || index > 15).join(","))
    .join("\n") + "\n";
}
