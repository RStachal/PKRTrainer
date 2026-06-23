import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:blockers CLI", () => {
  it("vypise source-free blocker report pro neprodukcni MTT radky", () => {
    const result = runBlockers();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT production blockers");
    expect(result.stdout).toContain("total rows in filter: 64");
    expect(result.stdout).toContain("blocker rows: 64");
    expect(result.stdout).toContain("candidate blocker rows: 54");
    expect(result.stdout).toContain("missing blocker rows: 10");
    expect(result.stdout).toContain("ready for validation: 0");
    expect(result.stdout).toContain("missing normalized.json: 64");
    expect(result.stdout).toContain("missing permission.json: 64");
    expect(result.stdout).toContain(
      "priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=8, P2_PREFLOP_DOLAR_EV=8, P3_FLOP_PRODUCTION=16, P4_TURN_PRODUCTION=16, P5_RIVER_PRODUCTION=16",
    );
    expect(result.stdout).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(result.stdout).toContain("P5_RIVER_PRODUCTION");
    expect(result.stdout).toContain("blocker: No production RIVER StrategyPack is registered for SIX_MAX/DOLAR_EV.");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi filtrovat blockery a vypsat JSON pro operator tooling", () => {
    const result = runBlockers(
      "--format=SIX_MAX",
      "--speed=TURBO",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--json",
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      filters: {
        tableFormat: string;
        blindSpeed: string;
        evModel: string;
        street: string;
      };
      counts: {
        totalRows: number;
        blockerRows: number;
        candidateRows: number;
        missingRows: number;
        readyForValidation: number;
        missingNormalized: number;
        missingPermission: number;
        byPriority: Record<string, number>;
      };
      rows: Array<{
        priority: string;
        slotId: string;
        status: string;
        coverageKind: string;
        blockers: string[];
        importSlot: { packId: string } | null;
        intake: {
          normalizedPresent: boolean;
          permissionPresent: boolean;
          readyForValidation: boolean;
        };
      }>;
    };

    expect(parsed.filters).toEqual({
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      evModel: "DOLAR_EV",
      street: "RIVER",
    });
    expect(parsed.counts).toEqual({
      totalRows: 2,
      blockerRows: 2,
      candidateRows: 2,
      missingRows: 0,
      readyForValidation: 0,
      missingNormalized: 2,
      missingPermission: 2,
      byPriority: {
        P0_READY_FOR_VALIDATION: 0,
        P1_PREFLOP_CHIP_EV: 0,
        P2_PREFLOP_DOLAR_EV: 0,
        P3_FLOP_PRODUCTION: 0,
        P4_TURN_PRODUCTION: 0,
        P5_RIVER_PRODUCTION: 2,
      },
    });
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        priority: "P5_RIVER_PRODUCTION",
        slotId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|ON",
        status: "CANDIDATE",
        coverageKind: "POSTFLOP_PUBLIC_HEURISTIC",
        importSlot: expect.objectContaining({
          packId: "mtt-six-max-turbo-river-dolar-ev-ante-on-production-v1",
        }),
        intake: {
          normalizedPresent: false,
          permissionPresent: false,
          readyForValidation: false,
        },
      }),
      expect.objectContaining({
        priority: "P5_RIVER_PRODUCTION",
        slotId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF",
        status: "CANDIDATE",
        coverageKind: "POSTFLOP_PUBLIC_HEURISTIC",
        importSlot: expect.objectContaining({
          packId: "mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1",
        }),
        intake: {
          normalizedPresent: false,
          permissionPresent: false,
          readyForValidation: false,
        },
      }),
    ]);
    expect(parsed.rows[0].blockers).toContain(
      "No production RIVER StrategyPack is registered for SIX_MAX/DOLAR_EV.",
    );
  });

  it("umi vypsat jen souhrn pro release check bez detailnich slot radku", () => {
    const result = runBlockers("--summary");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT production blockers");
    expect(result.stdout).toContain("total rows in filter: 64");
    expect(result.stdout).toContain("blocker rows: 64");
    expect(result.stdout).toContain("missing permission.json: 64");
    expect(result.stdout).toContain("priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=8");
    expect(result.stdout).not.toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(result.stdout).not.toContain("blocker:");
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runBlockers("--ev=ICM");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --ev value: ICM");
    expect(result.stderr).toContain("Usage:");
  });
});

function runBlockers(...args: string[]) {
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
  const npmArgs = ["run", "mtt:blockers", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
