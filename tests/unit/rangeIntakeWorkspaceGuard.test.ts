import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("range:intake:guard CLI", () => {
  it("hlida raw intake workspace pred commitnutim privatnich vstupu", () => {
    const result = runGuard();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Range intake workspace guard");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("raw folder: Agents/range-intake/raw");
    expect(result.stdout).toContain("tracked raw files: 2");
    expect(result.stdout).toContain("local raw folders: 0");
    expect(result.stdout).toContain("legal slots: 64");
    expect(result.stdout).toContain("ready for validation: 0");
    expect(result.stdout).toContain("waiting for files: 64");
    expect(result.stdout).toContain("missing normalized.json: 64");
    expect(result.stdout).toContain("missing permission.json: 64");
    expect(result.stdout).toContain("priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=8");
    expect(result.stdout).toContain("tracked: Agents/range-intake/raw/.gitignore");
    expect(result.stdout).toContain("tracked: Agents/range-intake/raw/README.md");
    expect(result.stdout).not.toContain("error:");
  });

  it("umi vratit strukturovany preflight report pro operator tooling", () => {
    const result = runGuard("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      rawFolder: string;
      trackedRawFiles: string[];
      localRawFolders: string[];
      counts: {
        legalSlots: number;
        localFolders: number;
        readyForValidation: number;
        waitingForFiles: number;
        missingNormalized: number;
        missingPermission: number;
        byPriority: Record<string, number>;
      };
      errors: string[];
    };

    expect(parsed.valid).toBe(true);
    expect(parsed.rawFolder).toBe("Agents/range-intake/raw");
    expect(parsed.trackedRawFiles).toEqual([
      "Agents/range-intake/raw/.gitignore",
      "Agents/range-intake/raw/README.md",
    ]);
    expect(parsed.localRawFolders).toEqual([]);
    expect(parsed.counts.legalSlots).toBe(64);
    expect(parsed.counts.localFolders).toBe(0);
    expect(parsed.counts.readyForValidation).toBe(0);
    expect(parsed.counts.waitingForFiles).toBe(64);
    expect(parsed.counts.missingNormalized).toBe(64);
    expect(parsed.counts.missingPermission).toBe(64);
    expect(parsed.counts.byPriority.P1_PREFLOP_CHIP_EV).toBe(8);
    expect(parsed.errors).toEqual([]);
  });
});

function runGuard(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "range:intake:guard", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
