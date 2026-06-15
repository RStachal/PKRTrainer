import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:validate-ready-intake CLI", () => {
  it("projde bez ready slotu a vypise source-free dry-run souhrn", () => {
    const result = runValidateReady();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT ready intake validation");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("ready rows: 0");
    expect(result.stdout).toContain("valid rows: 0");
    expect(result.stdout).toContain("failed rows: 0");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON pro batch tooling", () => {
    const result = runValidateReady("--format=SIX_MAX", "--ev=DOLAR_EV", "--street=RIVER", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      filters: { tableFormat: string; evModel: string; street: string };
      valid: boolean;
      counts: {
        readyRows: number;
        validRows: number;
        failedRows: number;
      };
      rows: unknown[];
    };

    expect(parsed.filters).toEqual({
      tableFormat: "SIX_MAX",
      evModel: "DOLAR_EV",
      street: "RIVER",
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.counts).toEqual({
      readyRows: 0,
      validRows: 0,
      failedRows: 0,
    });
    expect(parsed.rows).toEqual([]);
  });

  it("umi vynutit nenulovy exit kdyz neni co validovat", () => {
    const result = runValidateReady("--fail-on-empty");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("ready rows: 0");
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runValidateReady("--format=HU");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --format value: HU");
    expect(result.stderr).toContain("Usage:");
  });
});

function runValidateReady(...args: string[]) {
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
  const npmArgs = ["run", "mtt:validate-ready-intake", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
