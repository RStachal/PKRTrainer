/**
 * Migrace lokálního úložiště — legacy → nové verzované klíče.
 *
 * Zodpovědnost (Req 14.2, 14.4):
 *  - **Idempotentní migrace** strukturně kompatibilních legacy dat do nových
 *    verzovaných klíčů. Po dokončení (nastavení `KEY_MIGRATED`, resp. existenci
 *    platného nového stavu) se migrace při dalších spuštěních neopakuje
 *    (Req 14.2).
 *  - **Zápisy výhradně do nových verzovaných klíčů.** Legacy klíče se pouze
 *    čtou a zůstávají beze změny až do zaznamenání příznaku migrace (Req 14.4).
 *
 * Rozsah tohoto modulu (viz tasks.md 12.1):
 *  - Implementuje jádro idempotentní migrace + kontrolu strukturní
 *    kompatibility.
 *  - **Inicializaci čistého nového stavu (Req 14.3)** a **detekci
 *    nekonzistentního úložiště (Req 14.6)** řeší volající (`main.ts`, task 20.1)
 *    na základě vráceného `MigrationResult.status`. Tento modul pouze
 *    signalizuje výsledek; sám čistý stav nezapisuje.
 *
 * Defenzivní I/O:
 *  - Veškeré čtení i zápis do `Storage` je obaleno `try/catch`; poškozený nebo
 *    nedostupný obsah nikdy nezpůsobí pád (funkce nevyhazuje výjimky).
 *  - Při selhání zápisu se nové klíče, které již byly v rámci běhu zapsány,
 *    vrátí zpět (rollback), aby nedošlo k částečně poškozenému novému stavu.
 *    Legacy data zůstávají po celou dobu nedotčená.
 *
 * Strukturní kompatibilita (předpoklady):
 *  - Legacy baseline (`Legacy/PKRTrainer.html`) byl 6-max, 15–25 BB s event
 *    záznamy tvaru `{ ts, qid, cat, ok, chosen, ms }` a stavem
 *    `{ answered, correct, streak, byCat, ... }`. Nový model je 9-handed,
 *    5–150 BB se záznamem `ResultRecord` tvaru
 *    `{ qid, chosen, correct, context, position, bucket, ts }`.
 *  - Migrace přenáší pouze ty event záznamy, jejichž struktura **odpovídá
 *    novému formátu** (`ResultRecord` vč. platných hodnot `context`,
 *    `position`, `bucket`). Typické legacy záznamy používají `ok`/`cat` a
 *    nemají `position`/`bucket`, proto jsou jako nekompatibilní bezpečně
 *    přeskočeny — to je dle zadání akceptovatelné (mnoho legacy dat je
 *    strukturně nekompatibilních kvůli rozdílnému modelu stolu a hloubek).
 *  - Legacy hand-history (`fuf_hh_jungle_v1`) je uložen jako prostý text;
 *    nový klíč `KEY_HH` je rovněž prostý text, proto je neprázdný HH text
 *    strukturně kompatibilní a migruje se beze změny.
 *  - Nový snapshot stavu (`KEY_STATE`) je odvozen z migrovaných event záznamů
 *    (answered/correct/streak), aby byl konzistentní s `KEY_EVENTS`, který je
 *    pro Stats_Store jediným zdrojem pravdy. Legacy agregáty (`byCat` apod.)
 *    se nepřenášejí, protože odpovídají odlišnému modelu kategorií.
 */

import type { ActionContext, ActionKey } from "../core/types";
import { POSITION_ORDER, STACK_BUCKETS } from "../core/types";
import type { ResultRecord } from "./statsStore";
import {
  KEY_EVENTS,
  KEY_HH,
  KEY_MIGRATED,
  KEY_STATE,
  LEGACY_KEYS,
  SCHEMA_VERSION,
  type VersionedKeyName,
} from "./keys";

// ---------------------------------------------------------------------------
// Veřejné typy
// ---------------------------------------------------------------------------

/**
 * Výsledný stav migrace:
 *  - `noop`     migrace již proběhla dříve (příznak nastaven) nebo pod
 *               verzovanými klíči existuje platný nový stav ⇒ nic se nedělá
 *               (idempotence, Req 14.2).
 *  - `migrated` pod legacy klíči existovala data; strukturně kompatibilní část
 *               byla zapsána do verzovaných klíčů a nastaven příznak migrace.
 *               Legacy klíče zůstaly beze změny (Req 14.4).
 *  - `clean`    pod verzovanými ani legacy klíči neexistují žádná data ⇒
 *               není co migrovat; inicializaci čistého stavu provede volající
 *               (Req 14.3 / bootstrap 20.1).
 *  - `failed`   migrace selhala (např. nelze zapsat do verzovaných klíčů).
 *               Případné částečné zápisy do nových klíčů byly vráceny zpět,
 *               legacy zůstaly nedotčené; volající inicializuje čistý nový stav
 *               (Req 14.3).
 */
export type MigrationStatus = "noop" | "migrated" | "clean" | "failed";

/** Výsledek pokusu o migraci. */
export interface MigrationResult {
  status: MigrationStatus;
  /** Nové verzované klíče, do kterých byla zapsána data (jen u `migrated`). */
  migratedKeys?: VersionedKeyName[];
  /** Počet legacy event záznamů úspěšně namapovaných na `ResultRecord`. */
  migratedEventCount?: number;
  /** Počet legacy event záznamů přeskočených jako strukturně nekompatibilní. */
  skippedEventCount?: number;
  /**
   * Legacy události existovaly, ale nešly přečíst (nevalidní JSON nebo jiný tvar
   * než pole). Odlišeno od "žádné události", protože obojí dříve vypadalo
   * stejně: migrace hlásila úspěch s nulou záznamů a hráč tiše začal od nuly,
   * přestože jeho data v úložišti dál leží.
   */
  legacyEventsUnreadable?: boolean;
  /** Popis chyby, je-li `status === "failed"`. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Konstanty pro validaci strukturní kompatibility
// ---------------------------------------------------------------------------

/** Hodnota zapisovaná pod `KEY_MIGRATED` jako příznak dokončené migrace. */
const MIGRATED_FLAG_VALUE = SCHEMA_VERSION;

/** Všechny platné Akční_klíče (runtime sada pro validaci `chosen`). */
const ACTION_KEYS: readonly ActionKey[] = [
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

/** Všechny platné akční kontexty (runtime sada pro validaci `context`). */
const ACTION_CONTEXTS: readonly ActionContext[] = [
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

// ---------------------------------------------------------------------------
// Odvozený snapshot stavu (mirror Stats_Store snapshotu pod KEY_STATE)
// ---------------------------------------------------------------------------

/** Tvar snapshotu zapisovaného pod `KEY_STATE` (shodný se Stats_Store). */
interface StatsSnapshot {
  version: string;
  answered: number;
  correct: number;
  streak: number;
}

/**
 * Odvodí snapshot stavu z event záznamů (answered/correct/streak).
 * Mirroruje logiku `Stats_Store`, aby byl `KEY_STATE` konzistentní s
 * `KEY_EVENTS` (jediný zdroj pravdy).
 */
function snapshotFromEvents(events: ResultRecord[]): StatsSnapshot {
  let correct = 0;
  for (const e of events) {
    if (e.correct) correct += 1;
  }
  // Aktuální série správných odpovědí od konce sekvence (Req 9.5).
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].correct) streak += 1;
    else break;
  }
  return {
    version: SCHEMA_VERSION,
    answered: events.length,
    correct,
    streak,
  };
}

// ---------------------------------------------------------------------------
// Strukturní kompatibilita
// ---------------------------------------------------------------------------

/**
 * Type guard: je `x` strukturně kompatibilní s novým `ResultRecord`?
 *
 * Vyžaduje všechna povinná pole nového formátu se správnými typy a — u polí
 * definujících model (`context`, `position`, `bucket`) — i platné hodnoty z
 * příslušných domén. Tím je zaručeno, že migrovaná data dávají v novém modelu
 * smysl a projdou validací při čtení ve Stats_Store.
 */
function isCompatibleRecord(x: unknown): x is ResultRecord {
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
    Number.isFinite(r.ts)
  );
}

/**
 * Normalizuje kompatibilní záznam na čistý `ResultRecord` (zahodí případná
 * extra legacy pole jako `cat`, `ok`, `ms`).
 */
function normalizeRecord(r: ResultRecord): ResultRecord {
  return {
    qid: r.qid,
    chosen: r.chosen,
    correct: r.correct,
    context: r.context,
    position: r.position,
    bucket: r.bucket,
    ts: r.ts,
  };
}

/**
 * Vytěží z legacy event logu strukturně kompatibilní `ResultRecord` záznamy.
 * Nekompatibilní položky (typická legacy data) bezpečně přeskočí a započítá.
 */
function extractCompatibleEvents(raw: string | null): {
  records: ResultRecord[];
  skipped: number;
  unreadable: boolean;
} {
  if (!raw) return { records: [], skipped: 0, unreadable: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Data tu byla, jen je nelze přečíst. To není totéž co prázdná historie a
    // nesmí to tak vypadat, jinak hráč dostane čistý štít bez varování.
    return { records: [], skipped: 0, unreadable: true };
  }
  if (!Array.isArray(parsed)) return { records: [], skipped: 0, unreadable: true };
  const records: ResultRecord[] = [];
  let skipped = 0;
  for (const item of parsed) {
    if (isCompatibleRecord(item)) records.push(normalizeRecord(item));
    else skipped += 1;
  }
  return { records, skipped, unreadable: false };
}

/**
 * Vrátí HH text k migraci, nebo `null`, není-li co migrovat.
 * Legacy HH je prostý text; migruje se pouze neprázdný obsah.
 */
function extractCompatibleHh(raw: string | null): string | null {
  if (raw === null) return null;
  if (raw.trim().length === 0) return null;
  return raw;
}

// ---------------------------------------------------------------------------
// Defenzivní I/O helpers
// ---------------------------------------------------------------------------

/** Bezpečné čtení z úložiště; chybu/nedostupnost mapuje na `null`. */
function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** True, pokud má klíč neprázdnou hodnotu. */
function hasValue(storage: Storage, key: string): boolean {
  const v = safeGet(storage, key);
  return v !== null && v.length > 0;
}

/** Vrátí zpět (odstraní) nové klíče zapsané během neúspěšného běhu. */
function rollback(storage: Storage, writtenKeys: string[]): void {
  for (const key of writtenKeys) {
    try {
      storage.removeItem(key);
    } catch {
      /* best-effort rollback — sekundární selhání ignorujeme */
    }
  }
}

/** Bezpečný popis chyby pro `MigrationResult.error`. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

/**
 * True, pokud již byla migrace dokončena (příznak `KEY_MIGRATED` nastaven).
 * Exportováno pro volající (bootstrap), který může chtít rozhodnout o dalším
 * postupu bez opakovaného spouštění migrace.
 */
export function isMigrationDone(storage: Storage = localStorage): boolean {
  return hasValue(storage, KEY_MIGRATED);
}

/**
 * True, pokud pod verzovanými klíči existuje platný (neprázdný) nový stav.
 * Slouží k detekci „nový stav existuje" větve (viz design flowchart, uzel B).
 */
export function hasNewState(storage: Storage = localStorage): boolean {
  return hasValue(storage, KEY_STATE);
}

/**
 * Spustí idempotentní migraci legacy dat do nových verzovaných klíčů.
 *
 * Logika (viz design — „Migrace" flowchart):
 *  1. Pokud je migrace již dokončena (příznak) nebo existuje platný nový stav,
 *     vrátí `noop` a nic nemění (Req 14.2).
 *  2. Pokud neexistují žádná legacy data, vrátí `clean` (čistý stav inicializuje
 *     volající; Req 14.3 / 20.1).
 *  3. Jinak přenese strukturně kompatibilní legacy data výhradně do nových
 *     verzovaných klíčů, nastaví příznak migrace a ponechá legacy beze změny
 *     (Req 14.4). Selhání zápisu vrátí nové klíče zpět a signalizuje `failed`.
 *
 * Funkce nikdy nevyhazuje výjimku; veškeré I/O je defenzivní.
 *
 * @param storage Injektovatelné úložiště (výchozí `localStorage`) — usnadňuje
 *                testování bez prohlížeče.
 */
export function runMigration(storage: Storage = localStorage): MigrationResult {
  try {
    // 1) Idempotence (Req 14.2): migrace již proběhla nebo nový stav existuje.
    if (isMigrationDone(storage) || hasNewState(storage)) {
      return { status: "noop" };
    }

    // 2) Existují vůbec nějaká legacy data?
    const legacyEventsRaw = safeGet(storage, LEGACY_KEYS.events);
    const legacyHhRaw = safeGet(storage, LEGACY_KEYS.hh);
    const legacyStateRaw = safeGet(storage, LEGACY_KEYS.state);
    const hasLegacy =
      (legacyEventsRaw !== null && legacyEventsRaw.length > 0) ||
      (legacyHhRaw !== null && legacyHhRaw.length > 0) ||
      (legacyStateRaw !== null && legacyStateRaw.length > 0);

    if (!hasLegacy) {
      // Nic k migraci — čistý start. Inicializaci řeší volající (Req 14.3).
      return { status: "clean" };
    }

    // 3) Vytěžit strukturně kompatibilní data z legacy.
    const { records, skipped, unreadable } = extractCompatibleEvents(legacyEventsRaw);
    const hhText = extractCompatibleHh(legacyHhRaw);

    // Serializace mimo zápis: případná chyba serializace neovlivní úložiště.
    let eventsJson: string;
    let stateJson: string;
    try {
      eventsJson = JSON.stringify(records);
      stateJson = JSON.stringify(snapshotFromEvents(records));
    } catch (err) {
      return { status: "failed", error: describeError(err) };
    }

    // Zápis výhradně do nových verzovaných klíčů (Req 14.4). Příznak migrace
    // se zapisuje jako poslední — dokud není nastaven, případné selhání vede
    // k rollbacku, aby nevznikl částečně poškozený nový stav (Req 14.3).
    const written: string[] = [];
    try {
      storage.setItem(KEY_EVENTS, eventsJson);
      written.push(KEY_EVENTS);
      storage.setItem(KEY_STATE, stateJson);
      written.push(KEY_STATE);
      if (hhText !== null) {
        storage.setItem(KEY_HH, hhText);
        written.push(KEY_HH);
      }
      storage.setItem(KEY_MIGRATED, MIGRATED_FLAG_VALUE);
      written.push(KEY_MIGRATED);
    } catch (err) {
      rollback(storage, written);
      return { status: "failed", error: describeError(err) };
    }

    const migratedKeys: VersionedKeyName[] = ["events", "state"];
    if (hhText !== null) migratedKeys.push("hh");
    migratedKeys.push("migrated");

    return {
      status: "migrated",
      migratedKeys,
      migratedEventCount: records.length,
      skippedEventCount: skipped,
      ...(unreadable ? { legacyEventsUnreadable: true } : {}),
    };
  } catch (err) {
    // Pojistka: žádná cesta nesmí vyhodit výjimku ven.
    return { status: "failed", error: describeError(err) };
  }
}
