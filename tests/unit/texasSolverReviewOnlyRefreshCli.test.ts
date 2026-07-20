import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/refreshTexasSolverReviewOnlyEvidence.mts");
const VITE_NODE = resolve(ROOT, "node_modules/vite-node/vite-node.mjs");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe("TexasSolver cumulative review-only refresh CLI", () => {
  it("unions solved boards and plans only stale reports without writing evidence in dry-run mode", () => {
    const fixture = createFixture();
    const first = runCli(fixture, [fixture.firstManifest, fixture.secondManifest]);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("evidence boards: 2");
    expect(first.stdout).toContain("planned refresh: 1");
    expect(existsSync(fixture.reviewPath)).toBe(false);

    writeFileSync(fixture.reviewPath, `${JSON.stringify({
      valid: true,
      status: "REVIEW_ONLY_EVIDENCE",
      reviewOnlyTreeProfile: "MEMORY_SAFE_REVIEW_ONLY",
      familyId: "MTT9_TEST_FAMILY",
      requestedBoards: ["A72r", "Q72r"],
    })}\n`, "utf8");
    const second = runCli(fixture, [fixture.firstManifest, fixture.secondManifest]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("planned refresh: 0");

    const report = JSON.parse(readFileSync(fixture.outputPath, "utf8")) as {
      dryRun: boolean;
      eligibleFamilies: number;
      evidenceBoards: number;
      plannedRefresh: number;
      refreshed: number;
    };
    expect(report).toMatchObject({
      dryRun: true,
      eligibleFamilies: 1,
      evidenceBoards: 2,
      plannedRefresh: 0,
      refreshed: 0,
    });
  });

  it("rejects a manifest that is not explicitly memory-safe review-only", () => {
    const fixture = createFixture();
    const manifest = JSON.parse(readFileSync(fixture.firstManifest, "utf8")) as {
      executionProfile: { treeProfile: string };
    };
    manifest.executionProfile.treeProfile = "PRODUCTION";
    writeFileSync(fixture.firstManifest, `${JSON.stringify(manifest)}\n`, "utf8");

    const result = runCli(fixture, [fixture.firstManifest]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Manifest is not MEMORY_SAFE_REVIEW_ONLY");
    expect(existsSync(fixture.reviewPath)).toBe(false);
  });

  it("exits cleanly without writes when another live process owns the refresh lock", () => {
    const fixture = createFixture();
    writeFileSync(fixture.lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), "utf8");

    const result = runCli(fixture, [fixture.firstManifest]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Review-only refresh already owns the lock");
    expect(existsSync(fixture.outputPath)).toBe(false);
    expect(existsSync(fixture.reviewPath)).toBe(false);
  });
});

function createFixture(): {
  firstManifest: string;
  lockPath: string;
  outputPath: string;
  reportsDir: string;
  reviewPath: string;
  root: string;
  secondManifest: string;
  viewerPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), "pkrtrainer-review-only-refresh-"));
  temporaryRoots.push(root);
  const outputBase = join(root, "solver-output");
  const rawDir = join(outputBase, "MTT9_TEST_FAMILY", "raw");
  const reportsDir = join(root, "reports");
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(rawDir, "pkrtrainer_MTT9_TEST_FAMILY_A72r.json"), "{}\n", "utf8");
  writeFileSync(join(rawDir, "pkrtrainer_MTT9_TEST_FAMILY_Q72r.json"), "{}\n", "utf8");

  const firstManifest = join(root, "first-manifest.json");
  const secondManifest = join(root, "second-manifest.json");
  const base = {
    executionProfile: { treeProfile: "MEMORY_SAFE_REVIEW_ONLY" },
    outputBase,
  };
  writeFileSync(firstManifest, `${JSON.stringify({
    ...base,
    scenarios: [{ familyId: "MTT9_TEST_FAMILY", boards: ["A72r", "K72r"] }],
  })}\n`, "utf8");
  writeFileSync(secondManifest, `${JSON.stringify({
    ...base,
    scenarios: [{ familyId: "MTT9_TEST_FAMILY", boards: ["Q72r"] }],
  })}\n`, "utf8");

  return {
    firstManifest,
    lockPath: join(root, "refresh.lock"),
    outputPath: join(root, "refresh-report.json"),
    reportsDir,
    reviewPath: join(reportsDir, "MTT9_TEST_FAMILY.review.json"),
    root,
    secondManifest,
    viewerPath: join(root, "viewer", "index.html"),
  };
}

function runCli(
  fixture: ReturnType<typeof createFixture>,
  manifests: readonly string[],
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [
    VITE_NODE,
    SCRIPT,
    ...manifests.map((path) => `--manifest=${path}`),
    `--reports-dir=${fixture.reportsDir}`,
    `--viewer-output=${fixture.viewerPath}`,
    `--output=${fixture.outputPath}`,
    `--lock-path=${fixture.lockPath}`,
    "--dry-run",
    "--no-viewer",
    "--summary",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
