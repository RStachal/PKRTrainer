import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:validate-ready-intake CLI", () => {
  it("projde bez ready slotu a vypise source-free dry-run souhrn", () => {
    const result = runValidateReady();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MTT ready intake validation");
    expect(result.stdout).toContain("priority: all");
    expect(result.stdout).toContain("valid: true");
    expect(result.stdout).toContain("ready rows: 0");
    expect(result.stdout).toContain("waiting rows: 60");
    expect(result.stdout).toContain("missing normalized.json: 60");
    expect(result.stdout).toContain("missing permission.json: 56");
    expect(result.stdout).toContain("valid rows: 0");
    expect(result.stdout).toContain("failed rows: 0");
    expect(result.stdout).toContain("next action: npm run mtt:next-action");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON pro batch tooling", () => {
    const result = runValidateReady("--format=SIX_MAX", "--ev=DOLAR_EV", "--street=RIVER", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      filters: { tableFormat: string; evModel: string; street: string };
      priority: string | null;
      valid: boolean;
      counts: {
        readyRows: number;
        waitingRows: number;
        missingNormalized: number;
        missingPermission: number;
        validRows: number;
        failedRows: number;
      };
      nextActionCommand: string;
      rows: unknown[];
    };

    expect(parsed.filters).toEqual({
      tableFormat: "SIX_MAX",
      evModel: "DOLAR_EV",
      street: "RIVER",
    });
    expect(parsed.priority).toBe(null);
    expect(parsed.valid).toBe(true);
    expect(parsed.counts).toEqual({
      readyRows: 0,
      waitingRows: 4,
      missingNormalized: 4,
      missingPermission: 4,
      validRows: 0,
      failedRows: 0,
    });
    expect(parsed.nextActionCommand).toBe("npm run mtt:next-action");
    expect(parsed.rows).toEqual([]);
  });

  it("umi vynutit nenulovy exit kdyz neni co validovat", () => {
    const result = runValidateReady("--fail-on-empty");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("ready rows: 0");
  });

  it("umi omezit validaci na konkretni prioritu", () => {
    const result = runValidateReady("--priority=P1_PREFLOP_CHIP_EV", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      priority: string;
      counts: { readyRows: number };
      rows: unknown[];
    };

    expect(parsed.priority).toBe("P1_PREFLOP_CHIP_EV");
    expect(parsed.counts.readyRows).toBe(0);
    expect(parsed.rows).toEqual([]);
  });

  it("umi omezit validaci na DOLAR_EV preflop prioritu", () => {
    const result = runValidateReady("--priority=P2_PREFLOP_DOLAR_EV", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      priority: string;
      counts: { readyRows: number };
      rows: unknown[];
    };

    expect(parsed.priority).toBe("P2_PREFLOP_DOLAR_EV");
    expect(parsed.counts.readyRows).toBe(0);
    expect(parsed.rows).toEqual([]);
  });

  it("umi zapsat cisty JSON artefakt pro ready-intake validation handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-ready-validation-"));
    try {
      const outputPath = join(directory, "mtt-validate-ready-intake-report.json");
      const result = runValidateReady("--priority=P1_PREFLOP_CHIP_EV", `--output=${outputPath}`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("MTT ready intake validation");
      expect(result.stdout.trim().startsWith("{")).toBe(false);

      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        priority: string;
        counts: { readyRows: number; waitingRows: number; missingNormalized: number; missingPermission: number };
        rows: unknown[];
      };
      expect(parsed.priority).toBe("P1_PREFLOP_CHIP_EV");
      expect(parsed.counts).toMatchObject({
        readyRows: 0,
        waitingRows: 4,
        missingNormalized: 4,
        missingPermission: 0,
      });
      expect(parsed.rows).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("vrati chybu pro neznamou prioritu", () => {
    const result = runValidateReady("--priority=P9");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --priority value: P9");
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json");
  });

  it("vrati chybu pro neznamy filtr", () => {
    const result = runValidateReady("--format=HU");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --format value: HU");
    expect(result.stderr).toContain("Usage:");
  });
});

function runValidateReady(...args: string[]) {
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
  const npmArgs = ["run", "mtt:validate-ready-intake", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
