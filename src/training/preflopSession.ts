import { bucketsWithSpots, resolveSeed, spotSequence } from "../core/drillEngine";
import { grade, type Grade } from "../core/scoring";
import {
  emptySessionScore,
  isHit,
  recordAnswer,
  type SessionScore,
} from "../core/sessionScore";
import type { TrainingProfile } from "../core/trainingProfile";
import type { ActionKey, Filters, Spot, StackBucket } from "../core/types";
import { createRangeStoreFromRangePack, type RangeStore } from "../data/rangeStore";
import type { RangePack } from "../data/ranges/rangePack";
import { buildProfileAwarePreflopResultRecord } from "../persistence/statsRecordV2";
import type { StatsStore } from "../persistence/statsStore";

/**
 * Preflopová tréninková relace bez DOM: sekvence spotů, vyhodnocení odpovědi,
 * záznam do statistik a skóre relace.
 *
 * Do 22. 10. 2026 tahle logika žila uvnitř `setupTraining` v main.ts, spletená
 * s vykreslováním. Nové GUI (Agents/ui-redesign-plan.md, fáze 1) ji potřebuje
 * taky a psát ji podruhé by znamenalo dvě místa, která se rozejdou - třeba
 * v tom, co se zapíše do statistik. Proto ji používá starý pohled i nová
 * obrazovka.
 */

export type PreflopSessionStart =
  | { kind: "STARTED"; seed: number; spot: Spot }
  /** Pack se nepodařilo převést na úložiště ranží. */
  | { kind: "RANGES_UNAVAILABLE"; seed: number }
  /** Průnik filtrů nemá žádný spot; `workingDepths` říká, které hloubky by ho měly. */
  | { kind: "EMPTY"; seed: number; workingDepths: readonly StackBucket[] };

export interface PreflopAnswer {
  spot: Spot;
  chosen: ActionKey;
  grade: Grade;
  /** Počítá se do série: správně, nebo EV řekla „stejně dobrá“ či „přijatelná“. */
  hit: boolean;
  /** Záznam do statistik se uložil; když ne, pohled to má hráči říct. */
  saved: boolean;
  score: SessionScore;
}

export interface PreflopSessionClock {
  /** Čas záznamu do statistik. */
  wallMs: () => number;
  /** Monotónní čas pro dobu odpovědi. */
  monotonicMs: () => number;
}

const SYSTEM_CLOCK: PreflopSessionClock = {
  wallMs: () => Date.now(),
  monotonicMs: () => (
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now()
  ),
};

/** Běžící relace. Spot nikdy neexistuje bez profilu a packu, ze kterých vznikl. */
interface ActiveSession {
  iterator: Iterator<Spot>;
  filters: Filters;
  profile: TrainingProfile;
  pack: RangePack;
  rangeStore: RangeStore;
  spot: Spot;
  answered: boolean;
  questionStartedAt: number;
}

export interface PreflopSession {
  /**
   * Spustí relaci. Neprázdná sekvence nahradí běžící relaci a vynuluje skóre;
   * prázdná nebo nedostupná nechá běžící relaci beze změny.
   */
  start(filters: Filters, seed: number | null, profile: TrainingProfile, pack: RangePack): PreflopSessionStart;
  /** Vyhodnotí odpověď na aktuální spot; druhá odpověď na tentýž spot vrátí null. */
  answer(chosen: ActionKey): PreflopAnswer | null;
  /** Posune relaci na další spot; null, když relace neběží. */
  next(): Spot | null;
  /** Ukončí relaci, například když hráč mění situaci. */
  stop(): void;
  readonly spot: Spot | null;
  readonly filters: Filters | null;
  readonly profile: TrainingProfile | null;
  readonly rangeStore: RangeStore | null;
  readonly answered: boolean;
  readonly score: SessionScore;
}

export function createPreflopSession(
  statsStore: StatsStore,
  clock: PreflopSessionClock = SYSTEM_CLOCK,
): PreflopSession {
  let active: ActiveSession | null = null;
  let score = emptySessionScore();

  function responseMs(session: ActiveSession): number | undefined {
    if (!Number.isFinite(session.questionStartedAt) || session.questionStartedAt <= 0) return undefined;
    const value = Math.max(0, Math.round(clock.monotonicMs() - session.questionStartedAt));
    return Number.isFinite(value) ? value : undefined;
  }

  return {
    start(filters, seed, profile, pack) {
      const resolvedSeed = resolveSeed(seed);
      const rangeStore = createRangeStoreFromRangePack(pack);
      if (!rangeStore.isLoaded()) return { kind: "RANGES_UNAVAILABLE", seed: resolvedSeed };

      const iterator = spotSequence({ seed: resolvedSeed, filters }, rangeStore)[Symbol.iterator]();
      const first = iterator.next();
      if (first.done) {
        return {
          kind: "EMPTY",
          seed: resolvedSeed,
          workingDepths: bucketsWithSpots(filters.contexts, filters.ante, rangeStore),
        };
      }

      active = {
        iterator,
        filters,
        profile,
        pack,
        rangeStore,
        spot: first.value,
        answered: false,
        questionStartedAt: clock.monotonicMs(),
      };
      score = emptySessionScore();
      return { kind: "STARTED", seed: resolvedSeed, spot: first.value };
    },

    answer(chosen) {
      if (!active || active.answered) return null;
      active.answered = true;
      const { spot, filters, profile, pack } = active;
      const result = grade(spot, chosen, filters.scoringMode);
      const save = statsStore.record(buildProfileAwarePreflopResultRecord({
        spot,
        chosen,
        correct: result.correct,
        profile,
        rangePack: pack,
        scoringMode: filters.scoringMode,
        ts: clock.wallMs(),
        responseMs: responseMs(active),
      }));
      const hit = isHit(result.correct, result.actionEv?.outcome);
      score = recordAnswer(score, hit);
      return { spot, chosen, grade: result, hit, saved: save.ok, score };
    },

    next() {
      if (!active) return null;
      const following = active.iterator.next();
      // Neprázdná sekvence cyklí donekonečna; konec je jen pojistka.
      if (following.done) {
        active = null;
        return null;
      }
      active.spot = following.value;
      active.answered = false;
      active.questionStartedAt = clock.monotonicMs();
      return following.value;
    },

    stop() {
      active = null;
    },

    get spot() { return active?.spot ?? null; },
    get filters() { return active?.filters ?? null; },
    get profile() { return active?.profile ?? null; },
    get rangeStore() { return active?.rangeStore ?? null; },
    get answered() { return active?.answered ?? false; },
    get score() { return score; },
  };
}
