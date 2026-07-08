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
    const handoffScript = readFileSync("scripts/writeMttHandoffArtifacts.mts", "utf8");
    const postflopPilotCatalogScript = readFileSync("scripts/checkMttPostflopPilotCatalog.mts", "utf8");
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
    expect(pkg.scripts["mtt:solver-verification"]).toBe("vite-node scripts/checkMttSolverVerification.mts");
    expect(pkg.scripts["mtt:texas-solver-review-protocol"]).toBe("vite-node scripts/checkTexasSolverReviewProtocol.mts");
    expect(pkg.scripts["mtt:stage-texas-solver"]).toBe("vite-node scripts/stageTexasSolverExports.mts");
    expect(pkg.scripts["mtt:texas-solver-pack"]).toBe("vite-node scripts/checkTexasSolverParameterPack.mts");
    expect(pkg.scripts["mtt:texas-solver-review"]).toBe("vite-node scripts/extractTexasSolverReview.mts");
    expect(pkg.scripts["mtt:texas-solver-scenario-audit"]).toBe("vite-node scripts/auditTexasSolverScenarioBatch.mts");
    expect(pkg.scripts["mtt:texas-solver-coverage-batch"]).toBe("vite-node scripts/buildTexasSolverCoverageBatch.mts");
    expect(pkg.scripts["mtt:texas-solver-coverage-status"]).toBe("vite-node scripts/checkTexasSolverCoverageBatchStatus.mts");
    expect(pkg.scripts["mtt:texas-solver-ingest-completed"]).toBe("vite-node scripts/ingestTexasSolverCompletedCoverage.mts");
    expect(pkg.scripts["mtt:texas-solver-normalize-draft"]).toBe("vite-node scripts/buildTexasSolverNormalizedDraft.mts");
    expect(pkg.scripts["mtt:texas-solver-merge-pilot-drafts"]).toBe("vite-node scripts/mergeTexasSolverPilotDrafts.mts");
    expect(pkg.scripts["mtt:texas-solver-viewer"]).toBe("vite-node scripts/buildTexasSolverReviewViewer.mts");
    expect(pkg.scripts["mtt:postflop-pilot-gate"]).toBe("vite-node scripts/checkMttPostflopPilotGate.mts");
    expect(pkg.scripts["mtt:postflop-pilot-suite"]).toBe("vite-node scripts/checkMttPostflopPilotSuite.mts");
    expect(pkg.scripts["mtt:postflop-pilot-catalog"]).toBe("vite-node scripts/checkMttPostflopPilotCatalog.mts");
    expect(pkg.scripts["mtt:postflop-pilot-modules"]).toBe("vite-node scripts/buildMttPostflopPilotModules.mts");
    expect(pkg.scripts["mtt:release-gates"]).toBe("vite-node scripts/checkMttReleaseGates.mts");
    expect(pkg.scripts["mtt:acceptance"]).toBe("vite-node scripts/checkMttAcceptance.mts");
    expect(pkg.scripts["mtt:technical-acceptance"])
      .toBe("vite-node scripts/checkMttTechnicalAcceptance.mts");
    expect(pkg.scripts["mtt:handoff"]).toBe("vite-node scripts/writeMttHandoffArtifacts.mts");
    expect(pkg.scripts["mtt:next-action"]).toBe("vite-node scripts/reportNextMttAction.mts");
    expect(pkg.scripts["mtt:promote-ready"]).toBe("vite-node scripts/promoteReadyMttIntake.mts");
    expect(pkg.scripts["mtt:registry-integrity"]).toBe("vite-node scripts/checkMttProductionRegistryIntegrity.mts");
    expect(pkg.scripts["mtt:validate-ready-intake"]).toBe("vite-node scripts/validateMttReadyIntake.mts");
    expect(pkg.scripts["mtt:preflop-csv-draft"]).toBe("vite-node scripts/buildMttPreflopCsvDraft.mts");
    expect(pkg.scripts["range:intake"]).toBe("vite-node scripts/checkRangeIntakeStatus.mts");
    expect(pkg.scripts["range:intake:guard"]).toBe("vite-node scripts/checkRangeIntakeWorkspace.mts");
    expect(pkg.scripts["bundle:budget"]).toBe("vite-node scripts/checkBundleBudget.mts");
    expect(pkg.scripts["verify:precache"]).toBe("vite-node scripts/checkDistPrecache.mts");
    expect(pkg.scripts["profile:render"]).toBe("vite-node scripts/profileRenderPerformance.mts");
    expect(pkg.scripts["e2e:chrome"]).toBe("vite-node scripts/runChromeE2e.mts");
    expect(pkg.scripts["e2e:chrome:production-fixture"])
      .toBe("vite-node scripts/runChromeProductionFixtureE2e.mts");
    expect(pkg.scripts["e2e:android:preflight"])
      .toBe("vite-node scripts/checkAndroidDeviceAvailability.mts");
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
    expect(productionFixtureE2eScript).toContain("MTT_E2E_EXPECT_TURN_PACK_ID");
    expect(productionFixtureE2eScript).toContain("MTT_E2E_EXPECT_RIVER_PACK_ID");
    expect(productionFixtureE2eScript)
      .toContain("mtt-full-ring-9-regular-flop-chip-ev-ante-on-production-v1");
    expect(productionFixtureE2eScript).toContain("renderFlopFixtureModule");
    expect(productionFixtureE2eScript).toContain("renderTurnFixtureModule");
    expect(productionFixtureE2eScript).toContain("renderRiverFixtureModule");
    expect(productionFixtureE2eScript).toContain("buildFlopProductionCoverageReport");
    expect(productionFixtureE2eScript).toContain("findAvailablePort");
    expect(productionFixtureE2eScript).toContain('"--strictPort"');
    expect(productionFixtureE2eScript).toContain("scripts/refreshMttProductionRegistry.mts");
    expect(productionFixtureE2eScript).toContain("node_modules/vite/bin/vite.js");
    expect(productionFixtureE2eScript).toContain("process.execPath");
    expect(technicalAcceptanceScript).toContain("Complete Vitest suite");
    expect(technicalAcceptanceScript).toContain("Chrome production-build E2E");
    expect(technicalAcceptanceScript)
      .toContain("Chrome synthetic production PREFLOP/FLOP/TURN/RIVER E2E");
    expect(technicalAcceptanceScript).toContain("createNpmShim");
    expect(technicalAcceptanceScript).toContain("findAvailablePort");
    expect(technicalAcceptanceScript).toContain("mtt-technical-acceptance");
    expect(handoffScript).toContain("nextActionPacket");
    expect(handoffScript).toContain("--packet-dir=artifacts/mtt-next-action/packet");
    expect(handoffScript).toContain("--board-dir=artifacts/mtt-intake-board");
    expect(handoffScript).toContain("mtt:solver-verification");
    expect(handoffScript).toContain("artifacts/mtt-solver-verification/report.json");
    expect(handoffScript).toContain("mtt:texas-solver-review-protocol");
    expect(handoffScript).toContain("artifacts/texas-solver-review-protocol/report.json");
    expect(handoffScript).toContain("artifacts/texas-solver-review-protocol/packet");
    expect(handoffScript).toContain("mtt:postflop-pilot-suite");
    expect(handoffScript).toContain("artifacts/mtt-postflop-pilot-suite/report.json");
    expect(handoffScript).toContain("mtt:postflop-pilot-catalog");
    expect(handoffScript).toContain("artifacts/mtt-postflop-pilot-catalog/report.json");
    expect(postflopPilotCatalogScript).toContain("npm run mtt:postflop-pilot-catalog -- --output=artifacts/mtt-postflop-pilot-catalog/report.json");
    expect(handoffScript).toContain("mtt:texas-solver-pack");
    expect(handoffScript).toContain("artifacts/texas-solver-parameter-pack/report.json");
    expect(handoffScript).toContain("expected-paths.json");
    expect(handoffScript).toContain("NORMALIZED_JSON_REQUIREMENTS.md");
    expect(handoffScript).toContain("PERMISSION_JSON_REQUIREMENTS.md");
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
    const p1PreflopIntake = readFileSync("Agents/mtt-p1-preflop-chip-ev-intake.md", "utf8");
    const p1PreflopCsvTemplate = readFileSync(
      "Agents/range-intake/templates/mtt-preflop-records-template.csv",
      "utf8",
    );
    const p1PreflopCoverageCsv = readFileSync(
      "Agents/range-intake/templates/mtt-p1-preflop-chip-ev-coverage.csv",
      "utf8",
    );
    const p1PreflopCsvTemplateReadme = readFileSync(
      "Agents/range-intake/templates/mtt-preflop-records-template.README.md",
      "utf8",
    );
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
    expect(operatorGuide).toContain("npm run mtt:slots -- --output=artifacts/mtt-slots-report.json");
    expect(operatorGuide).toContain("npm run mtt:blockers");
    expect(operatorGuide).toContain("npm run mtt:release-gates");
    expect(operatorGuide).toContain("npm run mtt:release-gates -- --json");
    expect(operatorGuide).toContain("npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --output=artifacts/mtt-intake-plan-report.json");
    expect(operatorGuide).toContain("npm run mtt:blockers -- --output=artifacts/mtt-blockers-report.json");
    expect(operatorGuide).toContain("npm run mtt:next-action");
    expect(operatorGuide).toContain("npm run mtt:next-action -- --json");
    expect(operatorGuide).toContain("npm run mtt:next-action -- --output=artifacts/mtt-next-action/report.json");
    expect(operatorGuide).toContain("npm run mtt:next-action -- --packet-dir=artifacts/mtt-next-action/packet");
    expect(operatorGuide).toContain("npm run mtt:next-action -- --priority=P2_PREFLOP_DOLAR_EV");
    expect(operatorGuide).toContain("Use `--priority=<bucket>`");
    expect(operatorGuide).toContain("slot intake packet should be saved");
    expect(operatorGuide).toContain("next concrete MTT import step");
    expect(operatorGuide).toContain("next-action packet");
    expect(operatorGuide).toContain("required file acceptance notes");
    expect(operatorGuide).toContain("slot intake packet");
    expect(operatorGuide).toContain("Do not create placeholder");
    expect(operatorGuide).toContain("npm run mtt:handoff");
    expect(operatorGuide).toContain("npm run mtt:handoff -- --json");
    expect(operatorGuide).toContain("npm run mtt:handoff -- --strict");
    expect(operatorGuide).toContain("npm run mtt:handoff -- --output=artifacts/mtt-handoff-report.json");
    expect(operatorGuide).toContain("regenerates every source-free MTT handoff JSON artifact");
    expect(operatorGuide).toContain("scoped postflop pilot suite/catalog");
    expect(operatorGuide).toContain("solver verification");
    expect(operatorGuide).toContain("also writes the next-action checklist packet");
    expect(operatorGuide).toContain("npm run mtt:acceptance");
    expect(operatorGuide).toContain("npm run mtt:acceptance -- --json");
    expect(operatorGuide).toContain("npm run mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json");
    expect(operatorGuide).toContain("final MTT-only acceptance gate");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --summary");
    expect(operatorGuide).toContain("npm run mtt:completion -- --summary");
    expect(operatorGuide).toContain("npm run mtt:completion -- --output=artifacts/mtt-completion-report.json");
    expect(operatorGuide).toContain("priority counts matching the intake plan buckets");
    expect(operatorGuide).toContain("npm run mtt:postflop-matrix");
    expect(operatorGuide).toContain("npm run mtt:postflop-matrix -- --output=artifacts/mtt-postflop-matrix-report.json");
    expect(operatorGuide).toContain("freezes the 48 FLOP/TURN/RIVER production targets");
    expect(operatorGuide).toContain("npm run mtt:postflop-positions");
    expect(operatorGuide).toContain("npm run mtt:postflop-positions -- --output=artifacts/mtt-postflop-positions-report.json");
    expect(operatorGuide).toContain("freezes supported and unsupported heads-up position pairs");
    expect(operatorGuide).toContain("npm run mtt:postflop-coverage");
    expect(operatorGuide).toContain("npm run mtt:postflop-coverage -- --output=artifacts/mtt-postflop-coverage-report.json");
    expect(operatorGuide).toContain("expands the 48 profile targets into 9,600 concrete street/pot/action/position targets");
    expect(operatorGuide).toContain("npm run mtt:postflop-release");
    expect(operatorGuide).toContain("npm run mtt:postflop-release -- --summary");
    expect(operatorGuide).toContain("npm run mtt:postflop-release -- --output=artifacts/mtt-postflop-release-report.json");
    expect(operatorGuide).toContain("npm run mtt:solver-verification");
    expect(operatorGuide).toContain("npm run mtt:solver-verification -- --solver=texas-solver --json");
    expect(operatorGuide).toContain("npm run mtt:solver-verification -- --output=artifacts/mtt-solver-verification/report.json");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-review-protocol");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-review-protocol -- --summary");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-review-protocol -- --output=artifacts/texas-solver-review-protocol/report.json");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-review-protocol -- --packet-dir=artifacts/texas-solver-review-protocol/packet");
    expect(operatorGuide).toContain("REVIEW_CHECKLIST.md");
    expect(operatorGuide).toContain("separates");
    expect(operatorGuide).toContain("technical solver readiness from poker/content approval");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-pack");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-pack -- --summary");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-pack -- --output=artifacts/texas-solver-parameter-pack/report.json");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-review -- --family=MTT9_50BB_BTN_BB_SRP --write --summary");
    expect(operatorGuide).toContain("npm run mtt:texas-solver-review -- --family=MTT9_50BB_BTN_BB_SRP --node-history=CHECK --summary");
    expect(operatorGuide).toContain("--node-history=<ACTION>[>ACTION...]");
    expect(operatorGuide).toContain("strategy-export.review.json");
    expect(operatorGuide).toContain("strategy-export.CHECK.review.json");
    expect(operatorGuide).toContain("source-safe root strategy review summary");
    expect(operatorGuide).toContain("non-blocking `anomalies` for poker review");
    expect(operatorGuide).toContain(".\\Agents\\solver-input\\texas-solver\\mtt-safe-flops-v1\\run-nightly-verification.ps1");
    expect(operatorGuide).toContain(".\\Agents\\solver-input\\texas-solver\\mtt-safe-flops-v1\\run-nightly-verification.ps1 -RunSolve -ReviewTemplate");
    expect(operatorGuide).toContain("npm run mtt:stage-texas-solver -- --summary");
    expect(operatorGuide).toContain("npm run mtt:stage-texas-solver -- --write");
    expect(operatorGuide).toContain("npm run mtt:stage-texas-solver -- --write --review-template");
    expect(operatorGuide).toContain("npm run mtt:stage-texas-solver -- --family=MTT9_40BB_UTG_BB_SRP --write --review-template");
    expect(operatorGuide).toContain("npm run mtt:stage-texas-solver -- --family=MTT9_35BB_CO_BTN_3BP --write --review-template");
    expect(operatorGuide).toContain("maps the current GTO+/TexasSolver source families");
    expect(operatorGuide).toContain("strategy-export.json");
    expect(operatorGuide).toContain("fails release while any FLOP/TURN/RIVER slot still uses fallback runtime");
    expect(operatorGuide).toContain("npm run mtt:intake-plan");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --ready-only --json");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all");
    expect(operatorGuide).toContain("npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json");
    expect(operatorGuide).toContain("npm run mtt:validate-ready-intake -- --output=artifacts/mtt-validate-ready-intake-report.json");
    expect(operatorGuide).toContain("waiting rows");
    expect(operatorGuide).toContain("staged yet");
    expect(operatorGuide).toContain("completed import wave");
    expect(operatorGuide).toContain("npm run mtt:promote-ready");
    expect(operatorGuide).toContain("npm run mtt:promote-ready -- --output=artifacts/mtt-promote-ready-report.json");
    expect(operatorGuide).toContain("WRITE_READY_MTT_MODULES");
    expect(operatorGuide).toContain("refuses to overwrite existing output modules");
    expect(operatorGuide).toContain("an empty promotion plan prints waiting rows");
    expect(operatorGuide).toContain("npm run mtt:registry-integrity");
    expect(operatorGuide).toContain("generated modules not registered in runtime resolvers");
    expect(operatorGuide).toContain("Permission manifests must not contain placeholder text");
    expect(operatorGuide).toContain("Normalized production imports must not contain placeholder text");
    expect(operatorGuide).toContain("build:range-module --dry-run");
    expect(operatorGuide).toContain("npm run range:intake");
    expect(operatorGuide).toContain("npm run range:intake -- --output=artifacts/range-intake-report.json");
    expect(operatorGuide).toContain("npm run range:intake:guard");
    expect(operatorGuide).toContain("npm run range:intake:guard -- --output=artifacts/range-intake-guard-report.json");
    expect(operatorGuide).toContain("checks local raw folders against the legal slot registry");
    expect(operatorGuide).toContain("permission.json` `packId");
    expect(operatorGuide).toContain("legal import slot: true");
    expect(operatorGuide).toContain("matched import slots");
    expect(operatorGuide).toContain("npm run verify:ranges");
    expect(operatorGuide).toContain("npm run release:check");
    expect(mttDoneChecklist).toContain("All 64 MTT completion rows are production-ready");
    expect(mttDoneChecklist).toContain("npm run mtt:acceptance");
    expect(mttDoneChecklist).toContain("npm run mtt:handoff -- --strict");
    expect(mttDoneChecklist).toContain("artifacts/mtt-handoff-report.json");
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
    expect(mttCoverageAudit).toContain("npm run mtt:handoff");
    expect(mttCoverageAudit).toContain("npm run mtt:handoff -- --strict");
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
    expect(mttCoverageAudit).toContain("npm run mtt:texas-solver-review-protocol");
    expect(mttCoverageAudit).toContain("artifacts/texas-solver-review-protocol/report.json");
    expect(mttCoverageAudit).toContain("artifacts/mtt-postflop-pilot-suite/report.json");
    expect(mttCoverageAudit).toContain("artifacts/mtt-postflop-pilot-catalog/report.json");
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
    expect(p1PreflopIntake).toContain("MTT P1 preflop CHIP_EV intake checklist");
    expect(p1PreflopIntake).toContain("mtt-full-ring-9-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(p1PreflopIntake).toContain("Agents/range-intake/templates/mtt-preflop-records-template.csv");
    expect(p1PreflopIntake).toContain("Agents/range-intake/templates/mtt-p1-preflop-chip-ev-coverage.csv");
    expect(p1PreflopIntake).toContain("Turbo slots must not become production by copying regular-speed metadata");
    expect(p1PreflopIntake).toContain("Do not use postflop TexasSolver outputs for P1 preflop ranges");
    expect(p1PreflopCsvTemplate).toContain("rowKind,packId,tableFormat,blindSpeed,ante,evModel");
    expect(p1PreflopCsvTemplate).toContain("strictActions,lenientActions,sourceReferenceId");
    expect(p1PreflopCoverageCsv).toContain("P1_PREFLOP_CHIP_EV");
    expect(p1PreflopCoverageCsv).toContain("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1");
    expect(p1PreflopCoverageCsv).toContain("mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1");
    expect(p1PreflopCoverageCsv).toContain("UTG|UTG+1|UTG+2|LJ|HJ|CO|BTN|SB|BB");
    expect(p1PreflopCoverageCsv).toContain("RFI|VS_LIMP|VS_OPEN|VS_3BET|VS_4BET|SQUEEZE|BVB|PUSH_FOLD|VS_ALLIN");
    expect(p1PreflopCsvTemplateReadme).toContain("Do not create placeholder `normalized.json` or `permission.json` files");
    expect(p1PreflopCsvTemplateReadme).toContain("OPEN_2X");
    expect(p1PreflopCsvTemplateReadme).toContain("CALL_JAM");
    expect(p1PreflopCsvTemplateReadme).toContain("permission.json` means production provenance/audit");
    expect(p1PreflopCsvTemplateReadme).toContain("npm run mtt:preflop-csv-draft");
    expect(p1PreflopCsvTemplateReadme).toContain("exits non-zero until the generated draft is complete");
    expect(productionIntakeManifest).toContain("npm run mtt:release-gates");
    expect(productionIntakeManifest).toContain("npm run mtt:release-gates -- --json");
    expect(productionIntakeManifest).not.toContain("mtt:completion -- --summary` and `npm run mtt:postflop-release");
    expect(releaseTemplate).toContain("Gameplay changes");
    expect(releaseTemplate).toContain("Range data changes");
    expect(releaseTemplate).toContain("Statistics changes");
    expect(releaseTemplate).toContain("npm run mtt:handoff");
    expect(releaseTemplate).toContain("npm run mtt:handoff -- --strict");
    expect(releaseTemplate).toContain("MTT handoff report: `artifacts/mtt-handoff-report.json`");
    expect(releaseTemplate).toContain("npm run mtt:slots -- --output=artifacts/mtt-slots-report.json");
    expect(releaseTemplate).toContain("npm run mtt:completion -- --summary");
    expect(releaseTemplate).toContain("npm run mtt:completion -- --output=artifacts/mtt-completion-report.json");
    expect(releaseTemplate).toContain("npm run mtt:next-action");
    expect(releaseTemplate).toContain("artifacts/mtt-next-action/report.json");
    expect(releaseTemplate).toContain("npm run mtt:acceptance");
    expect(releaseTemplate).toContain("npm run mtt:acceptance -- --json");
    expect(releaseTemplate).toContain("npm run mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json");
    expect(releaseTemplate).toContain("npm run mtt:release-gates");
    expect(releaseTemplate).toContain("npm run mtt:release-gates -- --json");
    expect(releaseTemplate).toContain("npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json");
    expect(releaseTemplate).toContain("npm run mtt:blockers");
    expect(releaseTemplate).toContain("npm run mtt:blockers -- --output=artifacts/mtt-blockers-report.json");
    expect(releaseTemplate).toContain("npm run mtt:postflop-matrix -- --output=artifacts/mtt-postflop-matrix-report.json");
    expect(releaseTemplate).toContain("npm run mtt:postflop-positions -- --output=artifacts/mtt-postflop-positions-report.json");
    expect(releaseTemplate).toContain("npm run mtt:postflop-coverage -- --output=artifacts/mtt-postflop-coverage-report.json");
    expect(releaseTemplate).toContain("npm run mtt:postflop-release -- --summary");
    expect(releaseTemplate).toContain("npm run mtt:postflop-release -- --output=artifacts/mtt-postflop-release-report.json");
    expect(releaseTemplate).toContain("npm run mtt:postflop-pilot-suite -- --output=artifacts/mtt-postflop-pilot-suite/report.json");
    expect(releaseTemplate).toContain("npm run mtt:postflop-pilot-catalog -- --output=artifacts/mtt-postflop-pilot-catalog/report.json");
    expect(releaseTemplate).toContain("npm run mtt:intake-plan -- --summary");
    expect(releaseTemplate).toContain("npm run mtt:intake-plan -- --output=artifacts/mtt-intake-plan-report.json");
    expect(releaseTemplate).toContain("npm run mtt:intake-plan -- --ready-only");
    expect(releaseTemplate).toContain("npm run mtt:validate-ready-intake");
    expect(releaseTemplate).toContain("npm run mtt:validate-ready-intake -- --output=artifacts/mtt-validate-ready-intake-report.json");
    expect(releaseTemplate).toContain("npm run mtt:promote-ready");
    expect(releaseTemplate).toContain("npm run mtt:promote-ready -- --output=artifacts/mtt-promote-ready-report.json");
    expect(releaseTemplate).toContain("npm run mtt:registry-integrity");
    expect(releaseTemplate).toContain("npm run range:intake:guard");
    expect(releaseTemplate).toContain("npm run range:intake:guard -- --output=artifacts/range-intake-guard-report.json");
    expect(releaseTemplate).toContain("npm run range:intake -- --ready-only");
    expect(releaseTemplate).toContain("npm run range:intake -- --output=artifacts/range-intake-report.json");
    expect(releaseTemplate).toContain("npm run e2e:android:preflight");
    expect(releaseTemplate).toContain("artifacts/e2e-android-preflight/report.json");
    expect(releaseTemplate).toContain("Android preflight status / readySerial");
    expect(releaseTemplate).toContain("MTT intake priority plan");
    expect(releaseTemplate).toContain("Known limitations");
  });
});
