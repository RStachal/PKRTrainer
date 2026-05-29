/**
 * Schéma a integritní validace Range_Store (referenční preflop ranges).
 *
 * Tento modul je čistý (typy + validační funkce, žádné I/O). Definuje datový
 * tvar souboru ranges (`RangeFile` / `RangeRecord`) a vynucuje pravidla
 * integrity, na něž spoléhají `data/ranges/index.ts` a `data/rangeStore.ts`.
 *
 * Pravidla integrity (dle design „Range_Store schéma"):
 * - Každá přítomná ruka v `lenient`/`strict` nese ≥ 1 Akční_klíč (Req 7.6).
 * - Ruce bez záznamu jsou implicitně FOLD — nevalidují se (Req 10.2).
 * - Raise akce ve STRICT sadě nesou konkrétní sizing (Req 4.5, Property 11).
 *
 * _Requirements: 4.1, 4.2, 4.5, 7.6_
 */

import type {
  ActionContext,
  ActionKey,
  AnteMode,
  HandLabel,
  Position,
  StackBucket,
} from "../../core/types";

// ---------------------------------------------------------------------------
// Datový tvar (Req 4.1, 4.2)
// ---------------------------------------------------------------------------

/**
 * Jeden soubor ranges pro konkrétní variantu ante (ante-on nebo ante-off).
 *
 * Data jsou indexovaná podle `Pozice × Hloubkový_koš × akční kontext` skrze
 * jednotlivé záznamy `entries` (Req 4.2).
 */
export interface RangeFile {
  /** Verze dat (pro budoucí migrace dat). */
  version: string;
  /** Varianta ante, jíž tento soubor odpovídá. */
  ante: AnteMode;
  /** Záznamy indexované dle Pozice × Hloubkový_koš × akční kontext. */
  entries: RangeRecord[];
}

/**
 * Jeden záznam ranges pro kombinaci Pozice × Hloubkový_koš × akční kontext.
 *
 * `lenient` a `strict` mapují třídu startovní ruky (`HandLabel`) na pole
 * Akčních_klíčů. Chybějící (nebo prázdná) ruka znamená implicitní FOLD
 * (Req 10.2); validace takovou ruku nevyžaduje.
 */
export interface RangeRecord {
  position: Position;
  bucket: StackBucket;
  context: ActionContext;
  /** ruka → přijatelné Akční_klíče (LENIENT). Prázdné/chybějící = fold. */
  lenient: Record<HandLabel, ActionKey[]>;
  /** ruka → přesné Akční_klíče vč. sizingu (STRICT). */
  strict: Record<HandLabel, ActionKey[]>;
}

// ---------------------------------------------------------------------------
// Klasifikace Akčních_klíčů (Req 4.5)
// ---------------------------------------------------------------------------

/**
 * Akční_klíče představující raise akci (RFI/Open, Iso-raise, 3bet, 4bet,
 * Squeeze) — tj. akce, které dle Req 4.5 musí nést konkrétní sizing.
 *
 * Pozn.: sizing-variantní klíče (`OPEN_2X`, `ISO_25X`, ...) sizing již kódují
 * ve svém názvu, zatímco `3BET`/`4BET`/`SQUEEZE` jsou samy o sobě konkrétní
 * doporučené akce bez další sizingové varianty v doménovém modelu.
 */
export const RAISE_ACTION_KEYS = [
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
] as const satisfies readonly ActionKey[];

/** Typ raise Akčního_klíče (podmnožina `ActionKey`). */
export type RaiseActionKey = (typeof RAISE_ACTION_KEYS)[number];

/**
 * Raise Akční_klíče, které nesou explicitní sizing zakódovaný ve svém názvu
 * (Open/Iso varianty). Slouží k ověření Property 11 (existence sizingu).
 */
export const SIZED_RAISE_KEYS = [
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
] as const satisfies readonly ActionKey[];

/**
 * Prefixy raise akcí, které vyžadují sizing-variantní klíč (Open/Iso). Bez
 * konkrétního sizingu (např. holé „OPEN"/„ISO") by šlo o nevalidní placeholder.
 */
const SIZE_REQUIRING_PREFIXES = ["OPEN", "ISO"] as const;

const RAISE_ACTION_KEY_SET: ReadonlySet<ActionKey> = new Set(RAISE_ACTION_KEYS);
const SIZED_RAISE_KEY_SET: ReadonlySet<ActionKey> = new Set(SIZED_RAISE_KEYS);

/** True, pokud je klíč raise akcí (viz `RAISE_ACTION_KEYS`). */
export function isRaiseActionKey(key: ActionKey): key is RaiseActionKey {
  return RAISE_ACTION_KEY_SET.has(key);
}

/**
 * True, pokud raise klíč nese konkrétní sizing. Pro Open/Iso to znamená
 * sizing-variantní klíč (`OPEN_2X`, `ISO_25X`, ...); `3BET`/`4BET`/`SQUEEZE`
 * jsou považovány za již konkrétní doporučené akce.
 */
export function raiseKeyCarriesSizing(key: ActionKey): boolean {
  const needsExplicitSize = SIZE_REQUIRING_PREFIXES.some((p) =>
    key.startsWith(p),
  );
  if (needsExplicitSize) {
    return SIZED_RAISE_KEY_SET.has(key);
  }
  // Ostatní raise klíče (3BET/4BET/SQUEEZE) sizing nepotřebují variantně kódovat.
  return isRaiseActionKey(key);
}

// ---------------------------------------------------------------------------
// Validace integrity (Req 7.6, 4.5)
// ---------------------------------------------------------------------------

/** Formátuje kontext záznamu pro čitelné chybové hlášky. */
function recordTag(r: RangeRecord): string {
  return `${r.position}/${r.bucket}BB/${r.context}`;
}

function validateHandMap(
  errors: string[],
  tag: string,
  setName: "lenient" | "strict",
  map: Record<HandLabel, ActionKey[]>,
): void {
  for (const hand of Object.keys(map)) {
    const keys = map[hand];

    // Req 7.6: přítomná ruka musí nést ≥ 1 Akční_klíč.
    if (!Array.isArray(keys) || keys.length === 0) {
      errors.push(
        `[${tag}] ${setName}[${hand}]: přítomná ruka musí mít ≥ 1 Akční_klíč (Req 7.6).`,
      );
      continue;
    }

    // Req 4.5 / Property 11: raise klíč ve STRICT musí nést konkrétní sizing.
    if (setName === "strict") {
      for (const key of keys) {
        if (isRaiseActionKey(key) && !raiseKeyCarriesSizing(key)) {
          errors.push(
            `[${tag}] strict[${hand}]: raise akce „${key}" postrádá konkrétní sizing (Req 4.5).`,
          );
        }
      }
    }
  }
}

/**
 * Ověří integritu jediného `RangeRecord`. Vrací seznam chybových hlášek
 * (prázdné pole = záznam je validní).
 *
 * Kontroluje:
 * - každá přítomná ruka v `lenient`/`strict` nese ≥ 1 Akční_klíč (Req 7.6),
 * - raise akce ve `strict` nesou konkrétní sizing (Req 4.5, Property 11).
 *
 * Ruce bez záznamu se nevalidují — jsou implicitně FOLD (Req 10.2).
 */
export function validateRangeRecord(r: RangeRecord): string[] {
  const errors: string[] = [];
  const tag = recordTag(r);
  validateHandMap(errors, tag, "lenient", r.lenient);
  validateHandMap(errors, tag, "strict", r.strict);
  return errors;
}

/**
 * Ověří integritu celého `RangeFile`: validuje každý záznam a navíc hlásí
 * duplicitní kombinace Pozice × Hloubkový_koš × akční kontext. Vrací seznam
 * chybových hlášek (prázdné pole = soubor je validní).
 */
export function validateRangeFile(f: RangeFile): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const r of f.entries) {
    const combo = `${r.position}/${r.bucket}/${r.context}`;
    if (seen.has(combo)) {
      errors.push(
        `[${f.ante}] duplicitní kombinace Pozice × Hloubkový_koš × kontext: ${combo}.`,
      );
    }
    seen.add(combo);

    errors.push(...validateRangeRecord(r));
  }

  return errors;
}
