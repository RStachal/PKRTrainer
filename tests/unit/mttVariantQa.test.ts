import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildMttVariantQaReport } from "../../src/data/ranges/mttVariantQa";

describe("MTT variant QA", () => {
  it("overi flop pilot lab jako preview release train s runtime smoke pro vsechny scoped piloty", () => {
    const report = buildMttVariantQaReport();

    expect(report.valid).toBe(true);
    expect(report.releaseTrain).toBe("mtt-9max-regular-chip-ev-flop-pilots");
    expect(report.scenarioStatus).toBe("PREVIEW");
    expect(report.counts).toEqual({
      runtimeSmokes: 7,
      passed: 7,
      failed: 0,
      errors: 0,
    });
    expect(report.runtimeSmokes.map((row) => row.scope)).toContain("SB_vs_BB_SRP_OOP_FLOP_CBET");
    expect(report.runtimeSmokes.map((row) => row.scope)).toContain("CO_vs_BB_SRP_FLOP_CBET");
    expect(report.runtimeSmokes.every((row) => (
      row.freeLocked &&
      row.proPlusAllowed &&
      row.recommendationKind === "STRATEGY_PACK" &&
      row.fullProductionReady === false
    ))).toBe(true);
    expect(report.trainingRuntime).toMatchObject({
      mode: "SCOPED_PILOT",
      allowFallback: false,
      proPlusPilotResolver: true,
      freeLocked: true,
      legacySbInputRecommendationKind: "STRATEGY_PACK",
    });
  });

  it("CLI umi zapsat variant-specific QA artefakt", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-variant-qa-"));
    try {
      const output = join(dir, "report.json");
      const result = spawnSync(process.execPath, [
        "scripts/run-cli.mjs",
        "scripts/checkMttVariantQa.mts",
        `--output=${output}`,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain('"valid": true');
      expect(existsSync(output)).toBe(true);
      const report = JSON.parse(readFileSync(output, "utf8")) as ReturnType<typeof buildMttVariantQaReport>;
      expect(report.counts.runtimeSmokes).toBe(7);
      expect(report.runtimeSmokes.find((row) => row.scope === "SB_vs_BB_SRP_OOP_FLOP_CBET"))
        .toMatchObject({ status: "PASS", proPlusAllowed: true, freeLocked: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
