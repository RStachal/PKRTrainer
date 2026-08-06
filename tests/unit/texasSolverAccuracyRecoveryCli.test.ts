import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const VITE_NODE = resolve(ROOT, "scripts/run-cli.mjs");
const SCRIPT = resolve(ROOT, "scripts/prepareTexasSolverAccuracyRecovery.mts");
const FAMILY = "MTT9_50BB_BTN_BB_SRP";
const BOARD = "A72r";
const RAW_NAME = `pkrtrainer_${FAMILY}_${BOARD}.json`;
const LOG_NAME = `pkrtrainer_${FAMILY}_${BOARD}.log`;

describe("mtt:texas-solver-accuracy-recovery CLI", () => {
  it("prepares an exact recovery parameter without changing canonical raw evidence", () => {
    const fixture = createFixture();
    try {
      const rawBefore = sha256(readFileSync(fixture.rawPath));
      const dryRun = run(fixture, "--summary");
      expect(dryRun.status).toBe(0);
      expect(dryRun.stdout).toContain("accuracy: 0/1");
      expect(dryRun.stdout).toContain("pending logs: 1");
      expect(dryRun.stdout).toContain("recovery files: 1");
      expect(existsSync(fixture.outputDir)).toBe(false);

      const write = run(fixture, "--write", `--output=${fixture.reportPath}`, "--summary");
      expect(write.status).toBe(0);
      const generated = join(fixture.outputDir, `001_${FAMILY}_${BOARD}.txt`);
      expect(readFileSync(generated, "utf8")).toBe(readFileSync(fixture.parameterPath, "utf8"));
      expect(sha256(readFileSync(fixture.rawPath))).toBe(rawBefore);
      const manifest = JSON.parse(readFileSync(fixture.outputManifest, "utf8")) as {
        recoveryOnly: boolean;
        executionProfile: { purpose: string; canonicalRawWrite: boolean; threads: number };
        files: Array<{ sourceParameterSha256: string; canonicalRawPath: string; targetLogName: string }>;
      };
      expect(manifest).toMatchObject({
        recoveryOnly: true,
        executionProfile: { purpose: "ACCURACY_LOG_RECOVERY_ONLY", canonicalRawWrite: false, threads: 3 },
      });
      expect(manifest.files[0]).toMatchObject({
        sourceParameterSha256: sha256(readFileSync(fixture.parameterPath)),
        targetLogName: LOG_NAME,
      });
      expect(manifest.files[0].canonicalRawPath).toContain(`/raw/${RAW_NAME}`);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("removes only its stale generated parameter after accuracy becomes complete", () => {
    const fixture = createFixture();
    try {
      expect(run(fixture, "--write", "--summary").status).toBe(0);
      const generated = join(fixture.outputDir, `001_${FAMILY}_${BOARD}.txt`);
      const manual = join(fixture.outputDir, "manual-note.txt");
      writeFileSync(manual, "keep", "utf8");
      writeAccuracy(fixture.accuracyPath, false);

      const completed = run(fixture, "--write", "--summary");

      expect(completed.status).toBe(0);
      expect(completed.stdout).toContain("accuracy: 1/1");
      expect(completed.stdout).toContain("pending logs: 0");
      expect(existsSync(generated)).toBe(false);
      expect(readFileSync(manual, "utf8")).toBe("keep");
      const manifest = JSON.parse(readFileSync(fixture.outputManifest, "utf8")) as { files: unknown[] };
      expect(manifest.files).toEqual([]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when the canonical raw checkpoint is missing", () => {
    const fixture = createFixture();
    try {
      rmSync(fixture.rawPath);
      const result = run(fixture, "--write", "--summary");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cannot write accuracy recovery batch");
      expect(result.stderr).toContain("canonical raw checkpoint");
      expect(existsSync(fixture.outputDir)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects conflicting approved source parameters for the same checkpoint", () => {
    const fixture = createFixture();
    try {
      const secondParameter = join(fixture.root, "source-two.txt");
      writeFileSync(secondParameter, parameterText().replace("set_accuracy 0.5", "set_accuracy 0.4"), "ascii");
      const secondManifest = join(fixture.root, "source-two-manifest.json");
      writeSourceManifest(secondManifest, secondParameter, "source-pack-two");

      const result = run(fixture, `--source-manifest=${secondManifest}`, "--summary");

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("approved source parameters disagree");
      expect(existsSync(fixture.outputDir)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "pkrtrainer-accuracy-recovery-"));
  const accuracyRoot = join(root, "accuracy");
  const familyDir = join(accuracyRoot, FAMILY);
  const rawDir = join(familyDir, "raw");
  mkdirSync(rawDir, { recursive: true });
  const rawPath = join(rawDir, RAW_NAME);
  writeFileSync(rawPath, JSON.stringify({ strategy: { root: true } }), "utf8");
  const accuracyPath = join(familyDir, "accuracy-report.json");
  writeAccuracy(accuracyPath, true);
  const parameterPath = join(root, "source.txt");
  writeFileSync(parameterPath, parameterText(), "ascii");
  const sourceManifest = join(root, "source-manifest.json");
  writeSourceManifest(sourceManifest, parameterPath, "source-pack-one");
  return {
    root,
    accuracyRoot,
    rawPath,
    accuracyPath,
    parameterPath,
    sourceManifests: [sourceManifest],
    outputDir: join(root, "recovery"),
    outputManifest: join(root, "recovery-manifest.json"),
    reportPath: join(root, "report.json"),
  };
}

function writeAccuracy(path: string, missing: boolean): void {
  writeFileSync(path, JSON.stringify({
    solver: "texas-solver",
    familyId: FAMILY,
    evidenceScope: "APPROVED_MEMORY_SAFE_REVIEW_ONLY_MANIFEST_UNION",
    solverLogCoverage: {
      expectedLogs: 1,
      parsedLogs: missing ? 0 : 1,
      missingLogs: missing ? [LOG_NAME] : [],
      evidence: missing ? [] : [{ rawFileName: RAW_NAME, source: "PER_BOARD_LOG", value: 0.42 }],
    },
  }, null, 2), "utf8");
}

function writeSourceManifest(path: string, parameterPath: string, packId: string): void {
  writeFileSync(path, JSON.stringify({
    packId,
    executionProfile: { treeProfile: "MEMORY_SAFE_REVIEW_ONLY" },
    scenarios: [{ familyId: FAMILY, purpose: "fixture", coverageTags: ["MID_SPR", "SINGLE_RAISED_POT_CBET"] }],
    files: [{ fileName: "source.txt", path: parameterPath, familyId: FAMILY, boardId: BOARD, written: true }],
  }, null, 2), "utf8");
}

function parameterText(): string {
  return [
    "set_pot 10",
    "set_effective_stack 40",
    "set_board As,7h,2d",
    "set_range_ip AA",
    "set_range_oop KK",
    "set_thread_num 3",
    "set_accuracy 0.5",
    "set_bet_sizes ip,flop,bet,33",
    "set_bet_sizes oop,flop,bet,33",
    "build_tree",
    "start_solve",
    "set_dump_rounds 2",
    `dump_result ${RAW_NAME}`,
    "set_use_isomorphism 1",
    "",
  ].join("\n");
}

function run(fixture: ReturnType<typeof createFixture>, ...extra: string[]) {
  return spawnSync(process.execPath, [
    VITE_NODE,
    SCRIPT,
    `--accuracy-root=${fixture.accuracyRoot}`,
    ...fixture.sourceManifests.map((path) => `--source-manifest=${path}`),
    `--output-dir=${fixture.outputDir}`,
    `--manifest=${fixture.outputManifest}`,
    ...extra,
  ], { cwd: ROOT, encoding: "utf8", shell: false });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
