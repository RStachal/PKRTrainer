import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProductionPermissionManifest } from "../../src/data/ranges/productionPermissionManifest";

describe("mtt:p1-stage-reviewed-preflop CLI", () => {
  it("finalizes a reviewed regular candidate into raw staging only with explicit write confirmation", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-p1-stage-"));
    try {
      const draftDir = join(dir, "drafts");
      const rawRoot = join(dir, "raw");
      const packId = "mtt-full-ring-9-regular-preflop-chip-ev-ante-off-production-v1";
      const permission = join(dir, "permission.json");
      buildDrafts(draftDir);
      writeFileSync(permission, JSON.stringify(validPermissionManifest(packId), null, 2), "utf8");

      const dryRun = runStage([
        "--pack-id",
        packId,
        "--permission",
        permission,
        "--draft-dir",
        draftDir,
        "--raw-root",
        rawRoot,
        "--json",
      ]);

      expect(dryRun.status).toBe(0);
      expect(dryRun.stderr).toBe("");
      const dryRunJson = JSON.parse(dryRun.stdout) as {
        valid: boolean;
        writePerformed: boolean;
        rawNormalizedPath: string;
      };
      expect(dryRunJson.valid).toBe(true);
      expect(dryRunJson.writePerformed).toBe(false);
      expect(existsSync(dryRunJson.rawNormalizedPath)).toBe(false);

      const write = runStage([
        "--pack-id",
        packId,
        "--permission",
        permission,
        "--draft-dir",
        draftDir,
        "--raw-root",
        rawRoot,
        "--write",
        "--confirm=STAGE_REVIEWED_MTT_P1_PREFLOP",
        "--json",
      ]);

      expect(write.status).toBe(0);
      expect(write.stderr).toBe("");
      const written = JSON.parse(write.stdout) as {
        writePerformed: boolean;
        rawNormalizedPath: string;
        rawPermissionPath: string;
      };
      expect(written.writePerformed).toBe(true);
      expect(existsSync(written.rawNormalizedPath)).toBe(true);
      expect(existsSync(written.rawPermissionPath)).toBe(true);
      const normalized = JSON.parse(readFileSync(written.rawNormalizedPath, "utf8")) as {
        licenseKind: string;
        assumptions: string[];
      };
      expect(normalized.licenseKind).toBe("OWNED_SOLVER_EXPORT");
      expect(normalized.assumptions.join("\n")).toContain("Explicit reviewed reuse policy");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks turbo reuse candidates without reviewed BLIND_SPEED reuse policy", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-p1-stage-"));
    try {
      const draftDir = join(dir, "drafts");
      const rawRoot = join(dir, "raw");
      const packId = "mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1";
      const permission = join(dir, "permission.json");
      buildDrafts(draftDir);
      const manifest = validPermissionManifest(packId);
      delete manifest.reusePolicy;
      writeFileSync(permission, JSON.stringify(manifest, null, 2), "utf8");

      const result = runStage([
        "--pack-id",
        packId,
        "--permission",
        permission,
        "--draft-dir",
        draftDir,
        "--raw-root",
        rawRoot,
        "--json",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("BLIND_SPEED");
      expect(existsSync(join(rawRoot, packId, "normalized.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function buildDrafts(outDir: string): void {
  const result = spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/buildMttP1PreflopDrafts.mts",
    `--out-dir=${outDir}`,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
}

function runStage(args: readonly string[]) {
  return spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/stageMttP1ReviewedPreflopIntake.mts",
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function validPermissionManifest(packId: string): ProductionPermissionManifest {
  return {
    packId,
    version: "permission-fixture-v1",
    reviewedAt: "2026-07-10",
    reviewer: "PKRTrainer QA",
    rightsOwner: "PKRTrainer synthetic fixture",
    licenseKind: "OWNED_SOLVER_EXPORT",
    allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
    sourceMaterialLocation: "Agents/range-intake/raw/synthetic-fixture/",
    evidence: [
      {
        referenceId: "owned-export-manifest",
        storedAt: "Agents/range-intake/raw/synthetic-fixture/manifest.txt",
        reviewer: "PKRTrainer QA",
        description: "Synthetic owned export fixture.",
        containsRangeValues: true,
      },
    ],
    notes: [
      "No third-party chart values copied.",
    ],
    reusePolicy: {
      allowedDimensions: ["BLIND_SPEED"],
      reviewedAt: "2026-07-10",
      reviewer: "PKRTrainer QA",
      rationale: "Synthetic fixture is reviewed for reuse across supported blind speeds.",
      sourceMaterialReferenceIds: ["owned-export-manifest"],
    },
  };
}
