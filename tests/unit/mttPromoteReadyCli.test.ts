import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:promote-ready CLI", () => {
  it("v dry-run rezimu projde bez ready slotu a nevytvari moduly", () => {
    const result = runPromoteReady();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT ready intake promotion");
    expect(result.stdout).toContain("mode: dry-run");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("priority: all");
    expect(result.stdout).toContain("ready rows: 0");
    expect(result.stdout).toContain("waiting rows: 64");
    expect(result.stdout).toContain("missing normalized.json: 64");
    expect(result.stdout).toContain("missing permission.json: 64");
    expect(result.stdout).toContain("writeReady rows: 0");
    expect(result.stdout).toContain("blocked rows: 0");
    expect(result.stdout).toContain("written rows: 0");
    expect(result.stdout).toContain("next action: npm run mtt:next-action");
    expect(result.stdout).toContain("write guard: rerun with --write --confirm=WRITE_READY_MTT_MODULES");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON plan pro batch tooling", () => {
    const result = runPromoteReady("--priority=P1_PREFLOP_CHIP_EV", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      mode: string;
      valid: boolean;
      priority: string;
      force: boolean;
      counts: {
        readyRows: number;
        waitingRows: number;
        missingNormalized: number;
        missingPermission: number;
        writeReadyRows: number;
        blockedRows: number;
        existingOutputRows: number;
        writtenRows: number;
      };
      nextActionCommand: string;
      rows: unknown[];
    };

    expect(parsed.mode).toBe("dry-run");
    expect(parsed.valid).toBe(true);
    expect(parsed.priority).toBe("P1_PREFLOP_CHIP_EV");
    expect(parsed.force).toBe(false);
    expect(parsed.counts).toEqual({
      readyRows: 0,
      waitingRows: 8,
      missingNormalized: 8,
      missingPermission: 8,
      writeReadyRows: 0,
      blockedRows: 0,
      existingOutputRows: 0,
      writtenRows: 0,
    });
    expect(parsed.nextActionCommand).toBe("npm run mtt:next-action");
    expect(parsed.rows).toEqual([]);
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("odmitne zapis bez explicitniho potvrzeni", () => {
    const result = runPromoteReady("--write");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Writing ready MTT modules requires --confirm=WRITE_READY_MTT_MODULES");
    expect(result.stderr).toContain("Usage:");
  });

  it("odmitne soucasne dry-run a write rezimy v libovolnem poradi", () => {
    for (const args of [
      ["--dry-run", "--write"],
      ["--write", "--dry-run"],
    ]) {
      const result = runPromoteReady(...args);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Use only one of --dry-run or --write.");
      expect(result.stderr).toContain("Usage:");
    }
  });

  it("podporuje zapis jen s explicitnim potvrzenim", () => {
    const result = runPromoteReady("--write", "--confirm=WRITE_READY_MTT_MODULES", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      mode: string;
      valid: boolean;
      counts: { writtenRows: number };
      rows: unknown[];
    };

    expect(parsed.mode).toBe("write");
    expect(parsed.valid).toBe(true);
    expect(parsed.counts.writtenRows).toBe(0);
    expect(parsed.rows).toEqual([]);
  });

  it("umi zapsat cisty JSON artefakt pro promotion handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-promote-ready-"));
    try {
      const outputPath = join(directory, "mtt-promote-ready-report.json");
      const result = runPromoteReady("--priority=P1_PREFLOP_CHIP_EV", `--output=${outputPath}`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("MTT ready intake promotion");
      expect(result.stdout.trim().startsWith("{")).toBe(false);

      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        mode: string;
        priority: string;
        counts: { readyRows: number; waitingRows: number; missingNormalized: number; missingPermission: number };
        rows: unknown[];
      };
      expect(parsed.mode).toBe("dry-run");
      expect(parsed.priority).toBe("P1_PREFLOP_CHIP_EV");
      expect(parsed.counts).toMatchObject({
        readyRows: 0,
        waitingRows: 8,
        missingNormalized: 8,
        missingPermission: 8,
      });
      expect(parsed.rows).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runPromoteReady("--apply");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --apply");
    expect(result.stderr).toContain("Usage:");
  });
});

function runPromoteReady(...args: string[]) {
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
  const npmArgs = ["run", "mtt:promote-ready", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
