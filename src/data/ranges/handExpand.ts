/**
 * Expanze kompaktní range-notace na třídy startovních rukou (`HandLabel`).
 *
 * Tento modul je čisté jádro (žádné I/O). Slouží jako pomocník pro datová
 * definiční místa ranges (`rangeBuilders.ts` a varianty `ante-on/ante-off`):
 * z lidsky čitelné notace ("22+", "A2s+", "KTs+", "ATo+", "T9s", "55-88")
 * vytvoří deterministický a deduplikovaný seznam `HandLabel`.
 *
 * Notace (vždy s vyšší hodnotou na prvním místě):
 * - Pár:            "AA", "TT", "22"
 * - Pár a výše:     "22+"  → 22, 33, …, AA
 * - Pár rozsah:     "55-88" → 55, 66, 77, 88
 * - Suited/offsuit: "AKs", "T9o", "76s"
 * - Suited/offsuit a výše (fixní vyšší karta, nižší roste k vyšší−1):
 *     "A2s+" → A2s, A3s, …, AKs
 *     "KTs+" → KTs, KJs, KQs
 *     "ATo+" → ATo, AJo, AQo, AKo
 *     "96s+" → 96s, 97s, 98s
 *
 * Tvar labelů ("AA", "AKs", "AKo") odpovídá `core/poker.ts` (vyšší hodnota
 * první). Neznámý token vyhodí výjimku — typografické chyby v datech se tak
 * projeví hned při sestavení Range_Store.
 *
 * _Requirements: 4.1, 4.2_
 */

import type { HandLabel, Rank } from "../../core/types";
import { ALL_HAND_CLASSES, R2V, RANKS } from "../../core/poker";

/** Množina platných tříd rukou pro rychlou validaci výsledku expanze. */
const VALID_HANDS: ReadonlySet<HandLabel> = new Set(ALL_HAND_CLASSES);

/** Mapování číselné síly (2–14) zpět na hodnotu karty. */
const VALUE_TO_RANK: Record<number, Rank> = (() => {
  const map: Record<number, Rank> = {} as Record<number, Rank>;
  for (const r of RANKS) map[R2V[r]] = r;
  return map;
})();

const RANK_CHARS = "23456789TJQKA";
const RANK_TOKEN = `[${RANK_CHARS}]`;

const RE_PAIR = new RegExp(`^(${RANK_TOKEN})\\1$`);
const RE_PAIR_PLUS = new RegExp(`^(${RANK_TOKEN})\\1\\+$`);
const RE_PAIR_RANGE = new RegExp(`^(${RANK_TOKEN})\\1-(${RANK_TOKEN})\\2$`);
const RE_COMBO = new RegExp(`^(${RANK_TOKEN})(${RANK_TOKEN})([so])$`);
const RE_COMBO_PLUS = new RegExp(`^(${RANK_TOKEN})(${RANK_TOKEN})([so])\\+$`);
// Rozsah kombinací se shodnou vyšší kartou a klesající nižší kartou,
// např. "AJs-A9s" → AJs, ATs, A9s; "A9s-A2s" → A9s..A2s.
const RE_COMBO_RANGE = new RegExp(
  `^(${RANK_TOKEN})(${RANK_TOKEN})([so])-(${RANK_TOKEN})(${RANK_TOKEN})([so])$`,
);

/** Síla hodnoty z jejího znaku. */
function v(ch: string): number {
  return R2V[ch as Rank];
}

/** Sestaví label kombinace (vyšší hodnota vždy první). */
function combo(highV: number, lowV: number, suit: "s" | "o"): HandLabel {
  const hi = VALUE_TO_RANK[highV];
  const lo = VALUE_TO_RANK[lowV];
  return `${hi}${lo}${suit}`;
}

/**
 * Rozvine jeden token notace na pole `HandLabel`.
 *
 * @param tokenRaw Token notace (např. "A2s+").
 * @returns Pole tříd rukou, které token reprezentuje.
 * @throws Error pokud token neodpovídá žádnému podporovanému tvaru nebo
 *   produkuje neplatnou třídu ruky.
 */
export function expandToken(tokenRaw: string): HandLabel[] {
  const token = tokenRaw.trim();
  if (token.length === 0) return [];

  const out: HandLabel[] = [];

  // Pár a výše: "22+"
  let m = RE_PAIR_PLUS.exec(token);
  if (m) {
    const from = v(m[1]);
    for (let val = from; val <= 14; val++) {
      const r = VALUE_TO_RANK[val];
      out.push(`${r}${r}`);
    }
    return assertValid(token, out);
  }

  // Pár rozsah: "55-88"
  m = RE_PAIR_RANGE.exec(token);
  if (m) {
    const a = v(m[1]);
    const b = v(m[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let val = lo; val <= hi; val++) {
      const r = VALUE_TO_RANK[val];
      out.push(`${r}${r}`);
    }
    return assertValid(token, out);
  }

  // Pár jednotlivě: "AA"
  m = RE_PAIR.exec(token);
  if (m) {
    const r = m[1] as Rank;
    out.push(`${r}${r}`);
    return assertValid(token, out);
  }

  // Suited/offsuit a výše: "A2s+", "ATo+", "96s+"
  m = RE_COMBO_PLUS.exec(token);
  if (m) {
    const highV = v(m[1]);
    const lowFrom = v(m[2]);
    const suit = m[3] as "s" | "o";
    if (highV <= lowFrom) {
      throw new Error(`Neplatný token „${token}": vyšší karta musí být první.`);
    }
    for (let low = lowFrom; low <= highV - 1; low++) {
      out.push(combo(highV, low, suit));
    }
    return assertValid(token, out);
  }

  // Suited/offsuit jednotlivě: "AKs", "T9o"
  m = RE_COMBO.exec(token);
  if (m) {
    const a = v(m[1]);
    const b = v(m[2]);
    const suit = m[3] as "s" | "o";
    if (a === b) {
      throw new Error(`Neplatný token „${token}": suited/offsuit vyžaduje různé hodnoty.`);
    }
    out.push(combo(Math.max(a, b), Math.min(a, b), suit));
    return assertValid(token, out);
  }

  throw new Error(`Neznámý token range-notace: „${token}".`);
}

/** Ověří, že všechny vyprodukované labely jsou platné třídy rukou. */
function assertValid(token: string, hands: HandLabel[]): HandLabel[] {
  for (const h of hands) {
    if (!VALID_HANDS.has(h)) {
      throw new Error(`Token „${token}" vytvořil neplatnou třídu ruky „${h}".`);
    }
  }
  return hands;
}

/**
 * Rozvine seznam tokenů (pole nebo mezerami/čárkami oddělený řetězec) na
 * deduplikované pole `HandLabel` v pořadí prvního výskytu.
 *
 * @param spec Pole tokenů, nebo řetězec tokenů oddělených mezerami/čárkami.
 * @returns Deduplikované pole tříd rukou.
 */
export function expandTokens(spec: string | readonly string[]): HandLabel[] {
  const tokens = Array.isArray(spec)
    ? spec
    : (spec as string).split(/[\s,]+/).filter((t) => t.length > 0);

  const seen = new Set<HandLabel>();
  const out: HandLabel[] = [];
  for (const tok of tokens) {
    for (const hand of expandToken(tok)) {
      if (!seen.has(hand)) {
        seen.add(hand);
        out.push(hand);
      }
    }
  }
  return out;
}
