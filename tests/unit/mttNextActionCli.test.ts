import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:next-action CLI", () => {
  it("vybere prvni konkretni cekajici MTT import krok podle priority", () => {
    const result = runNextAction();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Next MTT action");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("state: WAITING_FOR_FILES");
    expect(result.stdout).toContain("priority: P1_PREFLOP_CHIP_EV");
    expect(result.stdout).toContain("slot: FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF");
    expect(result.stdout).toContain("pack: mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(result.stdout).toContain("missing file: Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/normalized.json");
    expect(result.stdout).toContain("missing file: Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/permission.json");
    expect(result.stdout).toContain("validate: npm run validate:range-import");
    expect(result.stdout).toContain("build dry-run: npm run build:range-module");
    expect(result.stdout).toContain("npm run mtt:acceptance");
    expect(result.stdout).toContain("npm run mtt:release-gates -- --json");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON pro operator tooling", () => {
    const result = runNextAction("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      state: string;
      counts: {
        blockerRows: number;
        readyForValidation: number;
        missingNormalized: number;
        missingPermission: number;
        byPriority: Record<string, number>;
      };
      nextAction: {
        priority: string;
        slotId: string;
        packId: string;
        missingFiles: string[];
        commands: {
          validate: string;
          buildDryRun: string;
        };
      };
      followUpCommands: string[];
      sourceReports: string[];
    };

    expect(parsed.valid).toBe(false);
    expect(parsed.state).toBe("WAITING_FOR_FILES");
    expect(parsed.counts.blockerRows).toBe(64);
    expect(parsed.counts.readyForValidation).toBe(0);
    expect(parsed.counts.missingNormalized).toBe(64);
    expect(parsed.counts.missingPermission).toBe(64);
    expect(parsed.counts.byPriority.P1_PREFLOP_CHIP_EV).toBe(8);
    expect(parsed.nextAction.priority).toBe("P1_PREFLOP_CHIP_EV");
    expect(parsed.nextAction.slotId).toBe("FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF");
    expect(parsed.nextAction.packId).toBe("mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(parsed.nextAction.missingFiles).toEqual([
      "Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/normalized.json",
      "Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/permission.json",
    ]);
    expect(parsed.nextAction.commands.validate).toContain("npm run validate:range-import");
    expect(parsed.nextAction.commands.buildDryRun).toContain("npm run build:range-module");
    expect(parsed.followUpCommands).toContain("npm run mtt:acceptance");
    expect(parsed.sourceReports).toContain("npm run mtt:release-gates -- --json");
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runNextAction("--priority=P1_PREFLOP_CHIP_EV");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --priority=P1_PREFLOP_CHIP_EV");
    expect(result.stderr).toContain("Usage:");
  });
});

function runNextAction(...args: string[]) {
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
  const npmArgs = ["run", "mtt:next-action", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
