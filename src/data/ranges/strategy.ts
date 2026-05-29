/**
 * Definice referenčních cEV preflop ranges (data, ne logika).
 *
 * Tento modul je čisté jádro (žádné I/O). Z kompaktních seznamů rukou
 * (segmentů) programově sestaví kompletní `RangeFile` pro zvolenou variantu
 * ante. Varianty `ante-on/` a `ante-off/` z něj jen volají `buildAnteRangeFile`.
 *
 * Strategie:
 * - Reflektuje cEV (chip-EV) bez ICM (Req 4.9).
 * - Ante-on ranges jsou mírně širší než ante-off (ante přidává mrtvé peníze do
 *   potu a posouvá break-even body — Req 5.2 vs 5.3). Rozdíl je vyjádřen
 *   segmenty „extra", které se přidávají jen pro `ante = ON`.
 * - Hodnoty/okraje vychází z referenčního baseline (`Legacy/PKRTrainer.html`,
 *   rule cards A–F) rozšířeného na full ring 9-handed a celé spektrum 5–150 BB.
 *
 * Indexace: každý `RangeRecord` je klíčován Pozicí × Hloubkovým_košem ×
 * akčním kontextem (Req 4.2). Pokrytí je reprezentativní, nikoli vyčerpávající:
 * Drill_Engine kombinace bez klíče přeskočí (Req 4.8).
 *
 * _Requirements: 4.1, 4.2, 4.9, 5.2, 5.3_
 */

import type {
  AnteMode,
  Position,
  StackBucket,
} from "../../core/types";
import type { RangeFile, RangeRecord } from "./schema";
import {
  isoKeys,
  makeRecord,
  openKeys,
  type RangeSegment,
} from "./rangeBuilders";

// ---------------------------------------------------------------------------
// Rozdělení košů (Req 2.3: ≤ 12 BB = push/fold)
// ---------------------------------------------------------------------------

/** Koše v režimu Push/Fold (≤ 12 BB) z definované sady: 5 a 10 BB. */
const PUSH_FOLD_BUCKETS: StackBucket[] = [5, 10];

/** Koše mimo push/fold (> 12 BB): plný akční strom. */
const DEEP_BUCKETS: StackBucket[] = [15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150];

/** Pozice schopné RFI/Open (vše kromě BB, která jedná poslední). */
const RFI_POSITIONS: Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
];

/** Pozice bránící proti open-raisu (mohou čelit openu). */
const DEFEND_POSITIONS: Position[] = ["LJ", "HJ", "CO", "BTN", "SB", "BB"];

/** Pozice, které mohly otevřít a nyní čelí 3betu. */
const OPENER_POSITIONS: Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
];

/** Pozice, které 3betovaly a nyní čelí 4betu. */
const THREEBETTOR_POSITIONS: Position[] = ["LJ", "HJ", "CO", "BTN", "SB", "BB"];

/** Pozice, kde se může nabídnout squeeze (open + 1–7 callerů před hrdinou). */
const SQUEEZE_POSITIONS: Position[] = ["HJ", "CO", "BTN", "SB", "BB"];

/** Pozice, kde se nabízí Iso-raise / over-limp / BB check vs limpeři. */
const ISO_POSITIONS: Position[] = ["LJ", "HJ", "CO", "BTN", "SB", "BB"];

// ---------------------------------------------------------------------------
// RFI / Open ranges (Req 3.1) — širší se zlepšující se pozicí
// ---------------------------------------------------------------------------

interface CoreExtra {
  /** Vždy přítomné ruce. */
  core: string;
  /** Ruce navíc jen pro ante-on (širší range). */
  extra: string;
}

const OPEN_RANGES: Record<string, CoreExtra> = {
  UTG: {
    core: "22+, A4s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo",
    extra: "A2s+, 87s, ATo",
  },
  "UTG+1": {
    core: "22+, A4s+, KTs+, QTs+, JTs, T9s, 98s, 87s, AJo+, KQo",
    extra: "A2s+, 76s, ATo",
  },
  "UTG+2": {
    core: "22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, 87s, 76s, ATo+, KJo+",
    extra: "K8s, Q9s, J9s, KTo",
  },
  LJ: {
    core: "22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, ATo+, KJo+, QJo",
    extra: "K8s, J8s, T8s, A9o, KTo",
  },
  HJ: {
    core: "22+, A2s+, K8s+, Q9s+, J8s+, T8s+, 98s, 87s, 76s, 65s, 54s, A9o+, KTo+, QJo",
    extra: "K7s, Q8s, 97s, A8o, QTo",
  },
  CO: {
    core: "22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, 54s, A8o+, KTo+, QTo+, JTo",
    extra: "K4s, Q6s, J7s, 86s, A5o, K9o",
  },
  BTN: {
    core: "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K9o+, Q9o+, J9o+, T9o",
    extra: "Q3s, J6s, T6s, 64s, K7o, Q8o, J8o, 98o",
  },
  SB: {
    core: "22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 86s+, 76s, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o",
    extra: "Q2s, J4s, T5s, 95s, 75s, K5o, Q7o, J8o, T8o, 87o",
  },
};

// ---------------------------------------------------------------------------
// VS_OPEN obrana (Req 3.5) — 3bet value / 3bet bluff / call
// ---------------------------------------------------------------------------

interface DefendDef {
  value: string; // 3bet value
  bluff: string; // 3bet bluff
  call: string; // call (flat)
  callExtra: string; // ante-on rozšíření callu
}

const DEFEND_RANGES: Record<string, DefendDef> = {
  LJ: {
    value: "QQ+, AKs, AKo",
    bluff: "A5s, A4s",
    call: "JJ-99, AQs, AJs, KQs, AQo",
    callExtra: "ATs, KJs, QJs, JTs",
  },
  HJ: {
    value: "QQ+, AKs, AQs, AKo",
    bluff: "A5s, A4s, KJs",
    call: "JJ-77, AJs, ATs, KQs, KJs, QJs, JTs, T9s, AQo",
    callExtra: "A9s, KTs, QTs, 98s, AJo, KQo",
  },
  CO: {
    value: "JJ+, AQs+, AKo",
    bluff: "A5s, A4s, A3s, K9s",
    call: "TT-66, AJs-A9s, KTs+, QTs+, JTs, T9s, 98s, AJo, KQo",
    callExtra: "A8s, A7s, K9s, Q9s, J9s, 87s, ATo, KJo",
  },
  BTN: {
    value: "TT+, AQs+, AKo",
    bluff: "A5s-A2s, K9s, Q9s",
    call: "99-22, AJs-A6s, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, AJo, KQo, KJo",
    callExtra: "A5s, K8s, Q8s, J8s, T8s, 65s, ATo, QJo",
  },
  SB: {
    value: "JJ+, AQs+, AKo",
    bluff: "A5s-A3s, KJs, QJs",
    call: "TT-55, AJs-ATs, KQs, KJs, QJs, JTs, T9s, 98s, AQo",
    callExtra: "A9s, KTs, QTs, J9s, 87s, AJo, KQo",
  },
  BB: {
    value: "TT+, AQs+, AKo",
    bluff: "A5s-A2s, K9s-K7s, Q9s, J9s",
    call: "99-22, A9s-A2s, KTs+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, 54s, ATo+, KJo+, QJo, JTo",
    callExtra: "K6s-K2s, Q7s, Q8s, J8s, T7s, 64s, A9o, KTo, QTo, T9o, 98o",
  },
};

// ---------------------------------------------------------------------------
// VS_3BET (Req 3.7) — 4bet value / call
// ---------------------------------------------------------------------------

interface ValueCall {
  value: string;
  call: string;
  callExtra: string;
}

const VS_3BET_RANGES: Record<string, ValueCall> = {
  UTG: { value: "QQ+, AKs, AKo", call: "JJ-TT, AQs, AKs", callExtra: "AQo, KQs" },
  "UTG+1": { value: "QQ+, AKs, AKo", call: "JJ-TT, AQs", callExtra: "AQo, KQs, 99" },
  "UTG+2": { value: "QQ+, AKs, AKo", call: "JJ-99, AQs, AJs", callExtra: "AQo, KQs, KJs" },
  LJ: { value: "QQ+, AKs, AKo", call: "JJ-99, AQs, AJs, KQs", callExtra: "AQo, ATs, KJs, QJs" },
  HJ: { value: "JJ+, AQs+, AKo", call: "TT-88, AJs, ATs, KQs, KJs, QJs, JTs", callExtra: "AQo, KQo, A9s, T9s" },
  CO: { value: "JJ+, AQs+, AKo", call: "TT-77, AJs-ATs, KQs, KJs, QJs, JTs, T9s", callExtra: "AQo, KQo, A9s, 98s" },
  BTN: { value: "TT+, AQs+, AKo", call: "99-66, AJs-A9s, KTs+, QTs+, JTs, T9s, 98s", callExtra: "AQo, KQo, KJo, 87s, A5s" },
  SB: { value: "JJ+, AQs+, AKo", call: "TT-88, AJs, ATs, KQs, KJs, QJs", callExtra: "AQo, A9s, JTs, T9s" },
};

// ---------------------------------------------------------------------------
// VS_4BET (Req 3.8) — jam value / call
// ---------------------------------------------------------------------------

const VS_4BET_RANGES: Record<string, ValueCall> = {
  LJ: { value: "KK+, AKs", call: "QQ, AKo", callExtra: "JJ" },
  HJ: { value: "KK+, AKs", call: "QQ, AKo", callExtra: "JJ, AQs" },
  CO: { value: "QQ+, AKs, AKo", call: "JJ, AQs", callExtra: "TT, AQo" },
  BTN: { value: "QQ+, AKs, AKo", call: "JJ-TT, AQs", callExtra: "99, AQo, A5s" },
  SB: { value: "QQ+, AKs, AKo", call: "JJ, AQs", callExtra: "TT, AQo" },
  BB: { value: "QQ+, AKs, AKo", call: "JJ-TT, AQs", callExtra: "99, AQo, A5s" },
};

// ---------------------------------------------------------------------------
// SQUEEZE (Req 3.6) — squeeze value / squeeze bluff / call
// ---------------------------------------------------------------------------

const SQUEEZE_RANGES: Record<string, DefendDef> = {
  HJ: { value: "QQ+, AKs, AKo", bluff: "A5s, A4s", call: "JJ-TT, AQs", callExtra: "AJs, KQs" },
  CO: { value: "JJ+, AQs+, AKo", bluff: "A5s, A4s, KJs", call: "TT-99, AJs, KQs", callExtra: "ATs, QJs, JTs" },
  BTN: { value: "JJ+, AQs+, AKo", bluff: "A5s-A3s, KJs, QJs", call: "TT-88, AJs-ATs, KQs, JTs", callExtra: "99, KJs, T9s, 98s" },
  SB: { value: "QQ+, AKs, AKo", bluff: "A5s, A4s", call: "JJ-99, AQs, AJs, KQs", callExtra: "ATs, QJs" },
  BB: { value: "JJ+, AQs+, AKo", bluff: "A5s-A3s, KJs", call: "TT-88, AJs-ATs, KQs, JTs, T9s", callExtra: "99, QJs, 98s" },
};

// ---------------------------------------------------------------------------
// VS_LIMP / Iso (Req 3.4, 3.13, 3.3) — iso value / over-limp / (BB check)
// ---------------------------------------------------------------------------

/** Iso-raise value range (vychází z legacy B2, value-heavy). */
const ISO_VALUE = "22+, A2s+, A9o+, K7s+, Q8s+, J8s+, T9s, 98s, 87s";
/** Ante-on rozšíření iso value. */
const ISO_VALUE_EXTRA = "K5s, Q6s, J7s, 76s, A7o, KJo";
/** Over-limp range (legacy B3): suited konektory/gappery navíc. */
const OVERLIMP_SPEC = "54s, 65s, 76s, 64s, 75s";
/** BB check (limp) range vs limpeři — široká, BB hraje zdarma. */
const BB_LIMP_SPEC =
  "K2s+, Q2s+, J4s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, K2o+, Q5o+, J7o+, T7o+, 97o+, 87o, 76o";

// ---------------------------------------------------------------------------
// BVB (Req 3.11) — SB open / BB obrana proti SB openu
// ---------------------------------------------------------------------------

/** SB open v BvB (širší než standardní RFI — pouze proti BB). */
const BVB_SB_OPEN: CoreExtra = {
  core:
    "22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K5o+, Q8o+, J8o+, T8o+, 98o",
  extra: "J2s, T4s, 95s, 53s, K2o, Q5o, J6o, T7o, 87o, 97o",
};

/** BB obrana proti SB openu (3bet value / 3bet bluff / call). */
const BVB_BB_DEFEND: DefendDef = {
  value: "TT+, AQs+, AKo",
  bluff: "A5s-A2s, K9s, Q9s, J9s, T9s",
  call:
    "99-22, A9s-A2s, K2s+, Q4s+, J6s+, T6s+, 96s+, 86s+, 76s, 65s, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o",
  callExtra: "Q2s, Q3s, J4s, J5s, T5s, 95s, 75s, 64s, K4o, Q6o, J6o, T6o, 87o",
};

// ---------------------------------------------------------------------------
// PUSH_FOLD (Req 3.9) — JAM ranges dle skupiny pozice a hloubky
// ---------------------------------------------------------------------------

type PosGroup = "early" | "mid" | "late" | "sb" | "bb";

function posGroup(pos: Position): PosGroup {
  if (pos === "UTG" || pos === "UTG+1" || pos === "UTG+2") return "early";
  if (pos === "LJ" || pos === "HJ") return "mid";
  if (pos === "CO" || pos === "BTN") return "late";
  if (pos === "SB") return "sb";
  return "bb";
}

/** JAM range při 5 BB (velmi široké). */
const JAM_5: Record<PosGroup, CoreExtra> = {
  early: { core: "22+, A2s+, A7o+, K9s+, KJo+, Q9s+, QJo, J9s+, T9s, 98s", extra: "A5o, K8s, KTo, J8s" },
  mid: { core: "22+, A2s+, A4o+, K6s+, K9o+, Q8s+, QTo+, J8s+, JTo, T8s+, 98s, 87s", extra: "A2o, K5s, K8o, Q7s, J9o, T9o" },
  late: { core: "22+, A2s+, A2o+, K2s+, K7o+, Q5s+, Q9o+, J7s+, J9o+, T7s+, T9o, 97s+, 87s, 76s, 65s", extra: "K4o, Q7o, J8o, T8o, 86s, 75s, 54s" },
  sb: { core: "22+, A2s+, A2o+, K2s+, K4o+, Q3s+, Q7o+, J5s+, J8o+, T5s+, T8o+, 95s+, 85s+, 75s+, 65s, 54s", extra: "Q2s, J3s, T4s, 94s, 84s, 74s, 64s, 53s, K2o, Q4o, J6o, T6o, 98o" },
  bb: { core: "22+, A2s+, A4o+, K6s+, K9o+, Q8s+, QTo+, J8s+, JTo, T8s+, 98s, 87s, 76s", extra: "A2o, K5s, K8o, Q7s, J9o, T9o, 65s" },
};

/** JAM range při 10 BB (užší než 5 BB). */
const JAM_10: Record<PosGroup, CoreExtra> = {
  early: { core: "66+, A8s+, ATo+, KTs+, KQo, QJs", extra: "55, A7s, A9o, K9s, KJo, QTs, JTs" },
  mid: { core: "44+, A5s+, ATo+, K9s+, KJo+, QTs+, JTs", extra: "33, A4s, A9o, K8s, KTo, Q9s, T9s, 98s" },
  late: { core: "22+, A2s+, A8o+, K8s+, KTo+, Q9s+, QJo, J9s+, T9s, 98s", extra: "A5o, A7o, K6s, K9o, Q8s, QTo, J8s, 87s" },
  sb: { core: "22+, A2s+, A5o+, K6s+, K9o+, Q8s+, QTo+, J8s+, T8s+, 98s, 87s", extra: "A2o, K4s, K8o, Q6s, Q9o, J7s, T7s, 76s, 65s" },
  bb: { core: "22+, A4s+, A8o+, K8s+, KTo+, Q9s+, QJo, J9s+, T9s", extra: "A2s, A6o, K6s, K9o, Q8s, QTo, J8s, 98s" },
};

// ---------------------------------------------------------------------------
// VS_ALLIN / Call-jam (Req 3.10) — call ranges dle skupiny a hloubky
// ---------------------------------------------------------------------------

/** Call vs jam při 5 BB (skvělé pot-odds → široký call). */
const CALLJAM_5: Record<PosGroup, CoreExtra> = {
  early: { core: "33+, A2s+, A7o+, K9s+, KJo+, QTs+, JTs", extra: "22, A5o, K8s, KTo, Q9s" },
  mid: { core: "22+, A2s+, A5o+, K8s+, KTo+, Q9s+, QJo, JTs, T9s", extra: "A3o, K6s, K9o, Q8s, J9s, 98s" },
  late: { core: "22+, A2s+, A3o+, K6s+, K9o+, Q8s+, QTo+, J9s+, T9s, 98s", extra: "A2o, K5s, K8o, Q7s, Q9o, J8s, 87s" },
  sb: { core: "22+, A2s+, A2o+, K5s+, K9o+, Q8s+, QTo+, J9s+, T9s, 98s, 87s", extra: "K3s, K7o, Q6s, Q9o, J8s, T8s, 76s, 65s" },
  bb: { core: "22+, A2s+, A2o+, K4s+, K8o+, Q7s+, Q9o+, J8s+, T8s+, 98s, 87s", extra: "K2s, K6o, Q6s, Q8o, J7s, T7s, 76s, 65s, 54s" },
};

/** Call vs jam při 10 BB (užší). */
const CALLJAM_10: Record<PosGroup, CoreExtra> = {
  early: { core: "66+, A9s+, AJo+, KQs", extra: "55, A8s, ATo, KJs, KQo" },
  mid: { core: "55+, A7s+, ATo+, KJs+, KQo", extra: "44, A5s, A9o, KTs, QJs" },
  late: { core: "44+, A5s+, A9o+, KTs+, KJo+, QJs", extra: "33, A4s, A8o, K9s, QTs, JTs" },
  sb: { core: "33+, A3s+, A8o+, KTs+, KJo+, QTs+, JTs", extra: "22, A2s, A7o, K9s, KTo, Q9s, T9s" },
  bb: { core: "22+, A2s+, A7o+, K9s+, KTo+, Q9s+, QJo, JTs, T9s", extra: "A5o, K8s, K9o, Q8s, J9s, 98s" },
};

// ---------------------------------------------------------------------------
// Pomocníci pro spojení core + (ante-on) extra
// ---------------------------------------------------------------------------

/** Spojí `core` a — pokud je ante zapnuté — i `extra` do jedné notace. */
function widen(ce: CoreExtra, wide: boolean): string {
  return wide ? `${ce.core}, ${ce.extra}` : ce.core;
}

/** Spojí základní a (ante-on) rozšiřující notaci. */
function widenSpec(base: string, extra: string, wide: boolean): string {
  return wide ? `${base}, ${extra}` : base;
}

// ---------------------------------------------------------------------------
// Sestavení segmentů pro jednotlivé kontexty
// ---------------------------------------------------------------------------

function rfiSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  const ce = OPEN_RANGES[pos];
  const k = openKeys(bucket);
  return [{ spec: widen(ce, wide), strict: k.strict, lenient: k.lenient }];
}

function defendSegments(def: DefendDef, wide: boolean): RangeSegment[] {
  return [
    { spec: def.value, strict: ["3BET"] },
    { spec: def.bluff, strict: ["3BET"] },
    { spec: widenSpec(def.call, def.callExtra, wide), strict: ["CALL"] },
  ];
}

function vs3betSegments(vc: ValueCall, wide: boolean): RangeSegment[] {
  return [
    { spec: vc.value, strict: ["4BET"] },
    { spec: widenSpec(vc.call, vc.callExtra, wide), strict: ["CALL"] },
  ];
}

function vs4betSegments(vc: ValueCall, wide: boolean): RangeSegment[] {
  return [
    { spec: vc.value, strict: ["JAM"] },
    { spec: widenSpec(vc.call, vc.callExtra, wide), strict: ["CALL"] },
  ];
}

function squeezeSegments(def: DefendDef, wide: boolean): RangeSegment[] {
  return [
    { spec: def.value, strict: ["SQUEEZE"] },
    { spec: def.bluff, strict: ["SQUEEZE"] },
    { spec: widenSpec(def.call, def.callExtra, wide), strict: ["CALL"] },
  ];
}

function isoSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  const k = isoKeys(bucket);
  const isoVal = widenSpec(ISO_VALUE, ISO_VALUE_EXTRA, wide);
  if (pos === "BB") {
    // BB čelící limpu(ům): iso value → ISO, ostatní hratelné → LIMP (check).
    return [
      { spec: isoVal, strict: k.strict, lenient: k.lenient },
      { spec: BB_LIMP_SPEC, strict: ["LIMP"] },
    ];
  }
  return [
    { spec: isoVal, strict: k.strict, lenient: k.lenient },
    { spec: OVERLIMP_SPEC, strict: ["OVERLIMP"] },
  ];
}

function bvbSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  if (pos === "SB") {
    const k = openKeys(bucket);
    return [{ spec: widen(BVB_SB_OPEN, wide), strict: k.strict, lenient: k.lenient }];
  }
  // BB obrana proti SB openu.
  return defendSegments(BVB_BB_DEFEND, wide);
}

function jamSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  const table = bucket === 5 ? JAM_5 : JAM_10;
  const ce = table[posGroup(pos)];
  return [{ spec: widen(ce, wide), strict: ["JAM"], lenient: ["JAM"] }];
}

function callJamSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  const table = bucket === 5 ? CALLJAM_5 : CALLJAM_10;
  const ce = table[posGroup(pos)];
  return [{ spec: widen(ce, wide), strict: ["CALL_JAM"], lenient: ["CALL_JAM"] }];
}

// ---------------------------------------------------------------------------
// Hlavní generátor souboru ranges pro variantu ante
// ---------------------------------------------------------------------------

/**
 * Sestaví kompletní `RangeFile` pro zvolenou variantu ante.
 *
 * Ante-on (`wide = true`) přidává „extra" segmenty (mírně širší ranges),
 * ante-off je užší. Vše je cEV bez ICM (Req 4.9).
 *
 * @param ante Varianta ante ("ON" / "OFF").
 * @param version Verze dat (např. "1.0.0").
 * @returns Naplněný `RangeFile` indexovaný Pozicí × Hloubkovým_košem × kontextem.
 */
export function buildAnteRangeFile(ante: AnteMode, version: string): RangeFile {
  const wide = ante === "ON";
  const entries: RangeRecord[] = [];

  // RFI/Open (Req 3.1) — pozice mimo BB × hluboké koše.
  for (const pos of RFI_POSITIONS) {
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "RFI", rfiSegments(pos, bucket, wide)));
    }
  }

  // VS_OPEN obrana (Req 3.5).
  for (const pos of DEFEND_POSITIONS) {
    const def = DEFEND_RANGES[pos];
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "VS_OPEN", defendSegments(def, wide)));
    }
  }

  // VS_3BET (Req 3.7).
  for (const pos of OPENER_POSITIONS) {
    const vc = VS_3BET_RANGES[pos];
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "VS_3BET", vs3betSegments(vc, wide)));
    }
  }

  // VS_4BET (Req 3.8).
  for (const pos of THREEBETTOR_POSITIONS) {
    const vc = VS_4BET_RANGES[pos];
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "VS_4BET", vs4betSegments(vc, wide)));
    }
  }

  // SQUEEZE (Req 3.6).
  for (const pos of SQUEEZE_POSITIONS) {
    const def = SQUEEZE_RANGES[pos];
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "SQUEEZE", squeezeSegments(def, wide)));
    }
  }

  // VS_LIMP / Iso (Req 3.3, 3.4, 3.13).
  for (const pos of ISO_POSITIONS) {
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "VS_LIMP", isoSegments(pos, bucket, wide)));
    }
  }

  // BVB (Req 3.11) — SB open / BB obrana.
  for (const pos of ["SB", "BB"] as Position[]) {
    for (const bucket of DEEP_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "BVB", bvbSegments(pos, bucket, wide)));
    }
  }

  // PUSH_FOLD (Req 3.9) — všechny pozice × krátké koše.
  for (const pos of POSITIONS_ALL) {
    for (const bucket of PUSH_FOLD_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "PUSH_FOLD", jamSegments(pos, bucket, wide)));
    }
  }

  // VS_ALLIN / Call-jam (Req 3.10) — všechny pozice × krátké koše.
  for (const pos of POSITIONS_ALL) {
    for (const bucket of PUSH_FOLD_BUCKETS) {
      entries.push(makeRecord(pos, bucket, "VS_ALLIN", callJamSegments(pos, bucket, wide)));
    }
  }

  return { version, ante, entries };
}

/** Všech 9 pozic (pro push/fold a vs-all-in pokrytí). */
const POSITIONS_ALL: Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];
