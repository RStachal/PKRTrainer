import type { ResultRecord, StatsStore } from "./statsStore";
import { isValidResultRecord } from "./statsStore";
import { SCHEMA_VERSION } from "./keys";
import {
  isPostflopStatsV2BridgeRecord,
  normalizePostflopStatsV2BridgeRecord,
  type PostflopStatsV2BridgeRecord,
} from "./postflopResultRecord";

export const STATS_EXPORT_PROFILE = "PKRTrainer.mtt-preflop.stats";

export interface StatsExportPayload {
  profile: typeof STATS_EXPORT_PROFILE;
  schemaVersion: string;
  exportedAt: string;
  events: ResultRecord[];
  postflopRecords: PostflopStatsV2BridgeRecord[];
}

export type StatsImportOutcome =
  | {
      ok: true;
      imported: number;
      postflopRecords: PostflopStatsV2BridgeRecord[];
    }
  | {
      ok: false;
      imported: 0;
      postflopRecords: [];
      error: string;
    };

type StatsImportFailure = Extract<StatsImportOutcome, { ok: false }>;

export interface BuildStatsExportOptions {
  postflopRecords?: readonly PostflopStatsV2BridgeRecord[];
}

export function buildStatsExportJson(
  store: StatsStore,
  now: Date = new Date(),
  options: BuildStatsExportOptions = {},
): string {
  const payload: StatsExportPayload = {
    profile: STATS_EXPORT_PROFILE,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    events: store.events(),
    postflopRecords: [...(options.postflopRecords ?? [])],
  };
  return JSON.stringify(payload, null, 2);
}

export function importStatsJson(raw: string, store: StatsStore): StatsImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failed("JSON se nepodarilo nacist. Zkontrolujte prosim format.");
  }

  const sourceEvents = extractEvents(parsed);
  if (!sourceEvents.ok) return sourceEvents;

  const nextEvents: ResultRecord[] = [];
  for (const item of sourceEvents.events) {
    if (!isValidResultRecord(item)) {
      return failed("Import obsahuje zaznam v nepodporovanem formatu.");
    }
    nextEvents.push({ ...item });
  }

  const sourcePostflop = extractPostflopRecords(parsed);
  if (!sourcePostflop.ok) return sourcePostflop;

  const postflopRecords: PostflopStatsV2BridgeRecord[] = [];
  for (const item of sourcePostflop.records) {
    if (!isPostflopStatsV2BridgeRecord(item)) {
      return failed("Import obsahuje postflop zaznam v nepodporovanem formatu.");
    }
    postflopRecords.push(normalizePostflopStatsV2BridgeRecord(item));
  }

  const save = store.replaceAll(nextEvents);
  if (!save.ok) {
    return failed(save.error ?? "Import se nepodarilo ulozit.");
  }

  return { ok: true, imported: nextEvents.length, postflopRecords };
}

function extractEvents(parsed: unknown):
  | { ok: true; events: unknown[] }
  | StatsImportFailure {
  if (Array.isArray(parsed)) {
    return { ok: true, events: parsed };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return failed("JSON musi obsahovat pole udalosti statistik.");
  }

  const payload = parsed as Record<string, unknown>;
  if (!Array.isArray(payload.events)) {
    return failed("JSON musi obsahovat pole `events`.");
  }
  return { ok: true, events: payload.events };
}

function extractPostflopRecords(parsed: unknown):
  | { ok: true; records: unknown[] }
  | StatsImportFailure {
  if (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null) {
    return { ok: true, records: [] };
  }

  const payload = parsed as Record<string, unknown>;
  if (payload.postflopRecords === undefined) {
    return { ok: true, records: [] };
  }
  if (!Array.isArray(payload.postflopRecords)) {
    return failed("JSON pole `postflopRecords` musi byt pole.");
  }

  return { ok: true, records: payload.postflopRecords };
}

function failed(error: string): StatsImportFailure {
  return { ok: false, imported: 0, postflopRecords: [], error };
}
