import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("mtt:registry-integrity CLI", () => {
  it("overi soucasny MTT registry baseline s importovanymi full-ring production moduly", () => {
    const result = runRegistryIntegrity();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT production registry integrity");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("legal import slots: 64");
    expect(result.stdout).toContain("registered runtime packs: 13");
    expect(result.stdout).toContain("generated production modules: 4");
    expect(result.stdout).toContain("permission manifests: 8");
    expect(result.stdout).toContain("errors: 0");
    expect(result.stdout).toContain("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1 | mtt-preflop | REGISTERED | LEGAL_SLOT");
    expect(result.stdout).toContain("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1 | mtt-preflop | REGISTERED | PREVIEW_ONLY");
    expect(result.stdout).not.toContain("LEGACY_OR_UNKNOWN");
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
        registryStatus: string;
        generatedModulePath: string | null;
        permissionManifestPath: string | null;
      }>;
      errors: string[];
    };

    expect(parsed.valid).toBe(true);
    expect(parsed.counts).toEqual({
      legalImportSlots: 64,
      // Třináctý je ICM preview vrstva ze schválených mřížek RYE (22. 9. 2026,
      // rozhodnutí 3a a 4a): registrovaná, ale PREVIEW_ONLY - legal slot pro
      // šestistolový $EV čeká na úplný pack, ne na tuhle vrstvu.
      registeredRuntimePacks: 13,
      generatedProductionModules: 4,
      permissionManifests: 8,
      errors: 0,
    });
    expect(parsed.packs.some((pack) => (
      pack.packId === "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1" &&
      pack.registered &&
      pack.legalImportSlot &&
      pack.registryStatus === "LEGAL_SLOT"
    ))).toBe(true);
    expect(parsed.packs.some((pack) => (
      pack.packId === "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1" &&
      pack.registered &&
      !pack.legalImportSlot &&
      pack.registryStatus === "PREVIEW_ONLY"
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

  it("blokuje orphan generated modul bez runtime registrace a provenance", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-registry-integrity-"));
    temporaryDirectories.push(directory);
    const modulePath = join(
      directory,
      "mtt-full-ring-9-turbo-production-preflop-chip-ev-ante-on-v1.ts",
    );
    writeFileSync(
      modulePath,
      'export const orphanPack = {\n' +
        '  "id": "mtt-full-ring-9-turbo-production-preflop-chip-ev-ante-on-v1"\n' +
        "};\n",
      "utf8",
    );

    const result = runRegistryIntegrity(`--range-dir=${directory}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("Generated production module is not registered");
    expect(result.stdout).toContain("Generated production module has no permission manifest");
    expect(result.stdout).toContain("Generated production module has no provenance fingerprint");
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
