/**
 * Stavební bloky pro referenční ranges (Range_Store).
 *
 * Tento modul je čisté jádro (žádné I/O). Poskytuje generické pomocníky, z nichž
 * jednotlivé varianty (`ante-on/`, `ante-off/`) skrze `strategy.ts` skládají
 * konkrétní `RangeRecord`y. Cílem je definovat ranges z kompaktních seznamů
 * rukou (segmentů) namísto ručního vypisování každé třídy ruky.
 *
 * Klíčové konvence (vynucené `schema.ts`):
 * - STRICT raise akce nesou konkrétní sizing (`OPEN_2X`, `ISO_25X`, …) — Req 4.5.
 * - LENIENT smí uznat více sizingů (např. `OPEN_2X` i `OPEN_25X`) — Req 7.3.
 * - Každá přítomná ruka má ≥ 1 Akční_klíč; ruce bez záznamu jsou implicitně
 *   FOLD (Req 7.6, 10.2).
 *
 * Ranges reflektují cEV (chip-EV) strategii bez ICM (Req 4.9).
 *
 * _Requirements: 4.1, 4.2, 4.5, 4.9, 7.6_
 */

import type {
  ActionContext,
  ActionKey,
  HandLabel,
  Position,
  StackBucket,
} from "../../core/types";
import type { RangeRecord } from "./schema";
import { expandTokens } from "./handExpand";

/**
 * Jeden segment range: množina rukou (v kompaktní notaci) sdílející stejné
 * doporučené Akční_klíče pro STRICT a LENIENT.
 */
export interface RangeSegment {
  /** Ruce v kompaktní notaci ("22+", "A2s+", "KQo", …) nebo jejich pole. */
  spec: string | readonly string[];
  /** Přesné Akční_klíče (STRICT). Musí obsahovat ≥ 1 klíč. */
  strict: ActionKey[];
  /** Přijatelné Akční_klíče (LENIENT). Výchozí = `strict`. */
  lenient?: ActionKey[];
}

/**
 * Sestaví `lenient`/`strict` mapy z pořadového seznamu segmentů.
 *
 * Pravidlo přednosti: **první přiřazení vyhrává**. Pokud se ruka objeví ve více
 * segmentech, platí ten dřívější. To umožňuje psát „výjimky napřed, obecné
 * pravidlo potom" (např. A5s jako 3bet bluff před obecným callem Axs).
 *
 * @param segments Segmenty v pořadí klesající priority.
 * @returns Dvojice map ruka → Akční_klíče pro LENIENT a STRICT.
 */
export function buildHandMaps(segments: readonly RangeSegment[]): {
  lenient: Record<HandLabel, ActionKey[]>;
  strict: Record<HandLabel, ActionKey[]>;
} {
  const strict: Record<HandLabel, ActionKey[]> = {};
  const lenient: Record<HandLabel, ActionKey[]> = {};

  for (const seg of segments) {
    if (seg.strict.length === 0) {
      throw new Error("RangeSegment.strict musí obsahovat alespoň jeden Akční_klíč.");
    }
    const lenientKeys = seg.lenient ?? seg.strict;
    for (const hand of expandTokens(seg.spec)) {
      if (hand in strict) continue; // první přiřazení vyhrává
      strict[hand] = [...seg.strict];
      lenient[hand] = [...lenientKeys];
    }
  }

  return { lenient, strict };
}

/**
 * Vytvoří `RangeRecord` z pozice, košíku, kontextu a seznamu segmentů.
 *
 * @param position Pozice hrdiny.
 * @param bucket Hloubkový koš.
 * @param context Akční kontext.
 * @param segments Segmenty range (priorita dle pořadí).
 */
export function makeRecord(
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
  segments: readonly RangeSegment[],
): RangeRecord {
  const { lenient, strict } = buildHandMaps(segments);
  return { position, bucket, context, lenient, strict };
}

// ---------------------------------------------------------------------------
// Sizing pomocníci (Req 4.5, 7.3)
// ---------------------------------------------------------------------------

/** Sizing-variantní klíče pro RFI/Open dle hloubky. */
export interface SizingKeys {
  strict: ActionKey[];
  lenient: ActionKey[];
}

/**
 * Doporučený open sizing dle hloubky.
 *
 * - Krátké/střední (≤ 25 BB): STRICT `OPEN_2X`, LENIENT {2x, 2.5x}.
 * - Hlubší (> 25 BB): STRICT `OPEN_25X`, LENIENT {2x, 2.5x, 3x}.
 *
 * Odráží trend menších open sizingů na kratších stacích (cEV, bez ICM).
 */
export function openKeys(bucket: StackBucket): SizingKeys {
  if (bucket <= 25) {
    return { strict: ["OPEN_2X"], lenient: ["OPEN_2X", "OPEN_25X"] };
  }
  return { strict: ["OPEN_25X"], lenient: ["OPEN_2X", "OPEN_25X", "OPEN_3X"] };
}

/**
 * Doporučený iso-raise sizing (default 2.5x, LENIENT uznává 2x–3x).
 * Sizing je víceméně nezávislý na přesné hloubce v rozsahu 15–150 BB.
 */
export function isoKeys(_bucket: StackBucket): SizingKeys {
  return { strict: ["ISO_25X"], lenient: ["ISO_2X", "ISO_25X", "ISO_3X"] };
}
