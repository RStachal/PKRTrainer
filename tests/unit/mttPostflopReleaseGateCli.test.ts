import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:postflop-release CLI", () => {
  it("selze, dokud vsechny FLOP/TURN/RIVER MTT sloty nejsou production-ready", () => {
    const result = runPostflopRelease();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT postflop final release gate");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("total postflop rows: 48");
    expect(result.stdout).toContain("productionReady rows: 0");
    expect(result.stdout).toContain("blocker rows: 48");
    expect(result.stdout).toContain("fallback runtime rows: 48");
    expect(result.stdout).toContain("missing normalized.json rows: 48");
    expect(result.stdout).toContain("missing permission.json rows: 48");
    expect(result.stdout).toContain("placeholder rows: 0");
    expect(result.stdout).toContain("FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON");
    expect(result.stdout).toContain("Production runtime must not fall back to public heuristic or generator logic.");
    expect(result.stdout).toContain("Permission manifest is missing.");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vypsat strukturovany report pro release tooling", () => {
    const result = runPostflopRelease("--json");

    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      counts: {
        totalPostflopRows: number;
        productionReadyRows: number;
        blockerRows: number;
        fallbackRuntimeRows: number;
        missingNormalizedRows: number;
        missingPermissionRows: number;
        placeholderRows: number;
      };
      rows: Array<{
        slotId: string;
        coverageKind: string;
        fallbackRuntime: boolean;
        missingNormalized: boolean;
        missingPermission: boolean;
        blockers: string[];
      }>;
      errors: string[];
    };

    expect(parsed.valid).toBe(false);
    expect(parsed.counts).toEqual(expect.objectContaining({
      totalPostflopRows: 48,
      productionReadyRows: 0,
      blockerRows: 48,
      fallbackRuntimeRows: 48,
      missingNormalizedRows: 48,
      missingPermissionRows: 48,
      placeholderRows: 0,
    }));
    expect(parsed.rows).toHaveLength(48);
    expect(parsed.errors).toHaveLength(48);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      coverageKind: "POSTFLOP_PUBLIC_HEURISTIC",
      fallbackRuntime: true,
      missingNormalized: true,
      missingPermission: true,
    }));
    expect(parsed.rows.map((row) => row.slotId)).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
  });

  it("umi vypsat strucny summary report pro release:check", () => {
    const result = runPostflopRelease("--summary");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT postflop final release gate");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("total postflop rows: 48");
    expect(result.stdout).toContain("fallback runtime rows: 48");
    expect(result.stdout).not.toContain("errors:");
    expect(result.stdout).not.toContain("FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON");
  });

  it("umi zapsat cisty JSON artefakt pro postflop handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-postflop-release-"));
    const outputPath = join(directory, "report.json");
    try {
      const result = runPostflopRelease("--summary", `--output=${outputPath}`);

      expect(result.status).toBe(1);
      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        valid: boolean;
        counts: { totalPostflopRows: number; blockerRows: number };
      };
      expect(parsed.valid).toBe(false);
      expect(parsed.counts.totalPostflopRows).toBe(48);
      expect(parsed.counts.blockerRows).toBe(48);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runPostflopRelease(...args: string[]) {
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
  const npmArgs = ["run", "mtt:postflop-release", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
