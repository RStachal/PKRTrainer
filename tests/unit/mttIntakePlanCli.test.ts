import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:intake-plan CLI", () => {
  it("vypise prioritizovany source-free intake queue pro MTT production gapy", () => {
    const result = runPlan();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT intake priority plan");
    expect(result.stdout).toContain("queue rows: 62");
    expect(result.stdout).toContain("shown rows: 12");
    expect(result.stdout).toContain("ready for validation: 0");
    expect(result.stdout).toContain(
      "priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=6, P2_PREFLOP_DOLAR_EV=8, P3_FLOP_PRODUCTION=16, P4_TURN_PRODUCTION=16, P5_RIVER_PRODUCTION=16",
    );
    expect(result.stdout).toContain("showing first 12 rows; use --all to show the full queue");
    expect(result.stdout).toContain(
      "1. P1_PREFLOP_CHIP_EV | FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF | MISSING | WAITING",
    );
    expect(result.stdout).toContain("--kind=mtt-preflop");
    expect(result.stdout).toContain("mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi filtrovat priority plan a vratit JSON pro batch tooling", () => {
    const result = runPlan(
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
        totalQueueRows: number;
        shownRows: number;
        readyForValidation: number;
        missingNormalized: number;
        missingPermission: number;
        byPriority: Record<string, number>;
      };
      rows: Array<{
        priority: string;
        slotId: string;
        status: string;
        nextCommand: string;
        intake: { readyForValidation: boolean };
      }>;
    };

    expect(parsed.filters).toEqual({
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      evModel: "DOLAR_EV",
      street: "RIVER",
    });
    expect(parsed.counts).toEqual({
      totalQueueRows: 2,
      shownRows: 2,
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
        slotId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF",
        status: "CANDIDATE",
        intake: expect.objectContaining({ readyForValidation: false }),
      }),
      expect.objectContaining({
        priority: "P5_RIVER_PRODUCTION",
        slotId: "SIX_MAX|TURBO|DOLAR_EV|RIVER|ON",
        status: "CANDIDATE",
        intake: expect.objectContaining({ readyForValidation: false }),
      }),
    ]);
    expect(parsed.rows[0].nextCommand).toContain("--kind=river-production");
  });

  it("umi omezit pocet radku pro lidsky vystup", () => {
    const result = runPlan("--limit=1");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("shown rows: 1");
    expect(result.stdout).toContain("showing first 1 rows; use --all to show the full queue");
    expect(result.stdout).toContain("1. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).not.toContain("2. ");
  });

  it("umi filtrovat primo podle prioritniho bucketu", () => {
    const result = runPlan("--priority=P1_PREFLOP_CHIP_EV", "--all");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("queue rows: 6");
    expect(result.stdout).toContain("shown rows: 6");
    expect(result.stdout).toContain("priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=6");
    expect(result.stdout).toContain("1. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).toContain("6. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).not.toContain("P2_PREFLOP_DOLAR_EV |");
  });

  it("vrati chybu pro neznamou prioritu", () => {
    const result = runPlan("--priority=P9");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --priority value: P9");
    expect(result.stderr).toContain("Usage:");
  });

  it("vrati chybu pro neplatny limit", () => {
    const result = runPlan("--limit=0");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --limit value: 0");
    expect(result.stderr).toContain("Usage:");
  });
});

function runPlan(...args: string[]) {
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
  const npmArgs = ["run", "mtt:intake-plan", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
