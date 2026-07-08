import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt preflop CSV draft CLI", () => {
  it("prevede privatni CSV rows do canonical draftu a fail-closed oznaci nekompletni coverage", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-mtt-csv-"));
    try {
      const csv = join(dir, "records.csv");
      const out = join(dir, "normalized.json");
      const packId = "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1";
      writeFileSync(csv, [
        "rowKind,packId,tableFormat,blindSpeed,ante,evModel,position,sourceStackBB,bucket,context,handClass,strictActions,lenientActions,sourceReferenceId,reviewer,reviewedAt,notes",
        `HAND_CLASS_DECISION,${packId},FULL_RING_9,REGULAR,ON,CHIP_EV,BTN,40,40,RFI,AA,OPEN_2X,OPEN_2X,owned-export-a,QA,2026-07-08,synthetic test row`,
        `HAND_CLASS_DECISION,${packId},FULL_RING_9,REGULAR,ON,CHIP_EV,BTN,40,40,RFI,72o,FOLD,FOLD,owned-export-a,QA,2026-07-08,synthetic test row`,
      ].join("\n"), "utf8");

      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/buildMttPreflopCsvDraft.mts",
        "--csv",
        csv,
        "--pack-id",
        packId,
        "--out",
        out,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain('"normalizedInput":');
      expect(existsSync(out)).toBe(true);
      const report = JSON.parse(result.stdout) as {
        csvReady: boolean;
        productionReady: boolean;
        packId: string;
        records: number;
        report: { missingPositions: string[]; missingContexts: string[]; missingBuckets: number[] };
      };
      const normalized = JSON.parse(readFileSync(out, "utf8")) as {
        id: string;
        records: Array<{ position: string; bucket: number; context: string; strict: Record<string, string[]> }>;
      };

      expect(report.csvReady).toBe(true);
      expect(report.productionReady).toBe(false);
      expect(report.packId).toBe(packId);
      expect(report.records).toBe(1);
      expect(report.report.missingPositions).toContain("UTG");
      expect(report.report.missingContexts).toContain("VS_OPEN");
      expect(report.report.missingBuckets).toContain(5);
      expect(normalized.id).toBe(packId);
      expect(normalized.records[0]).toMatchObject({
        position: "BTN",
        bucket: 40,
        context: "RFI",
      });
      expect(normalized.records[0].strict.AA).toEqual(["OPEN_2X"]);
      expect(normalized.records[0].strict["72o"]).toEqual(["FOLD"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
