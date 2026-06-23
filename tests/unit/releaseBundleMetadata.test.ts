import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { postflopPublicHeuristicStrategyPacks } from "../../src/data/ranges/postflopStrategyPack";
import { validateRangePack } from "../../src/data/ranges/rangePack";
import {
  allTrainingRangePacks,
  rangePackForTrainingProfile,
} from "../../src/data/ranges/trainingRangePacks";

describe("release bundle metadata", () => {
  it("obsahuje nove RangePack/StrategyPack metadata v offline katalogu", () => {
    const ids = allTrainingRangePacks.map((pack) => pack.id);

    expect(ids).toContain("mtt-six-max-regular-preflop-chip-ev-ante-on-candidate-v0");
    expect(ids).toContain("sng-six-max-turbo-preflop-chip-ev-ante-off-candidate-v0");
    expect(ids).toContain("cash-six-max-regular-preflop-chip-ev-rake-candidate-v0");
    expect(ids).toContain("cash-six-max-regular-preflop-chip-ev-no-rake-candidate-v0");
    expect(postflopPublicHeuristicStrategyPacks.map((pack) => pack.id)).toEqual([
      "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
      "mtt-full-ring-9-turn-single-raised-chip-ev-public-heuristic-v1",
      "mtt-full-ring-9-river-single-raised-chip-ev-public-heuristic-v1",
    ]);

    for (const pack of allTrainingRangePacks) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolvery vybiraji packy jen podle presneho profilu", () => {
    expect(rangePackForTrainingProfile(DEFAULT_TRAINING_PROFILE)?.id)
      .toBe("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1");

    expect(rangePackForTrainingProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "CASH",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "NO_RAKE",
    }))?.id).toBe("cash-six-max-regular-preflop-chip-ev-no-rake-candidate-v0");

    expect(rangePackForTrainingProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
      gameVariant: "MTT",
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "RAKE",
    }))).toBeUndefined();
  });

  it("publikovana app metadata pouzivaji cestinu a platne UTF-8 popisy", () => {
    const html = readFileSync("index.html", "utf8");
    const budgetScript = readFileSync("scripts/checkBundleBudget.mts", "utf8");
    const chromeE2eScript = readFileSync("scripts/runChromeE2e.mts", "utf8");
    const productionFixtureE2eScript = readFileSync(
      "scripts/runChromeProductionFixtureE2e.mts",
      "utf8",
    );
    const technicalAcceptanceScript = readFileSync(
      "scripts/checkMttTechnicalAcceptance.mts",
      "utf8",
    );
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
      description: string;
      lang: string;
    };
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      description: string;
      scripts: Record<string, string>;
    };

    expect(html).toContain('<html lang="cs">');
    expect(html).toContain("Tato aplikace vyžaduje zapnutý JavaScript.");
    expect(manifest.lang).toBe("cs");
    expect(manifest.description).toBe("Offline trenažér pokerových rozhodnutí pro turnajovou hru.");
    expect(pkg.description).toContain("offline full-ring 9-handed poker decision trainer");
    expect(pkg.scripts["verify:ranges"]).toBe("vite-node scripts/verifyRanges.mts");
    expect(pkg.scripts["validate:range-import"]).toBe("vite-node scripts/validateRangeImport.mts");
    expect(pkg.scripts["build:range-module"]).toBe("vite-node scripts/buildRangeModule.mts");
    expect(pkg.scripts["mtt:slots"]).toBe("vite-node scripts/listMttImportSlots.mts");
    expect(pkg.scripts["mtt:completion"]).toBe("vite-node scripts/checkMttCompletion.mts");
    expect(pkg.scripts["mtt:blockers"]).toBe("vite-node scripts/checkMttBlockers.mts");
    expect(pkg.scripts["mtt:intake-plan"]).toBe("vite-node scripts/checkMttIntakePlan.mts");
    expect(pkg.scripts["mtt:postflop-matrix"]).toBe("vite-node scripts/checkMttPostflopMatrix.mts");
    expect(pkg.scripts["mtt:postflop-coverage"]).toBe("vite-node scripts/checkMttPostflopProductionCoverage.mts");
    expect(pkg.scripts["mtt:postflop-positions"]).toBe("vite-node scripts/checkMttPostflopPositions.mts");
    expect(pkg.scripts["mtt:postflop-release"]).toBe("vite-node scripts/checkMttPostflopReleaseGate.mts");
    expect(pkg.scripts["mtt:release-gates"]).toBe("vite-node scripts/checkMttReleaseGates.mts");
    expect(pkg.scripts["mtt:acceptance"]).toBe("vite-node scripts/checkMttAcceptance.mts");
    expect(pkg.scripts["mtt:technical-acceptance"])
      .toBe("vite-node scripts/checkMttTechnicalAcceptance.mts");
    expect(pkg.scripts["mtt:next-action"]).toBe("vite-node scripts/reportNextMttAction.mts");
    expect(pkg.scripts["mtt:promote-ready"]).toBe("vite-node scripts/promoteReadyMttIntake.mts");
    expect(pkg.scripts["mtt:registry-integrity"]).toBe("vite-node scripts/checkMttProductionRegistryIntegrity.mts");
    expect(pkg.scripts["mtt:validate-ready-intake"]).toBe("vite-node scripts/validateMttReadyIntake.mts");
    expect(pkg.scripts["range:intake"]).toBe("vite-node scripts/checkRangeIntakeStatus.mts");
    expect(pkg.scripts["range:intake:guard"]).toBe("vite-node scripts/checkRangeIntakeWorkspace.mts");
    expect(pkg.scripts["bundle:budget"]).toBe("vite-node scripts/checkBundleBudget.mts");
    expect(pkg.scripts["verify:precache"]).toBe("vite-node scripts/checkDistPrecache.mts");
    expect(pkg.scripts["profile:render"]).toBe("vite-node scripts/profileRenderPerformance.mts");
    expect(pkg.scripts["e2e:chrome"]).toBe("vite-node scripts/runChromeE2e.mts");
    expect(pkg.scripts["e2e:chrome:production-fixture"])
      .toBe("vite-node scripts/runChromeProductionFixtureE2e.mts");
    expect(chromeE2eScript).toContain('"mobile-360"');
    expect(chromeE2eScript).toContain('"mobile-390"');
    expect(chromeE2eScript).toContain('"mobile-412"');
    expect(chromeE2eScript).toContain("Input.dispatchTouchEvent");
    expect(chromeE2eScript).toContain("Input.dispatchKeyEvent");
    expect(chromeE2eScript).toContain(".hh-analysis .matrix-cell");
    expect(chromeE2eScript).toContain(".stats-export");
    expect(chromeE2eScript).toContain(".stats-import");
    expect(chromeE2eScript).toContain("Network.emulateNetworkConditions");
    expect(chromeE2eScript).toContain("Emulation.setPageScaleFactor");
    expect(chromeE2eScript).toContain("mtt_preflop_state_v1");
    expect(chromeE2eScript).toContain("Simulated quota failure");
    expect(chromeE2eScript).toContain("MTT_E2E_POSTFLOP_SEED");
    expect(chromeE2eScript).toContain("auditContrast");
    expect(chromeE2eScript).toContain("required = fontSize >= 24");
    expect(chromeE2eScript).toContain("runServiceWorkerUpgradeScenario");
    expect(chromeE2eScript).toContain("previous-build-chunk");
    expect(chromeE2eScript).toContain("stableAssetIsolation");
    expect(productionFixtureE2eScript).toContain("Synthetic source-free browser fixture");
    expect(productionFixtureE2eScript).toContain("MTT_E2E_EXPECT_PREFLOP");
    expect(productionFixtureE2eScript).toContain("MTT_E2E_EXPECT_POSTFLOP_PACK_ID");
    expect(productionFixtureE2eScript)
      .toContain("mtt-full-ring-9-regular-flop-chip-ev-ante-on-production-v1");
    expect(productionFixtureE2eScript).toContain("renderFlopFixtureModule");
    expect(productionFixtureE2eScript).toContain("buildFlopProductionCoverageReport");
    expect(productionFixtureE2eScript).toContain("findAvailablePort");
    expect(productionFixtureE2eScript).toContain('"--strictPort"');
    expect(productionFixtureE2eScript).toContain("scripts/refreshMttProductionRegistry.mts");
    expect(productionFixtureE2eScript).toContain("node_modules/vite/bin/vite.js");
    expect(productionFixtureE2eScript).toContain("process.execPath");
    expect(technicalAcceptanceScript).toContain("Complete Vitest suite");
    expect(technicalAcceptanceScript).toContain("Chrome production-build E2E");
    expect(technicalAcceptanceScript).toContain("Chrome synthetic production PREFLOP/FLOP E2E");
    expect(technicalAcceptanceScript).toContain("createNpmShim");
    expect(technicalAcceptanceScript).toContain("findAvailablePort");
    expect(technicalAcceptanceScript).toContain("mtt-technical-acceptance");
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_JS_KB", 325)');
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_GZIP_KB", 86)');
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_PRECACHE_JS_KB", 400)');
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_PRECACHE_GZIP_KB", 128)');
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_LAZY_MTT_JS_KB", 512)');
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_LAZY_MTT_GZIP_KB", 128)');
    expect(budgetScript).toContain('"BUNDLE_MAX_LAZY_MTT_TOTAL_JS_KB", 32768');
    expect(budgetScript).toContain('"BUNDLE_MAX_LAZY_MTT_TOTAL_GZIP_KB",');
    expect(pkg.scripts["release:check"])
      .toBe("npm run typecheck && npm test && npm run mtt:refresh-registry -- --check && npm run mtt:release-gates && npm run verify:ranges && npm run build && npm run verify:precache && npm run bundle:budget");
    expect(`${html}\n${manifest.description}\n${pkg.description}`).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
  });

  it("release dokumentace obsahuje workflow a user quick start zustava bez citaci", () => {
    const quickStart = readFileSync("Agents/user-quick-start.md", "utf8");
    const operatorGuide = readFileSync("Agents/range-import-operator-guide.md", "utf8");
    const forpsiDeployment = readFileSync("Agents/forpsi-ftp-deployment.md", "utf8");
    const forpsiHtaccess = readFileSync("deploy/forpsi/.htaccess.example", "utf8");
    const mttDoneChecklist = readFileSync("Agents/mtt-done-checklist.md", "utf8");
    const mttCoverageAudit = readFileSync("Agents/mtt-production-coverage-audit.md", "utf8");
    const productionIntakeManifest = readFileSync("Agents/production-range-intake-manifest.md", "utf8");
    const releaseTemplate = readFileSync("Agents/release-notes-template.md", "utf8");

    expect(quickStart).toContain("Trénink");
    expect(quickStart).toContain("Statistiky");
    expect(quickStart).toContain("Import HH");
    expect(quickStart).toContain("Postflop");
    expect(quickStart).not.toMatch(/\bhttps?:\/\//i);
    expect(quickStart).not.toMatch(/\b(?:RangePack|StrategyPack)\b/);
    expect(quickStart).not.toMatch(/\b(?:mtt|sng|cash)-(?:full-ring|six-max|6max)[a-z0-9-]*/i);

    expect(operatorGuide).toContain("npm run validate:range-import");
    expect(operatorGuide).toContain("npm run mtt:slots");
    expect(operatorGuide).toContain("npm run mtt:blockers");
    expect(operatorGuide).toContain("npm run mtt:release-gates");
    expect(operatorGuide).toContain("npm run mtt:release-gates -- --json");
    expect(operatorGuide).toContain("npm run mtt:next-action");
    expect(operatorGuide).toContain("npm run mtt:next-action -- --json");
    expect(operatorGuide).toContain("next concrete MTT import step");
    expect(operatorGuide).toContain("npm run mtt:acceptance");
    expect(operatorGuide).toContain("npm run mtt:acceptance -- --json");
    expect(operatorGuide).toContain("final MTT-only acceptance gate");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --summary");
    expect(operatorGuide).toContain("npm run mtt:completion -- --summary");
    expect(operatorGuide).toContain("priority counts matching the intake plan buckets");
    expect(operatorGuide).toContain("npm run mtt:postflop-matrix");
    expect(operatorGuide).toContain("freezes the 48 FLOP/TURN/RIVER production targets");
    expect(operatorGuide).toContain("npm run mtt:postflop-positions");
    expect(operatorGuide).toContain("freezes supported and unsupported heads-up position pairs");
    expect(operatorGuide).toContain("npm run mtt:postflop-coverage");
    expect(operatorGuide).toContain("expands the 48 profile targets into 9,600 concrete street/pot/action/position targets");
    expect(operatorGuide).toContain("npm run mtt:postflop-release");
    expect(operatorGuide).toContain("npm run mtt:postflop-release -- --summary");
    expect(operatorGuide).toContain("fails release while any FLOP/TURN/RIVER slot still uses fallback runtime");
    expect(operatorGuide).toContain("npm run mtt:intake-plan");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --ready-only --json");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json");
    expect(operatorGuide).toContain("npm run mtt:promote-ready");
    expect(operatorGuide).toContain("WRITE_READY_MTT_MODULES");
    expect(operatorGuide).toContain("refuses to overwrite existing output modules");
    expect(operatorGuide).toContain("npm run mtt:registry-integrity");
    expect(operatorGuide).toContain("generated modules not registered in runtime resolvers");
    expect(operatorGuide).toContain("Permission manifests must not contain placeholder text");
    expect(operatorGuide).toContain("Normalized production imports must not contain placeholder text");
    expect(operatorGuide).toContain("build:range-module --dry-run");
    expect(operatorGuide).toContain("npm run range:intake");
    expect(operatorGuide).toContain("npm run range:intake:guard");
    expect(operatorGuide).toContain("checks local raw folders against the legal slot registry");
    expect(operatorGuide).toContain("permission.json` `packId");
    expect(operatorGuide).toContain("legal import slot: true");
    expect(operatorGuide).toContain("matched import slots");
    expect(operatorGuide).toContain("npm run verify:ranges");
    expect(operatorGuide).toContain("npm run release:check");
    expect(mttDoneChecklist).toContain("All 64 MTT completion rows are production-ready");
    expect(mttDoneChecklist).toContain("npm run mtt:acceptance");
    expect(mttDoneChecklist).toContain("npm run mtt:registry-integrity");
    expect(mttDoneChecklist).toContain("No production promotion uses public heuristic fallback");
    expect(mttDoneChecklist).toContain("Start and answer representative 9-max turbo DOLAR_EV preflop training");
    expect(forpsiDeployment).toContain("FORPSI FTP Deployment");
    expect(forpsiDeployment).toContain("dist/index.html");
    expect(forpsiDeployment).toContain("deploy/forpsi/.htaccess.example");
    expect(forpsiDeployment).toContain("AuthUserFile");
    expect(forpsiDeployment).toContain("/data/.htpasswd-pkrtrainer");
    expect(forpsiDeployment).not.toContain("YOUR_REAL_PASSWORD");
    expect(forpsiHtaccess).toContain("Options -Indexes");
    expect(forpsiHtaccess).toContain("AuthType Basic");
    expect(forpsiHtaccess).toContain("Require valid-user");
    expect(forpsiHtaccess).toContain(".htpasswd-pkrtrainer");
    expect(mttCoverageAudit).toContain("Updated: 2026-06-22");
    expect(mttCoverageAudit).toContain("DOLAR_EV");
    expect(mttCoverageAudit).toContain("Completion matrix");
    expect(mttCoverageAudit).toContain("npm run mtt:completion -- --summary");
    expect(mttCoverageAudit).toContain("npm run mtt:completion -- --preview --json");
    expect(mttCoverageAudit).toContain("npm run mtt:release-gates");
    expect(mttCoverageAudit).toContain("npm run mtt:release-gates -- --json");
    expect(mttCoverageAudit).toContain("npm run mtt:acceptance");
    expect(mttCoverageAudit).toContain("npm run mtt:acceptance -- --json");
    expect(mttCoverageAudit).toContain("npm run mtt:registry-integrity");
    expect(mttCoverageAudit).toContain("links its output to `Agents/mtt-done-checklist.md`");
    expect(mttCoverageAudit).toContain("prints completion, blocker, intake priority, postflop release, intake workspace and ready-validation summaries");
    expect(mttCoverageAudit).toContain("captured outputs for operator tooling");
    expect(mttCoverageAudit).toContain("defaults to a production gate");
    expect(mttCoverageAudit).toContain("total MTT rows: 64");
    expect(mttCoverageAudit).toContain("production-ready rows: 0");
    expect(mttCoverageAudit).toContain("candidate/preview rows: 54");
    expect(mttCoverageAudit).toContain("blocked/missing rows: 10");
    expect(mttCoverageAudit).toContain("npm run range:intake -- --ready-only --json");
    expect(mttCoverageAudit).toContain("npm run mtt:blockers");
    expect(mttCoverageAudit).toContain("npm run mtt:blockers -- --summary");
    expect(mttCoverageAudit).toContain("reports the same priority buckets as `mtt:intake-plan`");
    expect(mttCoverageAudit).toContain("npm run mtt:postflop-matrix");
    expect(mttCoverageAudit).toContain("freezes the 48 FLOP/TURN/RIVER production targets");
    expect(mttCoverageAudit).toContain("npm run mtt:postflop-positions");
    expect(mttCoverageAudit).toContain("freezes all supported and unsupported heads-up aggressor/caller pairs");
    expect(mttCoverageAudit).toContain("npm run mtt:postflop-coverage");
    expect(mttCoverageAudit).toContain("expands the 48 profile targets into 9,600 concrete street/pot/action/position targets");
    expect(mttCoverageAudit).toContain("npm run mtt:postflop-release");
    expect(mttCoverageAudit).toContain("npm run mtt:postflop-release -- --summary");
    expect(mttCoverageAudit).toContain("final postflop release gate currently fails");
    expect(mttCoverageAudit).toContain("npm run mtt:intake-plan");
    expect(mttCoverageAudit).toContain("npm run mtt:intake-plan -- --summary");
    expect(mttCoverageAudit).toContain("npm run mtt:intake-plan -- --ready-only --json");
    expect(mttCoverageAudit).toContain("npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all");
    expect(mttCoverageAudit).toContain("npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all");
    expect(mttCoverageAudit).toContain("npm run mtt:validate-ready-intake");
    expect(mttCoverageAudit).toContain("npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json");
    expect(mttCoverageAudit).toContain("npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json");
    expect(mttCoverageAudit).toContain("regular-vs-turbo diff audit");
    expect(mttCoverageAudit).toContain("FLOP, TURN and RIVER production StrategyPacks are not registered");
    expect(productionIntakeManifest).toContain("npm run mtt:release-gates");
    expect(productionIntakeManifest).toContain("npm run mtt:release-gates -- --json");
    expect(productionIntakeManifest).not.toContain("mtt:completion -- --summary` and `npm run mtt:postflop-release");
    expect(releaseTemplate).toContain("Gameplay changes");
    expect(releaseTemplate).toContain("Range data changes");
    expect(releaseTemplate).toContain("Statistics changes");
    expect(releaseTemplate).toContain("npm run mtt:completion -- --summary");
    expect(releaseTemplate).toContain("npm run mtt:next-action");
    expect(releaseTemplate).toContain("npm run mtt:acceptance");
    expect(releaseTemplate).toContain("npm run mtt:acceptance -- --json");
    expect(releaseTemplate).toContain("npm run mtt:release-gates");
    expect(releaseTemplate).toContain("npm run mtt:release-gates -- --json");
    expect(releaseTemplate).toContain("npm run mtt:blockers");
    expect(releaseTemplate).toContain("npm run mtt:postflop-release -- --summary");
    expect(releaseTemplate).toContain("npm run mtt:intake-plan -- --summary");
    expect(releaseTemplate).toContain("npm run mtt:intake-plan -- --ready-only");
    expect(releaseTemplate).toContain("npm run mtt:validate-ready-intake");
    expect(releaseTemplate).toContain("npm run mtt:promote-ready");
    expect(releaseTemplate).toContain("npm run mtt:registry-integrity");
    expect(releaseTemplate).toContain("npm run range:intake:guard");
    expect(releaseTemplate).toContain("npm run range:intake -- --ready-only");
    expect(releaseTemplate).toContain("MTT intake priority plan");
    expect(releaseTemplate).toContain("Known limitations");
  });
});
