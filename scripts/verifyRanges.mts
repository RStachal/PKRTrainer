import { anteOnRanges } from "../src/data/ranges/ante-on/index.ts";
import { anteOffRanges } from "../src/data/ranges/ante-off/index.ts";
import { flopProductionStrategyPacks } from "../src/data/ranges/flopProductionStrategyResolver.ts";
import {
  buildFlopProductionCoverageReport,
} from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  buildMttPreflopPackImportReadinessReport,
  buildMttPreflopReadinessReport,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { validateRangeFile } from "../src/data/ranges/schema.ts";

let hasHardFailure = false;

for (const file of [anteOnRanges, anteOffRanges]) {
  const errors = validateRangeFile(file);
  const ctxCounts: Record<string, number> = {};
  let handCount = 0;
  for (const r of file.entries) {
    ctxCounts[r.context] = (ctxCounts[r.context] ?? 0) + 1;
    handCount += Object.keys(r.strict).length;
  }
  console.log(`\n=== ante=${file.ante} v${file.version} ===`);
  console.log(`records: ${file.entries.length}`);
  console.log(`validateRangeFile errors: ${errors.length}`);
  if (errors.length) {
    hasHardFailure = true;
    console.log(errors.slice(0, 20).join("\n"));
  }
  console.log(`total strict hand entries: ${handCount}`);
  console.log(`records per context:`, ctxCounts);
}

const readiness = buildMttPreflopReadinessReport();
console.log("\n=== MTT preflop production readiness ===");
console.log(`production rows: ${readiness.productionRows}`);
console.log(`candidate rows: ${readiness.candidateRows}`);
console.log(`missing rows: ${readiness.missingRows}`);
for (const row of readiness.rows) {
  console.log(
    [
      `${row.tableFormat}/${row.blindSpeed}/ante-${row.ante}`,
      row.status,
      `records=${row.recordCount}`,
      `sources=${row.sourceCount}`,
      row.missingReasons.length > 0 ? `blockers=${row.missingReasons.join(" | ")}` : "blockers=none",
    ].join(" :: "),
  );
}

const importReadiness = buildMttPreflopPackImportReadinessReport();
console.log("\n=== MTT preflop pack import readiness ===");
console.log(`production-ready packs: ${importReadiness.productionReadyRows}`);
console.log(`candidate packs: ${importReadiness.candidateRows}`);
console.log(`low-confidence packs: ${importReadiness.lowConfidenceRows}`);
console.log(`empty-record packs: ${importReadiness.emptyRecordRows}`);
console.log(`missing expected profiles: ${importReadiness.missingExpectedProfiles.length}`);

console.log("\n=== Flop production strategy readiness ===");
console.log(`registered production packs: ${flopProductionStrategyPacks.length}`);
if (flopProductionStrategyPacks.length === 0) {
  console.log("blocker: no legal production flop StrategyPack is registered yet.");
}
for (const pack of flopProductionStrategyPacks) {
  const report = buildFlopProductionCoverageReport(pack);
  if (report.errors.length > 0) hasHardFailure = true;
  console.log(
    [
      pack.id,
      `productionReady=${report.productionReady}`,
      `errors=${report.errors.length}`,
      `missingPotTypes=${report.missingPotTypes.join(",") || "none"}`,
      `missingPatterns=${report.missingPositionPatterns.join(",") || "none"}`,
      `missingTextures=${report.missingBoardTextures.join(",") || "none"}`,
    ].join(" :: "),
  );
}

if (hasHardFailure) {
  process.exitCode = 1;
}
