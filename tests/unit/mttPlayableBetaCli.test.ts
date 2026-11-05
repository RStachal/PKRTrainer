import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { itWithSolverOutput } from "../solverInputs";

describe("mtt:playable-beta CLI", () => {
  itWithSolverOutput("keeps the current Core launchable while identifying the exact six-max target gap", () => {
    const result = invoke("--json");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      valid: boolean;
      status: string;
      targetScopeComplete: boolean;
      counts: Record<string, number>;
      knownLimits: string[];
    };
    expect(report).toMatchObject({
      valid: true,
      status: "LAUNCHABLE_INCREMENT",
      targetScopeComplete: false,
      counts: {
        minimumPreflopReady: 4,
        minimumPreflopTargets: 4,
        preflopReady: 4,
        preflopTargets: 8,
        sixMaxReady: 0,
        sixMaxTargets: 4,
        flopPilotsReady: 7,
        flopPilotTargets: 7,
        errors: 0,
      },
    });
    expect(report.knownLimits).toEqual(expect.arrayContaining([
      expect.stringContaining("Six-max CHIP_EV preflop remains 0/4"),
      expect.stringContaining("EV bubbles must remain hidden"),
    ]));
  });

  it("writes the same source-free report for release tooling", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-playable-beta-"));
    const output = join(directory, "report.json");
    try {
      const result = invoke(`--output=${output}`, "--summary");

      expect(result.status).toBe(0);
      expect(existsSync(output)).toBe(true);
      const report = JSON.parse(readFileSync(output, "utf8")) as { scope: string; errors: string[] };
      expect(report).toMatchObject({ scope: "MTT_PLAYABLE_BETA_V1", errors: [] });
      expect(readFileSync(output, "utf8")).not.toContain("normalized.json");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("zapocita vyreseny turn obsah, o kterem brana driv nevedela", () => {
    // Devet turn rodin se dodava hraci a brana o nich nevedela vubec: hlasila
    // sedm flopovych pilotu a v limitech tvrdila, ze to je cela postflopova
    // nabidka. Brana, ktera nevi, co produkt obsahuje, neni brana.
    const result = invoke("--json");
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);

    expect(parsed.counts.turnFamiliesShipped).toBeGreaterThan(0);
    expect(parsed.counts.turnFamiliesShipped).toBe(parsed.counts.turnFamiliesReviewReady);
    expect(parsed.counts.turnSolvedTurns).toBeGreaterThan(1000);
    expect(parsed.turnFamilies.length).toBe(parsed.counts.turnFamiliesShipped);

    // Ruzne flopy, ne soucet pres rodiny: nekolik rodin resi tentyz flop v jine
    // hloubce, takze sectene cislo by tvrdilo sirsi pokryti, nez jake je.
    expect(parsed.counts.turnDistinctFlops).toBeLessThan(
      parsed.turnFamilies.reduce((sum: number, family: { boards: number }) => sum + family.boards, 0),
    );

    // Dodavany obsah, ne overeny hracem.
    //
    // Do 19. 8. 2026 tady stalo, ze kazda rodina musi byt LOW: cesta z LOW vedla
    // jen pres ctenare a zadny nebyl. Majitel produktu pak rozhodl, ze pri 10 447
    // rozhodnutich ve 52 packach na cteni nema cas ani sily, a brana, kterou
    // nikdo nemuze projit, drzi obsah mimo produkci navzdy. Duveru proto zveda i
    // baterie mereni (`mechanicalReview`), ktera chyta hrube rozbiti.
    //
    // Co se tim NEzmenilo: brana musi porad nahlas rikat, ze to neni overeny
    // obsah. Test proto hlida vetu, ne hodnotu - hodnota se posunula rozhodnutim,
    // veta je to, co drzi produkt poctivy.
    expect(parsed.turnFamilies.every(
      (family: { confidence: string }) => family.confidence === "LOW" || family.confidence === "MEDIUM",
    )).toBe(true);
    expect(parsed.knownLimits.join(" ")).toContain("Solved TURN content ships");
    expect(parsed.knownLimits.join(" ")).toContain("not verified content");
    // Dve z devíti rodin mají část boardů z redukovaného review stromu. Agregát
    // pres oba by michal dve ruzne hry, takze se redukovane boardy do packu
    // nedostanou vubec - a brana to musi rict, protoze uzsi rodina je vysledek
    // rozhodnuti, ne nedostatku dat.
    expect(parsed.knownLimits.join(" ")).toContain("no turn pack blends two trees");
  });

  it("rejects an unknown option", () => {
    const result = invoke("--unknown");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --unknown");
  });
});

function invoke(...args: string[]) {
  return spawnSync(process.execPath, [
    "scripts/run-cli.mjs",
    "scripts/checkMttPlayableBeta.mts",
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
