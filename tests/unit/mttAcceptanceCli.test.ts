import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:acceptance CLI", () => {
  it("spusti finalni MTT acceptance gate a zustane cerveny pred legalnimi production daty", () => {
    const result = runAcceptance();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT acceptance gate");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("checklist: Agents/mtt-done-checklist.md");
    expect(result.stdout).toContain("commands: 11");
    expect(result.stdout).toContain("failed commands: 3");
    expect(result.stdout).toContain("## MTT completion production gate");
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("## MTT blocker summary");
    expect(result.stdout).toContain("MTT production blockers");
    expect(result.stdout).toContain("## MTT intake priority summary");
    expect(result.stdout).toContain("MTT intake priority plan");
    expect(result.stdout).toContain("## MTT next action");
    expect(result.stdout).toContain("Next MTT action");
    expect(result.stdout).toContain("slot: SIX_MAX|REGULAR|CHIP_EV|PREFLOP|OFF");
    expect(result.stdout).toContain("## MTT postflop final release gate");
    expect(result.stdout).toContain("MTT postflop final release gate");
    expect(result.stdout).toContain("## Ready MTT intake validation");
    expect(result.stdout).toContain("MTT ready intake validation");
    expect(result.stdout).toContain("## MTT source-free UI guard");
    expect(result.stdout).toContain("tests/unit/uiNoSourceCitation.test.ts");
    expect(result.stdout).toContain("9 tests");
    expect(result.stdout).toContain("## Range intake workspace guard");
    expect(result.stdout).toContain("Range intake workspace guard");
    expect(result.stdout).toContain("## Ready intake slots");
    expect(result.stdout).toContain("Range intake status");
    expect(result.stdout).toContain("## MTT registry integrity");
    expect(result.stdout).toContain("MTT production registry integrity");
    expect(result.stdout).toContain("## Android WebView/device preflight");
    expect(result.stdout).toContain("Android WebView/device preflight");
    expect(result.stdout).toContain("ready serial:");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON report pro release/operator tooling", () => {
    const result = runAcceptance("--json");

    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      checklist: string;
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
    expect(parsed.checklist).toBe("Agents/mtt-done-checklist.md");
    expect(parsed.counts).toEqual({
      commands: 11,
      failedCommands: 3,
    });
    expect(parsed.commands.map((command) => command.label)).toEqual([
      "MTT completion production gate",
      "MTT blocker summary",
      "MTT intake priority summary",
      "MTT next action",
      "MTT postflop final release gate",
      "Ready MTT intake validation",
      "MTT source-free UI guard",
      "Range intake workspace guard",
      "Ready intake slots",
      "MTT registry integrity",
      "Android WebView/device preflight",
    ]);
    expect(parsed.commands[0].npmArgs).toEqual(["run", "mtt:completion", "--", "--summary"]);
    expect(parsed.commands[5].npmArgs).toEqual(["run", "mtt:validate-ready-intake"]);
    expect(parsed.commands.every((command) => command.stdout.length > 0)).toBe(true);
    expect(parsed.commands[0].stdout).toContain("MTT completion release gate");
    expect(parsed.commands[3].stdout).toContain("Next MTT action");
    expect(parsed.commands[6].stdout).toContain("tests/unit/uiNoSourceCitation.test.ts");
    expect(parsed.commands[6].stdout).toContain("9 tests");
    expect(parsed.commands[9].stdout).toContain("MTT production registry integrity");
    expect(parsed.commands[10].npmArgs).toEqual(["run", "e2e:android:preflight"]);
    expect(parsed.commands[10].stdout).toContain("ready serial:");
    expect(parsed.commands[0].stdout).not.toContain("> mtt-preflop-trainer");
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runAcceptance("--format=SIX_MAX");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --format=SIX_MAX");
    expect(result.stderr).toContain("Usage:");
  });

  it("umi zapsat cisty JSON artefakt pro finalni MTT handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-acceptance-"));
    const outputPath = join(directory, "report.json");
    try {
      const result = runAcceptance(`--output=${outputPath}`);

      expect(result.status).toBe(1);
      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        checklist: string;
        counts: { commands: number; failedCommands: number };
      };
      expect(parsed.checklist).toBe("Agents/mtt-done-checklist.md");
      expect(parsed.counts).toEqual({ commands: 11, failedCommands: 3 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runAcceptance(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:acceptance", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
