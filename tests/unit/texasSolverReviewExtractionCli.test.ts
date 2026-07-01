import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-review CLI", () => {
  it("prevede raw TexasSolver root strategii do source-safe review summary bez production readiness", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-review-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "review");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(
      join(rawDir, "pkrtrainer_TEST_FAMILY_A72r.json"),
      JSON.stringify({
        node_type: "action_node",
        player: 1,
        actions: ["CHECK", "BET 25.000000", "BET 200.000000"],
        strategy: {
          actions: ["CHECK", "BET 25.000000", "BET 200.000000"],
          strategy: {
            AcJc: [0.1, 0.7, 0.2],
            AdJh: [0.3, 0.6, 0.1],
            "7d7c": [1, 0, 0],
          },
        },
        childrens: {},
      }),
      "utf8",
    );

    try {
      const result = runReview(
        "--family=TEST_FAMILY",
        `--raw-dir=${rawDir}`,
        `--solver-output-dir=${outputDir}`,
        "--write",
        "--json",
      );

      expect(result.status).toBe(0);
      const report = parseJsonStdout(result.stdout) as {
        valid: boolean;
        status: string;
        productionReady: boolean;
        counts: { rawFiles: number; parsedFiles: number; handClasses: number; writtenFiles: number };
        files: Array<{
          boardId: string;
          handClasses: Record<string, {
            comboCount: number;
            averageByAction: Record<string, number>;
            dominantAction: string;
          }>;
        }>;
      };
      const writtenReview = join(outputDir, "strategy-export.review.json");

      expect(report.valid).toBe(true);
      expect(report.status).toBe("NEEDS_REVIEW");
      expect(report.productionReady).toBe(false);
      expect(report.counts).toMatchObject({
        rawFiles: 1,
        parsedFiles: 1,
        handClasses: 3,
        writtenFiles: 1,
      });
      expect(report.files[0]?.boardId).toBe("A72r");
      expect(report.files[0]?.handClasses.AJs).toMatchObject({
        comboCount: 1,
        averageByAction: { CHECK: 0.1, BET_25: 0.7, BET_200: 0.2 },
        dominantAction: "BET_25",
      });
      expect(report.files[0]?.handClasses.AJo).toMatchObject({
        comboCount: 1,
        averageByAction: { CHECK: 0.3, BET_25: 0.6, BET_200: 0.1 },
      });
      expect(report.files[0]?.handClasses["77"]).toMatchObject({
        comboCount: 1,
        dominantAction: "CHECK",
      });
      expect(existsSync(writtenReview)).toBe(true);
      expect(JSON.parse(readFileSync(writtenReview, "utf8"))).toMatchObject({
        valid: true,
        productionReady: false,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("zablokuje malformed raw export bez generovani reviewed souboru", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-review-invalid-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "review");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(
      join(rawDir, "pkrtrainer_TEST_FAMILY_K83r.json"),
      JSON.stringify({
        node_type: "terminal_node",
        actions: [],
      }),
      "utf8",
    );

    try {
      const result = runReview(
        "--family=TEST_FAMILY",
        `--raw-dir=${rawDir}`,
        `--solver-output-dir=${outputDir}`,
        "--write",
        "--json",
      );

      expect(result.status).toBe(1);
      const report = parseJsonStdout(result.stdout) as {
        valid: boolean;
        counts: { blockedFiles: number; writtenFiles: number };
        blockers: string[];
      };

      expect(report.valid).toBe(false);
      expect(report.counts.blockedFiles).toBe(1);
      expect(report.counts.writtenFiles).toBe(0);
      expect(report.blockers.join("\n")).toContain("Root node_type must be action_node");
      expect(report.blockers.join("\n")).toContain("Root strategy is missing or malformed");
      expect(existsSync(join(outputDir, "strategy-export.review.json"))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runReview(...args: string[]) {
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
  const npmArgs = ["run", "mtt:texas-solver-review", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}

function parseJsonStdout(stdout: string): unknown {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`No JSON object found in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}
