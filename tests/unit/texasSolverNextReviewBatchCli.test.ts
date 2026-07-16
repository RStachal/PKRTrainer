import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOLVER_DIR = "Agents/solver-input/texas-solver/mtt-safe-flops-v1";

describe("next TexasSolver review batch", () => {
  it("prepares an isolated 72-board next batch without changing the active queue", () => {
    const result = runBatch("--preset=next");

    expect(result.status).toBe(0);
    const report = parseJsonStdout(result.stdout) as {
      valid: boolean;
      preset: string;
      outputDir: string;
      manifestPath: string;
      counts: { scenarios: number; files: number; blockers: number };
      blockers: string[];
      nextCommands: string[];
    };
    expect(report).toMatchObject({
      valid: true,
      preset: "next",
      counts: { scenarios: 12, files: 72, blockers: 0 },
    });
    expect(report.outputDir).toContain("pkrtrainer_mtt_next_flop_review_v1");
    expect(report.manifestPath).toContain("coverage-next-flop-review-v1-manifest.json");
    expect(report.blockers).toEqual([]);
    expect(report.nextCommands).toContain("npm run mtt:solver-batch-prep-status");
    expect(report.nextCommands.join("\n")).not.toContain("mtt:texas-solver-autostart-install");

    const queue = JSON.parse(readFileSync(resolve(ROOT, SOLVER_DIR, "texas-solver-autostart-queue.json"), "utf8")) as {
      items: Array<{ id: string; expectedBoards: number; manifest: string }>;
    };
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: "large-flop-review-v1",
        expectedBoards: 72,
        manifest: expect.stringContaining("coverage-large-flop-review-v1-manifest.json"),
      }),
    ]);
  });

  it("renders a compact next-batch status for recurring PowerShell logs", () => {
    const result = runBatch("--preset=next", "--summary");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("TexasSolver review batch");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("preset: next");
    expect(result.stdout).toContain("files: 72");
    expect(result.stdout).not.toContain('"fileName"');
  });

  it("prepares a separate 72-board follow-up batch with new board textures", () => {
    const result = runBatch("--preset=followup");
    expect(result.status).toBe(0);
    const report = parseJsonStdout(result.stdout) as {
      valid: boolean;
      preset: string;
      outputDir: string;
      manifestPath: string;
      counts: { scenarios: number; files: number; blockers: number };
      nextCommands: string[];
    };
    expect(report).toMatchObject({ valid: true, preset: "followup", counts: { scenarios: 12, files: 72, blockers: 0 } });
    expect(report.outputDir).toContain("pkrtrainer_mtt_followup_flop_review_v1");
    expect(report.manifestPath).toContain("coverage-followup-flop-review-v1-manifest.json");
    expect(report.nextCommands.join("\n")).toContain("only after the next-review manifest is raw-complete");
  });

  it("prepares a duplicate-safe 72-board owner-depth phase for underrepresented families", () => {
    const result = runBatch("--preset=owner-depth");
    expect(result.status).toBe(0);
    const report = parseJsonStdout(result.stdout) as {
      valid: boolean;
      preset: string;
      outputDir: string;
      manifestPath: string;
      counts: { scenarios: number; files: number; blockers: number };
      files: Array<{ familyId: string; boardId: string }>;
      blockers: string[];
      nextCommands: string[];
    };

    expect(report).toMatchObject({
      valid: true,
      preset: "owner-depth",
      counts: { scenarios: 8, files: 72, blockers: 0 },
    });
    expect(report.outputDir).toContain("pkrtrainer_mtt_owner_depth_review_v1");
    expect(report.manifestPath).toContain("coverage-owner-depth-flop-review-v1-manifest.json");
    expect(report.blockers).toEqual([]);
    expect(new Set(report.files.map((file) => `${file.familyId}/${file.boardId}`)).size).toBe(72);
    expect(new Set(report.files.map((file) => file.boardId))).toEqual(new Set([
      "AKQtt", "K72r", "J85tt", "T97r", "664r", "432mono", "AQ6r", "KJTmono", "955tt",
    ]));
    expect(report.nextCommands).toContain("npm run mtt:texas-solver-low-memory-install");
    expect(report.nextCommands.join("\n")).toContain("only after the follow-up manifest is raw-complete");
  });

  it("prepares a duplicate-safe 45-board beta-minimum wave across all 20 families", () => {
    const result = runBatch("--preset=beta-min");
    expect(result.status).toBe(0);
    const report = parseJsonStdout(result.stdout) as {
      valid: boolean;
      preset: string;
      outputDir: string;
      manifestPath: string;
      counts: { scenarios: number; files: number; blockers: number };
      files: Array<{ familyId: string; boardId: string }>;
      blockers: string[];
      nextCommands: string[];
    };

    expect(report).toMatchObject({
      valid: true,
      preset: "beta-min",
      counts: { scenarios: 20, files: 45, blockers: 0 },
    });
    expect(report.outputDir).toContain("pkrtrainer_mtt_beta_min_board_review_v1");
    expect(report.manifestPath).toContain("coverage-beta-min-board-review-v1-manifest.json");
    expect(report.blockers).toEqual([]);
    expect(new Set(report.files.map((file) => file.familyId)).size).toBe(20);
    expect(new Set(report.files.map((file) => file.boardId)).size).toBe(45);
    expect(new Set(report.files.map((file) => `${file.familyId}/${file.boardId}`)).size).toBe(45);
    expect(report.nextCommands.join("\n")).toContain("only after owner-depth is raw-complete");
  });

  it.each([
    ["beta-depth", 83, "pkrtrainer_mtt_beta_depth_board_review_v1"],
    ["growth", 98, "pkrtrainer_mtt_growth_board_review_v1"],
  ] as const)("prepares the non-active %s expansion wave", (preset, fileCount, outputName) => {
    const result = runBatch(`--preset=${preset}`);
    expect(result.status).toBe(0);
    const report = parseJsonStdout(result.stdout) as {
      valid: boolean;
      preset: string;
      outputDir: string;
      counts: { scenarios: number; files: number; blockers: number };
      files: Array<{ familyId: string; boardId: string }>;
      nextCommands: string[];
    };

    expect(report).toMatchObject({
      valid: true,
      preset,
      counts: { scenarios: 20, files: fileCount, blockers: 0 },
    });
    expect(report.outputDir).toContain(outputName);
    expect(new Set(report.files.map((file) => file.boardId)).size).toBe(fileCount);
    expect(new Set(report.files.map((file) => `${file.familyId}/${file.boardId}`)).size)
      .toBe(fileCount);
    expect(report.nextCommands.join("\n")).toContain("outside every active worker");
  });

  it("keeps the active batch frozen while removing an ignored console directive from next parameters", () => {
    const result = runBatch("--preset=next", "--write");

    expect(result.status).toBe(0);
    const parameter = readFileSync(resolve(
      ROOT,
      SOLVER_DIR,
      "parameters/pkrtrainer_mtt_next_flop_review_v1/001_MTT9_20BB_BTN_BB_SRP_LOWSPR_A72r.txt",
    ), "utf8");
    const activeParameter = readFileSync(resolve(
      ROOT,
      SOLVER_DIR,
      "parameters/pkrtrainer_mtt_large_flop_review_v1/001_MTT9_20BB_BTN_BB_SRP_LOWSPR_A95r.txt",
    ), "utf8");

    expect(parameter).not.toContain("set_raise_limit");
    expect(activeParameter).toContain("set_raise_limit 3");
  });
});

function runBatch(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:texas-solver-large-flop-batch", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}

function parseJsonStdout(stdout: string): unknown {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`No JSON object found in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}
