import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * This file used to cost 48 minutes of every full test run - roughly a fifth of
 * it - because three of its four tests each ran the real ten-gate chain, and
 * each gate is its own npm process transpiling the project from scratch.
 *
 * Two changes. The real chain now runs once, in beforeAll, and the assertions
 * that need real gate output share that one run. And the assertions that are
 * about *this runner* - how it aggregates, what it writes, what exit code it
 * returns - drive it with an injected two-command list instead, because none of
 * them need a real gate to be true.
 *
 * The injected runs are also better tests than what they replace. The old ones
 * asserted `failedCommands: 3`, which was true only while exactly three real
 * gates happened to be failing: a test coupled to whatever state the product was
 * in on the day, and one that would have gone quiet the moment somebody fixed a
 * gate.
 */

/** A gate list that costs two npm startups instead of ten full gates. */
function stubCommands(directory: string, ...outcomes: ("pass" | "fail")[]): string {
  const path = join(directory, "gates.json");
  writeFileSync(path, JSON.stringify(outcomes.map((outcome, index) => ({
    label: `stub ${index} ${outcome}`,
    // `npm run env` exists in every project and exits zero; a script that does
    // not exist exits non-zero. Neither needs anything added to package.json.
    npmArgs: outcome === "pass"
      ? ["run", "--silent", "env"]
      : ["run", "pkrtrainer-no-such-script"],
  }))), "utf8");
  return path;
}

describe("mtt:release-gates CLI", () => {
  // One real run, shared. See the note at the top of this file. It writes the
  // JSON report to a file as well, so the rendered output and the machine
  // readable one both come from the same execution instead of two.
  let real: ReturnType<typeof runReleaseGates>;
  let realReport: string;
  const realDirectory = mkdtempSync(join(tmpdir(), "pkrtrainer-release-gates-real-"));
  beforeAll(() => {
    realReport = join(realDirectory, "report.json");
    real = runReleaseGates(`--output=${realReport}`);
  }, 30 * 60 * 1000);
  afterAll(() => {
    rmSync(realDirectory, { recursive: true, force: true });
  });

  it("spusti vsechny MTT release gate souhrny i kdyz nektere selzou", () => {
    const result = real;

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT release gates");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("commands: 10");
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
    expect(result.stdout).toContain("## Range intake workspace guard");
    expect(result.stdout).toContain("Range intake workspace guard");
    expect(result.stdout).toContain("## Ready intake slots");
    expect(result.stdout).toContain("Range intake status");
    expect(result.stdout).toContain("## Ready MTT intake validation");
    expect(result.stdout).toContain("MTT ready intake validation");
    expect(result.stdout).toContain("## MTT registry integrity");
    expect(result.stdout).toContain("MTT production registry integrity");
    expect(result.stdout).toContain("## Android WebView/device preflight");
    expect(result.stdout).toContain("ready serial:");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON souhrn vsech gate prikazu pro operator tooling", () => {
    const result = real;

    expect(result.status).toBe(1);
    const parsed = JSON.parse(readFileSync(realReport, "utf8")) as {
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
      commands: 10,
      failedCommands: 3,
    });
    expect(parsed.commands.map((command) => command.label)).toEqual([
      "MTT completion production gate",
      "MTT blocker summary",
      "MTT intake priority summary",
      "MTT next action",
      "MTT postflop final release gate",
      "Range intake workspace guard",
      "Ready intake slots",
      "Ready MTT intake validation",
      "MTT registry integrity",
      "Android WebView/device preflight",
    ]);
    expect(parsed.commands[0].npmArgs).toEqual(["run", "mtt:completion", "--", "--summary"]);
    expect(parsed.commands[2].npmArgs).toEqual(["run", "mtt:intake-plan", "--", "--summary"]);
    expect(parsed.commands[2].stdout).toContain("MTT intake priority plan");
    expect(parsed.commands[3].stdout).toContain("Next MTT action");
    expect(parsed.commands.every((command) => command.stdout.length > 0)).toBe(true);
    expect(parsed.commands[0].stdout).toContain("MTT completion release gate");
    expect(parsed.commands[8].stdout).toContain("MTT production registry integrity");
    expect(parsed.commands[9].npmArgs).toEqual(["run", "e2e:android:preflight"]);
    expect(parsed.commands[9].stdout).toContain("ready serial:");
    expect(parsed.commands[0].stdout).not.toContain("> mtt-preflop-trainer");
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runReleaseGates("--format=SIX_MAX");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --format=SIX_MAX");
    expect(result.stderr).toContain("Usage:");
  });

  it("umi zapsat cisty JSON artefakt pro release handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-release-gates-"));
    const outputPath = join(directory, "report.json");
    try {
      // Injected, and deliberately one of each: this asserts that the runner
      // counts and writes, which needs a known mix of outcomes rather than
      // whichever real gates happen to be red today.
      const commands = stubCommands(directory, "pass", "fail", "fail");
      const result = runReleaseGates(`--commands=${commands}`, `--output=${outputPath}`);

      expect(result.status).toBe(1);
      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        commandSource: string;
        counts: { commands: number; failedCommands: number };
      };
      expect(parsed.counts).toEqual({ commands: 3, failedCommands: 2 });
      // An injected run has checked nothing about the product, and the artefact
      // has to say so - otherwise it reads exactly like release evidence.
      expect(parsed.commandSource).toBe("INJECTED");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("passes cleanly when every gate passes, and says the list was injected", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-release-gates-green-"));
    try {
      // There is no way to assert the all-green path against the real gates:
      // it only happens when the product is finished. Injection is what makes
      // this case testable at all.
      const commands = stubCommands(directory, "pass", "pass");
      const result = runReleaseGates(`--commands=${commands}`, "--json");

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
        valid: boolean;
        commandSource: string;
        counts: { commands: number; failedCommands: number };
      };
      expect(parsed.valid).toBe(true);
      expect(parsed.counts).toEqual({ commands: 2, failedCommands: 0 });
      expect(parsed.commandSource).toBe("INJECTED");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("marks a real run as BUILT_IN so evidence is distinguishable", () => {
    const parsed = JSON.parse(readFileSync(realReport, "utf8")) as { commandSource: string };
    expect(parsed.commandSource).toBe("BUILT_IN");
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
