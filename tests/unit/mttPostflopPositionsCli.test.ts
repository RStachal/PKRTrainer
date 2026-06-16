import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:postflop-positions CLI", () => {
  it("vypise supported i unsupported heads-up pozicni dvojice", () => {
    const result = runPositions();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT postflop position coverage");
    expect(result.stdout).toContain("total rows: 204");
    expect(result.stdout).toContain("supported rows: 67");
    expect(result.stdout).toContain("unsupported rows: 137");
    expect(result.stdout).toContain("format counts: FULL_RING_9=50/144 supported, 94 unsupported, SIX_MAX=17/60 supported, 43 unsupported");
    expect(result.stdout).toContain("pot counts: SINGLE_RAISED=40/102 supported, 62 unsupported, THREE_BET_POT=27/102 supported, 75 unsupported");
    expect(result.stdout).toContain("FULL_RING_9 | SINGLE_RAISED | BTN->BB | SUPPORTED | SRP_BTN_VS_BB");
    expect(result.stdout).toContain("SIX_MAX | THREE_BET_POT | BTN->UTG | SUPPORTED | 3BP_BTN_VS_UTG");
    expect(result.stdout).toContain("FULL_RING_9 | SINGLE_RAISED | BB->UTG | UNSUPPORTED | UNMAPPED");
    expect(result.stdout).toContain("reason: BB open-raise SRP heads-up pair is not modeled as an aggressor source.");
    expect(result.stdout).not.toContain("https://");
  });

  it("vrati JSON pro coverage tooling", () => {
    const result = runPositions("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      counts: {
        totalRows: number;
        supportedRows: number;
        unsupportedRows: number;
        byFormat: Record<string, { total: number; supported: number; unsupported: number }>;
        byPotType: Record<string, { total: number; supported: number; unsupported: number }>;
        byPattern: Record<string, number>;
      };
      rows: Array<{
        tableFormat: string;
        potType: string;
        aggressorPosition: string;
        callerPosition: string;
        state: string;
        positionPattern: string | null;
        reason: string | null;
      }>;
    };

    expect(parsed.counts).toMatchObject({
      totalRows: 204,
      supportedRows: 67,
      unsupportedRows: 137,
      byFormat: {
        FULL_RING_9: { total: 144, supported: 50, unsupported: 94 },
        SIX_MAX: { total: 60, supported: 17, unsupported: 43 },
      },
      byPotType: {
        SINGLE_RAISED: { total: 102, supported: 40, unsupported: 62 },
        THREE_BET_POT: { total: 102, supported: 27, unsupported: 75 },
      },
    });
    expect(Object.keys(parsed.counts.byPattern)).toHaveLength(50);
    expect(Object.values(parsed.counts.byPattern).reduce((sum, count) => sum + count, 0)).toBe(67);
    expect(parsed.counts.byPattern).toMatchObject({
      SRP_UTG_VS_BB: 2,
      SRP_BTN_VS_BB: 2,
      SRP_SB_VS_BB: 2,
      "3BP_BTN_VS_UTG": 2,
      "3BP_UTG_1_VS_UTG": 1,
    });
    expect(parsed.rows).toHaveLength(204);
    expect(parsed.rows).toContainEqual(expect.objectContaining({
      tableFormat: "SIX_MAX",
      potType: "SINGLE_RAISED",
      aggressorPosition: "SB",
      callerPosition: "BB",
      state: "SUPPORTED",
      positionPattern: "SRP_SB_VS_BB",
      reason: null,
    }));
    expect(parsed.rows).toContainEqual(expect.objectContaining({
      tableFormat: "FULL_RING_9",
      potType: "THREE_BET_POT",
      aggressorPosition: "BB",
      callerPosition: "BTN",
      state: "UNSUPPORTED",
      positionPattern: null,
    }));
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runPositions("--format=SIX_MAX");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --format=SIX_MAX");
    expect(result.stderr).toContain("Usage:");
  });
});

function runPositions(...args: string[]) {
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
  const npmArgs = ["run", "mtt:postflop-positions", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
