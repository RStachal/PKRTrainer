import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMttPreflopCsvScaffoldDocument } from "../../src/data/ranges/mttPreflopCsvScaffold.ts";
import { CLI_SPAWN_TIMEOUT_MS } from "../cliSpawnBudget";

const PACK_ID = "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1";
const CONFIRM_TOKEN = "MERGE_REVIEWED_MTT_SIXMAX_PREFLOP_CHUNK";

describe("mtt:sixmax-preflop-merge-chunk CLI", () => {
  it("dry-runs, atomically writes, repeats idempotently, and blocks conflicts", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-chunk-merge-"));
    const workbenchPath = join(directory, `${PACK_ID}.csv`);
    const chunkPath = join(directory, "reviewed-chunk.csv");
    try {
      const scaffold = buildMttPreflopCsvScaffoldDocument(PACK_ID);
      writeFileSync(workbenchPath, scaffold.document, "utf8");
      writeFileSync(chunkPath, firstRowChunk(scaffold.document, {
        11: "OPEN_2X",
        12: "OPEN_2X",
        13: "FOLD=0;OPEN_2X=0.2",
        14: "0.01",
        15: "0.05",
        17: "owner-reviewer",
        18: "2026-07-22",
      }), "utf8");
      const blankSha256 = sha256(readFileSync(workbenchPath));

      const dryRun = invoke(workbenchPath, chunkPath);
      expect(dryRun.status).toBe(0);
      expect(dryRun.stderr).toBe("");
      const dryRunReport = JSON.parse(dryRun.stdout) as MergeReport;
      expect(dryRunReport).toMatchObject({
        valid: true,
        status: "DRY_RUN_READY",
        writeRequested: false,
        writePerformed: false,
        strategyValuesGenerated: "none",
        counts: {
          chunkRows: 1,
          matchedRows: 1,
          plannedChangedRows: 1,
          unchangedRows: 0,
          conflictRows: 0,
        },
      });
      expect(dryRunReport.proposedSha256).not.toBe(blankSha256);
      expect(sha256(readFileSync(workbenchPath))).toBe(blankSha256);

      const unconfirmed = invoke(workbenchPath, chunkPath, ["--write"]);
      expect(unconfirmed.status).toBe(1);
      expect(unconfirmed.stderr).toContain(`--confirm=${CONFIRM_TOKEN}`);
      expect(sha256(readFileSync(workbenchPath))).toBe(blankSha256);

      const written = invoke(workbenchPath, chunkPath, [
        "--write",
        `--confirm=${CONFIRM_TOKEN}`,
      ]);
      expect(written.status).toBe(0);
      const writtenReport = JSON.parse(written.stdout) as MergeReport;
      expect(writtenReport).toMatchObject({
        valid: true,
        status: "MERGED",
        writeRequested: true,
        writePerformed: true,
        afterProgress: {
          strategyCompleteRows: 1,
          actionEvCompleteRows: 1,
          reviewCompleteRows: 1,
        },
      });
      const mergedSha256 = sha256(readFileSync(workbenchPath));
      expect(mergedSha256).toBe(writtenReport.proposedSha256);
      expect(mergedSha256).not.toBe(blankSha256);

      const repeated = invoke(workbenchPath, chunkPath, [
        "--write",
        `--confirm=${CONFIRM_TOKEN}`,
      ]);
      expect(repeated.status).toBe(0);
      expect(JSON.parse(repeated.stdout)).toMatchObject({
        valid: true,
        status: "ALREADY_APPLIED",
        writePerformed: false,
        counts: { plannedChangedRows: 0, unchangedRows: 1, conflictRows: 0 },
      });
      expect(sha256(readFileSync(workbenchPath))).toBe(mergedSha256);

      writeFileSync(chunkPath, firstRowChunk(scaffold.document, {
        11: "ALL_IN",
        12: "ALL_IN",
      }), "utf8");
      const conflict = invoke(workbenchPath, chunkPath, [
        "--write",
        `--confirm=${CONFIRM_TOKEN}`,
      ]);
      expect(conflict.status).toBe(1);
      expect(JSON.parse(conflict.stdout)).toMatchObject({
        valid: false,
        status: "INVALID",
        writePerformed: false,
        counts: { conflictRows: 1 },
      });
      expect(sha256(readFileSync(workbenchPath))).toBe(mergedSha256);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

interface MergeReport {
  afterProgress: {
    actionEvCompleteRows: number;
    reviewCompleteRows: number;
    strategyCompleteRows: number;
  } | null;
  counts: {
    chunkRows: number;
    conflictRows: number;
    matchedRows: number;
    plannedChangedRows: number;
    unchangedRows: number;
  };
  proposedSha256: string | null;
  status: string;
  strategyValuesGenerated: string;
  valid: boolean;
  writePerformed: boolean;
  writeRequested: boolean;
}

function invoke(workbenchPath: string, chunkPath: string, extra: readonly string[] = []) {
  return spawnSync(process.execPath, [
    "scripts/run-cli.mjs",
    "scripts/mergeMttSixMaxPreflopCsvChunk.mts",
    `--pack-id=${PACK_ID}`,
    `--workbench=${workbenchPath}`,
    `--chunk=${chunkPath}`,
    "--json",
    ...extra,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: CLI_SPAWN_TIMEOUT_MS,
  });
}

function firstRowChunk(document: string, values: Readonly<Record<number, string>>): string {
  const headerEnd = document.indexOf("\n");
  const firstRowEnd = document.indexOf("\n", headerEnd + 1);
  const header = document.slice(0, headerEnd);
  const row = document.slice(headerEnd + 1, firstRowEnd).split(",");
  for (const [index, value] of Object.entries(values)) row[Number(index)] = value;
  return `${header}\n${row.join(",")}\n`;
}

function sha256(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
