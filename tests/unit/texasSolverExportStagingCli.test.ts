import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:stage-texas-solver CLI", () => {
  it("vypise blocker, kdyz zatim chybi raw TexasSolver exporty", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-empty-texas-"));
    try {
      const result = runStage("--raw-dir", directory);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("TexasSolver export staging");
      expect(result.stdout).toContain("valid: false");
      expect(result.stdout).toContain("raw exports: 0");
      expect(result.stdout).toContain("No raw TexasSolver JSON exports found");
      expect(result.stdout).not.toContain("https://");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("umi staged raw exporty prevest na strategy a accuracy review artefakty", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-stage-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "out");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "pkrtrainer_A72r.json"), JSON.stringify({ board: "As7d2c", nodes: [] }), "utf8");
    writeFileSync(join(rawDir, "pkrtrainer_K83r.json"), JSON.stringify([{ board: "Ks8h3d" }]), "utf8");
    try {
      const result = runStage(
        "--write",
        `--raw-dir=${rawDir}`,
        `--solver-output-dir=${outputDir}`,
        "--family=TEST_FAMILY",
        "--json",
      );

      expect(result.status).toBe(0);
      expect(existsSync(join(outputDir, "strategy-export.json"))).toBe(true);
      expect(existsSync(join(outputDir, "accuracy-report.json"))).toBe(true);
      expect(existsSync(join(outputDir, "review-notes.md"))).toBe(false);

      const strategy = JSON.parse(readFileSync(join(outputDir, "strategy-export.json"), "utf8")) as {
        solver: string;
        familyId: string;
        rawExportCount: number;
        rawExports: Array<{ fileName: string; parseableJson: boolean; topLevelKind: string }>;
      };
      const accuracy = JSON.parse(readFileSync(join(outputDir, "accuracy-report.json"), "utf8")) as {
        status: string;
        rawExportCount: number;
      };

      expect(strategy.solver).toBe("texas-solver");
      expect(strategy.familyId).toBe("TEST_FAMILY");
      expect(strategy.rawExportCount).toBe(2);
      expect(strategy.rawExports).toEqual([
        expect.objectContaining({ fileName: "pkrtrainer_A72r.json", parseableJson: true, topLevelKind: "object" }),
        expect.objectContaining({ fileName: "pkrtrainer_K83r.json", parseableJson: true, topLevelKind: "array" }),
      ]);
      expect(accuracy.status).toBe("NEEDS_REVIEW");
      expect(accuracy.rawExportCount).toBe(2);
      expect(JSON.stringify({ strategy, accuracy })).not.toContain("https://");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("odvodi default raw a output cestu z family filtru", () => {
    const familyId = "TEST_NO_LOCAL_RAW_EXPORTS_0001";
    const result = runStage(`--family=${familyId}`, "--json");

    expect(result.status).toBe(1);
    const report = parseJsonStdout(result.stdout) as {
      familyId: string;
      rawDir: string;
      solverOutputDir: string;
      blockers: string[];
    };

    expect(report.familyId).toBe(familyId);
    expect(report.rawDir.split("\\").join("/")).toContain(
      `output/texas-solver/${familyId}/raw`,
    );
    expect(report.solverOutputDir.split("\\").join("/")).toContain(
      `output/texas-solver/${familyId}`,
    );
    expect(report.blockers.join("\n")).toContain("No raw TexasSolver JSON exports found");
  });

  it("umi volitelne vytvorit review template", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-review-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "out");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "pkrtrainer_A72r.json"), JSON.stringify({ ok: true }), "utf8");
    try {
      const result = runStage("--write", "--review-template", `--raw-dir=${rawDir}`, `--solver-output-dir=${outputDir}`);

      expect(result.status).toBe(0);
      const notes = readFileSync(join(outputDir, "review-notes.md"), "utf8");
      expect(notes).toContain("Status: NEEDS_REVIEW");
      expect(notes).toContain("pkrtrainer_A72r.json");
      expect(notes).toContain("Status: REVIEWED");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fail-closed priradi exploitability z jednoznacneho queue-log segmentu", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-queue-evidence-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "out");
    const queueDir = join(directory, "queue");
    mkdirSync(rawDir, { recursive: true });
    mkdirSync(queueDir, { recursive: true });
    writeFileSync(join(rawDir, "pkrtrainer_TEST_FAMILY_A72r.json"), JSON.stringify({ ok: true }), "utf8");
    writeFileSync(
      join(queueDir, "queue-20260714-120000.log"),
      [
        "[2026-07-14T12:00:00] PKRTRAINER_SOLVER_BEGIN parameter=001_TEST_FAMILY_A72r.txt raw=pkrtrainer_TEST_FAMILY_A72r.json",
        "[2026-07-14T12:01:00] Total exploitability 0.42 precent",
        "[2026-07-14T12:01:01] PKRTRAINER_SOLVER_END parameter=001_TEST_FAMILY_A72r.txt raw=pkrtrainer_TEST_FAMILY_A72r.json exit=0",
      ].join("\n"),
      "utf8",
    );
    try {
      const result = runStage(
        "--write",
        "--family=TEST_FAMILY",
        `--raw-dir=${rawDir}`,
        `--solver-output-dir=${outputDir}`,
        `--queue-log-dir=${queueDir}`,
      );

      expect(result.status).toBe(0);
      const accuracy = JSON.parse(readFileSync(join(outputDir, "accuracy-report.json"), "utf8")) as {
        exploitability: number | null;
        accuracySource: string;
        solverLogCoverage: { parsedLogs: number; queueLogEntries: number; evidence: Array<{ source: string }> };
      };
      expect(accuracy.exploitability).toBe(0.42);
      expect(accuracy.accuracySource).toContain("console evidence");
      expect(accuracy.solverLogCoverage).toMatchObject({ parsedLogs: 1, queueLogEntries: 1 });
      expect(accuracy.solverLogCoverage.evidence).toEqual([
        expect.objectContaining({ source: "QUEUE_LOG" }),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("odmitne queue-log evidenci, kdyz BEGIN a END marker odkazuji na jiny raw export", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-queue-mismatch-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "out");
    const queueDir = join(directory, "queue");
    mkdirSync(rawDir, { recursive: true });
    mkdirSync(queueDir, { recursive: true });
    writeFileSync(join(rawDir, "pkrtrainer_TEST_FAMILY_A72r.json"), JSON.stringify({ ok: true }), "utf8");
    writeFileSync(
      join(queueDir, "queue-20260714-120000.log"),
      [
        "PKRTRAINER_SOLVER_BEGIN parameter=001_TEST_FAMILY_A72r.txt raw=pkrtrainer_TEST_FAMILY_A72r.json",
        "Total exploitability 0.42 precent",
        "PKRTRAINER_SOLVER_END parameter=001_TEST_FAMILY_A72r.txt raw=pkrtrainer_OTHER_FAMILY_A72r.json exit=0",
      ].join("\n"),
      "utf8",
    );
    try {
      const result = runStage(
        "--write",
        "--family=TEST_FAMILY",
        `--raw-dir=${rawDir}`,
        `--solver-output-dir=${outputDir}`,
        `--queue-log-dir=${queueDir}`,
      );

      expect(result.status).toBe(0);
      const accuracy = JSON.parse(readFileSync(join(outputDir, "accuracy-report.json"), "utf8")) as {
        exploitability: number | null;
        solverLogCoverage: { parsedLogs: number; queueLogEntries: number };
      };
      expect(accuracy.exploitability).toBeNull();
      expect(accuracy.solverLogCoverage).toMatchObject({ parsedLogs: 0, queueLogEntries: 0 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("neprezentuje jeden exploitability udaj jako presnost viceboardove family", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-family-evidence-"));
    const rawDir = join(directory, "raw");
    const outputDir = join(directory, "out");
    const queueDir = join(directory, "queue");
    mkdirSync(rawDir, { recursive: true });
    mkdirSync(queueDir, { recursive: true });
    writeFileSync(join(rawDir, "pkrtrainer_TEST_FAMILY_A72r.json"), JSON.stringify({ ok: true }), "utf8");
    writeFileSync(join(rawDir, "pkrtrainer_TEST_FAMILY_K83r.json"), JSON.stringify({ ok: true }), "utf8");
    writeFileSync(
      join(queueDir, "queue-20260714-120000.log"),
      [
        "PKRTRAINER_SOLVER_BEGIN parameter=001_TEST_FAMILY_A72r.txt raw=pkrtrainer_TEST_FAMILY_A72r.json",
        "Total exploitability 0.42 precent",
        "PKRTRAINER_SOLVER_END parameter=001_TEST_FAMILY_A72r.txt raw=pkrtrainer_TEST_FAMILY_A72r.json exit=0",
        "PKRTRAINER_SOLVER_BEGIN parameter=002_TEST_FAMILY_K83r.txt raw=pkrtrainer_TEST_FAMILY_K83r.json",
        "Total exploitability 0.21 precent",
        "PKRTRAINER_SOLVER_END parameter=002_TEST_FAMILY_K83r.txt raw=pkrtrainer_TEST_FAMILY_K83r.json exit=0",
      ].join("\n"),
      "utf8",
    );
    try {
      const result = runStage(
        "--write",
        "--family=TEST_FAMILY",
        `--raw-dir=${rawDir}`,
        `--solver-output-dir=${outputDir}`,
        `--queue-log-dir=${queueDir}`,
      );

      expect(result.status).toBe(0);
      const accuracy = JSON.parse(readFileSync(join(outputDir, "accuracy-report.json"), "utf8")) as {
        exploitability: number | null;
        solverLogCoverage: { parsedLogs: number; evidence: Array<{ rawFileName: string; value: number }> };
      };
      expect(accuracy.exploitability).toBeNull();
      expect(accuracy.solverLogCoverage.parsedLogs).toBe(2);
      expect(accuracy.solverLogCoverage.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ rawFileName: "pkrtrainer_TEST_FAMILY_A72r.json", value: 0.42 }),
        expect.objectContaining({ rawFileName: "pkrtrainer_TEST_FAMILY_K83r.json", value: 0.21 }),
      ]));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("odmitne neplatny argument", () => {
    const result = runStage("--wat");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --wat");
    expect(result.stderr).toContain("Usage:");
  });
});

function runStage(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    shell: false,
  });
}

function parseJsonStdout(stdout: string): unknown {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`No JSON object found in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:stage-texas-solver", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
