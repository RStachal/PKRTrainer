import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildMttPostflopImportSlots,
  type MttPostflopImportSlot,
} from "../src/data/ranges/mttPostflopImportSlots.ts";
import {
  buildMttPreflopImportSlots,
  type MttPreflopImportSlot,
} from "../src/data/ranges/mttPreflopImportSlots.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";
import type {
  MttCompletionReadinessFilters,
  MttCompletionReadinessStatus,
} from "../src/data/ranges/mttProductionReadiness.ts";

type SlotKind = "all" | "preflop" | "postflop";

interface CliArgs {
  kind: SlotKind;
  filters: MttCompletionReadinessFilters;
  json: boolean;
  outputPath: string | null;
  visibility: "all" | "ready-only" | "waiting-only";
}

interface IntakeStatusRow {
  kind: "preflop" | "postflop";
  slotId: string;
  packId: string;
  status: MttCompletionReadinessStatus;
  normalizedInputPath: string;
  permissionManifestPath: string;
  normalizedPresent: boolean;
  permissionPresent: boolean;
  readyForValidation: boolean;
}

interface IntakeStatusReport {
  filters: MttCompletionReadinessFilters;
  counts: {
    total: number;
    readyForValidation: number;
    missingNormalized: number;
    missingPermission: number;
  };
  rows: readonly IntakeStatusRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run range:intake",
    "  npm run range:intake -- --kind=preflop",
    "  npm run range:intake -- --kind=postflop --format=SIX_MAX --street=RIVER --json",
    "  npm run range:intake -- --ready-only --json",
    "  npm run range:intake -- --waiting-only",
    "  npm run range:intake -- --output=artifacts/range-intake-report.json",
    "",
    "Output:",
    "  --json",
    "  --output=artifacts/range-intake-report.json",
    "  --ready-only",
    "  --waiting-only",
    "",
    "Filters:",
    "  --format=FULL_RING_9|SIX_MAX",
    "  --speed=REGULAR|TURBO",
    "  --ev=CHIP_EV|DOLAR_EV",
    "  --street=PREFLOP|FLOP|TURN|RIVER",
    "  --ante=ON|OFF",
    "  --status=candidate|missing|non-production|preview|blocked",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildIntakeStatusReport(args);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderIntakeStatusReport(report));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let kind: SlotKind = "all";
  let json = false;
  let outputPath: string | null = null;
  let visibility: CliArgs["visibility"] = "all";

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--ready-only") {
      visibility = setVisibility(visibility, "ready-only");
      continue;
    }
    if (item === "--waiting-only") {
      visibility = setVisibility(visibility, "waiting-only");
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    if (item === "--kind") {
      kind = parseKind(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (item.startsWith("--kind=")) {
      kind = parseKind(item.slice("--kind=".length));
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { kind, filters, json, outputPath, visibility };
}

function parseKind(value: string): SlotKind {
  if (value === "preflop" || value === "postflop" || value === "all") return value;
  throw new Error(`Unsupported --kind value: ${value}\n\n${usage()}`);
}

function buildIntakeStatusReport(args: CliArgs): IntakeStatusReport {
  const allRows = [
    ...(args.kind === "all" || args.kind === "preflop"
      ? filterMttPreflopImportSlots(buildMttPreflopImportSlots(), args.filters).map((slot) => (
        rowFromSlot("preflop", slot)
      ))
      : []),
    ...(args.kind === "all" || args.kind === "postflop"
      ? filterMttPostflopImportSlots(buildMttPostflopImportSlots(), args.filters).map((slot) => (
        rowFromSlot("postflop", slot)
      ))
      : []),
  ];
  const rows = filterRowsByVisibility(allRows, args.visibility);

  return {
    filters: args.filters,
    counts: {
      total: rows.length,
      readyForValidation: rows.filter((row) => row.readyForValidation).length,
      missingNormalized: rows.filter((row) => !row.normalizedPresent).length,
      missingPermission: rows.filter((row) => !row.permissionPresent).length,
    },
    rows,
  };
}

function setVisibility(
  current: CliArgs["visibility"],
  next: Exclude<CliArgs["visibility"], "all">,
): CliArgs["visibility"] {
  if (current !== "all" && current !== next) {
    throw new Error(`Use only one of --ready-only or --waiting-only.\n\n${usage()}`);
  }
  return next;
}

function filterRowsByVisibility(
  rows: readonly IntakeStatusRow[],
  visibility: CliArgs["visibility"],
): IntakeStatusRow[] {
  if (visibility === "ready-only") {
    return rows.filter((row) => row.readyForValidation);
  }
  if (visibility === "waiting-only") {
    return rows.filter((row) => !row.readyForValidation);
  }
  return [...rows];
}

function rowFromSlot(
  kind: "preflop" | "postflop",
  slot: MttPreflopImportSlot | MttPostflopImportSlot,
): IntakeStatusRow {
  const normalizedPresent = existsSync(slot.normalizedInputPath);
  const permissionPresent = existsSync(slot.permissionManifestPath);
  return {
    kind,
    slotId: slot.slotId,
    packId: slot.packId,
    status: slot.status,
    normalizedInputPath: slot.normalizedInputPath,
    permissionManifestPath: slot.permissionManifestPath,
    normalizedPresent,
    permissionPresent,
    readyForValidation: normalizedPresent && permissionPresent,
  };
}

function renderIntakeStatusReport(report: IntakeStatusReport): string {
  const lines = [
    "Range intake status",
    `slots: ${report.counts.total}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
  ];

  for (const row of report.rows) {
    lines.push(
      [
        row.kind,
        row.slotId,
        row.status,
        row.readyForValidation ? "READY" : "WAITING",
      ].join(" | "),
    );
    if (!row.normalizedPresent) lines.push(`  missing input: ${row.normalizedInputPath}`);
    if (!row.permissionPresent) lines.push(`  missing permission: ${row.permissionManifestPath}`);
  }

  return lines.join("\n");
}

function filterMttPreflopImportSlots(
  slots: readonly MttPreflopImportSlot[],
  filters: MttCompletionReadinessFilters,
): MttPreflopImportSlot[] {
  return slots.filter((slot) => (
    matchesOptionalFilter(slot.tableFormat, filters.tableFormat) &&
    matchesOptionalFilter(slot.blindSpeed, filters.blindSpeed) &&
    matchesOptionalFilter(slot.evModel, filters.evModel) &&
    matchesOptionalFilter("PREFLOP", filters.street) &&
    matchesOptionalFilter(slot.ante, filters.ante) &&
    matchesStatusFilter(slot.status, filters.status)
  ));
}

function filterMttPostflopImportSlots(
  slots: readonly MttPostflopImportSlot[],
  filters: MttCompletionReadinessFilters,
): MttPostflopImportSlot[] {
  return slots.filter((slot) => (
    matchesOptionalFilter(slot.tableFormat, filters.tableFormat) &&
    matchesOptionalFilter(slot.blindSpeed, filters.blindSpeed) &&
    matchesOptionalFilter(slot.evModel, filters.evModel) &&
    matchesOptionalFilter(slot.street, filters.street) &&
    matchesOptionalFilter(slot.ante, filters.ante) &&
    matchesStatusFilter(slot.status, filters.status)
  ));
}

function matchesOptionalFilter<T extends string>(
  value: T,
  filter: T | undefined,
): boolean {
  return filter === undefined || value === filter;
}

function matchesStatusFilter(
  status: MttCompletionReadinessStatus,
  filter: MttCompletionReadinessFilters["status"],
): boolean {
  if (filter === undefined || filter === "NON_PRODUCTION") return true;
  return status === filter;
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
