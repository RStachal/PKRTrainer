import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:postflop-coverage CLI", () => {
  it("vypise granularni source-free production target blockery", () => {
    const result = runCoverage("--limit=5");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT postflop production coverage targets");
    expect(result.stdout).toContain("profile rows: 48");
    expect(result.stdout).toContain("required position patterns: 50");
    expect(result.stdout).toContain("total targets: 8000");
    expect(result.stdout).toContain("covered targets: 0");
    expect(result.stdout).toContain("blocked targets: 8000");
    expect(result.stdout).toContain("street counts: FLOP=0/3200 covered, 3200 blocked, TURN=0/3200 covered, 3200 blocked, RIVER=0/1600 covered, 1600 blocked");
    expect(result.stdout).toContain("blocker counts: MISSING_PACK=8000, MISSING_RULE=0, PACK_NOT_PRODUCTION_READY=0");
    expect(result.stdout).toContain("shown rows: 5/8000");
    expect(result.stdout).toContain("FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON|SINGLE_RAISED|SINGLE_RAISED_POT_CBET|SRP_UTG_VS_BB");
    expect(result.stdout).toContain("No production FLOP StrategyPack is registered for FULL_RING_9/CHIP_EV.");
    expect(result.stdout).not.toContain("https://");
  });

  it("vrati JSON se vsemi target kombinacemi pro release tooling", () => {
    const result = runCoverage("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      counts: {
        profileRows: number;
        requiredPositionPatterns: number;
        totalTargets: number;
        coveredTargets: number;
        blockedTargets: number;
        byStreet: Record<string, { total: number; covered: number; blocked: number }>;
        byState: Record<string, number>;
        byBlockerKind: Record<string, number>;
      };
      rows: Array<{
        targetId: string;
        state: string;
        blockerKind: string;
        street: string;
        potType: string;
        actionNode: string;
        positionPattern: string;
        packId: string | null;
      }>;
    };

    expect(parsed.counts).toEqual({
      profileRows: 48,
      requiredPositionPatterns: 50,
      totalTargets: 8000,
      coveredTargets: 0,
      blockedTargets: 8000,
      byStreet: {
        FLOP: { total: 3200, covered: 0, blocked: 3200 },
        TURN: { total: 3200, covered: 0, blocked: 3200 },
        RIVER: { total: 1600, covered: 0, blocked: 1600 },
      },
      byState: { COVERED: 0, BLOCKED: 8000 },
      byBlockerKind: {
        NONE: 0,
        MISSING_PACK: 8000,
        MISSING_RULE: 0,
        PACK_NOT_PRODUCTION_READY: 0,
      },
    });
    expect(parsed.rows).toHaveLength(8000);
    expect(parsed.rows).toContainEqual(expect.objectContaining({
      targetId: "FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON|SINGLE_RAISED|SINGLE_RAISED_POT_CBET|SRP_UTG_VS_BB",
      state: "BLOCKED",
      blockerKind: "MISSING_PACK",
      street: "FLOP",
      potType: "SINGLE_RAISED",
      actionNode: "SINGLE_RAISED_POT_CBET",
      positionPattern: "SRP_UTG_VS_BB",
      packId: null,
    }));
    expect(parsed.rows).toContainEqual(expect.objectContaining({
      targetId: "FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON|SINGLE_RAISED|FLOP_FACING_BET|SRP_UTG_VS_BB",
      state: "BLOCKED",
      blockerKind: "MISSING_PACK",
      actionNode: "FLOP_FACING_BET",
    }));
    expect(parsed.rows).toContainEqual(expect.objectContaining({
      targetId: "FULL_RING_9|REGULAR|CHIP_EV|TURN|ON|SINGLE_RAISED|TURN_FACING_BET|SRP_UTG_VS_BB",
      state: "BLOCKED",
      blockerKind: "MISSING_PACK",
      actionNode: "TURN_FACING_BET",
    }));
    expect(parsed.rows).toContainEqual(expect.objectContaining({
      targetId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF|THREE_BET_POT|RIVER_PRESSURE|3BP_BTN_VS_UTG",
      state: "BLOCKED",
      blockerKind: "MISSING_PACK",
    }));
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runCoverage("--street=FLOP");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --street=FLOP");
    expect(result.stderr).toContain("Usage:");
  });
});

function runCoverage(...args: string[]) {
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
  const npmArgs = ["run", "mtt:postflop-coverage", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
