import type { AnteMode } from "../src/core/types.ts";
import type { BlindSpeed, EvModel, TableFormat, TrainingStreet } from "../src/core/trainingProfile.ts";
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
import type { MttCompletionReadinessStatus } from "../src/data/ranges/mttProductionReadiness.ts";

type SlotKind = "all" | "preflop" | "postflop";

interface SlotFilters {
  tableFormat?: TableFormat;
  blindSpeed?: BlindSpeed;
  evModel?: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  street?: TrainingStreet;
  ante?: AnteMode;
  status?: MttCompletionReadinessStatus | "NON_PRODUCTION";
}

interface CliArgs {
  kind: SlotKind;
  filters: SlotFilters;
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
  const filters: SlotFilters = {};
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
    if (item.startsWith("--format=")) {
      filters.tableFormat = parseTableFormat(item.slice("--format=".length));
      continue;
    }
    if (item.startsWith("--speed=")) {
      filters.blindSpeed = parseBlindSpeed(item.slice("--speed=".length));
      continue;
    }
    if (item.startsWith("--ev=")) {
      filters.evModel = parseEvModel(item.slice("--ev=".length));
      continue;
    }
    if (item.startsWith("--street=")) {
      filters.street = parseStreet(item.slice("--street=".length));
      continue;
    }
    if (item.startsWith("--ante=")) {
      filters.ante = parseAnte(item.slice("--ante=".length));
      continue;
    }
    if (item.startsWith("--status=")) {
      filters.status = parseStatus(item.slice("--status=".length));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { kind, filters, json };
}

function parseKind(value: string): SlotKind {
  if (value === "preflop" || value === "postflop" || value === "all") return value;
  throw new Error(`Unsupported --kind value: ${value}\n\n${usage()}`);
}

function parseTableFormat(value: string): TableFormat {
  if (value === "FULL_RING_9" || value === "SIX_MAX") return value;
  throw new Error(`Unsupported --format value: ${value}\n\n${usage()}`);
}

function parseBlindSpeed(value: string): BlindSpeed {
  if (value === "REGULAR" || value === "TURBO") return value;
  throw new Error(`Unsupported --speed value: ${value}\n\n${usage()}`);
}

function parseEvModel(value: string): Extract<EvModel, "CHIP_EV" | "DOLAR_EV"> {
  if (value === "CHIP_EV" || value === "DOLAR_EV") return value;
  throw new Error(`Unsupported --ev value: ${value}\n\n${usage()}`);
}

function parseStreet(value: string): TrainingStreet {
  if (value === "PREFLOP" || value === "FLOP" || value === "TURN" || value === "RIVER") {
    return value;
  }
  throw new Error(`Unsupported --street value: ${value}\n\n${usage()}`);
}

function parseAnte(value: string): AnteMode {
  if (value === "ON" || value === "OFF") return value;
  throw new Error(`Unsupported --ante value: ${value}\n\n${usage()}`);
}

function parseStatus(value: string): SlotFilters["status"] {
  const normalized = value.toUpperCase().replace("-", "_");
  if (normalized === "CANDIDATE" || normalized === "MISSING") return normalized;
  if (normalized === "NON_PRODUCTION") return "NON_PRODUCTION";
  if (normalized === "PREVIEW") return "CANDIDATE";
  if (normalized === "BLOCKED") return "MISSING";
  throw new Error(`Unsupported --status value: ${value}\n\n${usage()}`);
}

function filterMttPreflopImportSlots(
  slots: readonly MttPreflopImportSlot[],
  filters: SlotFilters,
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
  filters: SlotFilters,
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
  filter: SlotFilters["status"],
): boolean {
  if (filter === undefined || filter === "NON_PRODUCTION") return true;
  return status === filter;
}
