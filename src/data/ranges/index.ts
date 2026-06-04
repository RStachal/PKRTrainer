/**
 * Agregace referenčních ranges přes varianty ante a vynucení integrity.
 *
 * Tento modul je čisté jádro (data + čtení; žádné DOM/localStorage I/O). Spojuje
 * obě varianty (`ante-on` + `ante-off`) do jediného indexu klíčovaného
 * `Ante × Pozice × Hloubkový_koš × akční kontext` pro pozdější O(1) lookup
 * (na němž staví `data/rangeStore.ts`, task 5.4).
 *
 * Při načtení modulu se nad každou variantou spustí integritní validace
 * (`validateRangeFile`). Z výsledku se odvodí jediný **signál celkové
 * načtenosti** `isRangeDataLoaded()`:
 *
 *   načteno = obě varianty (ON i OFF) jsou přítomné
 *           ∧ obě mají neprázdné `entries`
 *           ∧ žádná varianta nemá integritní chybu
 *           ∧ index neobsahuje kolidující klíče
 *
 * Pokud cokoli z toho selže, signál je `false` a `Drill_Engine` nesmí
 * generovat žádné Spoty (Req 4.6). Modul záměrně **nevyhazuje** výjimku na
 * úrovni importu — případné chyby zachytí a zpřístupní přes seznam diagnostik,
 * aby import dat nikdy neshodil aplikaci.
 *
 * _Requirements: 4.6_
 */

import type {
  ActionContext,
  AnteMode,
  Position,
  StackBucket,
} from "../../core/types";
import { anteOffRanges } from "./ante-off";
import { anteOnRanges } from "./ante-on";
import { type RangeFile, type RangeRecord, validateRangeFile } from "./schema";

// ---------------------------------------------------------------------------
// Zdrojové varianty
// ---------------------------------------------------------------------------

/**
 * Všechny varianty ranges, které se agregují. Pořadí nehraje roli — index je
 * klíčovaný i podle `ante`, takže varianty nikdy nekolidují mezi sebou.
 */
const RANGE_VARIANTS: readonly RangeFile[] = [anteOnRanges, anteOffRanges];

/** Varianty ante, které musí být přítomné, aby byla data považována za úplná. */
const REQUIRED_ANTE_MODES: readonly AnteMode[] = ["ON", "OFF"];

// ---------------------------------------------------------------------------
// Klíčování indexu
// ---------------------------------------------------------------------------

/**
 * Sestaví stabilní index klíč z kombinace
 * `Ante × Pozice × Hloubkový_koš × akční kontext`.
 *
 * Tvar `${ante}|${position}|${bucket}|${context}` je jednoznačný: žádná z dílčích
 * hodnot neobsahuje znak `|`, takže nemůže dojít ke kolizi z konkatenace.
 */
export function rangeIndexKey(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
): string {
  return `${ante}|${position}|${bucket}|${context}`;
}

// ---------------------------------------------------------------------------
// Agregace + integrita
// ---------------------------------------------------------------------------

/** Výsledek agregace variant: index, diagnostika a signál načtenosti. */
interface AggregationResult {
  /** Agregovaný index pro O(1) lookup (klíč viz `rangeIndexKey`). */
  index: ReadonlyMap<string, RangeRecord>;
  /** Seznam integritních/strukturálních chyb (prázdný = data jsou v pořádku). */
  errors: readonly string[];
  /** Signál celkové načtenosti (Req 4.6). */
  loaded: boolean;
}

/**
 * Spojí varianty do jediného indexu a vynutí integritu. Veškerá práce je
 * obalena v `try/catch`, aby případná neočekávaná chyba neshodila import — místo
 * toho se promítne do seznamu chyb a signál načtenosti bude `false`.
 */
function aggregate(variants: readonly RangeFile[]): AggregationResult {
  const index = new Map<string, RangeRecord>();
  const errors: string[] = [];

  try {
    const seenAnte = new Set<AnteMode>();

    for (const file of variants) {
      seenAnte.add(file.ante);

      // Integritní pravidla schématu (≥ 1 klíč u přítomné ruky, sizing u raise
      // akcí, žádné duplicitní kombinace uvnitř souboru) — Req 7.6, 4.5.
      errors.push(...validateRangeFile(file));

      // Varianta musí nést alespoň jeden záznam, jinak je „nenačtená".
      if (file.entries.length === 0) {
        errors.push(
          `[${file.ante}] range variant does not contain any records (entries is empty).`,
        );
      }

      // Naplnění agregovaného indexu; kolize klíče je integritní chyba.
      for (const record of file.entries) {
        const key = rangeIndexKey(
          file.ante,
          record.position,
          record.bucket,
          record.context,
        );
        if (index.has(key)) {
          errors.push(`duplicate index key during aggregation: ${key}.`);
          continue;
        }
        index.set(key, record);
      }
    }

    // Obě požadované varianty ante musí být přítomné (Req 5.2, 5.3 spoléhají na
    // dostupnost obou sad; pro Req 4.6 je chybějící varianta = nenačteno).
    for (const ante of REQUIRED_ANTE_MODES) {
      if (!seenAnte.has(ante)) {
        errors.push(`missing range variant for ante = ${ante}.`);
      }
    }
  } catch (err) {
    errors.push(`unexpected error while aggregating ranges: ${String(err)}.`);
  }

  const loaded = errors.length === 0 && index.size > 0;
  return { index, errors, loaded };
}

// Agregace proběhne jednou při načtení modulu (data jsou statická a neměnná).
const AGGREGATION: AggregationResult = aggregate(RANGE_VARIANTS);

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

/**
 * Agregovaný index všech variant ranges, klíčovaný přes `rangeIndexKey`.
 * Slouží jako podklad pro lookup API v `data/rangeStore.ts` (task 5.4).
 */
export const RANGE_INDEX: ReadonlyMap<string, RangeRecord> = AGGREGATION.index;

/**
 * Vrátí `RangeRecord` pro kombinaci
 * `Ante × Pozice × Hloubkový_koš × akční kontext`, nebo `undefined`, pokud pro
 * danou kombinaci žádný záznam neexistuje (Req 4.8 — chybějící kombinace).
 */
export function getRangeRecord(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
): RangeRecord | undefined {
  return RANGE_INDEX.get(rangeIndexKey(ante, position, bucket, context));
}

/**
 * Signál celkové načtenosti Range_Store (Req 4.6).
 *
 * `true` právě tehdy, když se obě varianty (ON i OFF) podařilo agregovat bez
 * jediné integritní chyby a index obsahuje alespoň jeden záznam. Při `false`
 * nesmí `Drill_Engine` generovat žádné Spoty.
 */
export function isRangeDataLoaded(): boolean {
  return AGGREGATION.loaded;
}

/**
 * Seznam integritních/strukturálních chyb zjištěných při agregaci (pro
 * diagnostiku). Prázdné pole znamená, že data jsou konzistentně načtena.
 */
export function getRangeDataErrors(): readonly string[] {
  return AGGREGATION.errors;
}
