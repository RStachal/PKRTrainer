import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:core-release CLI", () => {
  it("passes the scoped core gate without claiming the full MTT library", () => {
    const result = runCore("--summary");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT core release gate");
    expect(result.stdout).toContain("scope: MTT_CORE_V1");
    expect(result.stdout).toContain("release label: MTT ChipEV Core");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("preflop production: 4/4");
    expect(result.stdout).toContain("permission ready: 4/4");
    expect(result.stdout).toContain("scoped flop pilots: 7/7");
    expect(result.stdout).toContain("pilot runtime entries: 7");
    expect(result.stdout).toContain("pilot rules: 19");
    expect(result.stdout).toContain("pilot range buckets: 972");
    expect(result.stdout).toContain("action EV comparison ready: false");
    expect(result.stdout).toMatch(/preflop action EV: 0\/\d+ decisions \(0\/4 packs\)/);
    expect(result.stdout).toContain("scoped flop action EV: 0/972 decisions (0/7 packs)");
    expect(result.stdout).toContain("Strategy frequencies are not EV and are not counted");
    expect(result.stdout).toContain("full library ready: false");
    expect(result.stdout).toContain("full library production: 4/64");
    expect(result.stdout).toContain("errors: 0");
  });

  it("writes a structured source-free core handoff report", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-mtt-core-"));
    try {
      const output = join(directory, "report.json");
      const result = runCore("--json", `--output=${output}`);

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(output, "utf8")) as {
        valid: boolean;
        scope: string;
        counts: {
          preflopProductionReady: number;
          permissionReady: number;
          readyPilots: number;
          pilotRuntimeEntries: number;
          errors: number;
        };
        fullLibrary: { releaseReady: boolean; productionReadyRows: number; totalRows: number };
        actionEv: {
          comparisonReady: boolean;
          preflopCompleteDecisions: number;
          preflopTotalDecisions: number;
          postflopCompleteDecisions: number;
          postflopTotalDecisions: number;
        };
        permissions: Array<{ valid: boolean; licenseKind: string; evidenceCount: number }>;
        errors: string[];
        warnings: string[];
      };
      expect(report).toMatchObject({
        valid: true,
        scope: "MTT_CORE_V1",
        counts: {
          preflopProductionReady: 4,
          permissionReady: 4,
          readyPilots: 7,
          pilotRuntimeEntries: 7,
          errors: 0,
        },
        fullLibrary: {
          releaseReady: false,
          productionReadyRows: 4,
          totalRows: 64,
        },
        actionEv: {
          comparisonReady: false,
          preflopCompleteDecisions: 0,
          postflopCompleteDecisions: 0,
          postflopTotalDecisions: 972,
        },
      });
      expect(report.actionEv.preflopTotalDecisions).toBeGreaterThan(0);
      expect(report.permissions).toHaveLength(4);
      expect(report.permissions.every((item) => item.valid)).toBe(true);
      expect(report.permissions.every((item) => item.licenseKind === "OWNED_SOLVER_EXPORT")).toBe(true);
      expect(report.permissions.every((item) => item.evidenceCount === 0)).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.warnings.join("\n")).toContain("must be marketed as scoped core content");
      expect(JSON.stringify(report)).not.toContain("https://");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects an unknown option", () => {
    const result = runCore("--full-library");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --full-library");
    expect(result.stderr).toContain("Usage:");
  });
});

function runCore(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:core-release", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
