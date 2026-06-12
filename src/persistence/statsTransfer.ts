import type { ResultRecord, StatsStore } from "./statsStore";
import { isValidResultRecord } from "./statsStore";
import { SCHEMA_VERSION } from "./keys";
import { migrateResultRecordsToV2 } from "./statsRecordV2";
import {
  isPostflopStatsV2BridgeRecord,
  normalizePostflopStatsV2BridgeRecord,
  type PostflopStatsV2BridgeRecord,
} from "./postflopResultRecord";
import {
  isPostflopLineResultRecord,
  normalizePostflopLineResultRecord,
  type PostflopLineResultRecord,
} from "./postflopLineResultRecord";

export const STATS_EXPORT_PROFILE = "PKRTrainer.mtt-preflop.stats";

export interface StatsExportPayload {
  profile: typeof STATS_EXPORT_PROFILE;
  schemaVersion: string;
  exportedAt: string;
  events: ResultRecord[];
  postflopRecords: PostflopStatsV2BridgeRecord[];
  postflopLineRecords: PostflopLineResultRecord[];
}

export type StatsImportOutcome =
  | {
      ok: true;
      imported: number;
      postflopRecords: PostflopStatsV2BridgeRecord[];
      postflopLineRecords: PostflopLineResultRecord[];
    }
  | {
      ok: false;
      imported: 0;
      postflopRecords: [];
      postflopLineRecords: [];
      error: string;
    };

type StatsImportFailure = Extract<StatsImportOutcome, { ok: false }>;

export interface BuildStatsExportOptions {
  postflopRecords?: readonly PostflopStatsV2BridgeRecord[];
  postflopLineRecords?: readonly PostflopLineResultRecord[];
  profileId?: string;
}

export interface StatsProfileOption {
  profileId: string;
  total: number;
  preflopTotal: number;
  postflopTotal: number;
  postflopLineTotal: number;
}

export interface StatsProfileSelection {
  events: ResultRecord[];
  postflopRecords: PostflopStatsV2BridgeRecord[];
  postflopLineRecords: PostflopLineResultRecord[];
}

export function buildStatsExportJson(
  store: StatsStore,
  now: Date = new Date(),
  options: BuildStatsExportOptions = {},
): string {
  const events = store.events();
  const selected = options.profileId
    ? selectStatsProfileRecords(
        events,
        options.postflopRecords ?? [],
        options.postflopLineRecords ?? [],
        options.profileId,
      )
    : {
        events,
        postflopRecords: [...(options.postflopRecords ?? [])],
        postflopLineRecords: [...(options.postflopLineRecords ?? [])],
      };
  const payload: StatsExportPayload = {
    profile: STATS_EXPORT_PROFILE,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    events: selected.events,
    postflopRecords: selected.postflopRecords,
    postflopLineRecords: selected.postflopLineRecords,
  };
  return JSON.stringify(payload, null, 2);
}

export function listStatsProfiles(
  events: readonly ResultRecord[],
  postflopRecords: readonly PostflopStatsV2BridgeRecord[] = [],
  postflopLineRecords: readonly PostflopLineResultRecord[] = [],
): StatsProfileOption[] {
  const profiles = new Map<string, StatsProfileOption>();
  const preflopProfiles = migrateResultRecordsToV2(events);
  preflopProfiles.forEach((record) => {
    addProfileCount(profiles, record.profileId, "preflop");
  });
  postflopRecords.forEach((record) => {
    addProfileCount(profiles, record.profileId, "postflop");
  });
  postflopLineRecords.forEach((record) => {
    addProfileCount(profiles, record.profileId, "postflopLine");
  });
  return [...profiles.values()].sort((a, b) => a.profileId.localeCompare(b.profileId));
}

export function selectStatsProfileRecords(
  events: readonly ResultRecord[],
  postflopRecords: readonly PostflopStatsV2BridgeRecord[],
  postflopLineRecords: readonly PostflopLineResultRecord[],
  profileId: string,
): StatsProfileSelection {
  const preflopProfiles = migrateResultRecordsToV2(events);
  return {
    events: events.filter((_, index) => preflopProfiles[index]?.profileId === profileId),
    postflopRecords: postflopRecords.filter((record) => record.profileId === profileId).map((record) => ({ ...record })),
    postflopLineRecords: postflopLineRecords.filter((record) => record.profileId === profileId).map(cloneLineRecord),
  };
}

export function removeStatsProfileRecords(
  events: readonly ResultRecord[],
  postflopRecords: readonly PostflopStatsV2BridgeRecord[],
  postflopLineRecords: readonly PostflopLineResultRecord[],
  profileId: string,
): StatsProfileSelection {
  const preflopProfiles = migrateResultRecordsToV2(events);
  return {
    events: events.filter((_, index) => preflopProfiles[index]?.profileId !== profileId),
    postflopRecords: postflopRecords.filter((record) => record.profileId !== profileId).map((record) => ({ ...record })),
    postflopLineRecords: postflopLineRecords.filter((record) => record.profileId !== profileId).map(cloneLineRecord),
  };
}

function addProfileCount(
  profiles: Map<string, StatsProfileOption>,
  profileId: string,
  source: "preflop" | "postflop" | "postflopLine",
): void {
  const current = profiles.get(profileId) ?? {
    profileId,
    total: 0,
    preflopTotal: 0,
    postflopTotal: 0,
    postflopLineTotal: 0,
  };
  current.total += 1;
  if (source === "preflop") current.preflopTotal += 1;
  else if (source === "postflop") current.postflopTotal += 1;
  else current.postflopLineTotal += 1;
  profiles.set(profileId, current);
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

  const sourcePostflopLines = extractPostflopLineRecords(parsed);
  if (!sourcePostflopLines.ok) return sourcePostflopLines;

  const postflopLineRecords: PostflopLineResultRecord[] = [];
  for (const item of sourcePostflopLines.records) {
    if (!isPostflopLineResultRecord(item)) {
      return failed("Import obsahuje postflop line zaznam v nepodporovanem formatu.");
    }
    postflopLineRecords.push(normalizePostflopLineResultRecord(item));
  }

  const save = store.replaceAll(nextEvents);
  if (!save.ok) {
    return failed(save.error ?? "Import se nepodarilo ulozit.");
  }

  return { ok: true, imported: nextEvents.length, postflopRecords, postflopLineRecords };
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

function extractPostflopLineRecords(parsed: unknown):
  | { ok: true; records: unknown[] }
  | StatsImportFailure {
  if (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null) {
    return { ok: true, records: [] };
  }

  const payload = parsed as Record<string, unknown>;
  if (payload.postflopLineRecords === undefined) {
    return { ok: true, records: [] };
  }
  if (!Array.isArray(payload.postflopLineRecords)) {
    return failed("JSON pole `postflopLineRecords` musi byt pole.");
  }

  return { ok: true, records: payload.postflopLineRecords };
}

function failed(error: string): StatsImportFailure {
  return { ok: false, imported: 0, postflopRecords: [], postflopLineRecords: [], error };
}

function cloneLineRecord(record: PostflopLineResultRecord): PostflopLineResultRecord {
  return {
    ...record,
    streetResults: record.streetResults.map((street) => ({
      ...street,
      record: { ...street.record },
    })),
    actionHistory: record.actionHistory.map((action) => ({ ...action })),
  };
}
