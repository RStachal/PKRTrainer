import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt preflop CSV scaffold CLI", () => {
  it("vygeneruje prazdny source-safe scaffold bez strategickych akci", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-mtt-scaffold-"));
    try {
      const output = join(dir, "scaffold.csv");
      const packId = "mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1";
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/buildMttPreflopCsvScaffold.mts",
        "--pack-id",
        packId,
        "--out",
        output,
        "--max-rows=3",
        "--source-reference-id=review-source-a",
        "--reviewer=QA",
        "--reviewed-at=2026-07-08",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("strategyValues: none");
      expect(existsSync(output)).toBe(true);

      const lines = readFileSync(output, "utf8").trim().split(/\r?\n/);
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("strictActions,lenientActions");
      expect(lines[1]).toContain(packId);
      expect(lines[1]).toContain("SIX_MAX,TURBO,OFF,CHIP_EV");
      expect(lines[1]).toContain("review-source-a,QA,2026-07-08");

      const firstCells = lines[1].split(",");
      expect(firstCells[11]).toBe("");
      expect(firstCells[12]).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
