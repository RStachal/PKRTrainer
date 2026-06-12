import type { AnteMode } from "../../core/types";
import type { BlindSpeed, EvModel, TableFormat, TrainingStreet } from "../../core/trainingProfile";
import type { MttCompletionReadinessFilters } from "./mttProductionReadiness";

export type MttCliStatusFilter = NonNullable<MttCompletionReadinessFilters["status"]>;

export function parseMttTableFormatFilter(value: string, usage: () => string): TableFormat {
  if (value === "FULL_RING_9" || value === "SIX_MAX") return value;
  throw new Error(`Unsupported --format value: ${value}\n\n${usage()}`);
}

export function parseMttBlindSpeedFilter(value: string, usage: () => string): BlindSpeed {
  if (value === "REGULAR" || value === "TURBO") return value;
  throw new Error(`Unsupported --speed value: ${value}\n\n${usage()}`);
}

export function parseMttEvModelFilter(
  value: string,
  usage: () => string,
): Extract<EvModel, "CHIP_EV" | "DOLAR_EV"> {
  if (value === "CHIP_EV" || value === "DOLAR_EV") return value;
  throw new Error(`Unsupported --ev value: ${value}\n\n${usage()}`);
}

export function parseMttStreetFilter(value: string, usage: () => string): TrainingStreet {
  if (value === "PREFLOP" || value === "FLOP" || value === "TURN" || value === "RIVER") {
    return value;
  }
  throw new Error(`Unsupported --street value: ${value}\n\n${usage()}`);
}

export function parseMttAnteFilter(value: string, usage: () => string): AnteMode {
  if (value === "ON" || value === "OFF") return value;
  throw new Error(`Unsupported --ante value: ${value}\n\n${usage()}`);
}

export function parseMttStatusFilter(value: string, usage: () => string): MttCliStatusFilter {
  const normalized = value.toUpperCase().replace("-", "_");
  if (normalized === "PRODUCTION" || normalized === "CANDIDATE" || normalized === "MISSING") {
    return normalized;
  }
  if (normalized === "NON_PRODUCTION") return "NON_PRODUCTION";
  if (normalized === "PREVIEW") return "CANDIDATE";
  if (normalized === "BLOCKED") return "MISSING";
  throw new Error(`Unsupported --status value: ${value}\n\n${usage()}`);
}

export function parseMttFilterArg(
  item: string,
  filters: MttCompletionReadinessFilters,
  usage: () => string,
): boolean {
  if (item.startsWith("--format=")) {
    filters.tableFormat = parseMttTableFormatFilter(item.slice("--format=".length), usage);
    return true;
  }
  if (item.startsWith("--speed=")) {
    filters.blindSpeed = parseMttBlindSpeedFilter(item.slice("--speed=".length), usage);
    return true;
  }
  if (item.startsWith("--ev=")) {
    filters.evModel = parseMttEvModelFilter(item.slice("--ev=".length), usage);
    return true;
  }
  if (item.startsWith("--street=")) {
    filters.street = parseMttStreetFilter(item.slice("--street=".length), usage);
    return true;
  }
  if (item.startsWith("--ante=")) {
    filters.ante = parseMttAnteFilter(item.slice("--ante=".length), usage);
    return true;
  }
  if (item.startsWith("--status=")) {
    filters.status = parseMttStatusFilter(item.slice("--status=".length), usage);
    return true;
  }
  return false;
}
