import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("mtt:completion CLI", () => {
  it("vypise default release gate bez detailu", () => {
    const result = runCompletion();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("total rows: 64");
    expect(result.stdout).not.toContain("MTT completion readiness");
  });

  it("umi filtrovat detailni readiness podle MTT dimenzi", () => {
    const result = runCompletion(
      "--details",
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("MTT completion readiness");
    expect(result.stdout).toContain("total rows: 4");
    expect(result.stdout).toContain("candidate rows: 4");
    expect(result.stdout).toContain("non-production rows: 4");
    expect(result.stdout).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(result.stdout).toContain("mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
    expect(result.stdout).not.toContain("FULL_RING_9|");
  });

  it("umi vypsat filtrovany readiness report jako JSON pro tooling", () => {
    const result = runCompletion(
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
      "--json",
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      filters: { tableFormat: string; evModel: string; street: string; status: string };
      gate: { valid: boolean; totalRows: number; productionReadyRows: number };
      readiness: {
        rows: { slotId?: string; tableFormat: string; evModel: string; street: string; importSlot: { packId: string } | null }[];
        productionRows: number;
        candidateRows: number;
        missingRows: number;
      };
    };
    expect(parsed.filters).toEqual({
      tableFormat: "SIX_MAX",
      evModel: "DOLAR_EV",
      street: "RIVER",
      status: "CANDIDATE",
    });
    expect(parsed.gate).toMatchObject({
      valid: true,
      totalRows: 64,
      productionReadyRows: 2,
    });
    expect(parsed.readiness.rows).toHaveLength(4);
    expect(parsed.readiness.productionRows).toBe(0);
    expect(parsed.readiness.candidateRows).toBe(4);
    expect(parsed.readiness.missingRows).toBe(0);
    expect(parsed.readiness.rows.every((row) => (
      row.tableFormat === "SIX_MAX" &&
      row.evModel === "DOLAR_EV" &&
      row.street === "RIVER"
    ))).toBe(true);
    expect(parsed.readiness.rows.map((row) => row.importSlot?.packId)).toContain(
      "mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1",
    );
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runCompletion("--details", "--street=SHOWDOWN");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --street value: SHOWDOWN");
    expect(result.stderr).toContain("Usage:");
  });
});

function runCompletion(...args: string[]) {
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
  const npmArgs = ["run", "mtt:completion", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
