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
export interface RangeRefinement {
  /** Sedačka, která jednala před hrdinou. */
  vsSeat?: Position;
  /** Rozložení stacků u stolu, pro které záznam platí. */
  stackSetupId?: string;
  /**
   * Kdo otevření dorovnal, zkratkami zdroje a v pořadí akce - osa dorovnávajícího
   * (rozhodnutí 4a, 1. 10. 2026).
   *
   * Range proti otevření, které někdo dorovnal, je jiná než proti otevření
   * samotnému, a liší se **i podle toho kdo**: změřeno na mřížkách zdroje, že
   * BTN na 100 bb squeezuje 67 kombinací proti flatu z EP, 84 proti MP a 102
   * proti CO; BB na 40 bb callne 506 proti EP/MP, 644 proti CO/BU a 751 proti SB.
   *
   * Seznam, ne jedno pole: čtrnáct záznamů korpusu má dorovnávající dva.
   * Prázdný seznam se do klíče **nepřipojuje** - „otevření nikdo nedorovnal" je
   * přesně to, co znamená `vsSeat` sám, a kdyby si na to vyrobil vlastní klíč,
   * rozdělil by dnešní obsah na dvě poloviny bez důvodu.
   */
  flatCallers?: readonly string[];
}

/**
 * Zpřesnění se do klíče připojuje **jen když je**.
 *
 * Klíč záznamu bez zpřesnění tím zůstává bajt po bajtu tentýž jako dřív, takže
 * dnešní obsah, uložená historie ani Question_ID se nehnou. Přesnější záznam
 * dostane vlastní klíč vedle něj, ne místo něj.
 */
function refinementSuffix(refinement?: RangeRefinement): string {
  if (refinement === undefined) return "";
  const vs = refinement.vsSeat ? `|vs${refinement.vsSeat}` : "";
  const scenario = refinement.stackSetupId ? `|#${refinement.stackSetupId}` : "";
  // Prázdný seznam nepřipojuje nic - viz `RangeRefinement.flatCallers`. Proto
  // `?.length`, ne `!== undefined`: `[]` se musí chovat jako „bez osy".
  const flat = refinement.flatCallers?.length ? `|@${refinement.flatCallers.join("+")}` : "";
  return `${vs}${scenario}${flat}`;
}

export function rangeIndexKey(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
  refinement?: RangeRefinement,
): string {
  return `${ante}|${position}|${bucket}|${context}${refinementSuffix(refinement)}`;
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
        // Zpřesněný záznam dostane vlastní klíč **vedle** obecného, ne místo
        // něj: obecná odpověď musí zůstat dosažitelná pro spoty, kde se
        // otvírající sedačka nezná.
        const key = rangeIndexKey(
          file.ante,
          record.position,
          record.bucket,
          record.context,
          {
            vsSeat: record.vsSeat,
            stackSetupId: record.stackSetupId,
            flatCallers: record.flatCallers,
          },
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
let cachedAggregation: AggregationResult | null = null;

function aggregation(): AggregationResult {
  if (cachedAggregation === null) {
    cachedAggregation = aggregate(RANGE_VARIANTS);
  }
  return cachedAggregation;
}

const LAZY_RANGE_INDEX: ReadonlyMap<string, RangeRecord> = {
  get size(): number {
    return aggregation().index.size;
  },
  get(key: string): RangeRecord | undefined {
    return aggregation().index.get(key);
  },
  has(key: string): boolean {
    return aggregation().index.has(key);
  },
  forEach(
    callbackfn: (
      value: RangeRecord,
      key: string,
      map: ReadonlyMap<string, RangeRecord>,
    ) => void,
    thisArg?: unknown,
  ): void {
    aggregation().index.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, LAZY_RANGE_INDEX);
    });
  },
  entries(): IterableIterator<[string, RangeRecord]> {
    return aggregation().index.entries();
  },
  keys(): IterableIterator<string> {
    return aggregation().index.keys();
  },
  values(): IterableIterator<RangeRecord> {
    return aggregation().index.values();
  },
  [Symbol.iterator](): IterableIterator<[string, RangeRecord]> {
    return aggregation().index[Symbol.iterator]();
  },
};

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

/**
 * Agregovaný index všech variant ranges, klíčovaný přes `rangeIndexKey`.
 * Slouží jako podklad pro lookup API v `data/rangeStore.ts` (task 5.4).
 */
export const RANGE_INDEX: ReadonlyMap<string, RangeRecord> = LAZY_RANGE_INDEX;

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
  refinement?: RangeRefinement,
): RangeRecord | undefined {
  // Od nejpřesnějšího k nejobecnějšímu.
  //
  // Pořadí je podstatné: range proti otevření z UTG a z BTN se liší, takže
  // přesnější odpověď musí vyhrát, když existuje. Když neexistuje, vrátí se
  // dnešní záznam - **nezpřesněná odpověď je pořád odpověď** a je lepší než
  // žádná. Je to tentýž postup, jakým vybírá vyřešený postflop.
  const attempts: RangeRefinement[] = [];
  const hasFlat = (refinement?.flatCallers?.length ?? 0) > 0;
  if (refinement !== undefined
    && (refinement.vsSeat !== undefined || refinement.stackSetupId !== undefined || hasFlat)) {
    attempts.push(refinement);
    /*
     * Osy se zahazují od nejméně důležité, a to pořadí je úsudek o obsahu:
     *
     * 1. **rozložení stacků** padá první - bez něj je odpověď o téže situaci,
     *    jen o něco méně přesná (tak to tu stálo od 16. 9. 2026);
     * 2. **dorovnávající** padá druhý - je to pořád táž otázka („čelím otevření
     *    z UTG"), jen bez toho, kdo ho dorovnal. Změřeno, že ten rozdíl je velký
     *    (67 proti 102 kombinacím), takže se nezahazuje dřív než rozložení;
     * 3. **sedačka** padá poslední: bez ní je odpověď o **jiné situaci**.
     *
     * Když se žádná z přesnějších variant nenajde, vrátí se obecný záznam -
     * nezpřesněná odpověď je pořád odpověď.
     */
    if (hasFlat && refinement.stackSetupId !== undefined) {
      attempts.push({ ...(refinement.vsSeat === undefined ? {} : { vsSeat: refinement.vsSeat }), flatCallers: refinement.flatCallers });
    }
    if (hasFlat && refinement.vsSeat !== undefined) {
      attempts.push({ vsSeat: refinement.vsSeat, ...(refinement.stackSetupId === undefined ? {} : { stackSetupId: refinement.stackSetupId }) });
    }
    if (refinement.stackSetupId !== undefined && refinement.vsSeat !== undefined) {
      attempts.push({ vsSeat: refinement.vsSeat });
    }
  }
  attempts.push({});
  for (const attempt of attempts) {
    const found = RANGE_INDEX.get(
      rangeIndexKey(ante, position, bucket, context, attempt),
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Signál celkové načtenosti Range_Store (Req 4.6).
 *
 * `true` právě tehdy, když se obě varianty (ON i OFF) podařilo agregovat bez
 * jediné integritní chyby a index obsahuje alespoň jeden záznam. Při `false`
 * nesmí `Drill_Engine` generovat žádné Spoty.
 */
export function isRangeDataLoaded(): boolean {
  return aggregation().loaded;
}

/**
 * Seznam integritních/strukturálních chyb zjištěných při agregaci (pro
 * diagnostiku). Prázdné pole znamená, že data jsou konzistentně načtena.
 */
export function getRangeDataErrors(): readonly string[] {
  return aggregation().errors;
}
