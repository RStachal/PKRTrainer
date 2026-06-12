import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:completion CLI", () => {
  it("vypise default release gate bez detailu", () => {
    const result = runCompletion();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("total rows: 64");
    expect(result.stdout).not.toContain("MTT completion readiness");
  });

  it("umi filtrovat detailni readiness podle MTT dimenzi", () => {
    const result = runCompletion(
      "--details",
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("MTT completion readiness");
    expect(result.stdout).toContain("total rows: 4");
    expect(result.stdout).toContain("candidate rows: 4");
    expect(result.stdout).toContain("non-production rows: 4");
    expect(result.stdout).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(result.stdout).toContain("mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
    expect(result.stdout).not.toContain("FULL_RING_9|");
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runCompletion("--details", "--street=SHOWDOWN");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --street value: SHOWDOWN");
    expect(result.stderr).toContain("Usage:");
  });
});

function runCompletion(...args: string[]) {
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
  const npmArgs = ["run", "mtt:completion", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
