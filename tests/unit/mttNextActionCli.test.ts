import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:next-action CLI", () => {
  it("vybere prvni konkretni cekajici MTT import krok podle priority", () => {
    const result = runNextAction();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Next MTT action");
    expect(result.stdout).toContain("priority filter: all");
    expect(result.stdout).toContain("valid: false");
    expect(result.stdout).toContain("state: WAITING_FOR_FILES");
    expect(result.stdout).toContain("priority: P1_PREFLOP_CHIP_EV");
    expect(result.stdout).toContain("slot: FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF");
    expect(result.stdout).toContain("pack: mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(result.stdout).toContain("missing file: Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/normalized.json");
    expect(result.stdout).toContain("missing file: Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/permission.json");
    expect(result.stdout).toContain("required files:");
    expect(result.stdout).toContain("Pack id must be mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1.");
    expect(result.stdout).toContain("Turbo slot must use dedicated turbo hand recommendations");
    expect(result.stdout).toContain("validate: npm run validate:range-import");
    expect(result.stdout).toContain("build dry-run: npm run build:range-module");
    expect(result.stdout).toContain("validate ready: npm run mtt:validate-ready-intake");
    expect(result.stdout).toContain("promote dry-run: npm run mtt:promote-ready");
    expect(result.stdout).toContain("technical acceptance: npm run mtt:technical-acceptance");
    expect(result.stdout).toContain("android preflight: npm run e2e:android:preflight");
    expect(result.stdout).toContain("attach readySerial/device blocker evidence");
    expect(result.stdout).toContain("npm run mtt:acceptance");
    expect(result.stdout).toContain("npm run e2e:android:preflight");
    expect(result.stdout).toContain("npm run mtt:release-gates -- --json");
    expect(result.stdout).toContain("npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json");
    expect(result.stdout).not.toContain("https://");
  });

  it("umi vratit JSON pro operator tooling", () => {
    const result = runNextAction("--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      valid: boolean;
      state: string;
      priority: string | null;
      counts: {
        blockerRows: number;
        readyForValidation: number;
        missingNormalized: number;
        missingPermission: number;
        byPriority: Record<string, number>;
      };
      nextAction: {
        priority: string;
        slotId: string;
        packId: string;
        missingFiles: string[];
        commands: {
          validate: string;
          buildDryRun: string;
          validateReady: string;
          promoteDryRun: string;
          promoteWrite: string;
          registryIntegrity: string;
          technicalAcceptance: string;
          androidPreflight: string;
        };
        requiredFiles: Array<{
          path: string;
          purpose: string;
          acceptance: string[];
        }>;
        operatorChecklist: string[];
      };
      followUpCommands: string[];
      sourceReports: string[];
    };

    expect(parsed.valid).toBe(false);
    expect(parsed.state).toBe("WAITING_FOR_FILES");
    expect(parsed.priority).toBe(null);
    expect(parsed.counts.blockerRows).toBe(64);
    expect(parsed.counts.readyForValidation).toBe(0);
    expect(parsed.counts.missingNormalized).toBe(64);
    expect(parsed.counts.missingPermission).toBe(64);
    expect(parsed.counts.byPriority.P1_PREFLOP_CHIP_EV).toBe(8);
    expect(parsed.nextAction.priority).toBe("P1_PREFLOP_CHIP_EV");
    expect(parsed.nextAction.slotId).toBe("FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF");
    expect(parsed.nextAction.packId).toBe("mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(parsed.nextAction.missingFiles).toEqual([
      "Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/normalized.json",
      "Agents/range-intake/raw/mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1/permission.json",
    ]);
    expect(parsed.nextAction.commands.validate).toContain("npm run validate:range-import");
    expect(parsed.nextAction.commands.buildDryRun).toContain("npm run build:range-module");
    expect(parsed.nextAction.commands.validateReady).toContain("npm run mtt:validate-ready-intake");
    expect(parsed.nextAction.commands.promoteDryRun).toContain("npm run mtt:promote-ready");
    expect(parsed.nextAction.commands.promoteWrite).toContain("WRITE_READY_MTT_MODULES");
    expect(parsed.nextAction.commands.registryIntegrity).toBe("npm run mtt:registry-integrity");
    expect(parsed.nextAction.commands.technicalAcceptance).toBe("npm run mtt:technical-acceptance");
    expect(parsed.nextAction.commands.androidPreflight).toBe("npm run e2e:android:preflight");
    expect(parsed.nextAction.requiredFiles).toHaveLength(2);
    expect(parsed.nextAction.requiredFiles[0].path).toContain("normalized.json");
    expect(parsed.nextAction.requiredFiles[0].acceptance).toContain(
      "Pack id must be mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1.",
    );
    expect(parsed.nextAction.requiredFiles[1].path).toContain("permission.json");
    expect(parsed.nextAction.operatorChecklist.join("\n"))
      .toContain("Turbo slot must use dedicated turbo hand recommendations");
    expect(parsed.followUpCommands).toContain("npm run mtt:acceptance");
    expect(parsed.followUpCommands).toContain("npm run mtt:handoff -- --strict");
    expect(parsed.followUpCommands).toContain("npm run e2e:android:preflight");
    expect(parsed.sourceReports).toContain(
      "npm run mtt:handoff -- --output=artifacts/mtt-handoff-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run range:intake:guard -- --output=artifacts/range-intake-guard-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run range:intake -- --output=artifacts/range-intake-report.json",
    );
    expect(parsed.sourceReports).toContain("npm run mtt:slots -- --json");
    expect(parsed.sourceReports).toContain(
      "npm run mtt:slots -- --output=artifacts/mtt-slots-report.json",
    );
    expect(parsed.sourceReports).toContain("npm run mtt:completion -- --json");
    expect(parsed.sourceReports).toContain(
      "npm run mtt:completion -- --output=artifacts/mtt-completion-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:intake-plan -- --output=artifacts/mtt-intake-plan-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:blockers -- --output=artifacts/mtt-blockers-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:postflop-matrix -- --output=artifacts/mtt-postflop-matrix-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:postflop-positions -- --output=artifacts/mtt-postflop-positions-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:postflop-coverage -- --output=artifacts/mtt-postflop-coverage-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:postflop-release -- --output=artifacts/mtt-postflop-release-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:validate-ready-intake -- --output=artifacts/mtt-validate-ready-intake-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:promote-ready -- --output=artifacts/mtt-promote-ready-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run e2e:android:preflight -- --output=artifacts/e2e-android-preflight/report.json",
    );
    expect(parsed.sourceReports).toContain("npm run mtt:release-gates -- --json");
    expect(parsed.sourceReports).toContain(
      "npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json",
    );
    expect(parsed.sourceReports).toContain(
      "npm run mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json",
    );
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("umi vybrat dalsi krok pro konkretni prioritu", () => {
    const result = runNextAction("--priority=P2_PREFLOP_DOLAR_EV", "--json");

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
      priority: string;
      counts: { blockerRows: number; byPriority: Record<string, number> };
      nextAction: { priority: string; slotId: string; packId: string };
    };

    expect(parsed.priority).toBe("P2_PREFLOP_DOLAR_EV");
    expect(parsed.counts.blockerRows).toBe(8);
    expect(parsed.counts.byPriority.P2_PREFLOP_DOLAR_EV).toBe(8);
    expect(parsed.nextAction.priority).toBe("P2_PREFLOP_DOLAR_EV");
    expect(parsed.nextAction.slotId).toBe("FULL_RING_9|REGULAR|DOLAR_EV|PREFLOP|OFF");
    expect(parsed.nextAction.packId).toBe(
      "mtt-full-ring-9-regular-preflop-dolar-ev-ante-off-production-v1",
    );
    expect(JSON.stringify(parsed)).not.toContain("https://");
  });

  it("umi zapsat JSON artefakt pro operator handoff", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-next-action-"));
    const outputPath = join(directory, "report.json");
    try {
      const result = runNextAction("--priority=P3_FLOP_PRODUCTION", `--output=${outputPath}`);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("priority filter: P3_FLOP_PRODUCTION");
      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
        priority: string;
        nextAction: {
          priority: string;
          slotId: string;
          commands: { technicalAcceptance: string; androidPreflight: string };
        };
      };

      expect(parsed.priority).toBe("P3_FLOP_PRODUCTION");
      expect(parsed.nextAction.priority).toBe("P3_FLOP_PRODUCTION");
      expect(parsed.nextAction.slotId).toBe("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
      expect(parsed.nextAction.commands.technicalAcceptance).toBe("npm run mtt:technical-acceptance");
      expect(parsed.nextAction.commands.androidPreflight).toBe("npm run e2e:android:preflight");
      expect(JSON.stringify(parsed)).not.toContain("https://");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("vrati chybu pro neznamou prioritu", () => {
    const result = runNextAction("--priority=P9");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported --priority value: P9");
    expect(result.stderr).toContain("Usage:");
  });
});

function runNextAction(...args: string[]) {
  return spawnSync(command(), commandArgs(args), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
}

function command(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function commandArgs(args: string[]): string[] {
  const npmArgs = ["run", "mtt:next-action", "--", ...args];
  return process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs;
}
