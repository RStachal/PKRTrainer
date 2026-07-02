import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-normalize-draft CLI", () => {
  it("normalizuje FLOP_FACING_BET review do FOLD/CALL/RAISE akci", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-normalize-facing-"));
    const reviewPath = join(directory, "strategy-export.CHECK-BET_25.review.json");
    const outputDir = join(directory, "draft");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      reviewPath,
      JSON.stringify({
        valid: true,
        familyId: "TEST_FACING_BET",
        nodeHistory: ["CHECK", "BET_25"],
        files: [
          {
            boardId: "A72r",
            handClasses: {
              AA: {
                averageByAction: { RAISE_75: 0.8, CALL: 0.2 },
                dominantAction: "RAISE_75",
                dominantFrequency: 0.8,
              },
              KQo: {
                averageByAction: { CALL: 0.7, FOLD: 0.3 },
                dominantAction: "CALL",
                dominantFrequency: 0.7,
              },
              "32s": {
                averageByAction: { FOLD: 1 },
                dominantAction: "FOLD",
                dominantFrequency: 1,
              },
            },
          },
        ],
        anomalies: [],
        blockers: [],
      }),
      "utf8",
    );

    try {
      const result = runNormalize(
        `--review=${reviewPath}`,
        `--output-dir=${outputDir}`,
        "--action-node=FLOP_FACING_BET",
        "--pot-type=SINGLE_RAISED",
        "--position-pattern=SRP_BTN_VS_BB",
        "--write",
      );

      expect(result.status).toBe(0);
      const normalizedPath = join(outputDir, "normalized.candidate.json");
      expect(existsSync(normalizedPath)).toBe(true);
      const normalized = JSON.parse(readFileSync(normalizedPath, "utf8")) as {
        rules: Array<{
          actions: string[];
          recommendedAction: string;
          rangeBuckets: Array<{
            label: string;
            lane: string;
            action: string;
            actionMix: Array<{ action: string; frequencyPct: number }>;
          }>;
        }>;
      };
      const rule = normalized.rules[0];
      const allMixActions = new Set(rule?.rangeBuckets.flatMap((bucket) => bucket.actionMix.map((mix) => mix.action)));

      expect(rule?.actions).toEqual(["FOLD", "CALL", "RAISE"]);
      expect(["FOLD", "CALL", "RAISE"]).toContain(rule?.recommendedAction);
      expect(rule?.rangeBuckets.map((bucket) => [bucket.label, bucket.lane, bucket.action])).toEqual([
        ["32s · FOLD", "CHECK", "FOLD"],
        ["AA · RAISE", "VALUE", "RAISE"],
        ["KQo · CALL", "VALUE", "CALL"],
      ]);
      expect([...allMixActions].sort()).toEqual(["CALL", "FOLD", "RAISE"]);
      expect([...allMixActions]).not.toContain("CHECK");
      expect([...allMixActions]).not.toContain("BET_SMALL");
      expect([...allMixActions]).not.toContain("BET_BIG");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runNormalize(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:texas-solver-normalize-draft", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
