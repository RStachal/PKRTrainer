import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:release-gates CLI", () => {
  it("spusti vsechny MTT release gate souhrny i kdyz nektere selzou", () => {
    const result = runReleaseGates();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT release gates");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("commands: 7");
    expect(result.stdout).toContain("failed commands: 2");
    expect(result.stdout).toContain("## MTT completion production gate");
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("## MTT blocker summary");
    expect(result.stdout).toContain("MTT production blockers");
    expect(result.stdout).toContain("## MTT intake priority summary");
    expect(result.stdout).toContain("MTT intake priority plan");
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

  it("umi vratit JSON souhrn vsech gate prikazu pro operator tooling", () => {
    const result = runReleaseGates("--json");

    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      counts: {
        commands: number;
        failedCommands: number;
      };
      commands: Array<{
        label: string;
        npmArgs: string[];
        status: number;
        stdout: string;
        stderr: string;
      }>;
    };

    expect(parsed.valid).toBe(false);
    expect(parsed.counts).toEqual({
      commands: 7,
      failedCommands: 2,
    });
    expect(parsed.commands.map((command) => command.label)).toEqual([
      "MTT completion production gate",
      "MTT blocker summary",
      "MTT intake priority summary",
      "MTT postflop final release gate",
      "Range intake workspace guard",
      "Ready intake slots",
      "Ready MTT intake validation",
    ]);
    expect(parsed.commands[0].npmArgs).toEqual(["run", "mtt:completion", "--", "--summary"]);
    expect(parsed.commands[2].npmArgs).toEqual(["run", "mtt:intake-plan", "--", "--summary"]);
    expect(parsed.commands[2].stdout).toContain("MTT intake priority plan");
    expect(parsed.commands.every((command) => command.stdout.length > 0)).toBe(true);
    expect(parsed.commands[0].stdout).toContain("MTT completion release gate");
    expect(parsed.commands[0].stdout).not.toContain("> mtt-preflop-trainer");
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runReleaseGates("--format=SIX_MAX");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --format=SIX_MAX");
    expect(result.stderr).toContain("Usage:");
  });
});

function runReleaseGates(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:release-gates", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
