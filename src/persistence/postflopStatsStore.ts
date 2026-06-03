import { KEY_POSTFLOP_EVENTS } from "./keys";
import {
  isPostflopStatsV2BridgeRecord,
  type PostflopStatsV2BridgeRecord,
} from "./postflopResultRecord";
import type { SaveOutcome } from "./statsStore";

export interface PostflopStatsStore {
  record(r: PostflopStatsV2BridgeRecord): SaveOutcome;
  events(): PostflopStatsV2BridgeRecord[];
  replaceAll(records: readonly PostflopStatsV2BridgeRecord[]): SaveOutcome;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

class LocalPostflopStatsStore implements PostflopStatsStore {
  private readonly storage: Storage;
  private records: PostflopStatsV2BridgeRecord[];

  constructor(storage: Storage) {
    this.storage = storage;
    this.records = this.readEvents();
  }

  record(r: PostflopStatsV2BridgeRecord): SaveOutcome {
    return this.replaceAll(this.records.concat({ ...r }));
  }

  events(): PostflopStatsV2BridgeRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  replaceAll(records: readonly PostflopStatsV2BridgeRecord[]): SaveOutcome {
    const nextEvents = records.map((record) => ({ ...record }));
    if (!nextEvents.every(isPostflopStatsV2BridgeRecord)) {
      return { ok: false, error: "Invalid postflop stats record." };
    }
    const priorRaw = this.safeGet(KEY_POSTFLOP_EVENTS);

    let eventsJson: string;
    try {
      eventsJson = JSON.stringify(nextEvents);
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }

    try {
      this.storage.setItem(KEY_POSTFLOP_EVENTS, eventsJson);
    } catch (err) {
      this.restore(KEY_POSTFLOP_EVENTS, priorRaw);
      return { ok: false, error: describeError(err) };
    }

    this.records = nextEvents;
    return { ok: true };
  }

  private readEvents(): PostflopStatsV2BridgeRecord[] {
    const raw = this.safeGet(KEY_POSTFLOP_EVENTS);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isPostflopStatsV2BridgeRecord).map((record) => ({ ...record }));
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

export function createPostflopStatsStore(
  storage: Storage = localStorage,
): PostflopStatsStore {
  return new LocalPostflopStatsStore(storage);
}
