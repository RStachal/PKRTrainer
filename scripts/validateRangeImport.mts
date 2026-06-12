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
  json: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run validate:range-import -- --kind=mtt-preflop <input.json>",
    "  npm run validate:range-import -- --kind=flop-production <input.json>",
    "  npm run validate:range-import -- --kind=turn-production <input.json>",
    "  npm run validate:range-import -- --kind=river-production <input.json>",
    "  npm run validate:range-import -- --kind=mtt-preflop --permission-manifest <manifest.json> <input.json>",
    "  npm run validate:range-import -- --kind=mtt-preflop --permission-manifest <manifest.json> --json <input.json>",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let kind: ImportKind | null = null;
  let file: string | null = null;
  let permissionManifest: string | null = null;
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
    if (!item.startsWith("-") && file === null) {
      file = item;
    }
  }

  if (!kind || !file) {
    throw new Error(usage());
  }
  return { kind, file, permissionManifest, json };
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
    emitValidationResult(args, {
      packId: typedInput.id,
      report,
      productionReady: report.productionReady,
      slotReport,
      permissionReport,
      renderText: () => [
        renderMttPreflopImportReadinessReport(report),
        renderMttImportSlotValidationReport(slotReport),
        renderProductionPermissionManifestReport(permissionReport),
      ].join("\n\n"),
    });
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
    emitValidationResult(args, {
      packId: pack.id,
      report,
      productionReady: report.productionReady,
      slotReport,
      permissionReport,
      renderText: () => [
        renderFlopProductionCoverageReport(pack, report),
        renderMttImportSlotValidationReport(slotReport),
        renderProductionPermissionManifestReport(permissionReport),
      ].join("\n\n"),
    });
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
    emitValidationResult(args, {
      packId: pack.id,
      report,
      productionReady: report.productionReady,
      slotReport,
      permissionReport,
      renderText: () => [
        renderTurnProductionCoverageReport(pack, report),
        renderMttImportSlotValidationReport(slotReport),
        renderProductionPermissionManifestReport(permissionReport),
      ].join("\n\n"),
    });
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
  emitValidationResult(args, {
    packId: pack.id,
    report,
    productionReady: report.productionReady,
    slotReport,
    permissionReport,
    renderText: () => [
      renderRiverProductionCoverageReport(pack, report),
      renderMttImportSlotValidationReport(slotReport),
      renderProductionPermissionManifestReport(permissionReport),
    ].join("\n\n"),
  });
}

function buildPostflopLegalSlotReport(pack: MttPostflopProductionPack) {
  return buildMttPostflopImportSlotValidationReport(pack);
}

function emitValidationResult(
  args: CliArgs,
  result: {
    packId: string;
    productionReady: boolean;
    report: unknown;
    slotReport: ReturnType<typeof buildMttPreflopImportSlotValidationReport>;
    permissionReport: ReturnType<typeof buildProductionPermissionManifestReport>;
    renderText: () => string;
  },
): void {
  const valid = result.productionReady && result.slotReport.valid && result.permissionReport.valid;
  if (args.json) {
    console.log(JSON.stringify({
      kind: args.kind,
      packId: result.packId,
      valid,
      productionReady: result.productionReady,
      legalImportSlot: result.slotReport.valid,
      permissionReady: result.permissionReport.valid,
      report: result.report,
      slotReport: result.slotReport,
      permissionReport: result.permissionReport,
    }, null, 2));
  } else {
    console.log(result.renderText());
  }
  process.exitCode = valid ? 0 : 1;
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
