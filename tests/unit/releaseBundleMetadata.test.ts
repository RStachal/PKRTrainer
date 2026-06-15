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

  it("publikovana app metadata pouzivaji anglictinu a ciste ASCII popisy", () => {
    const html = readFileSync("index.html", "utf8");
    const budgetScript = readFileSync("scripts/checkBundleBudget.mts", "utf8");
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
      description: string;
      lang: string;
    };
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      description: string;
      scripts: Record<string, string>;
    };

    expect(html).toContain('<html lang="en">');
    expect(html).toContain("This app requires JavaScript to be enabled.");
    expect(manifest.lang).toBe("en");
    expect(manifest.description).toBe("Offline full-ring 9-handed poker decision trainer.");
    expect(pkg.description).toContain("offline full-ring 9-handed poker decision trainer");
    expect(pkg.scripts["verify:ranges"]).toBe("vite-node scripts/verifyRanges.mts");
    expect(pkg.scripts["validate:range-import"]).toBe("vite-node scripts/validateRangeImport.mts");
    expect(pkg.scripts["build:range-module"]).toBe("vite-node scripts/buildRangeModule.mts");
    expect(pkg.scripts["mtt:slots"]).toBe("vite-node scripts/listMttImportSlots.mts");
    expect(pkg.scripts["mtt:completion"]).toBe("vite-node scripts/checkMttCompletion.mts");
    expect(pkg.scripts["mtt:blockers"]).toBe("vite-node scripts/checkMttBlockers.mts");
    expect(pkg.scripts["range:intake"]).toBe("vite-node scripts/checkRangeIntakeStatus.mts");
    expect(pkg.scripts["range:intake:guard"]).toBe("vite-node scripts/checkRangeIntakeWorkspace.mts");
    expect(pkg.scripts["bundle:budget"]).toBe("vite-node scripts/checkBundleBudget.mts");
    expect(pkg.scripts["profile:render"]).toBe("vite-node scripts/profileRenderPerformance.mts");
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_JS_KB", 325)');
    expect(budgetScript).toContain('numberFromEnv("BUNDLE_MAX_GZIP_KB", 86)');
    expect(pkg.scripts["release:check"])
      .toBe("npm run typecheck && npm test && npm run mtt:completion && npm run mtt:blockers -- --summary && npm run range:intake:guard && npm run range:intake -- --ready-only && npm run verify:ranges && npm run build && npm run bundle:budget");
    expect(`${html}\n${manifest.description}\n${pkg.description}`).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
  });

  it("release dokumentace obsahuje workflow a user quick start zustava bez citaci", () => {
    const quickStart = readFileSync("Agents/user-quick-start.md", "utf8");
    const operatorGuide = readFileSync("Agents/range-import-operator-guide.md", "utf8");
    const mttCoverageAudit = readFileSync("Agents/mtt-production-coverage-audit.md", "utf8");
    const releaseTemplate = readFileSync("Agents/release-notes-template.md", "utf8");

    expect(quickStart).toContain("Training");
    expect(quickStart).toContain("Statistics");
    expect(quickStart).toContain("HH Import");
    expect(quickStart).toContain("Postflop");
    expect(quickStart).not.toMatch(/\bhttps?:\/\//i);
    expect(quickStart).not.toMatch(/\b(?:RangePack|StrategyPack)\b/);
    expect(quickStart).not.toMatch(/\b(?:mtt|sng|cash)-(?:full-ring|six-max|6max)[a-z0-9-]*/i);

    expect(operatorGuide).toContain("npm run validate:range-import");
    expect(operatorGuide).toContain("npm run mtt:slots");
    expect(operatorGuide).toContain("npm run mtt:blockers");
    expect(operatorGuide).toContain("npm run range:intake");
    expect(operatorGuide).toContain("npm run range:intake:guard");
    expect(operatorGuide).toContain("legal import slot: true");
    expect(operatorGuide).toContain("matched import slots");
    expect(operatorGuide).toContain("npm run verify:ranges");
    expect(operatorGuide).toContain("npm run release:check");
    expect(mttCoverageAudit).toContain("Updated: 2026-06-15");
    expect(mttCoverageAudit).toContain("DOLAR_EV");
    expect(mttCoverageAudit).toContain("Completion matrix");
    expect(mttCoverageAudit).toContain("total MTT rows: 64");
    expect(mttCoverageAudit).toContain("production-ready rows: 2");
    expect(mttCoverageAudit).toContain("candidate/preview rows: 52");
    expect(mttCoverageAudit).toContain("blocked/missing rows: 10");
    expect(mttCoverageAudit).toContain("npm run range:intake -- --ready-only --json");
    expect(mttCoverageAudit).toContain("npm run mtt:blockers");
    expect(mttCoverageAudit).toContain("npm run mtt:blockers -- --summary");
    expect(mttCoverageAudit).toContain("regular-vs-turbo diff audit");
    expect(mttCoverageAudit).toContain("FLOP, TURN and RIVER production StrategyPacks are not registered");
    expect(releaseTemplate).toContain("Gameplay changes");
    expect(releaseTemplate).toContain("Range data changes");
    expect(releaseTemplate).toContain("Statistics changes");
    expect(releaseTemplate).toContain("npm run mtt:completion");
    expect(releaseTemplate).toContain("npm run mtt:blockers");
    expect(releaseTemplate).toContain("npm run range:intake:guard");
    expect(releaseTemplate).toContain("npm run range:intake -- --ready-only");
    expect(releaseTemplate).toContain("Known limitations");
  });
});
