import { describe, expect, it } from "vitest";

import { grade } from "../../src/core/scoring";
import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import type { Filters } from "../../src/core/types";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { buildProfileAwarePreflopResultRecord } from "../../src/persistence/statsRecordV2";
import { createStatsStore } from "../../src/persistence/statsStore";
import { createPreflopSession, type PreflopSessionClock } from "../../src/training/preflopSession";
import { makeFilters } from "../properties/drillSupport";

/**
 * Řadič preflopové relace (Agents/ui-redesign-plan.md, fáze 1, krok 1).
 *
 * Logika, kterou dřív nesl `setupTraining` v main.ts. Testy hlídají hlavně to,
 * co by se při dvou kopiích rozešlo: co se zapíše do statistik a kdy.
 */

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function fakeClock(): PreflopSessionClock & { advance(ms: number): void } {
  let monotonic = 1_000;
  return {
    wallMs: () => 1_790_000_000_000,
    monotonicMs: () => monotonic,
    advance(ms: number) { monotonic += ms; },
  };
}

const pack = currentMttPreflopRangePack("ON");
const profile = { ...DEFAULT_TRAINING_PROFILE, ante: "ON" as const, street: "PREFLOP" as const };
const filters: Filters = makeFilters({ ante: "ON", positions: ["CO"], contexts: ["RFI"] });

function setup() {
  const clock = fakeClock();
  const store = createStatsStore(new MemoryStorage());
  const session = createPreflopSession(store, clock);
  return { clock, store, session };
}

describe("preflopová relace", () => {
  it("spustí relaci, vrátí seed a první spot", () => {
    const { session } = setup();
    const started = session.start(filters, 42, profile, pack);
    expect(started.kind).toBe("STARTED");
    expect(started.seed).toBe(42);
    if (started.kind !== "STARTED") return;
    expect(session.spot).toBe(started.spot);
    expect(started.spot.heroPos).toBe("CO");
    expect(session.answered).toBe(false);
    expect(session.score.answered).toBe(0);
  });

  it("zapíše do statistik přesně to, co dřív main.ts, i s dobou odpovědi", () => {
    const { clock, store, session } = setup();
    const started = session.start(filters, 42, profile, pack);
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    clock.advance(1_500);
    const chosen = started.spot.answers[0].key;
    const answer = session.answer(chosen);
    expect(answer).not.toBeNull();

    const expected = grade(started.spot, chosen, "LENIENT");
    expect(answer?.grade).toEqual(expected);
    expect(store.events()).toEqual([buildProfileAwarePreflopResultRecord({
      spot: started.spot,
      chosen,
      correct: expected.correct,
      profile,
      rangePack: pack,
      scoringMode: "LENIENT",
      ts: 1_790_000_000_000,
      responseMs: 1_500,
    })]);
    expect(answer?.saved).toBe(true);
  });

  it("na jeden spot přijme jen jednu odpověď", () => {
    const { store, session } = setup();
    const started = session.start(filters, 42, profile, pack);
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    const chosen = started.spot.answers[0].key;
    expect(session.answer(chosen)).not.toBeNull();
    expect(session.answer(chosen)).toBeNull();
    expect(store.events()).toHaveLength(1);
    expect(session.score.answered).toBe(1);
  });

  it("další spot otevře novou otázku a skóre počítá dál", () => {
    const { store, session } = setup();
    const started = session.start(filters, 42, profile, pack);
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    session.answer(started.spot.answers[0].key);
    const next = session.next();
    expect(next).not.toBeNull();
    expect(session.answered).toBe(false);
    session.answer(next!.answers[0].key);
    expect(store.events()).toHaveLength(2);
    expect(session.score.answered).toBe(2);
  });

  it("prázdný průnik filtrů řekne, které hloubky fungují, a běžící relaci nechá", () => {
    const { session } = setup();
    const started = session.start(filters, 42, profile, pack);
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    // Pozice, ze které se v RFI neotvírá: velký blind.
    const empty = session.start(makeFilters({ ante: "ON", positions: ["BB"], contexts: ["RFI"] }), 7, profile, pack);
    expect(empty.kind).toBe("EMPTY");
    expect(empty.seed).toBe(7);
    expect(session.spot).toBe(started.spot);
  });

  it("nový start vynuluje skóre, zastavení ukončí relaci", () => {
    const { session } = setup();
    const first = session.start(filters, 42, profile, pack);
    if (first.kind !== "STARTED") throw new Error("relace nezačala");
    session.answer(first.spot.answers[0].key);
    expect(session.score.answered).toBe(1);

    expect(session.start(filters, 43, profile, pack).kind).toBe("STARTED");
    expect(session.score.answered).toBe(0);

    session.stop();
    expect(session.spot).toBeNull();
    expect(session.answer("FOLD")).toBeNull();
    expect(session.next()).toBeNull();
  });
});
