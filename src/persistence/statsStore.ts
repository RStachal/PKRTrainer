/**
 * Stats_Store — perzistence výsledků tréninku a výpočet statistik.
 *
 * Zodpovědnost (Req 9):
 *  - `record(r)`   uloží jeden záznam výsledku do localStorage před zobrazením
 *                  dalšího Spotu (Req 9.1); při selhání uložení ponechá dříve
 *                  uložená data nezměněná a vrátí neúspěšný `SaveOutcome` bez
 *                  vyhození výjimky (Req 9.6).
 *  - `summary()`   vrátí celkový počet zodpovězených a úspěšnost v procentech
 *                  zaokrouhlenou na 1 desetinné místo (Req 9.3); total=0 ⇒ rate
 *                  je `null` (nedostupná) místo dělení nulou.
 *  - `breakdownBy` rozčlenění úspěšnosti podle kategorie akce / Pozice /
 *                  Hloubkového_košu (Req 9.4); skupiny bez záznamu mají count=0
 *                  a rate `null` (Req 9.7).
 *  - `currentStreak()` aktuální série správných odpovědí (Req 9.5): +1 po
 *                  správné odpovědi, reset na 0 po nesprávné.
 *
 * Návrhové principy:
 *  - **Event log je jediný zdroj pravdy.** Pod `KEY_EVENTS` je uložené pole
 *    `ResultRecord[]`; všechny statistiky (souhrn, breakdown, streak) se z něj
 *    odvozují čistými funkcemi. Pod `KEY_STATE` je zapisován odvozený snapshot
 *    (answered/correct/streak) pro rychlý přístup a externí konzumenty
 *    (dashboard, migrace).
 *  - **Defenzivní I/O (Req 9.2).** Veškeré čtení i zápis do `Storage` je
 *    obaleno `try/catch`. Poškozený nebo nedostupný obsah nikdy nezpůsobí pád;
 *    čtení selže „tiše" do prázdného stavu.
 *  - **Testovatelnost.** Factory `createStatsStore(storage)` umožňuje injektovat
 *    libovolnou implementaci `Storage` (např. in-memory fake v testech).
 */

import type {
  ActionContext,
  ActionKey,
  Position,
  StackBucket,
} from "../core/types";
import { POSITION_ORDER, STACK_BUCKETS } from "../core/types";
import { KEY_EVENTS, KEY_STATE, SCHEMA_VERSION } from "./keys";

// ---------------------------------------------------------------------------
// Veřejné typy
// ---------------------------------------------------------------------------

/**
 * Jeden trvale ukládaný záznam výsledku (Req 9.1).
 * Obsahuje povinná pole: Question_ID, zvolený Akční_klíč, příznak správnosti,
 * kategorii akce (context), Pozici a Hloubkový_koš daného Spotu + časové razítko.
 */
export interface ResultRecord {
  qid: string;
  chosen: ActionKey;
  correct: boolean;
  context: ActionContext;
  position: Position;
  bucket: StackBucket;
  ts: number;
  responseMs?: number;
}

/**
 * Výsledek pokusu o uložení záznamu (Req 9.1, 9.6).
 * `ok=false` znamená, že uložení selhalo a dříve uložená data zůstala nezměněná.
 */
export interface SaveOutcome {
  ok: boolean;
  /** Popis chyby, je-li `ok=false`. */
  error?: string;
}

/**
 * Souhrnné statistiky (Req 9.3).
 * `rate` je úspěšnost v procentech zaokrouhlená na 1 desetinné místo, nebo
 * `null`, pokud dosud nebyla zodpovězena žádná otázka (nedostupná úspěšnost).
 */
export interface Summary {
  total: number;
  correct: number;
  rate: number | null;
}

/** Statistika jedné skupiny v rámci breakdownu (Req 9.4, 9.7). */
export interface GroupStat {
  /** Identifikátor skupiny (hodnota kategorie / Pozice / Hloubkového_košu). */
  key: string;
  total: number;
  correct: number;
  /** Úspěšnost v % na 1 desetinné místo; `null` pro skupinu bez záznamu (Req 9.7). */
  rate: number | null;
}

/** Rozčlenění úspěšnosti podle zvolené dimenze (Req 9.4). */
export type Breakdown = GroupStat[];

/** Dimenze, podle které lze členit statistiky (Req 9.4). */
export type BreakdownDim = "context" | "position" | "bucket";

/** Veřejné API Stats_Store. */
export interface StatsStore {
  /** Uloží záznam výsledku (Req 9.1); na selhání vrací `ok=false` (Req 9.6). */
  record(r: ResultRecord): SaveOutcome;
  /** Vrátí kopii append-only event logu pro export / diagnostiku. */
  events(): ResultRecord[];
  /** Nahradí event log validovanou sadou záznamů (import JSON statistik). */
  replaceAll(records: ResultRecord[]): SaveOutcome;
  /** Celkový počet a úspěšnost (Req 9.3). */
  summary(): Summary;
  /** Rozčlenění úspěšnosti podle dimenze (Req 9.4, 9.7). */
  breakdownBy(dim: BreakdownDim): Breakdown;
  /** Aktuální série správných odpovědí (Req 9.5). */
  currentStreak(): number;
}

// ---------------------------------------------------------------------------
// Interní snapshot (KEY_STATE)
// ---------------------------------------------------------------------------

/** Odvozený snapshot stavu zapisovaný pod `KEY_STATE`. */
interface StatsSnapshot {
  version: string;
  answered: number;
  correct: number;
  streak: number;
}

/** Všechny akční kontexty (kategorie) pro úplný breakdown (Req 9.7). */
const ACTION_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

const ACTION_KEYS: ActionKey[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
  "JAM",
  "CALL_JAM",
];

// ---------------------------------------------------------------------------
// Čisté pomocné funkce (deterministické, bez I/O)
// ---------------------------------------------------------------------------

/** Deterministické zaokrouhlení na 1 desetinné místo (Req 9.3). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Počet správných odpovědí v sadě záznamů. */
function countCorrect(events: ResultRecord[]): number {
  let correct = 0;
  for (const e of events) {
    if (e.correct) correct += 1;
  }
  return correct;
}

/**
 * Aktuální série správných odpovědí (Req 9.5): počet po sobě jdoucích správných
 * odpovědí od konce sekvence. Nesprávná odpověď na konci ⇒ 0.
 */
function trailingCorrect(events: ResultRecord[]): number {
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].correct) streak += 1;
    else break;
  }
  return streak;
}

/** Odvodí snapshot stavu z event logu. */
function snapshotFromEvents(events: ResultRecord[]): StatsSnapshot {
  return {
    version: SCHEMA_VERSION,
    answered: events.length,
    correct: countCorrect(events),
    streak: trailingCorrect(events),
  };
}

/** Vypočte úspěšnost v % na 1 desetinné místo; `null` při nulovém počtu. */
function successRate(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return round1((correct / total) * 100);
}

/** Klíč skupiny daného záznamu pro zvolenou dimenzi. */
function dimKeyOf(r: ResultRecord, dim: BreakdownDim): string {
  switch (dim) {
    case "context":
      return r.context;
    case "position":
      return r.position;
    case "bucket":
      return String(r.bucket);
  }
}

/** Úplná množina skupin pro zvolenou dimenzi (pro skupiny bez záznamu, Req 9.7). */
function canonicalGroups(dim: BreakdownDim): string[] {
  switch (dim) {
    case "context":
      return [...ACTION_CONTEXTS];
    case "position":
      return [...POSITION_ORDER];
    case "bucket":
      return STACK_BUCKETS.map((b) => String(b));
  }
}

/** Type guard pro defenzivní deserializaci jednoho záznamu (Req 9.2). */
export function isValidResultRecord(x: unknown): x is ResultRecord {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.qid === "string" &&
    r.qid.length > 0 &&
    typeof r.chosen === "string" &&
    (ACTION_KEYS as readonly string[]).includes(r.chosen) &&
    typeof r.correct === "boolean" &&
    typeof r.context === "string" &&
    (ACTION_CONTEXTS as readonly string[]).includes(r.context) &&
    typeof r.position === "string" &&
    (POSITION_ORDER as readonly string[]).includes(r.position) &&
    typeof r.bucket === "number" &&
    (STACK_BUCKETS as readonly number[]).includes(r.bucket) &&
    typeof r.ts === "number" &&
    Number.isFinite(r.ts) &&
    isOptionalNonNegativeFiniteNumber(r.responseMs)
  );
}

function isOptionalNonNegativeFiniteNumber(value: unknown): boolean {
  return value === undefined || (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

/** Bezpečný popis chyby pro `SaveOutcome.error`. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Implementace
// ---------------------------------------------------------------------------

class LocalStatsStore implements StatsStore {
  private readonly storage: Storage;
  /** In-memory zrcadlo `KEY_EVENTS` — jediný zdroj pravdy pro statistiky. */
  private records: ResultRecord[];

  constructor(storage: Storage) {
    this.storage = storage;
    this.records = this.readEvents();
  }

  record(r: ResultRecord): SaveOutcome {
    // Pořídíme si výchozí hodnotu pro případný rollback (Req 9.6).
    const priorEventsRaw = this.safeGet(KEY_EVENTS);

    const nextEvents = this.records.concat(r);

    // Serializace mimo zápis: případná chyba serializace neovlivní úložiště.
    let eventsJson: string;
    let stateJson: string;
    try {
      eventsJson = JSON.stringify(nextEvents);
      stateJson = JSON.stringify(snapshotFromEvents(nextEvents));
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }

    // 1) Zápis event logu. Pokud selže, žádný klíč se nezměnil (Req 9.6).
    try {
      this.storage.setItem(KEY_EVENTS, eventsJson);
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }

    // 2) Zápis snapshotu stavu. Pokud selže, vrátíme event log do původního
    //    stavu, aby dříve uložená data zůstala nezměněná (Req 9.6).
    try {
      this.storage.setItem(KEY_STATE, stateJson);
    } catch (err) {
      this.restore(KEY_EVENTS, priorEventsRaw);
      return { ok: false, error: describeError(err) };
    }

    // Úspěch — teprve nyní aktualizujeme in-memory zrcadlo.
    this.records = nextEvents;
    return { ok: true };
  }

  events(): ResultRecord[] {
    return this.records.map((event) => ({ ...event }));
  }

  replaceAll(records: ResultRecord[]): SaveOutcome {
    const nextEvents = records.map((event) => ({ ...event }));
    const priorEventsRaw = this.safeGet(KEY_EVENTS);
    const priorStateRaw = this.safeGet(KEY_STATE);

    let eventsJson: string;
    let stateJson: string;
    try {
      eventsJson = JSON.stringify(nextEvents);
      stateJson = JSON.stringify(snapshotFromEvents(nextEvents));
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }

    try {
      this.storage.setItem(KEY_EVENTS, eventsJson);
      this.storage.setItem(KEY_STATE, stateJson);
    } catch (err) {
      this.restore(KEY_EVENTS, priorEventsRaw);
      this.restore(KEY_STATE, priorStateRaw);
      return { ok: false, error: describeError(err) };
    }

    this.records = nextEvents;
    return { ok: true };
  }

  summary(): Summary {
    const total = this.records.length;
    const correct = countCorrect(this.records);
    return { total, correct, rate: successRate(total, correct) };
  }

  breakdownBy(dim: BreakdownDim): Breakdown {
    const groups = canonicalGroups(dim);
    const agg = new Map<string, { total: number; correct: number }>();
    // Předem inicializujeme všechny známé skupiny (Req 9.7: count=0, rate=null).
    for (const key of groups) {
      agg.set(key, { total: 0, correct: 0 });
    }
    // Uchováme pořadí: nejprve kanonické skupiny, poté případné neočekávané.
    const order: string[] = [...groups];
    for (const e of this.records) {
      const key = dimKeyOf(e, dim);
      let entry = agg.get(key);
      if (!entry) {
        entry = { total: 0, correct: 0 };
        agg.set(key, entry);
        order.push(key);
      }
      entry.total += 1;
      if (e.correct) entry.correct += 1;
    }
    return order.map((key) => {
      const entry = agg.get(key)!;
      return {
        key,
        total: entry.total,
        correct: entry.correct,
        rate: successRate(entry.total, entry.correct),
      };
    });
  }

  currentStreak(): number {
    return trailingCorrect(this.records);
  }

  // -- Defenzivní I/O ------------------------------------------------------

  /** Načte a zvaliduje event log; při jakékoli chybě vrátí prázdné pole (Req 9.2). */
  private readEvents(): ResultRecord[] {
    const raw = this.safeGet(KEY_EVENTS);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidResultRecord);
    } catch {
      return [];
    }
  }

  /** Bezpečné čtení z úložiště (Req 9.2). */
  private safeGet(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  /** Obnoví předchozí hodnotu klíče (rollback); chyby ignoruje (best-effort). */
  private restore(key: string, raw: string | null): void {
    try {
      if (raw === null) this.storage.removeItem(key);
      else this.storage.setItem(key, raw);
    } catch {
      /* best-effort rollback — sekundární selhání ignorujeme */
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Vytvoří `StatsStore` nad zadaným `Storage` (výchozí `localStorage`).
 * Injektovatelné úložiště umožňuje testování bez prohlížeče (Req 9.2).
 */
export function createStatsStore(storage: Storage = localStorage): StatsStore {
  return new LocalStatsStore(storage);
}
