import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:registry-integrity CLI", () => {
  it("overi soucasny MTT registry baseline bez importovanych production modulu", () => {
    const result = runRegistryIntegrity();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT production registry integrity");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("legal import slots: 62");
    expect(result.stdout).toContain("registered runtime packs: 6");
    expect(result.stdout).toContain("generated production modules: 0");
    expect(result.stdout).toContain("permission manifests: 0");
    expect(result.stdout).toContain("errors: 0");
    expect(result.stdout).toContain("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1 | mtt-preflop | REGISTERED | LEGACY_OR_UNKNOWN");
    expect(result.stdout).not.toContain("error:");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON report pro CI/operator tooling", () => {
    const result = runRegistryIntegrity("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      counts: {
        legalImportSlots: number;
        registeredRuntimePacks: number;
        generatedProductionModules: number;
        permissionManifests: number;
        errors: number;
      };
      packs: Array<{
        packId: string;
        kind: string;
        registered: boolean;
        legalImportSlot: boolean;
        generatedModulePath: string | null;
        permissionManifestPath: string | null;
      }>;
      errors: string[];
    };

    expect(parsed.valid).toBe(true);
    expect(parsed.counts).toEqual({
      legalImportSlots: 62,
      registeredRuntimePacks: 6,
      generatedProductionModules: 0,
      permissionManifests: 0,
      errors: 0,
    });
    expect(parsed.packs.some((pack) => (
      pack.packId === "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1" &&
      pack.registered &&
      !pack.legalImportSlot
    ))).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runRegistryIntegrity("--format=SIX_MAX");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --format=SIX_MAX");
    expect(result.stderr).toContain("Usage:");
  });
});

function runRegistryIntegrity(...args: string[]) {
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
  const npmArgs = ["run", "mtt:registry-integrity", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
