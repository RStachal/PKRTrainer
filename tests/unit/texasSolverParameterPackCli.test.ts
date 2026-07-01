import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-pack CLI", () => {
  it("overi, ze realny TexasSolver parameter pack pokryva solver verification family", () => {
    const result = runPack("--json");

    expect(result.status).toBe(0);
    const report = parseJsonStdout(result.stdout) as {
      valid: boolean;
      counts: {
        expectedFamilies: number;
        parameterFiles: number;
        missingFamilies: number;
        filesMissingDumpResult: number;
      };
      families: Array<{ familyId: string; status: string; parameterFiles: number }>;
    };

    expect(report.valid).toBe(true);
    expect(report.counts.expectedFamilies).toBe(3);
    expect(report.counts.parameterFiles).toBeGreaterThanOrEqual(10);
    expect(report.counts.missingFamilies).toBe(0);
    expect(report.counts.filesMissingDumpResult).toBe(0);
    expect(report.families).toEqual(expect.arrayContaining([
      expect.objectContaining({ familyId: "MTT9_50BB_BTN_BB_SRP", status: "READY" }),
      expect.objectContaining({ familyId: "MTT9_40BB_UTG_BB_SRP", status: "READY", parameterFiles: 1 }),
      expect.objectContaining({ familyId: "MTT9_35BB_CO_BTN_3BP", status: "READY", parameterFiles: 1 }),
    ]));
  });

  it("zachyti chybejici dump_result a neznamou family v parameter file", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-texas-pack-"));
    const parameterDir = join(directory, "parameters");
    mkdirSync(parameterDir, { recursive: true });
    const familyPlan = join(directory, "database-families.json");
    writeFileSync(
      familyPlan,
      JSON.stringify({
        families: [
          {
            familyId: "MTT9_TEST_FAMILY",
            flopListFile: "flops.txt",
            spots: ["MTT9_TEST_FAMILY_A72r_CBET"],
          },
        ],
      }),
      "utf8",
    );
    writeFileSync(join(parameterDir, "01_MTT9_TEST_FAMILY_A72r.txt"), "set_board As,7d,2c\n", "utf8");
    writeFileSync(
      join(parameterDir, "02_UNKNOWN_FAMILY_K83r.txt"),
      "set_board Ks,8d,3c\ndump_result unknown.json\n",
      "utf8",
    );

    try {
      const result = runPack(`--family-plan=${familyPlan}`, `--parameter-dir=${parameterDir}`, "--json");

      expect(result.status).toBe(1);
      const report = parseJsonStdout(result.stdout) as {
        valid: boolean;
        counts: { unknownFamilyFiles: number; filesMissingDumpResult: number };
        blockers: string[];
      };

      expect(report.valid).toBe(false);
      expect(report.counts.unknownFamilyFiles).toBe(1);
      expect(report.counts.filesMissingDumpResult).toBe(1);
      expect(report.blockers.join("\n")).toContain("Missing dump_result");
      expect(report.blockers.join("\n")).toContain("Unknown family");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runPack(...args: string[]) {
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
  const npmArgs = ["run", "mtt:texas-solver-pack", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}

function parseJsonStdout(stdout: string): unknown {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`No JSON object found in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}
