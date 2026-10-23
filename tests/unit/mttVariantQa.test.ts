import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildMttVariantQaReport } from "../../src/data/ranges/mttVariantQa";

describe("MTT variant QA", () => {
  it("overi flop pilot lab jako preview release train s runtime smoke pro vsechny scoped piloty", () => {
    const report = buildMttVariantQaReport();

    expect(report.valid).toBe(true);
    expect(report.releaseTrain).toBe("mtt-9max-regular-chip-ev-flop-pilots");
    expect(report.scenarioStatus).toBe("PREVIEW");
    // Šest pilotů mlčí záměrně: čtenář jejich obsah 14. 9. 2026 odmítl, modul
    // proto nese LOW a resolver na LOW neodpovídá (rozhodnutí vlastníka 9a,
    // 22. 9. 2026). Brána to počítá zvlášť - mlčení ze zvoleného důvodu není
    // selhání, ale kdyby takový pilot odpověděl, `errors` to chytí.
    expect(report.counts).toEqual({
      runtimeSmokes: 7,
      passed: 1,
      silent: 6,
      failed: 0,
      errors: 0,
    });
    expect(report.runtimeSmokes.map((row) => row.scope)).toContain("SB_vs_BB_SRP_OOP_FLOP_CBET");
    expect(report.runtimeSmokes.map((row) => row.scope)).toContain("CO_vs_BB_SRP_FLOP_CBET");
    expect(report.runtimeSmokes.every((row) => (
      row.freeLocked &&
      row.proPlusAllowed &&
      row.fullProductionReady === false
    ))).toBe(true);
    // Kdo odpovídá, odpovídá strategií; kdo mlčí, mlčí úplně - heuristika se
    // pod hlavičku pilota nedostane ani v jednom případě.
    expect(report.runtimeSmokes.every((row) => (
      row.status === "SILENT"
        ? row.recommendationKind === null
        : row.recommendationKind === "STRATEGY_PACK"
    ))).toBe(true);
    expect(report.runtimeSmokes.filter((row) => row.status === "PASS").map((row) => row.scope))
      .toEqual(["UTG_vs_BB_SRP_FLOP_CBET"]);
    expect(report.trainingRuntime).toMatchObject({
      mode: "SCOPED_PILOT",
      allowFallback: false,
      proPlusPilotResolver: true,
      freeLocked: true,
      // Pilot SB vs BB je LOW, takže na starší zápis pozice z UI nic nevrací;
      // že se ten zápis pořád mapuje na tentýž pilot, hlídá brána zvlášť.
      legacySbInputRecommendationKind: null,
    });
  });

  it("CLI umi zapsat variant-specific QA artefakt", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-variant-qa-"));
    try {
      const output = join(dir, "report.json");
      const result = spawnSync(process.execPath, [
        "scripts/run-cli.mjs",
        "scripts/checkMttVariantQa.mts",
        `--output=${output}`,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain('"valid": true');
      expect(existsSync(output)).toBe(true);
      const report = JSON.parse(readFileSync(output, "utf8")) as ReturnType<typeof buildMttVariantQaReport>;
      expect(report.counts.runtimeSmokes).toBe(7);
      expect(report.runtimeSmokes.find((row) => row.scope === "SB_vs_BB_SRP_OOP_FLOP_CBET"))
        .toMatchObject({ status: "SILENT", proPlusAllowed: true, freeLocked: true });
      expect(report.runtimeSmokes.find((row) => row.scope === "UTG_vs_BB_SRP_FLOP_CBET"))
        .toMatchObject({ status: "PASS", proPlusAllowed: true, freeLocked: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
