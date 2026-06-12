import { readFileSync } from "node:fs";
import {
  buildFlopProductionCoverageReport,
  renderFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  buildTurnProductionCoverageReport,
  renderTurnProductionCoverageReport,
  type TurnProductionStrategyPack,
} from "../src/data/ranges/turnProductionStrategyPack.ts";
import {
  buildRiverProductionCoverageReport,
  renderRiverProductionCoverageReport,
  type RiverProductionStrategyPack,
} from "../src/data/ranges/riverProductionStrategyPack.ts";
import {
  buildMttPreflopImportReadinessReport,
  renderMttPreflopImportReadinessReport,
  type MttPreflopRangePackImportInput,
} from "../src/data/ranges/mttPreflopRangePackImport.ts";
import {
  buildMttPostflopImportSlotValidationReport,
  buildMttPreflopImportSlotValidationReport,
  renderMttImportSlotValidationReport,
} from "../src/data/ranges/mttImportSlotValidation.ts";
import type { MttPostflopProductionPack } from "../src/data/ranges/mttPostflopImportSlots.ts";
import {
  buildProductionPermissionManifestReport,
  renderProductionPermissionManifestReport,
  type ProductionPermissionManifest,
} from "../src/data/ranges/productionPermissionManifest.ts";

type ImportKind = "mtt-preflop" | "flop-production" | "turn-production" | "river-production";

interface CliArgs {
  kind: ImportKind;
  file: string;
  permissionManifest: string | null;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run validate:range-import -- --kind=mtt-preflop <input.json>",
    "  npm run validate:range-import -- --kind=flop-production <input.json>",
    "  npm run validate:range-import -- --kind=turn-production <input.json>",
    "  npm run validate:range-import -- --kind=river-production <input.json>",
    "  npm run validate:range-import -- --kind=mtt-preflop --permission-manifest <manifest.json> <input.json>",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let kind: ImportKind | null = null;
  let file: string | null = null;
  let permissionManifest: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
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
    if (!item.startsWith("-") && file === null) {
      file = item;
    }
  }

  if (!kind || !file) {
    throw new Error(usage());
  }
  return { kind, file, permissionManifest };
}

function parseKind(value: string | undefined): ImportKind {
  if (
    value === "mtt-preflop" ||
    value === "flop-production" ||
    value === "turn-production" ||
    value === "river-production"
  ) return value;
  throw new Error(`Unsupported --kind value: ${value ?? ""}\n\n${usage()}`);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const input = readJson(args.file);
  const permissionManifest = args.permissionManifest
    ? readJson(args.permissionManifest) as ProductionPermissionManifest
    : null;

  if (args.kind === "mtt-preflop") {
    const typedInput = input as MttPreflopRangePackImportInput;
    const report = buildMttPreflopImportReadinessReport(
      typedInput,
    );
    const permissionReport = buildProductionPermissionManifestReport(
      permissionManifest,
      {
        packId: typedInput.id,
        licenseKind: typedInput.licenseKind,
      },
    );
    const slotReport = buildMttPreflopImportSlotValidationReport(typedInput);
    console.log(renderMttPreflopImportReadinessReport(report));
    console.log("");
    console.log(renderMttImportSlotValidationReport(slotReport));
    console.log("");
    console.log(renderProductionPermissionManifestReport(permissionReport));
    process.exitCode = report.productionReady && slotReport.valid && permissionReport.valid ? 0 : 1;
    return;
  }

  if (args.kind === "flop-production") {
    const pack = input as FlopProductionStrategyPack;
    const report = buildFlopProductionCoverageReport(pack);
    const slotReport = buildPostflopLegalSlotReport(pack);
    const permissionReport = buildProductionPermissionManifestReport(
      permissionManifest,
      {
        packId: pack.id,
        licenseKind: pack.licenseKind,
      },
    );
    console.log(renderFlopProductionCoverageReport(pack, report));
    console.log("");
    console.log(renderMttImportSlotValidationReport(slotReport));
    console.log("");
    console.log(renderProductionPermissionManifestReport(permissionReport));
    process.exitCode = report.productionReady && slotReport.valid && permissionReport.valid ? 0 : 1;
    return;
  }

  if (args.kind === "turn-production") {
    const pack = input as TurnProductionStrategyPack;
    const report = buildTurnProductionCoverageReport(pack);
    const slotReport = buildPostflopLegalSlotReport(pack);
    const permissionReport = buildProductionPermissionManifestReport(
      permissionManifest,
      {
        packId: pack.id,
        licenseKind: pack.licenseKind,
      },
    );
    console.log(renderTurnProductionCoverageReport(pack, report));
    console.log("");
    console.log(renderMttImportSlotValidationReport(slotReport));
    console.log("");
    console.log(renderProductionPermissionManifestReport(permissionReport));
    process.exitCode = report.productionReady && slotReport.valid && permissionReport.valid ? 0 : 1;
    return;
  }

  const pack = input as RiverProductionStrategyPack;
  const report = buildRiverProductionCoverageReport(pack);
  const slotReport = buildPostflopLegalSlotReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(
    permissionManifest,
    {
      packId: pack.id,
      licenseKind: pack.licenseKind,
    },
  );
  console.log(renderRiverProductionCoverageReport(pack, report));
  console.log("");
  console.log(renderMttImportSlotValidationReport(slotReport));
  console.log("");
  console.log(renderProductionPermissionManifestReport(permissionReport));
  process.exitCode = report.productionReady && slotReport.valid && permissionReport.valid ? 0 : 1;
}

function buildPostflopLegalSlotReport(pack: MttPostflopProductionPack) {
  return buildMttPostflopImportSlotValidationReport(pack);
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
