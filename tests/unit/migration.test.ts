import { describe, it, expect } from "vitest";

import {
  KEY_EVENTS,
  KEY_MIGRATED,
  KEY_STATE,
  LEGACY_KEYS,
} from "../../src/persistence/keys";
import { runMigration } from "../../src/persistence/migration";

class MemoryStorage implements Storage {
  protected readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

class ThrowingMigrationStorage extends MemoryStorage {
  override setItem(key: string, value: string): void {
    if (key === KEY_EVENTS || key === KEY_STATE || key === KEY_MIGRATED) {
      throw new Error("migration write failed");
    }
    super.setItem(key, value);
  }
}

describe("migration - chybove toky", () => {
  it("bez legacy dat vrati clean pro inicializaci cisteho stavu volajicim", () => {
    const storage = new MemoryStorage();

    expect(runMigration(storage)).toEqual({ status: "clean" });
  });

  it("pri selhani zapisu vrati failed, legacy necha beze zmeny a nove klice nevytvori", () => {
    const storage = new ThrowingMigrationStorage();
    const legacyEvents = JSON.stringify([
      {
        qid: "RFI|BTN|25|AKs|OFF",
        chosen: "OPEN_2X",
        correct: true,
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 1,
      },
    ]);
    storage.setItem(LEGACY_KEYS.events, legacyEvents);

    const result = runMigration(storage);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("migration write failed");
    expect(storage.getItem(LEGACY_KEYS.events)).toBe(legacyEvents);
    expect(storage.getItem(KEY_EVENTS)).toBeNull();
    expect(storage.getItem(KEY_STATE)).toBeNull();
    expect(storage.getItem(KEY_MIGRATED)).toBeNull();
  });

  it("odlisi necitelna legacy data od zadne historie", () => {
    // Both used to look identical: records [] and skipped 0, reported as a
    // successful migration of a player who simply had no history. Their data was
    // still sitting in storage, untouched and recoverable, with nothing to say
    // so - the player just got a clean slate.
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_KEYS.events, "{ this is not valid json");

    const result = runMigration(storage);

    expect(result.status).toBe("migrated");
    expect(result.legacyEventsUnreadable).toBe(true);
    expect(result.migratedEventCount).toBe(0);
    // The original data must survive, since it is the only copy.
    expect(storage.getItem(LEGACY_KEYS.events)).toBe("{ this is not valid json");
  });

  it("hlasi necitelnost i pro legacy hodnotu, ktera neni pole", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_KEYS.events, JSON.stringify({ events: [] }));

    expect(runMigration(storage).legacyEventsUnreadable).toBe(true);
  });

  it("necitelnost nehlasi, kdyz legacy data proste chybi nebo jsou v poradku", () => {
    // The flag has to stay off for the ordinary cases, or the warning it drives
    // becomes noise and gets ignored when it matters.
    const empty = new MemoryStorage();
    empty.setItem(LEGACY_KEYS.state, JSON.stringify({ any: "state" }));
    expect(runMigration(empty).legacyEventsUnreadable).toBeUndefined();

    const readable = new MemoryStorage();
    readable.setItem(LEGACY_KEYS.events, JSON.stringify([]));
    expect(runMigration(readable).legacyEventsUnreadable).toBeUndefined();
  });
});
