import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:intake-plan CLI", () => {
  it("vypise prioritizovany source-free intake queue pro MTT production gapy", () => {
    const result = runPlan();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT intake priority plan");
    expect(result.stdout).toContain("queue rows: 64");
    expect(result.stdout).toContain("shown rows: 12");
    expect(result.stdout).toContain("ready for validation: 0");
    expect(result.stdout).toContain(
      "priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=8, P2_PREFLOP_DOLAR_EV=8, P3_FLOP_PRODUCTION=16, P4_TURN_PRODUCTION=16, P5_RIVER_PRODUCTION=16",
    );
    expect(result.stdout).toContain("showing first 12 rows; use --all to show the full queue");
    expect(result.stdout).toContain(
      "1. P1_PREFLOP_CHIP_EV | FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF | MISSING | WAITING",
    );
    expect(result.stdout).toContain("--kind=mtt-preflop");
    expect(result.stdout).toContain("build dry-run: npm run build:range-module -- --kind=mtt-preflop --dry-run");
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
        buildCommand: string;
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
    expect(parsed.rows[0].buildCommand).toContain("build:range-module");
    expect(parsed.rows[0].buildCommand).toContain("--kind=river-production");
    expect(parsed.rows[0].buildCommand).toContain("--dry-run");
  });

  it("umi omezit pocet radku pro lidsky vystup", () => {
    const result = runPlan("--limit=1");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("shown rows: 1");
    expect(result.stdout).toContain("showing first 1 rows; use --all to show the full queue");
    expect(result.stdout).toContain("1. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).not.toContain("2. ");
  });

  it("umi vypsat jen souhrn prioritni fronty pro release diagnostiku", () => {
    const result = runPlan("--summary");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT intake priority plan");
    expect(result.stdout).toContain("queue rows: 64");
    expect(result.stdout).toContain("detail rows available: 12");
    expect(result.stdout).not.toContain("shown rows: 12");
    expect(result.stdout).toContain("ready for validation: 0");
    expect(result.stdout).toContain("priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=8");
    expect(result.stdout).not.toContain("1. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).not.toContain("build dry-run:");
  });

  it("umi filtrovat primo podle prioritniho bucketu", () => {
    const result = runPlan("--priority=P1_PREFLOP_CHIP_EV", "--all");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("queue rows: 8");
    expect(result.stdout).toContain("shown rows: 8");
    expect(result.stdout).toContain("priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=8");
    expect(result.stdout).toContain("1. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).toContain("8. P1_PREFLOP_CHIP_EV");
    expect(result.stdout).not.toContain("P2_PREFLOP_DOLAR_EV |");
  });

  it("umi vypsat samostatnou DOLAR_EV preflop priority frontu", () => {
    const result = runPlan("--priority=P2_PREFLOP_DOLAR_EV", "--all");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("queue rows: 8");
    expect(result.stdout).toContain("shown rows: 8");
    expect(result.stdout).toContain("priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=0, P2_PREFLOP_DOLAR_EV=8");
    expect(result.stdout).toContain("1. P2_PREFLOP_DOLAR_EV");
    expect(result.stdout).toContain("8. P2_PREFLOP_DOLAR_EV");
    expect(result.stdout).toContain("DOLAR_EV|PREFLOP");
    expect(result.stdout).toContain("dolar-ev");
    expect(result.stdout).not.toContain("P1_PREFLOP_CHIP_EV |");
  });

  it("vrati chybu pro neznamou prioritu", () => {
    const result = runPlan("--priority=P9");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --priority value: P9");
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all");
  });

  it("umi vypsat jen prioritni MTT sloty pripravene k validaci", () => {
    const result = runPlan("--ready-only", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      counts: {
        totalQueueRows: number;
        shownRows: number;
        readyForValidation: number;
        byPriority: Record<string, number>;
      };
      rows: unknown[];
    };

    expect(parsed.counts.totalQueueRows).toBe(0);
    expect(parsed.counts.shownRows).toBe(0);
    expect(parsed.counts.readyForValidation).toBe(0);
    expect(parsed.counts.byPriority.P0_READY_FOR_VALIDATION).toBe(0);
    expect(parsed.rows).toEqual([]);
  });

  it("odmitne konflikt ready-only a waiting-only filtru", () => {
    const result = runPlan("--ready-only", "--waiting-only");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Use only one of --ready-only or --waiting-only.");
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
