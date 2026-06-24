import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  buildRangeModule,
  renderRangeModuleBuildReport,
  type RangeModuleBuildKind,
} from "../src/data/ranges/rangeModuleBuilder.ts";
import type { ProductionPermissionManifest } from "../src/data/ranges/productionPermissionManifest.ts";
import type { MttPreflopRangePackImportInput } from "../src/data/ranges/mttPreflopRangePackImport.ts";
import type { FlopProductionStrategyPack } from "../src/data/ranges/flopProductionStrategyPack.ts";
import type { TurnProductionStrategyPack } from "../src/data/ranges/turnProductionStrategyPack.ts";
import type { RiverProductionStrategyPack } from "../src/data/ranges/riverProductionStrategyPack.ts";

interface CliArgs {
  kind: RangeModuleBuildKind;
  inputFile: string;
  permissionManifest: string | null;
  exportName: string | undefined;
  outFile: string | null;
  dryRun: boolean;
  force: boolean;
  json: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest <manifest.json> <input.json>",
    "  npm run build:range-module -- --kind=flop-production --dry-run --permission-manifest <manifest.json> <input.json>",
    "  npm run build:range-module -- --kind=turn-production --dry-run --permission-manifest <manifest.json> <input.json>",
    "  npm run build:range-module -- --kind=river-production --dry-run --permission-manifest <manifest.json> <input.json>",
    "  npm run build:range-module -- --kind=mtt-preflop --permission-manifest <manifest.json> --out <module.ts> <input.json>",
    "  npm run build:range-module -- --kind=mtt-preflop --dry-run --permission-manifest <manifest.json> --json <input.json>",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let kind: RangeModuleBuildKind | null = null;
  let inputFile: string | null = null;
  let permissionManifest: string | null = null;
  let exportName: string | undefined;
  let outFile: string | null = null;
  let dryRun = false;
  let force = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--kind=")) {
      kind = parseKind(item.slice("--kind=".length));
      continue;
    }
    if (item === "--kind") {
      kind = parseKind(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item.startsWith("--permission-manifest=")) {
      permissionManifest = item.slice("--permission-manifest=".length);
      continue;
    }
    if (item === "--permission-manifest") {
      permissionManifest = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (item.startsWith("--export-name=")) {
      exportName = parseExportName(item.slice("--export-name=".length));
      continue;
    }
    if (item === "--export-name") {
      exportName = parseExportName(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item.startsWith("--out=")) {
      outFile = item.slice("--out=".length);
      continue;
    }
    if (item === "--out") {
      outFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (item === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (item === "--force") {
      force = true;
      continue;
    }
    if (!item.startsWith("-") && inputFile === null) {
      inputFile = item;
      continue;
    }
    if (item.startsWith("-")) throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
    throw new Error(`Unexpected input file argument: ${item}\n\n${usage()}`);
  }

  if (!kind || !inputFile) throw new Error(usage());
  return {
    kind,
    inputFile,
    permissionManifest,
    exportName,
    outFile,
    dryRun,
    force,
    json,
  };
}

function parseKind(value: string | undefined): RangeModuleBuildKind {
  if (
    value === "mtt-preflop" ||
    value === "flop-production" ||
    value === "turn-production" ||
    value === "river-production"
  ) return value;
  throw new Error(`Unsupported --kind value: ${value ?? ""}\n\n${usage()}`);
}

function parseExportName(value: string | undefined): string {
  if (!value || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
    throw new Error(`Invalid --export-name value: ${value ?? ""}`);
  }
  return value;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const input = readInput(args.kind, args.inputFile);
  const permissionManifest = args.permissionManifest
    ? readJson<ProductionPermissionManifest>(args.permissionManifest)
    : null;
  const result = buildRangeModule({
    kind: args.kind,
    input,
    permissionManifest,
    exportName: args.exportName,
  });

  if (args.json) {
    console.log(JSON.stringify({
      kind: result.kind,
      packId: result.packId,
      exportName: result.exportName,
      productionReady: result.productionReady,
      permissionReady: result.permissionReady,
      writeReady: result.writeReady,
      matchedImportSlots: result.matchedImportSlots,
      blockers: result.blockers,
      permissionReport: result.permissionReport,
      dryRun: args.dryRun,
      outFile: args.outFile,
    }, null, 2));
  } else {
    console.log(renderRangeModuleBuildReport(result));
  }

  if (args.dryRun || !args.outFile) {
    process.exitCode = result.writeReady ? 0 : 1;
    return;
  }
  if (!result.writeReady || result.moduleText === null) {
    throw new Error("Refusing to write a range module while build report is not writeReady.");
  }
  if (existsSync(args.outFile) && !args.force) {
    throw new Error(`Refusing to overwrite existing file without --force: ${args.outFile}`);
  }

  mkdirSync(dirname(args.outFile), { recursive: true });
  writeFileSync(args.outFile, result.moduleText, "utf8");
}

function readInput(
  kind: RangeModuleBuildKind,
  file: string,
): MttPreflopRangePackImportInput | FlopProductionStrategyPack | TurnProductionStrategyPack | RiverProductionStrategyPack {
  switch (kind) {
    case "mtt-preflop":
      return readJson<MttPreflopRangePackImportInput>(file);
    case "flop-production":
      return readJson<FlopProductionStrategyPack>(file);
    case "turn-production":
      return readJson<TurnProductionStrategyPack>(file);
    case "river-production":
      return readJson<RiverProductionStrategyPack>(file);
  }
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
