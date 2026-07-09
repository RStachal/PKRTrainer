import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const TMP_ROOT = join(process.cwd(), "artifacts", "test-texas-solver-ingest");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("mtt:texas-solver-ingest-completed CLI", () => {
  it("reviewuje SB vs BB OOP c-bet root node misto CHECK vetve", () => {
    const familyId = "MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR";
    const outputBase = join(TMP_ROOT, "output", "texas-solver");
    const rawDir = join(outputBase, familyId, "raw");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, `pkrtrainer_${familyId}_A72r.json`), JSON.stringify({ node: "root" }), "utf8");

    const manifestPath = join(TMP_ROOT, "manifest.json");
    const reportPath = join(TMP_ROOT, "report.json");
    writeFileSync(manifestPath, `${JSON.stringify({
      packId: "test-sb-bb-oop-cbet",
      generatedAt: "2026-07-08",
      parameterDir: "unused",
      outputBase,
      scenarios: [{
        familyId,
        pot: 50,
        effectiveStack: 125,
        boards: ["A72r"],
        purpose: "test",
        coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR"],
      }],
      files: [{
        fileName: `01_${familyId}_A72r.txt`,
        path: "unused",
        familyId,
        boardId: "A72r",
        written: true,
      }],
      notes: [],
      commands: [],
    }, null, 2)}\n`, "utf8");

    const result = runIngest("--dry-run", `--manifest=${manifestPath}`, `--output=${reportPath}`);
    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      rows: Array<{ commands: string[] }>;
      mergePilotCommands: string[];
      counts: { commands: number };
    };
    const commands = report.rows.flatMap((row) => row.commands);
    expect(report.counts.commands).toBe(4);
    expect(commands).toHaveLength(3);
    expect(commands).toContain(`mtt:stage-texas-solver -- --family=${familyId} --write --review-template --summary`);
    expect(commands).toContain(`mtt:texas-solver-review -- --family=${familyId} --write --summary`);
    expect(commands.join("\n")).toContain("--review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR\\strategy-export.review.json");
    expect(commands.join("\n")).toContain("--position-pattern=SRP_SB_VS_BB");
    expect(commands.join("\n")).not.toContain("--node-history=CHECK");
    expect(report.mergePilotCommands).toContain("mtt:texas-solver-merge-pilot-drafts -- --scope=SB_vs_BB_SRP_OOP_FLOP_CBET --write --summary");
    expect(report.mergePilotCommands.join("\n")).not.toContain("BTN_vs_BB_SRP_FLOP_CBET");
  });

  it("u nove review-only family bez mappingu nehlasi falesne already normalized", () => {
    const familyId = "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR";
    const outputBase = join(TMP_ROOT, "output", "texas-solver");
    const familyDir = join(outputBase, familyId);
    const rawDir = join(outputBase, familyId, "raw");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, `pkrtrainer_${familyId}_A72r.json`), JSON.stringify({ node: "root" }), "utf8");
    writeFileSync(join(familyDir, "strategy-export.json"), JSON.stringify({ familyId }), "utf8");
    writeFileSync(join(familyDir, "strategy-export.CHECK.review.json"), JSON.stringify({ familyId }), "utf8");
    writeFileSync(join(familyDir, "review-notes.md"), "Status: NEEDS_REVIEW\n", "utf8");

    const manifestPath = join(TMP_ROOT, "co-bb-manifest.json");
    const reportPath = join(TMP_ROOT, "co-bb-report.json");
    writeFileSync(manifestPath, `${JSON.stringify({
      packId: "test-co-bb-cbet",
      generatedAt: "2026-07-09",
      parameterDir: "unused",
      outputBase,
      scenarios: [{
        familyId,
        pot: 50,
        effectiveStack: 125,
        boards: ["A72r"],
        purpose: "test",
        coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_CO_VS_BB", "SINGLE_RAISED_POT_CBET", "IP_AGGRESSOR"],
      }],
      files: [{
        fileName: `01_${familyId}_A72r.txt`,
        path: "unused",
        familyId,
        boardId: "A72r",
        written: true,
      }],
      notes: [],
      commands: [],
    }, null, 2)}\n`, "utf8");

    const result = runIngest("--dry-run", `--manifest=${manifestPath}`, `--output=${reportPath}`);
    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      rows: Array<{ commands: string[]; skippedReason: string | null }>;
      counts: { commands: number; skipped: number };
    };

    expect(report.counts.commands).toBe(0);
    expect(report.counts.skipped).toBe(1);
    expect(report.rows[0].commands).toEqual([]);
    expect(report.rows[0].skippedReason).toContain("No supported normalization mapping");
    expect(report.rows[0].skippedReason).not.toContain("Already staged");
  });
});

function runIngest(...args: string[]) {
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
  const npmArgs = ["run", "mtt:texas-solver-ingest-completed", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
