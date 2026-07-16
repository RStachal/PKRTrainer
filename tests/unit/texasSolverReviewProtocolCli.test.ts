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

  it("nenecha prazdne review pole pohltit nasledujici checklistovy radek", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-empty-field-"));
    try {
      const familyDir = join(directory, "MTT9_50BB_BTN_BB_SRP");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(
        join(familyDir, "review-notes.md"),
        [
          "Status: NEEDS_REVIEW",
          "Reviewer:",
          "Reviewed at:",
          "Usable for production: no",
          "Production caveats:",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = runProtocol(`--root=${directory}`, "--json");
      expect(result.status).toBe(1);
      const parsed = parseJsonStdout(result.stdout) as {
        rows: Array<{ reviewer: string; reviewedAt: string; usableForProduction: string; blockers: string[] }>;
      };
      expect(parsed.rows[0]).toMatchObject({ reviewer: "", reviewedAt: "", usableForProduction: "NO" });
      expect(parsed.rows[0].blockers).toEqual(expect.arrayContaining([
        "Reviewer is required.",
        "Reviewed at is required.",
      ]));
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

  it("uzna traceable per-board evidence bez falešne family-wide exploitability hodnoty", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-per-board-"));
    try {
      const familyDir = join(directory, "MTT9_80BB_BTN_BB_SRP_HIGHSPR");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(
        join(familyDir, "review-notes.md"),
        [
          "Status: REVIEWED",
          "Reviewer: PKRTrainer QA",
          "Reviewed at: 2026-07-14",
          "Usable for production: scoped: high-SPR pilot only",
          "Usable scope: high-SPR pilot only",
          "Production caveats: narrow reviewed scope",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(familyDir, "accuracy-report.json"),
        JSON.stringify({
          solver: "texas-solver",
          status: "NEEDS_REVIEW",
          exploitability: null,
          accuracySource: "Parsed from local TexasSolver console evidence; human review still decides adequacy.",
          solverLogCoverage: {
            evidence: [
              { rawFileName: "pkrtrainer_MTT9_80BB_BTN_BB_SRP_HIGHSPR_A72r.json", source: "QUEUE_LOG", value: 0.42 },
              { rawFileName: "pkrtrainer_MTT9_80BB_BTN_BB_SRP_HIGHSPR_K83r.json", source: "QUEUE_LOG", value: 0.21 },
            ],
          },
        }),
        "utf8",
      );

      const packetDir = join(directory, "packet");
      const result = runProtocol(
        `--root=${directory}`,
        "--require-production-usable",
        "--json",
        `--packet-dir=${packetDir}`,
      );

      expect(result.status).toBe(0);
      const parsed = parseJsonStdout(result.stdout) as {
        counts: { productionEligible: number; reviewedScoped: number };
        rows: Array<{ accuracyEvidence: string; productionEligible: boolean }>;
      };
      expect(parsed.counts).toMatchObject({ productionEligible: 1, reviewedScoped: 1 });
      expect(parsed.rows[0]).toMatchObject({ productionEligible: true });
      expect(parsed.rows[0].accuracyEvidence).toContain("pkrtrainer_MTT9_80BB_BTN_BB_SRP_HIGHSPR_A72r.json: 0.42");
      const checklist = readFileSync(
        join(packetDir, "MTT9_80BB_BTN_BB_SRP_HIGHSPR", "REVIEW_CHECKLIST.md"),
        "utf8",
      );
      expect(checklist).toContain("## Current accuracy evidence");
      expect(checklist).toContain("pkrtrainer_MTT9_80BB_BTN_BB_SRP_HIGHSPR_A72r.json: 0.42");
      expect(checklist).not.toContain("\"strategy\"");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("neuzna nečíselnou per-board hodnotu jako parsed solver evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-invalid-evidence-"));
    try {
      const familyDir = join(directory, "MTT9_80BB_BTN_BB_SRP_HIGHSPR");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(
        join(familyDir, "review-notes.md"),
        [
          "Status: REVIEWED",
          "Reviewer: PKRTrainer QA",
          "Reviewed at: 2026-07-14",
          "Usable for production: scoped: high-SPR pilot only",
          "Usable scope: high-SPR pilot only",
          "Production caveats: narrow reviewed scope",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(familyDir, "accuracy-report.json"),
        JSON.stringify({
          accuracySource: "Parsed from local TexasSolver console evidence; human review still decides adequacy.",
          solverLogCoverage: {
            evidence: [{ rawFileName: "pkrtrainer_MTT9_80BB_BTN_BB_SRP_HIGHSPR_A72r.json", source: "QUEUE_LOG", value: true }],
          },
        }),
        "utf8",
      );

      const result = runProtocol(`--root=${directory}`, "--require-production-usable", "--json");

      expect(result.status).toBe(1);
      const parsed = parseJsonStdout(result.stdout) as {
        rows: Array<{ productionEligible: boolean; warnings: string[] }>;
      };
      expect(parsed.rows[0]).toMatchObject({ productionEligible: false });
      expect(parsed.rows[0].warnings.join("\n")).toContain("does not contain parsed production-grade accuracy evidence");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("umi vygenerovat source-safe review packet pro jednotlive family", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-packet-"));
    const packetDir = join(directory, "packet");
    try {
      const familyDir = join(directory, "MTT9_50BB_BTN_BB_SRP");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(
        join(familyDir, "review-notes.md"),
        [
          "# TexasSolver review notes: MTT9_50BB_BTN_BB_SRP",
          "",
          "Status: NEEDS_REVIEW",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = runProtocol(`--root=${directory}`, `--packet-dir=${packetDir}`, "--summary");

      expect(result.status).toBe(1);
      const readme = readFileSync(join(packetDir, "README.md"), "utf8");
      const checklist = readFileSync(
        join(packetDir, "MTT9_50BB_BTN_BB_SRP", "REVIEW_CHECKLIST.md"),
        "utf8",
      );
      const waves = readFileSync(join(packetDir, "OWNER_REVIEW_WAVES.md"), "utf8");
      const summary = JSON.parse(readFileSync(join(packetDir, "review-protocol-summary.json"), "utf8")) as {
        families: number;
        needsReview: number;
      };

      expect(summary).toMatchObject({ families: 1, needsReview: 1 });
      expect(readme).toContain("TexasSolver review protocol packet");
      expect(readme).toContain("Source-safe checklist packet");
      expect(readme).toContain("OWNER_REVIEW_WAVES.md");
      expect(waves).toContain("## Wave 1");
      expect(waves).toContain("MTT9_50BB_BTN_BB_SRP: NEEDS_REVIEW");
      expect(checklist).toContain("TexasSolver review checklist: MTT9_50BB_BTN_BB_SRP");
      expect(checklist).toContain("Status: NEEDS_REVIEW");
      expect(checklist).toContain("Required review-notes.md fields");
      expect(checklist).toContain("Confirm intended PKRTrainer spot family");
      expect(checklist).not.toContain("\"strategy\"");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("doplni pouze chybejici prazdna owner rozhodovaci pole bez falesneho sign-off", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-protocol-template-"));
    try {
      const familyDir = join(directory, "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR");
      mkdirSync(familyDir, { recursive: true });
      writeFileSync(join(familyDir, "review-notes.md"), "Status: NEEDS_REVIEW\n", "utf8");

      const result = runProtocol(`--root=${directory}`, "--write-review-templates", "--summary");

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Prepared blank owner decision fields: 1");
      const notes = readFileSync(join(familyDir, "review-notes.md"), "utf8");
      expect(notes).toContain("## Owner decision");
      expect(notes).toContain("Reviewer:");
      expect(notes).toContain("Reviewed at:");
      expect(notes).toContain("Usable for production:");
      expect(notes).toContain("Usable scope:");
      expect(notes).toContain("Production caveats:");
      expect(notes).toContain("Status: NEEDS_REVIEW");
      expect(notes).not.toContain("Status: REVIEWED");
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
