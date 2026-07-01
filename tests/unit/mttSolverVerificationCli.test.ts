import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:solver-verification CLI", () => {
  it("vypise stav solver verifikace pro GTO+ i TexasSolver families", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-solver-verification-root-"));
    try {
      createSolverRoot(directory);
      const result = runReport(`--root=${directory}`);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("MTT solver verification report");
      expect(result.stdout).toContain("valid: false");
      expect(result.stdout).toContain("solver: all");
      expect(result.stdout).toContain("families: 3");
      expect(result.stdout).toContain("family solver rows: 6");
      expect(result.stdout).toContain("spots: 4");
      expect(result.stdout).toContain("flops: 4");
      expect(result.stdout).toContain("waiting for solver output: 6");
      expect(result.stdout).toContain("gto-plus | MTT9_50BB_BTN_BB_SRP | WAITING_FOR_SOLVER_OUTPUT");
      expect(result.stdout).toContain("texas-solver | MTT9_50BB_BTN_BB_SRP | WAITING_FOR_SOLVER_OUTPUT");
      expect(result.stdout).toContain("strategy-export.json");
      expect(result.stdout).not.toContain("https://");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("umi filtrovat jen TexasSolver vystup pro zitrejsi solver workflow", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-solver-verification-root-"));
    try {
      createSolverRoot(directory);
      const result = runReport(`--root=${directory}`, "--solver=texas-solver", "--json");

      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
        solver: string;
        counts: {
          families: number;
          familySolverRows: number;
          waitingForSolverOutput: number;
          missingExpectedOutputs: number;
        };
        rows: Array<{ solver: string; familyId: string; expectedOutputs: Array<{ path: string }> }>;
      };

      expect(parsed.solver).toBe("texas-solver");
      expect(parsed.counts).toEqual({
        families: 3,
        familySolverRows: 3,
        spots: 4,
        flops: 4,
        readyForReview: 0,
        partial: 0,
        waitingForSolverOutput: 3,
        missingExpectedOutputs: 9,
      });
      expect(parsed.rows.every((row) => row.solver === "texas-solver")).toBe(true);
      expect(parsed.rows[0].familyId).toBe("MTT9_50BB_BTN_BB_SRP");
      expect(parsed.rows[0].expectedOutputs[0].path).toContain("output");
      expect(parsed.rows[0].expectedOutputs[0].path).toContain("texas-solver");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("umi zapsat JSON report jako handoff artefakt", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-solver-verification-"));
    const rootDir = join(directory, "root");
    const outputPath = join(directory, "report.json");
    try {
      createSolverRoot(rootDir);
      const result = runReport(`--root=${rootDir}`, "--summary", `--output=${outputPath}`);

      expect(result.status).toBe(1);
      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        valid: boolean;
        counts: { familySolverRows: number; missingExpectedOutputs: number };
      };
      expect(parsed.valid).toBe(false);
      expect(parsed.counts.familySolverRows).toBe(6);
      expect(parsed.counts.missingExpectedOutputs).toBe(18);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("odmitne neznamy solver", () => {
    const result = runReport("--solver=monker");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --solver value: monker");
    expect(result.stderr).toContain("Usage:");
  });
});

function runReport(...args: string[]) {
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
  const npmArgs = ["run", "mtt:solver-verification", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}

function createSolverRoot(rootDir: string): void {
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(
    join(rootDir, "database-families.json"),
    JSON.stringify({
      packId: "test-solver-pack",
      families: [
        {
          familyId: "MTT9_50BB_BTN_BB_SRP",
          description: "BTN vs BB SRP",
          spots: ["MTT9_50BB_BTN_BB_SRP_A72r_CBET", "MTT9_50BB_BTN_BB_SRP_JT9tt_CBET"],
          flopListFile: "flops-btn-bb.txt",
          ipRangeFile: "btn-ip.txt",
          oopRangeFile: "bb-oop.txt",
        },
        {
          familyId: "MTT9_40BB_UTG_BB_SRP",
          description: "UTG vs BB SRP",
          spots: ["MTT9_40BB_UTG_BB_SRP_Q72r_CBET"],
          flopListFile: "flops-utg-bb.txt",
          ipRangeFile: "utg-ip.txt",
          oopRangeFile: "bb-oop.txt",
        },
        {
          familyId: "MTT9_35BB_CO_BTN_3BP",
          description: "CO vs BTN 3BP",
          spots: ["MTT9_35BB_CO_BTN_3BP_K83r_CBET"],
          flopListFile: "flops-co-btn.txt",
          ipRangeFile: "co-ip.txt",
          oopRangeFile: "btn-oop.txt",
        },
      ],
    }),
    "utf8",
  );
  writeFileSync(join(rootDir, "flops-btn-bb.txt"), "As,7d,2c\nJs,Ts,9d\n", "utf8");
  writeFileSync(join(rootDir, "flops-utg-bb.txt"), "Qs,7d,2c\n", "utf8");
  writeFileSync(join(rootDir, "flops-co-btn.txt"), "Ks,8d,3c\n", "utf8");
  for (const fileName of ["btn-ip.txt", "bb-oop.txt", "utg-ip.txt", "co-ip.txt", "btn-oop.txt"]) {
    writeFileSync(join(rootDir, fileName), "AA,AKs,AQs\n", "utf8");
  }
}
