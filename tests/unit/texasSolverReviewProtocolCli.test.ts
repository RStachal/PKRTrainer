import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-review-protocol CLI", () => {
  it("fail-closed reportuje chybejici review-notes bez raw solver JSONu", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-missing-"));
    try {
      mkdirSync(join(directory, "MTT9_50BB_BTN_BB_SRP"), { recursive: true });
      const result = runProtocol(`--root=${directory}`, "--summary");

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("TexasSolver review protocol");
      expect(result.stdout).toContain("valid: false");
      expect(result.stdout).toContain("families: 1");
      expect(result.stdout).toContain("missing review: 1");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("cte scoped human sign-off jako protocol-ready, ale ne jako production eligible bez accuracy evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-scoped-"));
    try {
      const familyDir = join(directory, "MTT9_50BB_BTN_BB_SRP");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(
        join(familyDir, "review-notes.md"),
        [
          "# TexasSolver review notes: MTT9_50BB_BTN_BB_SRP",
          "",
          "Status: REVIEWED",
          "Reviewer: PKRTrainer QA",
          "Reviewed at: 2026-07-07",
          "Usable for production: scoped: BTN vs BB SRP c-bet pilot only",
          "Usable scope: BTN vs BB SRP c-bet pilot only",
          "Production caveats: narrow board and position coverage",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(familyDir, "accuracy-report.json"),
        JSON.stringify({
          solver: "texas-solver",
          status: "NEEDS_REVIEW",
          accuracySource: "Not parsed from TexasSolver logs yet.",
        }),
        "utf8",
      );

      const result = runProtocol(`--root=${directory}`, "--json");

      expect(result.status).toBe(0);
      const parsed = parseJsonStdout(result.stdout) as {
        valid: boolean;
        counts: { protocolReady: number; productionEligible: number; reviewedScoped: number; warnings: number };
        rows: Array<{
          status: string;
          protocolReady: boolean;
          productionEligible: boolean;
          usableForProduction: string;
          warnings: string[];
        }>;
      };

      expect(parsed.valid).toBe(true);
      expect(parsed.counts).toMatchObject({
        protocolReady: 1,
        productionEligible: 0,
        reviewedScoped: 1,
      });
      expect(parsed.rows[0]).toMatchObject({
        status: "REVIEWED_SCOPED",
        protocolReady: true,
        productionEligible: false,
        usableForProduction: "SCOPED",
      });
      expect(parsed.rows[0].warnings.join("\n")).toContain("accuracy-report.json does not contain parsed production-grade accuracy evidence");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("umi vyzadovat production-usable sign-off pred promoci", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-strict-"));
    const outputPath = join(directory, "report.json");
    try {
      const familyDir = join(directory, "MTT9_80BB_BTN_BB_SRP_HIGHSPR");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(
        join(familyDir, "review-notes.md"),
        [
          "# TexasSolver review notes: MTT9_80BB_BTN_BB_SRP_HIGHSPR",
          "",
          "Status: REVIEWED",
          "Reviewer: PKRTrainer QA",
          "Reviewed at: 2026-07-07",
          "Usable for production: yes",
          "Usable scope: BTN vs BB SRP HIGHSPR production import candidate",
          "Production caveats: requires downstream coverage gate",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(familyDir, "accuracy-report.json"),
        JSON.stringify({
          solver: "texas-solver",
          status: "REVIEWED",
          exploitability: "0.42%",
          accuracySource: "Parsed from console log pkrtrainer-review-protocol-test.log.",
        }),
        "utf8",
      );

      const result = runProtocol(
        `--root=${directory}`,
        "--require-production-usable",
        "--summary",
        `--output=${outputPath}`,
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("valid: true");
      expect(result.stdout).toContain("production eligible: 1");
      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        valid: boolean;
        counts: { productionEligible: number; reviewedProduction: number };
      };
      expect(parsed.valid).toBe(true);
      expect(parsed.counts).toMatchObject({
        productionEligible: 1,
        reviewedProduction: 1,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runProtocol(...args: string[]) {
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
  const npmArgs = ["run", "mtt:texas-solver-review-protocol", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}

function parseJsonStdout(stdout: string): unknown {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`No JSON object found in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}
