import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const VITE_NODE = resolve(ROOT, "node_modules/vite-node/vite-node.mjs");
const AUDIT_SCRIPT = resolve(ROOT, "scripts/auditTexasSolverScenarioBatch.mts");

describe("mtt:texas-solver-scenario-audit CLI", () => {
  it("flags a console directive that the installed solver ignores without invalidating the scenario", () => {
    const temporary = mkdtempSync(join(tmpdir(), "pkrtrainer-solver-audit-"));
    try {
      const parameterPath = join(temporary, "spot.txt");
      const manifestPath = join(temporary, "manifest.json");
      const reportPath = join(temporary, "report.json");
      writeFileSync(parameterPath, [
        "set_pot 10",
        "set_effective_stack 40",
        "set_board As,7h,2d",
        "set_range_ip AA",
        "set_range_oop KK",
        "set_bet_sizes ip,flop,bet,50",
        "set_bet_sizes oop,flop,bet,50",
        "set_raise_limit 3",
        "build_tree",
        "start_solve",
        "set_dump_rounds 2",
        "dump_result pkrtrainer_TEST_A72r.json",
        "set_use_isomorphism 1",
        "",
      ].join("\n"), "utf8");
      writeFileSync(manifestPath, JSON.stringify({
        packId: "scenario-audit-compatibility-test",
        generatedAt: "2026-07-14",
        parameterDir: temporary,
        outputBase: temporary,
        scenarios: [{
          familyId: "TEST",
          boards: ["A72r"],
          purpose: "Compatibility warning test.",
          coverageTags: ["SINGLE_RAISED_POT_CBET", "MID_SPR"],
        }],
        files: [{
          fileName: "spot.txt",
          path: parameterPath,
          familyId: "TEST",
          boardId: "A72r",
          written: true,
        }],
      }, null, 2), "utf8");

      execFileSync(process.execPath, [
        VITE_NODE,
        AUDIT_SCRIPT,
        "--manifest",
        manifestPath,
        "--output",
        reportPath,
      ], { cwd: ROOT, encoding: "utf8" });

      const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
        valid: boolean;
        rows: Array<{ valid: boolean; actual: { unsupportedConsoleDirectives: string[] }; warnings: string[] }>;
      };
      expect(report.valid).toBe(true);
      expect(report.rows[0]).toMatchObject({
        valid: true,
        actual: { unsupportedConsoleDirectives: ["set_raise_limit"] },
      });
      expect(report.rows[0].warnings.join("\n")).toContain("set_raise_limit is not recognized");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
