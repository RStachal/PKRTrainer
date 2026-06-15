import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("range:intake CLI", () => {
  it("vypise stav lokalnich raw import souboru pro vsechny legalni sloty", () => {
    const result = runIntake();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Range intake status");
    expect(result.stdout).toContain("slots: 62");
    expect(result.stdout).toContain("ready for validation: 0");
    expect(result.stdout).toContain("missing normalized.json: 62");
    expect(result.stdout).toContain("missing permission.json: 62");
    expect(result.stdout).toContain("preflop | SIX_MAX|TURBO|DOLAR_EV|PREFLOP|OFF");
    expect(result.stdout).toContain("postflop | SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi filtrovat intake status a vypsat JSON pro batch tooling", () => {
    const result = runIntake(
      "--kind=postflop",
      "--format=SIX_MAX",
      "--speed=TURBO",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
      "--json",
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      counts: {
        total: number;
        readyForValidation: number;
        missingNormalized: number;
        missingPermission: number;
      };
      rows: Array<{
        kind: string;
        slotId: string;
        normalizedPresent: boolean;
        permissionPresent: boolean;
        readyForValidation: boolean;
      }>;
    };

    expect(parsed.counts).toEqual({
      total: 2,
      readyForValidation: 0,
      missingNormalized: 2,
      missingPermission: 2,
    });
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        kind: "postflop",
        slotId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|ON",
        normalizedPresent: false,
        permissionPresent: false,
        readyForValidation: false,
      }),
      expect.objectContaining({
        kind: "postflop",
        slotId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF",
        normalizedPresent: false,
        permissionPresent: false,
        readyForValidation: false,
      }),
    ]);
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runIntake("--format=HU");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --format value: HU");
    expect(result.stderr).toContain("Usage:");
  });
});

function runIntake(...args: string[]) {
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
  const npmArgs = ["run", "range:intake", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
