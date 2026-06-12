import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:slots CLI", () => {
  it("vypise legalni preflop a postflop MTT import sloty", () => {
    const result = runSlots();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT preflop legal import slots");
    expect(result.stdout).toContain("slots: 14");
    expect(result.stdout).toContain("MTT postflop legal import slots");
    expect(result.stdout).toContain("slots: 48");
    expect(result.stdout).toContain("SIX_MAX|TURBO|DOLAR_EV|PREFLOP|OFF");
    expect(result.stdout).toContain("mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
  });

  it("umi vypsat jen postflop sloty", () => {
    const result = runSlots("--kind=postflop");

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("MTT preflop legal import slots");
    expect(result.stdout).toContain("MTT postflop legal import slots");
    expect(result.stdout).toContain("slots: 48");
  });

  it("vrati chybu pro neznamy kind", () => {
    const result = runSlots("--kind=unknown");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});

function runSlots(...args: string[]) {
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
  const npmArgs = ["run", "mtt:slots", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
