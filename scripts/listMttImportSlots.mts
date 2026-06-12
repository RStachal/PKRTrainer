import {
  buildMttPostflopImportSlots,
  renderMttPostflopImportSlots,
  type MttPostflopImportSlot,
} from "../src/data/ranges/mttPostflopImportSlots.ts";
import {
  buildMttPreflopImportSlots,
  renderMttPreflopImportSlots,
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
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:slots",
    "  npm run mtt:slots -- --kind=preflop",
    "  npm run mtt:slots -- --kind=postflop",
    "  npm run mtt:slots -- --kind=postflop --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --status=candidate",
    "  npm run mtt:slots -- --kind=postflop --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "",
    "Output:",
    "  --json",
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
  const preflopSlots = args.kind === "all" || args.kind === "preflop"
    ? filterMttPreflopImportSlots(buildMttPreflopImportSlots(), args.filters)
    : [];
  const postflopSlots = args.kind === "all" || args.kind === "postflop"
    ? filterMttPostflopImportSlots(buildMttPostflopImportSlots(), args.filters)
    : [];

  if (args.json) {
    console.log(JSON.stringify({
      kind: args.kind,
      filters: args.filters,
      counts: {
        preflop: preflopSlots.length,
        postflop: postflopSlots.length,
        total: preflopSlots.length + postflopSlots.length,
      },
      preflopSlots,
      postflopSlots,
    }, null, 2));
  } else {
    const sections: string[] = [];
    if (args.kind === "all" || args.kind === "preflop") {
      sections.push(renderMttPreflopImportSlots(preflopSlots));
    }
    if (args.kind === "all" || args.kind === "postflop") {
      sections.push(renderMttPostflopImportSlots(postflopSlots));
    }
    console.log(sections.join("\n\n"));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let kind: SlotKind = "all";
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item === "--json") {
      json = true;
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

  return { kind, filters, json };
}

function parseKind(value: string): SlotKind {
  if (value === "preflop" || value === "postflop" || value === "all") return value;
  throw new Error(`Unsupported --kind value: ${value}\n\n${usage()}`);
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
