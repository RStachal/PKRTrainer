import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMttLearningPathCatalogReport,
  MTT_LEARNING_PATH_PRESETS,
} from "../../src/data/ranges/mttScenarioCatalog";

describe("MTT scenario / learning path catalog", () => {
  it("vyhodnoti source-free learning paths bez raw enum chaosu", () => {
    const report = buildMttLearningPathCatalogReport();

    expect(report.valid).toBe(true);
    expect(MTT_LEARNING_PATH_PRESETS).toHaveLength(4);
    expect(report.counts).toMatchObject({
      total: 4,
      ready: 0,
      preview: 1,
      waiting: 2,
      unsupported: 1,
      estimatedPlayableSpots: 13 * 9 * 169,
    });
  });

  it("drzi postflop solver lab jako WAITING dokud chybi SB OOP pilot promotion", () => {
    const report = buildMttLearningPathCatalogReport();
    const row = report.rows.find((item) => item.id === "mtt-9max-regular-chip-ev-flop-pilots");

    expect(row?.status).toBe("WAITING");
    expect(row?.readyPilotScopes).toEqual([
      "BTN_vs_BB_SRP_FLOP_CBET",
      "UTG_vs_BB_SRP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_FACING_BET",
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
    ]);
    expect(row?.waitingPilotScopes).toEqual(["SB_vs_BB_SRP_OOP_FLOP_CBET"]);
    expect(row?.blockers.join("\n")).toContain("waiting for complete reviewed solver coverage");
  });

  it("CLI umi zapsat scenario catalog report", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-mtt-scenario-catalog-"));
    try {
      const output = join(dir, "report.json");
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/checkMttScenarioCatalog.mts",
        `--output=${output}`,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(existsSync(output)).toBe(true);
      const report = JSON.parse(readFileSync(output, "utf8")) as ReturnType<typeof buildMttLearningPathCatalogReport>;
      expect(report.valid).toBe(true);
      expect(report.counts.waiting).toBe(2);
      expect(report.rows.some((row) => row.id === "mtt-9max-icm-bubble" && row.status === "UNSUPPORTED"))
        .toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
