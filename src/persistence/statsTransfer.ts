import type { ResultRecord, StatsStore } from "./statsStore";
import { isValidResultRecord } from "./statsStore";
import { SCHEMA_VERSION } from "./keys";

export const STATS_EXPORT_PROFILE = "PKRTrainer.mtt-preflop.stats";

export interface StatsExportPayload {
  profile: typeof STATS_EXPORT_PROFILE;
  schemaVersion: string;
  exportedAt: string;
  events: ResultRecord[];
}

export interface StatsImportOutcome {
  ok: boolean;
  imported: number;
  error?: string;
}

export function buildStatsExportJson(
  store: StatsStore,
  now: Date = new Date(),
): string {
  const payload: StatsExportPayload = {
    profile: STATS_EXPORT_PROFILE,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    events: store.events(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importStatsJson(raw: string, store: StatsStore): StatsImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      imported: 0,
      error: "JSON se nepodařilo načíst. Zkontrolujte prosím formát.",
    };
  }

  const sourceEvents = extractEvents(parsed);
  if (!sourceEvents.ok) {
    return sourceEvents;
  }

  const nextEvents: ResultRecord[] = [];
  for (const item of sourceEvents.events) {
    if (!isValidResultRecord(item)) {
      return {
        ok: false,
        imported: 0,
        error: "Import obsahuje záznam v nepodporovaném formátu.",
      };
    }
    nextEvents.push({ ...item });
  }

  const save = store.replaceAll(nextEvents);
  if (!save.ok) {
    return {
      ok: false,
      imported: 0,
      error: save.error ?? "Import se nepodařilo uložit.",
    };
  }

  return { ok: true, imported: nextEvents.length };
}

function extractEvents(parsed: unknown):
  | { ok: true; events: unknown[] }
  | { ok: false; imported: 0; error: string } {
  if (Array.isArray(parsed)) {
    return { ok: true, events: parsed };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      imported: 0,
      error: "JSON musí obsahovat pole událostí statistik.",
    };
  }

  const payload = parsed as Record<string, unknown>;
  if (!Array.isArray(payload.events)) {
    return {
      ok: false,
      imported: 0,
      error: "JSON musí obsahovat pole `events`.",
    };
  }
  return { ok: true, events: payload.events };
}
