import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:release-gates CLI", () => {
  it("spusti vsechny MTT release gate souhrny i kdyz nektere selzou", () => {
    const result = runReleaseGates();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT release gates");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("commands: 6");
    expect(result.stdout).toContain("failed commands: 2");
    expect(result.stdout).toContain("## MTT completion production gate");
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("## MTT blocker summary");
    expect(result.stdout).toContain("MTT production blockers");
    expect(result.stdout).toContain("## MTT postflop final release gate");
    expect(result.stdout).toContain("MTT postflop final release gate");
    expect(result.stdout).toContain("## Range intake workspace guard");
    expect(result.stdout).toContain("Range intake workspace guard");
    expect(result.stdout).toContain("## Ready intake slots");
    expect(result.stdout).toContain("Range intake status");
    expect(result.stdout).toContain("## Ready MTT intake validation");
    expect(result.stdout).toContain("MTT ready intake validation");
    expect(result.stdout).not.toContain("https://");
  });
});

function runReleaseGates() {
  return spawnSync(command(), commandArgs(), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(): string[] {
  const npmArgs = ["run", "mtt:release-gates"];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
