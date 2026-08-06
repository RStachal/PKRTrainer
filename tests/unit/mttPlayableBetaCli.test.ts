import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:playable-beta CLI", () => {
  it("keeps the current Core launchable while identifying the exact six-max target gap", () => {
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
