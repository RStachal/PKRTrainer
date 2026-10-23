import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:slots CLI", () => {
  it("vypise legalni preflop a postflop MTT import sloty", () => {
    const result = runSlots();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT preflop legal import slots");
    expect(result.stdout).toContain("slots: 12");
    expect(result.stdout).toContain("MTT postflop legal import slots");
    expect(result.stdout).toContain("slots: 48");
    expect(result.stdout).toContain("SIX_MAX|TURBO|DOLAR_EV|PREFLOP|OFF");
    expect(result.stdout).toContain("mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
  });

  it("umi vypsat jen postflop sloty", () => {
    const result = runSlots("--kind=postflop");

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("MTT preflop legal import slots");
    expect(result.stdout).toContain("MTT postflop legal import slots");
    expect(result.stdout).toContain("slots: 48");
  });

  it("umi filtrovat postflop sloty podle MTT dimenzi", () => {
    const result = runSlots(
      "--kind=postflop",
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("MTT preflop legal import slots");
    expect(result.stdout).toContain("MTT postflop legal import slots");
    expect(result.stdout).toContain("slots: 4");
    expect(result.stdout).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(result.stdout).toContain("mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
    expect(result.stdout).not.toContain("FULL_RING_9|");
  });

  it("umi vypsat filtrovane sloty jako JSON pro operator tooling", () => {
    const result = runSlots(
      "--kind=postflop",
      "--format=SIX_MAX",
      "--ev=DOLAR_EV",
      "--street=RIVER",
      "--status=candidate",
      "--json",
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      kind: string;
      counts: { preflop: number; postflop: number; total: number };
      postflopSlots: { slotId: string; packId: string; normalizedInputPath: string }[];
    };
    expect(parsed.kind).toBe("postflop");
    expect(parsed.counts).toEqual({ preflop: 0, postflop: 4, total: 4 });
    expect(parsed.postflopSlots).toHaveLength(4);
    expect(parsed.postflopSlots.map((slot) => slot.slotId)).toContain(
      "SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF",
    );
    expect(parsed.postflopSlots[0].normalizedInputPath).toContain("Agents/range-intake/raw/");
  });

  it("umi zapsat cisty JSON artefakt se vsemi legalnimi MTT sloty", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-mtt-slots-"));
    try {
      const outputPath = join(directory, "mtt-slots-report.json");
      const result = runSlots(`--output=${outputPath}`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("MTT preflop legal import slots");
      expect(result.stdout.trim().startsWith("{")).toBe(false);

      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        kind: string;
        counts: { preflop: number; postflop: number; total: number };
        preflopSlots: unknown[];
        postflopSlots: unknown[];
      };
      expect(parsed.kind).toBe("all");
      expect(parsed.counts).toEqual({ preflop: 12, postflop: 48, total: 60 });
      expect(parsed.preflopSlots).toHaveLength(12);
      expect(parsed.postflopSlots).toHaveLength(48);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("vrati chybu pro neznamy kind", () => {
    const result = runSlots("--kind=unknown");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --kind value: unknown");
    expect(result.stderr).toContain("Usage:");
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runSlots("--street=SHOWDOWN");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --street value: SHOWDOWN");
    expect(result.stderr).toContain("Usage:");
  });

  it("vrati chybu pro neznamy status alias ze sdileneho parseru", () => {
    const result = runSlots("--status=later");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --status value: later");
    expect(result.stderr).toContain("Usage:");
  });
});

function runSlots(...args: string[]) {
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
  const npmArgs = ["run", "mtt:slots", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
