import { KEY_POSTFLOP_LINE_EVENTS } from "./keys";
import {
  isPostflopLineResultRecord,
  normalizePostflopLineResultRecord,
  type PostflopLineResultRecord,
} from "./postflopLineResultRecord";
import type { SaveOutcome } from "./statsStore";

export interface PostflopLineStatsStore {
  record(r: PostflopLineResultRecord): SaveOutcome;
  events(): PostflopLineResultRecord[];
  replaceAll(records: readonly PostflopLineResultRecord[]): SaveOutcome;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

class LocalPostflopLineStatsStore implements PostflopLineStatsStore {
  private readonly storage: Storage;
  private records: PostflopLineResultRecord[];

  constructor(storage: Storage) {
    this.storage = storage;
    this.records = this.readEvents();
  }

  record(r: PostflopLineResultRecord): SaveOutcome {
    return this.replaceAll(this.records.concat(cloneRecord(r)));
  }

  events(): PostflopLineResultRecord[] {
    return this.records.map(cloneRecord);
  }

  replaceAll(records: readonly PostflopLineResultRecord[]): SaveOutcome {
    const nextEvents = records.map(cloneRecord);
    if (!nextEvents.every(isPostflopLineResultRecord)) {
      return { ok: false, error: "Invalid postflop line stats record." };
    }
    const normalizedEvents = nextEvents.map(normalizePostflopLineResultRecord);
    const priorRaw = this.safeGet(KEY_POSTFLOP_LINE_EVENTS);

    let eventsJson: string;
    try {
      eventsJson = JSON.stringify(normalizedEvents);
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }

    try {
      this.storage.setItem(KEY_POSTFLOP_LINE_EVENTS, eventsJson);
    } catch (err) {
      this.restore(KEY_POSTFLOP_LINE_EVENTS, priorRaw);
      return { ok: false, error: describeError(err) };
    }

    this.records = normalizedEvents;
    return { ok: true };
  }

  private readEvents(): PostflopLineResultRecord[] {
    const raw = this.safeGet(KEY_POSTFLOP_LINE_EVENTS);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(isPostflopLineResultRecord)
        .map(normalizePostflopLineResultRecord);
    } catch {
      return [];
    }
  }

  private safeGet(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private restore(key: string, raw: string | null): void {
    try {
      if (raw === null) this.storage.removeItem(key);
      else this.storage.setItem(key, raw);
    } catch {
      /* best-effort rollback */
    }
  }
}

export function createPostflopLineStatsStore(
  storage: Storage = localStorage,
): PostflopLineStatsStore {
  return new LocalPostflopLineStatsStore(storage);
}

function cloneRecord(record: PostflopLineResultRecord): PostflopLineResultRecord {
  return {
    ...record,
    streetResults: record.streetResults.map((street) => ({
      ...street,
      record: { ...street.record },
    })),
    actionHistory: record.actionHistory.map((action) => ({
      ...action,
      ...(action.sequence
        ? { sequence: action.sequence.map((step) => ({ ...step })) }
        : {}),
      ...(action.stateBefore ? { stateBefore: { ...action.stateBefore } } : {}),
      ...(action.stateAfter ? { stateAfter: { ...action.stateAfter } } : {}),
    })),
  };
}
