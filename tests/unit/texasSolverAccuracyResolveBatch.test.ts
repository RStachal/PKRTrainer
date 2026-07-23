import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface ResolveReport {
  valid: boolean;
  threshold: number;
  iterations: number;
  counts: { families: number; boards: number; blockers: number };
  boards: Array<{ familyId: string; boardId: string; exploitabilityBefore: number; sourcePath: string; fileName: string }>;
  blockers: string[];
}

let root: string;
let accuracyRoot: string;
let paramRoot: string;
let outputDir: string;
let manifestPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pkrtrainer-accuracy-resolve-"));
  accuracyRoot = join(root, "output");
  paramRoot = join(root, "parameters");
  outputDir = join(root, "resolve-params");
  manifestPath = join(root, "resolve-manifest.json");
  mkdirSync(accuracyRoot, { recursive: true });
  mkdirSync(paramRoot, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("mtt:texas-solver-accuracy-resolve-batch CLI", () => {
  it("selects only over-target boards and maps them to authoritative sources", () => {
    writeAccuracy("MTT9_TEST_FAMILY", [["K83r", 10.42], ["A72r", 0.31], ["QJ2tt", 0.72]]);
    writeParamSet("pkrtrainer_mtt_safe_flops_v1", "MTT9_TEST_FAMILY", ["K83r", "A72r", "QJ2tt"]);

    const report = invokeJson();

    expect(report.valid).toBe(true);
    expect(report.counts).toMatchObject({ families: 1, boards: 2, blockers: 0 });
    expect(report.boards.map((board) => board.boardId).sort()).toEqual(["K83r", "QJ2tt"]);
  });

  it("copies the authoritative parameter verbatim and only raises set_max_iteration", () => {
    writeAccuracy("MTT9_TEST_FAMILY", [["K83r", 10.42]]);
    writeParamSet("pkrtrainer_mtt_safe_flops_v1", "MTT9_TEST_FAMILY", ["K83r"]);
    const sourcePath = join(paramRoot, "pkrtrainer_mtt_safe_flops_v1", "01_MTT9_TEST_FAMILY_K83r.txt");

    const result = invoke("--write", "--iterations=600", "--summary");
    expect(result.status).toBe(0);

    const written = readdirSync(outputDir);
    expect(written).toHaveLength(1);
    const before = readFileSync(sourcePath, "utf8").split(/\r?\n/);
    const after = readFileSync(join(outputDir, written[0]), "utf8").split(/\r?\n/);

    expect(after.length).toBe(before.length);
    const differing = before.map((line, index) => [line, after[index]] as const).filter(([a, b]) => a !== b);
    expect(differing).toEqual([["set_max_iteration 200", "set_max_iteration 600"]]);
    // The dump target must stay identical so a re-solve replaces the same checkpoint.
    expect(after.some((line) => line === "dump_result pkrtrainer_MTT9_TEST_FAMILY_K83r.json")).toBe(true);
  });

  it("never sources parameters from a reduced-tree low-memory set", () => {
    writeAccuracy("MTT9_TEST_FAMILY", [["K83r", 10.42]]);
    writeParamSet("pkrtrainer_mtt_low_memory_review_v1", "MTT9_TEST_FAMILY", ["K83r"]);

    const report = invokeJson();

    expect(report.valid).toBe(false);
    expect(report.counts.boards).toBe(0);
    expect(report.blockers.join(" ")).toContain("No authoritative full-tree parameter file");
  });

  it("reports nothing to do when every board is at or below target", () => {
    writeAccuracy("MTT9_TEST_FAMILY", [["K83r", 0.42], ["A72r", 0.5]]);
    writeParamSet("pkrtrainer_mtt_safe_flops_v1", "MTT9_TEST_FAMILY", ["K83r", "A72r"]);

    const report = invokeJson();

    expect(report.counts.boards).toBe(0);
    expect(report.blockers).toEqual([]);
  });

  it("rejects an unknown option", () => {
    const result = invoke("--unknown");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --unknown");
  });
});

function writeAccuracy(familyId: string, boards: ReadonlyArray<readonly [string, number]>): void {
  const dir = join(accuracyRoot, familyId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "accuracy-report.json"), JSON.stringify({
    familyId,
    solverLogCoverage: {
      expectedLogs: boards.length,
      parsedLogs: boards.length,
      missingLogs: [],
      evidence: boards.map(([boardId, value]) => ({
        rawFileName: `pkrtrainer_${familyId}_${boardId}.json`,
        source: "PER_BOARD_LOG",
        value,
      })),
    },
  }), "utf8");
}

function writeParamSet(setName: string, familyId: string, boards: readonly string[]): void {
  const dir = join(paramRoot, setName);
  mkdirSync(dir, { recursive: true });
  boards.forEach((boardId, index) => {
    const content = [
      "set_pot 50",
      "set_effective_stack 200",
      "set_board Ks,8h,3d",
      "set_range_oop QQ,JJ,TT",
      "set_range_ip AA,KK,QQ",
      "build_tree",
      "set_thread_num 8",
      "set_accuracy 0.5",
      "set_max_iteration 200",
      "start_solve",
      `dump_result pkrtrainer_${familyId}_${boardId}.json`,
      "",
    ].join("\n");
    writeFileSync(join(dir, `${String(index + 1).padStart(2, "0")}_${familyId}_${boardId}.txt`), content, "utf8");
  });
}

function invokeJson(...args: string[]): ResolveReport {
  const result = invoke("--json", ...args);
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as ResolveReport;
}

function invoke(...args: string[]) {
  return spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/buildTexasSolverAccuracyResolveBatch.mts",
    `--accuracy-root=${accuracyRoot}`,
    `--param-root=${paramRoot}`,
    `--output-dir=${outputDir}`,
    `--manifest=${manifestPath}`,
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
