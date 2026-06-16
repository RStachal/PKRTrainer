import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:postflop-matrix CLI", () => {
  it("vypise source-free MTT postflop production matrix", () => {
    const result = runMatrix();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT postflop production matrix");
    expect(result.stdout).toContain("total rows: 48");
    expect(result.stdout).toContain("waiting rows: 48");
    expect(result.stdout).toContain("ready rows: 0");
    expect(result.stdout).toContain("production rows: 0");
    expect(result.stdout).toContain("street counts: FLOP=16, TURN=16, RIVER=16");
    expect(result.stdout).toContain("state counts: WAITING=48, READY=0, PRODUCTION=0");
    expect(result.stdout).toContain("kind counts: flop-production=16, turn-production=16, river-production=16");
    expect(result.stdout).toContain(
      "priority counts: P0_READY_FOR_VALIDATION=0, P1_PREFLOP_CHIP_EV=0, P2_PREFLOP_DOLAR_EV=0, P3_FLOP_PRODUCTION=16, P4_TURN_PRODUCTION=16, P5_RIVER_PRODUCTION=16",
    );
    expect(result.stdout).toContain("P3_FLOP_PRODUCTION | FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF | flop-production | WAITING");
    expect(result.stdout).toContain("P5_RIVER_PRODUCTION | SIX_MAX|TURBO|DOLAR_EV|RIVER|ON | river-production | WAITING");
    expect(result.stdout).not.toContain("https://");
  });

  it("vrati JSON pro batch tooling", () => {
    const result = runMatrix("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      counts: {
        totalRows: number;
        waitingRows: number;
        readyRows: number;
        productionRows: number;
        byPriority: Record<string, number>;
        byStreet: Record<string, number>;
        byState: Record<string, number>;
        byKind: Record<string, number>;
      };
      rows: Array<{
        priority: string;
        slotId: string;
        state: string;
        kind: string;
        intake: { readyForValidation: boolean };
      }>;
    };

    expect(parsed.counts).toEqual({
      totalRows: 48,
      waitingRows: 48,
      readyRows: 0,
      productionRows: 0,
      byPriority: {
        P0_READY_FOR_VALIDATION: 0,
        P1_PREFLOP_CHIP_EV: 0,
        P2_PREFLOP_DOLAR_EV: 0,
        P3_FLOP_PRODUCTION: 16,
        P4_TURN_PRODUCTION: 16,
        P5_RIVER_PRODUCTION: 16,
      },
      byStreet: { FLOP: 16, TURN: 16, RIVER: 16 },
      byState: { WAITING: 48, READY: 0, PRODUCTION: 0 },
      byKind: {
        "flop-production": 16,
        "turn-production": 16,
        "river-production": 16,
        "mtt-preflop": 0,
        production: 0,
      },
    });
    expect(parsed.rows).toHaveLength(48);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      priority: "P3_FLOP_PRODUCTION",
      state: "WAITING",
      kind: "flop-production",
      intake: expect.objectContaining({ readyForValidation: false }),
    }));
  });

  it("vrati chybu pro neznamy argument", () => {
    const result = runMatrix("--priority=P3_FLOP_PRODUCTION");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --priority=P3_FLOP_PRODUCTION");
    expect(result.stderr).toContain("Usage:");
  });
});

function runMatrix(...args: string[]) {
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
  const npmArgs = ["run", "mtt:postflop-matrix", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
