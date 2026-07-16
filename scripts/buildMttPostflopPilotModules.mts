import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { FlopProductionStrategyPack } from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  MTT_POSTFLOP_PILOT_CATALOG,
  type MttPostflopPilotCatalogEntry,
  validateMttPostflopPilotCatalog,
} from "../src/data/ranges/mttPostflopPilotCatalog.ts";
import { buildMttPostflopPilotGateReport } from "../src/data/ranges/mttPostflopPilotGate.ts";
import type { ProductionPermissionManifest } from "../src/data/ranges/productionPermissionManifest.ts";

const GENERATED_INDEX = "src/data/ranges/mttPostflopPilotPacks.generated.ts";

interface PilotModuleSource {
  catalogId: string;
  normalizedPath: string;
  permissionPath: string;
  modulePath: string;
  exportName: string;
}

const PILOT_MODULE_SOURCES: readonly PilotModuleSource[] = [
  {
    catalogId: "btn-bb-srp-flop-cbet-low-mid-high",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_CBET_PILOT-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_CBET_PILOT-CHECK/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/btnBbSrpFlopCbetPilot.generated.ts",
    exportName: "btnBbSrpFlopCbetPilotPack",
  },
  {
    catalogId: "utg-bb-srp-flop-cbet",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_40BB_UTG_BB_SRP-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_40BB_UTG_BB_SRP-CHECK/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/utgBbSrpFlopCbetPilot.generated.ts",
    exportName: "utgBbSrpFlopCbetPilotPack",
  },
  {
    catalogId: "btn-co-3bp-flop-cbet-low-mid-high",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_CBET_PILOT-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_CBET_PILOT-CHECK/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/btnCo3bpFlopCbetPilot.generated.ts",
    exportName: "btnCo3bpFlopCbetPilotPack",
  },
  {
    catalogId: "sb-bb-srp-oop-flop-cbet-low-mid-high",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/SB_BB_SRP_OOP_FLOP_CBET_PILOT-ROOT/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/SB_BB_SRP_OOP_FLOP_CBET_PILOT-ROOT/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/sbBbSrpOopFlopCbetPilot.generated.ts",
    exportName: "sbBbSrpOopFlopCbetPilotPack",
  },
  {
    catalogId: "co-bb-srp-flop-cbet-low-mid-high",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/CO_BB_SRP_FLOP_CBET_PILOT-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/CO_BB_SRP_FLOP_CBET_PILOT-CHECK/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/coBbSrpFlopCbetPilot.generated.ts",
    exportName: "coBbSrpFlopCbetPilotPack",
  },
  {
    catalogId: "btn-co-3bp-flop-facing-bet-low-mid-high",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_FACING_BET_PILOT/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_FACING_BET_PILOT/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/btnCo3bpFlopFacingBetPilot.generated.ts",
    exportName: "btnCo3bpFlopFacingBetPilotPack",
  },
  {
    catalogId: "btn-bb-srp-flop-facing-bet-low-mid-high",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_FACING_BET_PILOT/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_FACING_BET_PILOT/permission.candidate.json",
    modulePath: "src/data/ranges/pilots/btnBbSrpFlopFacingBetPilot.generated.ts",
    exportName: "btnBbSrpFlopFacingBetPilotPack",
  },
];

interface CliArgs {
  write: boolean;
  json: boolean;
}

interface BuiltPilotModule {
  source: PilotModuleSource;
  catalog: MttPostflopPilotCatalogEntry;
  pack: FlopProductionStrategyPack;
  fingerprint: string;
  moduleText: string;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const built = buildPilotModules();
  const report = {
    valid: true,
    write: args.write,
    modules: built.map((item) => ({
      catalogId: item.catalog.id,
      scope: item.catalog.scope,
      modulePath: item.source.modulePath,
      exportName: item.source.exportName,
      rules: item.pack.rules.length,
      rangeBuckets: item.pack.rules.reduce((sum, rule) => sum + rule.rangeBuckets.length, 0),
      fingerprint: item.fingerprint,
    })),
    indexPath: GENERATED_INDEX,
  };
  if (args.write) writePilotModules(built);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let write = false;
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { write, json };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-pilot-modules",
    "  npm run mtt:postflop-pilot-modules -- --write",
    "  npm run mtt:postflop-pilot-modules -- --json",
    "",
    "Builds scoped source-free MTT postflop pilot modules from reviewed TexasSolver normalized drafts.",
  ].join("\n");
}

function buildPilotModules(): BuiltPilotModule[] {
  const catalogErrors = validateMttPostflopPilotCatalog();
  if (catalogErrors.length > 0) throw new Error(`Pilot catalog is invalid:\n${catalogErrors.join("\n")}`);
  const catalogById = new Map(MTT_POSTFLOP_PILOT_CATALOG.map((entry) => [entry.id, entry]));
  const built: BuiltPilotModule[] = [];

  for (const source of PILOT_MODULE_SOURCES) {
    const catalog = catalogById.get(source.catalogId);
    if (catalog === undefined) throw new Error(`Missing pilot catalog entry: ${source.catalogId}`);
    if (!existsSync(source.normalizedPath)) throw new Error(`Missing normalized pilot draft: ${source.normalizedPath}`);
    if (!existsSync(source.permissionPath)) throw new Error(`Missing pilot permission draft: ${source.permissionPath}`);
    const pack = readJson<FlopProductionStrategyPack>(source.normalizedPath);
    const permission = readJson<ProductionPermissionManifest>(source.permissionPath);
    const gate = buildMttPostflopPilotGateReport(pack, permission, catalog.scope);
    if (!gate.valid) throw new Error(`${source.catalogId}: pilot gate failed:\n${gate.errors.join("\n")}`);
    if (gate.fullProductionReady) {
      throw new Error(`${source.catalogId}: refusing to build scoped pilot module marked fullProductionReady.`);
    }
    if (gate.counts.rules !== catalog.rules || gate.counts.rangeBuckets !== catalog.rangeBuckets) {
      throw new Error(
        `${source.catalogId}: catalog counts do not match gate counts ` +
        `(catalog ${catalog.rules}/${catalog.rangeBuckets}, gate ${gate.counts.rules}/${gate.counts.rangeBuckets}).`,
      );
    }
    const fingerprint = pilotFingerprint(pack, permission, catalog);
    built.push({
      source,
      catalog,
      pack,
      fingerprint,
      moduleText: renderPilotModule(pack, source.exportName, catalog, fingerprint),
    });
  }

  return built;
}

function writePilotModules(built: readonly BuiltPilotModule[]): void {
  for (const item of built) {
    writeText(item.source.modulePath, item.moduleText);
  }
  writeText(GENERATED_INDEX, renderGeneratedIndex(built));
}

function renderPilotModule(
  pack: FlopProductionStrategyPack,
  exportName: string,
  catalog: MttPostflopPilotCatalogEntry,
  fingerprint: string,
): string {
  return [
    "// Generated by `npm run mtt:postflop-pilot-modules -- --write`.",
    "// Scoped MTT postflop pilot pack; do not register as full production coverage.",
    `// pilot-id: ${catalog.id}`,
    `// pilot-scope: ${catalog.scope}`,
    `// pilot-provenance-fingerprint: sha256:${fingerprint}`,
    'import type { FlopProductionStrategyPack } from "../flopProductionStrategyPack";',
    "",
    `export const ${exportName} = ${JSON.stringify(pack, null, 2)} satisfies FlopProductionStrategyPack;`,
    "",
  ].join("\n");
}

function renderGeneratedIndex(built: readonly BuiltPilotModule[]): string {
  const imports = built.map((item) => (
    `import { ${item.source.exportName} } from "./pilots/${moduleBasename(item.source.modulePath)}";`
  ));
  const entries = built.map((item) => [
    "  {",
    `    catalogId: ${JSON.stringify(item.catalog.id)},`,
    `    scope: ${JSON.stringify(item.catalog.scope)},`,
    `    pack: ${item.source.exportName},`,
    "  },",
  ].join("\n"));
  return [
    "// Generated by `npm run mtt:postflop-pilot-modules -- --write`.",
    "// Scoped MTT postflop pilot packs; intentionally separate from production registry.",
    'import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";',
    'import type { MttPostflopPilotScope } from "./mttPostflopPilotGate";',
    ...imports,
    "",
    "export interface GeneratedMttPostflopPilotPackEntry {",
    "  catalogId: string;",
    "  scope: MttPostflopPilotScope;",
    "  pack: FlopProductionStrategyPack;",
    "}",
    "",
    "export const generatedMttPostflopPilotPacks: readonly GeneratedMttPostflopPilotPackEntry[] = [",
    ...entries,
    "];",
    "",
  ].join("\n");
}

function moduleBasename(modulePath: string): string {
  return modulePath
    .replace(/^src\/data\/ranges\/pilots\//, "")
    .replace(/\.ts$/, "");
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function writeText(file: string, text: string): void {
  const target = resolve(file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function pilotFingerprint(
  pack: FlopProductionStrategyPack,
  permission: ProductionPermissionManifest,
  catalog: MttPostflopPilotCatalogEntry,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      catalogId: catalog.id,
      scope: catalog.scope,
      catalogProvenance: catalog.provenanceFingerprint,
      packId: pack.id,
      packVersion: pack.version,
      rules: pack.rules.map((rule) => ({
        id: rule.id,
        actionNode: rule.actionNode,
        potType: rule.potType,
        positionPattern: rule.positionPattern,
        sprMin: rule.sprMin,
        sprMax: rule.sprMax,
        bucketCount: rule.rangeBuckets.length,
      })),
      permission: {
        packId: permission.packId,
        version: permission.version,
        reviewedAt: permission.reviewedAt,
        licenseKind: permission.licenseKind,
      },
    }))
    .digest("hex");
}

function renderReport(report: {
  valid: boolean;
  write: boolean;
  modules: readonly {
    catalogId: string;
    scope: string;
    modulePath: string;
    exportName: string;
    rules: number;
    rangeBuckets: number;
    fingerprint: string;
  }[];
  indexPath: string;
}): string {
  const lines = [
    "MTT postflop pilot module build",
    `valid: ${report.valid}`,
    `write: ${report.write}`,
    `modules: ${report.modules.length}`,
    `index: ${report.indexPath}`,
  ];
  for (const module of report.modules) {
    lines.push(
      `${module.catalogId}: ${module.scope} rules=${module.rules} buckets=${module.rangeBuckets} ` +
      `module=${module.modulePath}`,
    );
  }
  return lines.join("\n");
}
