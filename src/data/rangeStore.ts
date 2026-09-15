/**
 * Range_Store — lookup API nad agregovanými referenčními ranges.
 *
 * Tento modul je čistý (data + čtení; žádné DOM/localStorage I/O). Staví na
 * agregovaném indexu z `data/ranges/index.ts` (task 5.3) a poskytuje tenké
 * lookup API, na němž závisí `Drill_Engine` (task 6.1) a `Scoring_Engine`
 * (task 10.1). Sám data znovu neagreguje — jen z nich čte.
 *
 * Mapování datového tvaru: interní `RangeRecord` (viz `ranges/schema.ts`)
 * vystavujeme navenek jako `RangeEntry` dle designu „Range_Store
 * (data/rangeStore.ts)":
 *
 *   RangeRecord.lenient → RangeEntry.actions   (LENIENT množina)
 *   RangeRecord.strict  → RangeEntry.strict    (STRICT množina vč. sizingu)
 *
 * Pozn. k Req 4.7/4.8: samotný `lookup` jen vrací záznam, nebo `undefined`,
 * pokud pro danou kombinaci žádný záznam neexistuje (Req 4.8). Rozhodnutí
 * „generovat / vynechat" Spot (Req 4.7 — povolit i bez kompletního sizingu;
 * Req 4.8 — vynechat kombinaci bez klíče) činí `Drill_Engine`, nikoli tento
 * modul. Scoring přitom závisí výhradně na záznamu pro klíč daného Spotu
 * (Req 4.3): `lookup` čte pouze z dat Range_Store a pro každý klíč vrací právě
 * jeden odpovídající záznam.
 *
 * _Requirements: 4.3, 4.4, 4.7, 4.8_
 */

import type {
  ActionContext,
  ActionKey,
  AnteMode,
  HandLabel,
  Position,
  StackBucket,
} from "../core/types";
import type { ActionEvSet } from "../core/actionEv";
import {
  getRangeRecord,
  isRangeDataLoaded,
  type RangeRefinement,
} from "./ranges";
import type { RangeRecord } from "./ranges/schema";
import type { RangePack } from "./ranges/rangePack";
import { validateRangePack } from "./ranges/rangePack";

// ---------------------------------------------------------------------------
// Veřejné typy (dle design „Range_Store")
// ---------------------------------------------------------------------------

/**
 * Klíč lookupu: kombinace `Pozice × Hloubkový_koš × akční kontext × Ante`.
 *
 * Odpovídá indexaci Range_Store (Req 4.2) a variantě ante (Req 5.2, 5.3).
 */
export interface RangeKey {
  position: Position;
  bucket: StackBucket;
  context: ActionContext;
  ante: AnteMode;
  /**
   * Sedačka, která jednala před hrdinou - osa otvírače (bod 234, rozhodnuto
   * 14. 9. 2026).
   *
   * Range proti otevření z UTG a z BTN se liší, a bez téhle osy je z koupené
   * knihovny dosažitelná ~desetina. Klíč bez ní vrací dnešní záznam beze změny;
   * s ní se zkusí přesnější záznam a když není, **vrátí se obecný** - týž pád
   * jako v `getRangeRecord`. Dnešní obsah, uložená historie ani Question_ID
   * se tím nehnou.
   */
  vsSeat?: Position;
}

/**
 * Záznam ranges vystavený navenek pro daný `RangeKey`.
 *
 * - `actions` = LENIENT množina (ruka → přijatelné Akční_klíče), Req 7.3.
 * - `strict`  = STRICT množina (ruka → přesné Akční_klíče vč. sizingu), Req 7.2/4.5.
 *
 * Ruce bez záznamu jsou implicitně FOLD (Req 10.2).
 */
export interface RangeEntry {
  /** Doporučené akce pro celou range (mapování ruka → akce) — LENIENT množina. */
  actions: Record<HandLabel, ActionKey[]>;
  /** Přesné doporučené akce vč. sizingu (mapování ruka → akce) — STRICT množina. */
  strict: Record<HandLabel, ActionKey[]>;
  actionEvs?: Partial<Record<HandLabel, ActionEvSet<ActionKey>>>;
  /**
   * Sedačka, proti které záznam platí; chybí u obecného záznamu.
   *
   * Klíč se sedačkou může dostat obecný záznam (pád v `lookup`), a volající
   * musí poznat, který z těch dvou dostal: jen zpřesněná odpověď mění
   * Question_ID (viz `questionId`).
   */
  vsSeat?: Position;
}

/** Lookup API nad referenčními ranges (čtení; žádné I/O). */
export interface RangeStore {
  /**
   * Vrátí záznam pro kombinaci `RangeKey`, nebo `undefined`, pokud pro danou
   * kombinaci žádný záznam neexistuje (Req 4.8 — chybějící kombinace).
   *
   * Vrácený záznam nese pro každou přítomnou ruku ≥ 1 doporučený Akční_klíč
   * (Req 4.4); kombinace s ≥ 1 klíčem je generovatelná i bez kompletního
   * sizingu (Req 4.7 — rozhodnutí činí Drill_Engine).
   */
  lookup(key: RangeKey): RangeEntry | undefined;
  /** True, pokud jsou data konzistentně načtena jako celek (Req 4.6). */
  isLoaded(): boolean;
}

// ---------------------------------------------------------------------------
// Mapování RangeRecord → RangeEntry
// ---------------------------------------------------------------------------

/**
 * Převede interní `RangeRecord` na veřejný `RangeEntry`.
 *
 * Mapuje `lenient → actions` a `strict → strict`. Záznam pouze přečteme; data
 * jsou statická a neměnná, takže ho vystavíme přímo (bez hluboké kopie) —
 * konzumenti (Drill_Engine, Scoring_Engine) z něj jen čtou.
 */
function toRangeEntry(record: RangeRecord): RangeEntry {
  return {
    actions: record.lenient,
    strict: record.strict,
    ...(record.actionEvs ? { actionEvs: record.actionEvs } : {}),
    ...(record.vsSeat ? { vsSeat: record.vsSeat } : {}),
  };
}

// ---------------------------------------------------------------------------
// Závislosti a factory
// ---------------------------------------------------------------------------

/**
 * Závislosti, z nichž `RangeStore` čte. Ve výchozím stavu míří na reálný
 * agregovaný index (`data/ranges/index.ts`). Injektovatelnost slouží primárně
 * pro testy (např. izolace scoringu na záznam daného Spotu, Property 10) — bez
 * potřeby měnit globální data.
 */
export interface RangeStoreDeps {
  /** Vrátí interní `RangeRecord` pro danou kombinaci, nebo `undefined`. */
  getRecord: (
    ante: AnteMode,
    position: Position,
    bucket: StackBucket,
    context: ActionContext,
    refinement?: RangeRefinement,
  ) => RangeRecord | undefined;
  /** Signál celkové načtenosti dat (Req 4.6). */
  isLoaded: () => boolean;
}

/** Výchozí závislosti: reálný agregovaný index Range_Store. */
const DEFAULT_DEPS: RangeStoreDeps = {
  getRecord: getRangeRecord,
  isLoaded: isRangeDataLoaded,
};

/**
 * Vytvoří `RangeStore` nad danými závislostmi (výchozí = reálná agregovaná
 * data). `lookup` přeloží `RangeKey` na odpovídající `RangeRecord` a vrátí jej
 * jako `RangeEntry`, nebo `undefined` pro chybějící kombinaci (Req 4.8).
 */
export function createRangeStore(deps: RangeStoreDeps = DEFAULT_DEPS): RangeStore {
  return {
    lookup(key: RangeKey): RangeEntry | undefined {
      const record = deps.getRecord(
        key.ante,
        key.position,
        key.bucket,
        key.context,
        key.vsSeat === undefined ? undefined : { vsSeat: key.vsSeat },
      );
      return record === undefined ? undefined : toRangeEntry(record);
    },
    isLoaded(): boolean {
      return deps.isLoaded();
    },
  };
}

/**
 * Creates an isolated runtime store for one concrete preflop RangePack.
 * Lookups are rejected when the requested ante differs from the pack profile,
 * which prevents cross-profile scoring through the legacy global store.
 */
export function createRangeStoreFromRangePack(pack: RangePack): RangeStore {
  const records = new Map<string, RangeRecord>();
  const errors = validateRangePack(pack);

  for (const record of pack.records) {
    const key = packRecordKey(record.position, record.bucket, record.context, record.vsSeat);
    if (records.has(key)) {
      errors.push(`Duplicate RangePack runtime key: ${key}.`);
      continue;
    }
    records.set(key, {
      position: record.position,
      bucket: record.bucket,
      context: record.context,
      lenient: record.lenient,
      strict: record.strict,
      ...(record.vsSeat ? { vsSeat: record.vsSeat } : {}),
      ...(record.actionEvs ? { actionEvs: record.actionEvs } : {}),
    });
  }

  const loaded = errors.length === 0 && records.size > 0;
  return {
    lookup(key: RangeKey): RangeEntry | undefined {
      if (!loaded || key.ante !== pack.dimensions.ante) return undefined;
      // Od nejpřesnějšího k obecnému, stejně jako `getRangeRecord`.
      const record = (key.vsSeat === undefined
        ? undefined
        : records.get(packRecordKey(key.position, key.bucket, key.context, key.vsSeat)))
        ?? records.get(packRecordKey(key.position, key.bucket, key.context));
      return record === undefined ? undefined : toRangeEntry(record);
    },
    isLoaded(): boolean {
      return loaded;
    },
  };
}

function packRecordKey(
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
  vsSeat?: Position,
): string {
  // Zpřesnění se připojuje jen když je - klíč obecného záznamu zůstává týž.
  return `${position}|${bucket}|${context}${vsSeat === undefined ? "" : `|vs${vsSeat}`}`;
}

// ---------------------------------------------------------------------------
// Výchozí singleton nad reálnými daty
// ---------------------------------------------------------------------------

/**
 * Výchozí instance `RangeStore` nad reálnými agregovanými daty. Toto je
 * primární exportovaný artefakt — importují jej `Drill_Engine` (task 6.1) a
 * `Scoring_Engine` (task 10.1).
 */
export const rangeStore: RangeStore = createRangeStore();
