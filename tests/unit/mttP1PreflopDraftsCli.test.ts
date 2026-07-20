import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:p1-preflop-drafts CLI", () => {
  it("accepts separated out-dir syntax", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-p1-drafts-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/buildMttP1PreflopDrafts.mts",
        "--out-dir",
        dir,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(existsSync(join(dir, "summary.json"))).toBe(true);
      expect(existsSync(join(dir, "UNBLOCK_MATRIX.md"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes review-only normalized candidates with inline out-dir syntax", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-p1-drafts-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/buildMttP1PreflopDrafts.mts",
        `--out-dir=${dir}`,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");

      const parsed = JSON.parse(result.stdout) as {
        rows: Array<{
          slotId: string;
          status: string;
          normalizedCandidatePath: string | null;
          permissionReviewRequestPath: string | null;
          validation: {
            normalizedReportValid: boolean | null;
            legalImportSlot: boolean | null;
            expectedBlockingErrors: string[];
          };
        }>;
      };
      const regularRows = parsed.rows.filter((row) => (
        row.slotId.startsWith("FULL_RING_9|REGULAR|CHIP_EV|PREFLOP")
      ));
      const turboRows = parsed.rows.filter((row) => (
        row.slotId.startsWith("FULL_RING_9|TURBO|CHIP_EV|PREFLOP")
      ));
      expect(regularRows).toHaveLength(2);
      expect(regularRows.every((row) => row.status === "NORMALIZED_CANDIDATE_WRITTEN")).toBe(true);
      expect(regularRows.every((row) => row.normalizedCandidatePath !== null)).toBe(true);
      expect(regularRows.every((row) => row.permissionReviewRequestPath !== null)).toBe(true);
      expect(regularRows.every((row) => row.validation.legalImportSlot === true)).toBe(true);
      expect(regularRows.every((row) => row.validation.normalizedReportValid === false)).toBe(true);
      expect(regularRows.every((row) => row.validation.expectedBlockingErrors.length === 1)).toBe(true);
      expect(regularRows.every((row) => (
        row.validation.expectedBlockingErrors.some((error) => error.includes("needs owned export"))
      ))).toBe(true);
      expect(turboRows).toHaveLength(2);
      expect(turboRows.every((row) => row.status === "REUSE_CANDIDATE_WRITTEN_NEEDS_POLICY")).toBe(true);
      expect(turboRows.every((row) => row.normalizedCandidatePath !== null)).toBe(true);
      expect(turboRows.every((row) => row.validation.legalImportSlot === true)).toBe(true);

      const normalizedPath = regularRows[0].normalizedCandidatePath;
      const permissionPath = regularRows[0].permissionReviewRequestPath;
      expect(normalizedPath).not.toBeNull();
      expect(permissionPath).not.toBeNull();
      expect(existsSync(normalizedPath as string)).toBe(true);
      expect(existsSync(permissionPath as string)).toBe(true);

      const normalized = JSON.parse(readFileSync(normalizedPath as string, "utf8")) as {
        id: string;
        licenseKind: string;
        records: unknown[];
      };
      const permissionReview = JSON.parse(readFileSync(permissionPath as string, "utf8")) as {
        warning: string;
        requiredPermissionDecision: {
          requiredRedistributionScope: string;
          requiredFields: string[];
          externalEvidenceRule: string;
        };
      };

      expect(normalized.id).toContain("production-v1");
      expect(normalized.licenseKind).toBe("UNKNOWN");
      expect(normalized.records.length).toBeGreaterThan(0);
      expect(permissionReview.warning).toContain("Do not rename or copy");
      expect(permissionReview.requiredPermissionDecision.requiredRedistributionScope).toBe(
        "PKRTRAINER_RUNTIME_BUNDLE",
      );
      expect(permissionReview.requiredPermissionDecision.requiredFields).not.toContain(
        "at least one source-free evidence reference",
      );
      expect(permissionReview.requiredPermissionDecision.externalEvidenceRule).toContain(
        "OWNED_SOLVER_EXPORT needs no external evidence reference",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
