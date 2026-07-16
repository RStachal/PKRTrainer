import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/prepareMttPostflopActionEvIntake.mts";
const CONFIRM = "WRITE_MTT_POSTFLOP_ACTION_EV_CANDIDATE";
const OVERWRITE_CONFIRM = "OVERWRITE_MTT_POSTFLOP_ACTION_EV_TEMPLATE";
const PILOT = "utg-bb-srp-flop-cbet";

describe("MTT postflop action-EV intake CLI", () => {
  it("writes seven blank, fingerprinted templates for all 972 pilot decisions", () => {
    withTempDir((dir) => {
      const result = run("--all", "--write-template", `--template-dir=${dir}`, "--json");
      expect(result.status).toBe(0);
      const report = parseJson(result.stdout) as {
        valid: boolean;
        strategyValues: string;
        counts: { pilots: number; decisions: number; actionValueSlots: number };
        templates: Array<{ outputPath: string; baseFingerprint: string }>;
      };
      expect(report).toMatchObject({
        valid: true,
        strategyValues: "none",
        counts: { pilots: 7, decisions: 972, actionValueSlots: 2916 },
      });
      expect(report.templates).toHaveLength(7);
      for (const item of report.templates) {
        expect(item.baseFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(existsSync(item.outputPath)).toBe(true);
        const template = JSON.parse(readFileSync(item.outputPath, "utf8")) as {
          source: { rightsConfirmed: boolean };
          review: { decision: string };
          rows: Array<{ values: Array<{ evBb: number | null }> }>;
        };
        expect(template.source.rightsConfirmed).toBe(true);
        expect(template.review.decision).toBe("PENDING");
        expect(template.rows.flatMap((row) => row.values).every((value) => value.evBb === null)).toBe(true);
      }
    });
  });

  it("validates a complete owned export and writes only a non-production candidate plus audit sidecar", () => {
    withTempDir((dir) => {
      const templatePath = join(dir, "template.json");
      expect(run(`--catalog-id=${PILOT}`, "--write-template", `--template-out=${templatePath}`).status).toBe(0);
      const input = JSON.parse(readFileSync(templatePath, "utf8")) as {
        review: { reviewer: string; reviewedAt: string; decision: string };
        rows: Array<{
          values: Array<{ evBb: number | null }>;
          equivalentThresholdBb: number | null;
          acceptableThresholdBb: number | null;
        }>;
      };
      input.review = { reviewer: "Project owner", reviewedAt: "2026-07-16", decision: "APPROVED" };
      for (const [rowIndex, row] of input.rows.entries()) {
        row.values.forEach((value, actionIndex) => { value.evBb = rowIndex / 100 + actionIndex / 1000; });
        row.equivalentThresholdBb = 0.01;
        row.acceptableThresholdBb = 0.05;
      }
      const inputPath = join(dir, "completed.json");
      const candidatePath = join(dir, "normalized-action-ev-candidate");
      writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");

      const result = run(
        `--input=${inputPath}`,
        `--candidate-out=${candidatePath}`,
        "--write-candidate",
        `--confirm=${CONFIRM}`,
        "--json",
      );
      expect(result.status).toBe(0);
      const report = parseJson(result.stdout) as {
        valid: boolean;
        written: boolean;
        productionPromotion: boolean;
        reportOut: string;
        counts: { completeDecisions: number; expectedDecisions: number; errors: number };
      };
      expect(report).toMatchObject({
        valid: true,
        written: true,
        productionPromotion: false,
        counts: { completeDecisions: 36, expectedDecisions: 36, errors: 0 },
      });
      expect(existsSync(candidatePath)).toBe(true);
      expect(existsSync(report.reportOut)).toBe(true);
      expect(report.reportOut).toBe(`${candidatePath}.report.json`);
      const audit = JSON.parse(readFileSync(report.reportOut, "utf8")) as { candidateSha256: string };
      expect(audit.candidateSha256).toBe(
        createHash("sha256").update(readFileSync(candidatePath)).digest("hex"),
      );
      const candidate = JSON.parse(readFileSync(candidatePath, "utf8")) as {
        rules: Array<{ rangeBuckets: Array<{ actionEvs?: { source: string; values: unknown[] } }> }>;
      };
      const buckets = candidate.rules.flatMap((rule) => rule.rangeBuckets);
      expect(buckets).toHaveLength(36);
      expect(buckets.every((bucket) => bucket.actionEvs?.source === "SOLVER" && bucket.actionEvs.values.length === 3)).toBe(true);
      expect(readFileSync(report.reportOut, "utf8")).toContain('"productionPromotion": false');
    });
  });

  it("preserves an existing intake unless template overwrite is explicitly confirmed", () => {
    withTempDir((dir) => {
      const templatePath = join(dir, "template.json");
      expect(run(`--catalog-id=${PILOT}`, "--write-template", `--template-out=${templatePath}`).status).toBe(0);
      const edited = JSON.parse(readFileSync(templatePath, "utf8")) as {
        review: { reviewer: string; reviewedAt: string; decision: string };
      };
      edited.review.reviewer = "Owner work in progress";
      writeFileSync(templatePath, `${JSON.stringify(edited, null, 2)}\n`, "utf8");

      const preserved = run(
        `--catalog-id=${PILOT}`,
        "--write-template",
        `--template-out=${templatePath}`,
        "--json",
      );
      expect(preserved.status).toBe(0);
      expect(parseJson(preserved.stdout)).toMatchObject({
        counts: { existingTemplates: 1, staleTemplates: 0, writtenTemplates: 0 },
        templates: [{ existing: true, stale: false, written: false }],
      });
      expect(readFileSync(templatePath, "utf8")).toContain("Owner work in progress");

      delete (edited as { rows?: unknown[] }).rows;
      writeFileSync(templatePath, `${JSON.stringify(edited, null, 2)}\n`, "utf8");
      const stale = run(
        `--catalog-id=${PILOT}`,
        "--write-template",
        `--template-out=${templatePath}`,
        "--json",
      );
      expect(stale.status).toBe(1);
      expect(parseJson(stale.stdout)).toMatchObject({
        valid: false,
        counts: { existingTemplates: 1, staleTemplates: 1, writtenTemplates: 0 },
        templates: [{ existing: true, stale: true, written: false }],
      });
      expect(readFileSync(templatePath, "utf8")).toContain("Owner work in progress");

      const overwritten = run(
        `--catalog-id=${PILOT}`,
        "--write-template",
        "--overwrite-template",
        `--confirm=${OVERWRITE_CONFIRM}`,
        `--template-out=${templatePath}`,
        "--json",
      );
      expect(overwritten.status).toBe(0);
      expect(parseJson(overwritten.stdout)).toMatchObject({
        counts: { existingTemplates: 1, staleTemplates: 0, writtenTemplates: 1 },
        templates: [{ existing: true, stale: false, written: true }],
      });
      expect(readFileSync(templatePath, "utf8")).not.toContain("Owner work in progress");
    });
  });

  it("refuses to overwrite the reviewed intake with a candidate", () => {
    withTempDir((dir) => {
      const templatePath = join(dir, "template.json");
      expect(run(`--catalog-id=${PILOT}`, "--write-template", `--template-out=${templatePath}`).status).toBe(0);
      const result = run(
        `--input=${templatePath}`,
        `--candidate-out=${templatePath}`,
        "--write-candidate",
        `--confirm=${CONFIRM}`,
        "--json",
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("candidate output must not overwrite the reviewed intake input");
    });
  });

  it("fails closed for stale identity and partial EV without writing a candidate", () => {
    withTempDir((dir) => {
      const templatePath = join(dir, "template.json");
      expect(run(`--catalog-id=${PILOT}`, "--write-template", `--template-out=${templatePath}`).status).toBe(0);
      const input = JSON.parse(readFileSync(templatePath, "utf8")) as {
        baseFingerprint: string;
        review: { reviewer: string; reviewedAt: string; decision: string };
        rows: Array<{ values: Array<{ evBb: number | null }> }>;
      };
      input.baseFingerprint = "stale";
      input.review = { reviewer: "Project owner", reviewedAt: "2026-07-16", decision: "APPROVED" };
      input.rows[0].values[0].evBb = 0;
      const inputPath = join(dir, "partial.json");
      const candidatePath = join(dir, "must-not-exist.json");
      writeFileSync(inputPath, JSON.stringify(input), "utf8");

      const result = run(
        `--input=${inputPath}`,
        `--candidate-out=${candidatePath}`,
        "--write-candidate",
        `--confirm=${CONFIRM}`,
        "--json",
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("baseFingerprint does not match");
      expect(result.stdout).toContain("evBb must be finite");
      expect(existsSync(candidatePath)).toBe(false);
    });
  });
});

function run(...args: string[]) {
  return spawnSync(process.execPath, ["node_modules/vite-node/vite-node.mjs", SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`No JSON in output:\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

function withTempDir(runTest: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-postflop-ev-"));
  try {
    runTest(dir);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
