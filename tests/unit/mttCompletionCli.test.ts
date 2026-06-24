import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:completion CLI", () => {
  it("vypise default release gate bez detailu", () => {
    const result = runCompletion();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("mode: PRODUCTION");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("total rows: 64");
    expect(result.stdout).not.toContain("MTT completion readiness");
  });

  it("umi vypsat strucny production gate pro release:check", () => {
    const result = runCompletion("--summary");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("mode: PRODUCTION");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("total rows: 64");
    expect(result.stdout).not.toContain("errors:");
    expect(result.stdout).not.toContain("FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON");
  });

  it("umi filtrovat detailni readiness podle MTT dimenzi", () => {
    const result = runCompletion(
      "--details",
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
      "--preview",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT completion release gate");
    expect(result.stdout).toContain("mode: PREVIEW");
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
      "--preview",
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      filters: { tableFormat: string; evModel: string; street: string; status: string };
      gate: { valid: boolean; mode: string; totalRows: number; productionReadyRows: number };
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
      mode: "PREVIEW",
      totalRows: 64,
      productionReadyRows: 0,
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

  it("drzi JSON import sloty konzistentni s mtt:slots CLI", () => {
    const args = [
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
      "--json",
    ];
    const completionResult = runCompletion(...args, "--preview");
    const slotsResult = runSlots("--kind=postflop", ...args);

    expect(completionResult.status).toBe(0);
    expect(slotsResult.status).toBe(0);

    const completion = parseJson(completionResult.stdout) as {
      readiness: { rows: { importSlot: { packId: string } | null }[] };
    };
    const slots = parseJson(slotsResult.stdout) as {
      postflopSlots: { packId: string }[];
    };
    const completionPackIds = completion.readiness.rows
      .map((row) => row.importSlot?.packId)
      .filter((packId): packId is string => typeof packId === "string")
      .sort();
    const slotPackIds = slots.postflopSlots.map((slot) => slot.packId).sort();

    expect(completionPackIds).toEqual(slotPackIds);
  });

  it("umi zapsat cisty JSON artefakt pro production completion handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-completion-"));
    try {
      const outputPath = join(directory, "completion-report.json");
      const result = runCompletion("--summary", `--output=${outputPath}`);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("MTT completion release gate");
      expect(result.stdout.trim().startsWith("{")).toBe(false);

      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        filters: Record<string, never>;
        gate: { valid: boolean; mode: string; totalRows: number };
        readiness: { rows: unknown[] };
      };
      expect(parsed.filters).toEqual({});
      expect(parsed.gate).toMatchObject({
        valid: false,
        mode: "PRODUCTION",
        totalRows: 64,
      });
      expect(parsed.readiness.rows).toHaveLength(64);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runCompletion("--details", "--street=SHOWDOWN");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --street value: SHOWDOWN");
    expect(result.stderr).toContain("Usage:");
  });

  it("vrati chybu pro neznamy status alias ze sdileneho parseru", () => {
    const result = runCompletion("--status=later");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --status value: later");
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

function runSlots(...args: string[]) {
  return spawnSync(command(), slotsCommandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    shell: false,
  });
}

function parseJson(stdout: string): unknown {
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:completion", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}

function slotsCommandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:slots", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
