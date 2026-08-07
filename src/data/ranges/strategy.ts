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
import { REJAM_CALIBRATION_OPENER, REJAM_RANGES } from "./rejamRanges.generated";
import { CALL_REJAM_CALIBRATION_SHOVER, CALL_REJAM_RANGES } from "./callRejamRanges.generated";
import { BB_VS_SB_LIMP } from "./limpDefenceRanges.generated";
import { OPEN_JAM_RANGES } from "./openJamRanges.generated";
import { PUSH_FOLD_CHART } from "./pushFoldChart.generated";
import { expandTokens } from "./handExpand";

// ---------------------------------------------------------------------------
// Rozdělení košů (Req 2.3: ≤ 12 BB = push/fold)
// ---------------------------------------------------------------------------

/** Koše v režimu Push/Fold (≤ 12 BB) z definované sady: 5 a 10 BB. */
const PUSH_FOLD_BUCKETS: StackBucket[] = [5, 10];

/** Depths the owner's re-jam and calling-rejam sheets draw. */
const CALL_REJAM_BUCKETS: StackBucket[] = [15, 20, 25, 30];

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

/**
 * Opening ranges by stack depth, replacing the flat table from a given depth up.
 *
 * The flat table gave each seat one range from 15BB to 150BB. Checked against the
 * owner's purchased charts on 2026-07-30, every seat there widens with depth and
 * none of ours did: the button runs 40.3 to 46.9 percent between 25BB and 100BB,
 * the cutoff 30.3 to 32.4, the lojack 16.4 to 18.9, the hijack 22.6 to 25.5. One
 * number for both ends is wrong at both ends.
 *
 * The bands are the chart pack's own - it is organised 10-20BB, 20-40BB, 40-100BB
 * - rather than points interpolated between measurements, which would be
 * inventing data the source does not contain. Below 25BB the flat table stands,
 * and it was verified against the 10-20BB chart to a single hand class.
 *
 * These are the ante-off ranges, by the owner's decision: the depth curve is
 * taken as ante-off and the ante widening sits above it, which is why `extra`
 * still comes from the flat table. Ante is a property of the dead money, not of
 * the stack, so the same addition applies at every depth.
 */
interface DepthBand {
  /** Applies from this bucket upward, until a deeper band takes over. */
  fromBucket: number;
  core: string;
}

const DEPTH_OPEN_RANGES: Record<string, readonly DepthBand[]> = {
  UTG: [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, AKs, AQs, AJs, ATs, A9s, A8s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, AKo, AQo, AJo, KQo" },
    // Two hands were missing at this depth that the same seat opens at 25BB:
    // KQo and A8s. Under the gun was the only early seat to lose anything as
    // stacks deepened - UTG+1 and UTG+2 both keep KQo at 50 - and a seat that
    // opens tighter deep than shallow is wrong whatever the right width is,
    // because position and depth both argue the other way.
    //
    // A8s is here because the first reading of this band was wrong. It looked
    // like A9s and A8s had been traded for the wheel aces, which is a real
    // solver pattern and would have been left alone. But A9s is still here: only
    // A8s went, against four hands added. One out and four in is an omission,
    // not a strategy.
    //
    // Restored as transcription fixes, not as a re-reading of the chart. The
    // width question this seat still has - 13.6% here against roughly 17.6% in
    // two independent sources - is not answered by either hand and is documented
    // in Agents/reference-ranges/btn-rfi-mtt-regular.md.
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, AKs, AQs, AJs, ATs, A9s, A8s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, AKo, AQo, AJo, KQo" },
  ],
  "UTG+1": [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, AKs, AQs, AJs, ATs, A9s, A8s, A5s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, AKo, AQo, AJo, KQo" },
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, AKs, AQs, AJs, ATs, A9s, A8s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, AKo, AQo, AJo, KQo" },
  ],
  "UTG+2": [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, AKo, AQo, AJo, ATo, KQo" },
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, AKo, AQo, AJo, ATo, KQo, KJo" },
  ],
  CO: [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, QJs, QTs, Q9s, Q8s, JTs, J9s, J8s, T9s, T8s, 98s, 97s, 87s, 76s, 65s, AKo, AQo, AJo, ATo, A9o, A8o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, QJo, QTo, JTo" },
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, QJs, QTs, Q9s, Q8s, Q7s, JTs, J9s, J8s, J7s, T9s, T8s, T7s, 98s, 97s, 87s, 86s, 76s, 75s, 65s, 54s, AKo, AQo, AJo, ATo, A9o, A8o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, QJo, QTo, JTo" },
  ],
  BTN: [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, JTs, J9s, J8s, J7s, T9s, T8s, T7s, 98s, 97s, 96s, 87s, 86s, 85s, 76s, 75s, 65s, 64s, 54s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, K9o, QJo, QTo, Q9o, JTo, J9o, T9o" },
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, Q4s, Q3s, Q2s, JTs, J9s, J8s, J7s, J6s, J5s, J4s, J3s, J2s, T9s, T8s, T7s, T6s, T5s, T4s, 98s, 97s, 96s, 95s, 94s, 87s, 86s, 85s, 84s, 76s, 75s, 74s, 73s, 65s, 64s, 63s, 54s, 53s, 43s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, K9o, K8o, QJo, QTo, Q9o, JTo, J9o, T9o" },
  ],
  LJ: [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, QJs, QTs, Q9s, JTs, J9s, T9s, 98s, AKo, AQo, AJo, ATo, KQo, KJo" },
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, QJs, QTs, Q9s, JTs, J9s, T9s, 98s, 87s, 76s, AKo, AQo, AJo, ATo, KQo, KJo" },
  ],
  HJ: [
    { fromBucket: 25, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, QJs, QTs, Q9s, Q8s, JTs, J9s, J8s, T9s, T8s, 98s, 97s, 87s, 76s, AKo, AQo, AJo, ATo, A9o, KQo, KJo, KTo, QJo, QTo" },
    { fromBucket: 50, core: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, QJs, QTs, Q9s, Q8s, JTs, J9s, J8s, T9s, T8s, 98s, 97s, 87s, 76s, 65s, 54s, AKo, AQo, AJo, ATo, A9o, KQo, KJo, KTo, QJo, QTo, JTo" },
  ],
};

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

/**
 * Big-blind defence by stack depth, from the owner's charts.
 *
 * The flat table defended 21.6 percent at every depth against every opener. The
 * charts defend 35.1 percent at 12-20BB, 52.0 at 25-35 and 66.5 at 40-50, so at
 * fifty big blinds against a normal button open this was short by more than forty
 * points - in the spot that reaches more flops than any other. Folding two thirds
 * of a range that should defend two thirds gives up the pot odds the blind exists
 * to use.
 *
 * Calibrated to the sheets' 45 percent opener column. The sheets also vary
 * defence by how wide the opener was - 6 to 13 points across their 40, 45 and 50
 * percent columns - and this model has no such dimension. Adding one is a model
 * change, and being forty points out matters more than being six, so the width is
 * corrected first and that axis can follow.
 *
 * Below 15BB the flat table stands; the sheets begin at 12-20BB.
 */
interface DepthDefendBand {
  fromBucket: number;
  value: string;
  bluff: string;
  call: string;
}

const DEPTH_DEFEND_RANGES: Record<string, readonly DepthDefendBand[]> = {
  BB: [
    { fromBucket: 15, value: "AA, KK, QQ, AKs", bluff: "A5s, A4s, A3s, A2s", call: "JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AQs, AJs, ATs, A9s, A8s, A7s, A6s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, Q4s, Q3s, JTs, J9s, J8s, J7s, J6s, J5s, T9s, T8s, T7s, T6s, 98s, 97s, 96s, 95s, 87s, 86s, 85s, 84s, 76s, 75s, 74s, 73s, 65s, 64s, 63s, 62s, 54s, 53s, 52s, 43s, 42s, 32s, AKo, AQo, AJo, ATo, A9o, KQo, KJo, KTo, QJo, QTo, JTo" },
    { fromBucket: 25, value: "AA, KK, QQ, JJ, TT, AKs, AQs, KQs, AKo, AQo", bluff: "85s, 75s, 74s, 65s, 64s, 63s, 54s, 53s, 43s", call: "99, 88, 77, 66, 55, 44, 33, 22, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, Q4s, Q3s, Q2s, JTs, J9s, J8s, J7s, J6s, J5s, J4s, J3s, J2s, T9s, T8s, T7s, T6s, T5s, T4s, T3s, T2s, 98s, 97s, 96s, 95s, 94s, 93s, 92s, 87s, 86s, 84s, 83s, 82s, 76s, 73s, 72s, 62s, 52s, 42s, 32s, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, KQo, KJo, KTo, K9o, QJo, QTo, Q9o, JTo, J9o, T9o, T8o, 98o, 87o, 76o" },
    { fromBucket: 40, value: "AA, KK, QQ, JJ, TT, 99, AKs, AQs, AJs, KQs, KJs, AKo, AQo, AJo, KQo", bluff: "85s, 84s, 75s, 74s, 64s, 63s, 54s, 53s, 43s", call: "88, 77, 66, 55, 44, 33, 22, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, Q4s, Q3s, Q2s, JTs, J9s, J8s, J7s, J6s, J5s, J4s, J3s, J2s, T9s, T8s, T7s, T6s, T5s, T4s, T3s, T2s, 98s, 97s, 96s, 95s, 94s, 93s, 92s, 87s, 86s, 83s, 82s, 76s, 73s, 72s, 65s, 62s, 52s, 42s, 32s, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KJo, KTo, K9o, K8o, K7o, K6o, K5o, K4o, QJo, QTo, Q9o, Q8o, Q7o, JTo, J9o, J8o, T9o, T8o, T7o, 98o, 97o, 87o, 86o, 76o, 75o, 65o, 64o, 54o" },
  ],
};

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

/**
 * Ten-big-blind jam ranges per seat, from the owner's pushing sheets.
 *
 * The grouped table below put the cutoff and the button in one "late" bucket at
 * 22.2 percent. The sheets have the cutoff at 40.0 and the button at 53.8 - a
 * fourteen point spread inside a single group, so the grouping was baking in an
 * error whichever way it was set. Every seat measured is roughly double what the
 * group gave it, and the small blind is more than double.
 *
 * These are the LOWER bound. The sheets draw blue, white and a cream, carry no
 * legend, and the cream sits within a luminance point of the white - so it cannot
 * be told from a fold by shade. Only the blue is unambiguously a jam, so only the
 * blue is taken. If the cream turns out to be a jam too these are still short by
 * up to nineteen points, and if it is a fold they are exact; what they cannot be
 * is too wide. The small blind's grid has no cream at all, so its 74.7 percent is
 * not a bound but the figure.
 *
 * Early position keeps the grouped table: its sheet names three seats and the
 * detector finds two grids on it, so which grid is which seat is not established,
 * and attributing a range to the wrong seat is worse than leaving a known-narrow
 * one in place.
 */
const JAM_10_BY_SEAT: Readonly<Record<string, string>> = {
  BTN: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, Q4s, Q3s, Q2s, JTs, J9s, J8s, J7s, J6s, J5s, J4s, J3s, J2s, T9s, T8s, T7s, T6s, 98s, 97s, 96s, 95s, 87s, 86s, 85s, 84s, 76s, 75s, 74s, 65s, 64s, 63s, 54s, 53s, 43s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, K9o, K8o, K7o, K6o, K5o, QJo, QTo, Q9o, Q8o, JTo, J9o, J8o, T9o, T8o, 98o, 97o, 87o",
  SB: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, Q5s, Q4s, Q3s, Q2s, JTs, J9s, J8s, J7s, J6s, J5s, J4s, J3s, J2s, T9s, T8s, T7s, T6s, T5s, T4s, T3s, T2s, 98s, 97s, 96s, 95s, 94s, 93s, 92s, 87s, 86s, 85s, 84s, 83s, 82s, 76s, 75s, 74s, 73s, 72s, 65s, 64s, 63s, 62s, 54s, 53s, 52s, 43s, 42s, 32s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, K9o, K8o, K7o, K6o, K5o, K4o, K3o, K2o, QJo, QTo, Q9o, Q8o, Q7o, Q6o, Q5o, Q4o, Q3o, Q2o, JTo, J9o, J8o, J7o, J6o, T9o, T8o, T7o, T6o, 98o, 97o, 96o, 87o, 86o, 76o, 75o, 65o",
  LJ: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, QJs, QTs, Q9s, Q8s, JTs, J9s, J8s, T9s, T8s, T7s, 98s, 97s, 87s, 76s, 65s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, KQo, KJo, KTo, QJo, QTo, JTo",
  HJ: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, QJs, QTs, Q9s, Q8s, Q7s, JTs, J9s, J8s, J7s, T9s, T8s, T7s, 98s, 97s, 87s, 86s, 76s, 75s, 65s, 54s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, QJo, QTo, JTo",
  CO: "AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, AKs, AQs, AJs, ATs, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, KQs, KJs, KTs, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, QJs, QTs, Q9s, Q8s, Q7s, Q6s, JTs, J9s, J8s, J7s, T9s, T8s, T7s, T6s, 98s, 97s, 96s, 87s, 86s, 76s, 75s, 65s, 64s, 54s, AKo, AQo, AJo, ATo, A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, KQo, KJo, KTo, K9o, QJo, QTo, Q9o, JTo, J9o, T9o",
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

/**
 * Hands that shove rather than open at this depth, from the 10-20BB sheets.
 *
 * Each hand carries the stack below which it goes in, so a hand jams when the
 * bucket sits under its threshold. At our bucket spacing that bites only at
 * 15BB, and only where a sheet drew a 20BB threshold - the button's small pairs
 * and the cutoff's - because the sheets' other thresholds, 12 and 15, fall at or
 * below buckets we do not hold. The full measurement is kept in
 * OPEN_JAM_RANGES so a finer bucket would need no re-reading.
 */
function openJamAt(pos: Position, bucket: StackBucket): string[] {
  const row = OPEN_JAM_RANGES.find((item) => item.seat === pos);
  if (row === undefined) return [];
  return Object.entries(row.thresholds)
    .filter(([, threshold]) => threshold > bucket)
    .map(([hand]) => hand)
    .sort();
}

function rfiSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  // The deepest band whose threshold this bucket has reached, else the flat
  // table. Below 25BB that table stands: a single opening range stops being the
  // model there at all, and the charts confirm it - the button has an openraise
  // range and three jam thresholds, not one range.
  const band = (DEPTH_OPEN_RANGES[pos] ?? [])
    .filter((item) => bucket >= item.fromBucket)
    .sort((left, right) => right.fromBucket - left.fromBucket)[0];
  const flat = OPEN_RANGES[pos];
  const ce = band === undefined ? flat : { core: band.core, extra: flat.extra };
  const k = openKeys(bucket);
  const open: RangeSegment = { spec: widen(ce, wide), strict: k.strict, lenient: k.lenient };

  // Listed *before* the open, because the first segment to name a hand wins and
  // these hands are inside the opening range - the sheet moves them from raising
  // to shoving rather than adding them. Putting it second silently did nothing.
  const jam = openJamAt(pos, bucket);
  return jam.length > 0
    ? [{ spec: jam.join(", "), strict: ["JAM"] }, open]
    : [open];
}

/**
 * Why the early seats step down at the 20 to 25BB seam, and why that stands.
 *
 * The measured bands start above twenty big blinds and are narrower than the
 * flat table they replace: under the gun 14.9 percent at 20BB and 11.2 at 25,
 * the lojack 20.1 and 16.4, with the same shape at UTG+1 and UTG+2. What they
 * drop is mostly the small pairs.
 *
 * That looked backwards - a small pair is a set-mining hand, implied odds
 * improve with depth, and the table opened them only while stacks were short -
 * so a rule was added carrying every pair and suited hand up from the shallower
 * range. It has been removed again, because it fixed the wrong end.
 *
 * Two independent published references put nine-handed UTG at about 11.4 percent
 * (one MTT chart set at 75BB with antes, one full-ring cash guide at 11.5). Our
 * measured deep bands were 11.2 to 12.7 - within a point of both. The carry rule
 * pushed them to 15.5 ante off and 16.7 ante on, four to five points above two
 * sources that agree with each other.
 *
 * So the outlier is the flat 20BB table, not the bands. And the set-mining
 * argument reverses on inspection: at twenty big blinds a small pair from under
 * the gun has no implied odds to mine for - the stacks are too shallow to get
 * paid - while at a hundred they do. Opening them shallow and folding them deep
 * is wrong in the direction the flat table is wrong, and propagating it upward
 * made four seats wrong instead of one.
 *
 * The corroboration that persuaded me was also weaker than it looked: the 40BB
 * UTG postflop solves were built at about 15 percent, and I read landing within
 * two tenths of that as confirmation. Those solves take their hero range from
 * the same lineage as the flat table, and the consistency test in this repo
 * already warns in as many words that a pack agreeing with a solve proves
 * nothing about either.
 *
 * Left as it is until the 20BB end can be re-measured. The seam is real and
 * documented in Agents/reference-ranges/btn-rfi-mtt-regular.md; closing it by
 * widening the end that matches the evidence was the wrong repair.
 */

/**
 * Re-jam over an open, for the depths the owner's sheets cover.
 *
 * Between roughly twelve and thirty big blinds the shove is the main answer to an
 * open, and the model had no way to say so: PUSH_FOLD stops at 12BB and VS_OPEN
 * above it offered only CALL and 3BET, so a player at twenty big blinds was being
 * taught deep-stack shapes. The sheets give each hand the deepest stack at which
 * it jams, so the range at a bucket is every hand whose threshold reaches it -
 * which is why these get narrower as stacks get deeper, not wider.
 *
 * Calibrated to one opener per hero, listed in REJAM_CALIBRATION_OPENER, because
 * VS_OPEN has no opener axis. That axis matters here more than anywhere else -
 * the big blind re-jams 33 percent over a button open at 15BB and 9.8 percent
 * over an early one - so the measured ranges for every opener are kept in
 * REJAM_RANGES and only collapsed at this one point.
 */
function rejamSegments(pos: Position, bucket: StackBucket): RangeSegment[] {
  const opener = REJAM_CALIBRATION_OPENER[pos];
  if (opener === undefined) return [];
  const row = REJAM_RANGES.find((item) => item.hero === pos && item.opener === opener);
  if (row === undefined) return [];

  // Above the deepest threshold the sheets draw, there is no jam to make. Left as
  // "no segment" rather than an empty range so the flat defence is untouched at
  // the depths the charts say nothing about.
  const jam = Object.entries(row.thresholds)
    .filter(([, threshold]) => threshold >= bucket)
    .map(([hand]) => hand);
  if (jam.length === 0) return [];

  return [
    { spec: jam.join(", "), strict: ["JAM"] },
    // The sheets' salmon band three-bets and calls the four-bet rather than
    // jamming, at every depth they cover. It reaches the same stack in the middle
    // but keeps worse hands in, so it is kept as its own action.
    { spec: row.threeBetCall.join(", "), strict: ["3BET"] },
  ];
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

/**
 * The big blind against a small-blind limp, from the owner's chart.
 *
 * The flat table raised one range at every depth. The sheet's raise width barely
 * moves - 37.0, 34.5, 38.5 percent - but what it is made of changes completely:
 * at 15-20BB more than half of it is a shove, and by 30BB there is no shove at
 * all. So the width was never the error; teaching a raise where the chart shoves
 * was, and one range per seat cannot express the difference.
 *
 * Only the big blind has a sheet, and only against the small blind. The other
 * seats keep the flat table rather than borrowing this curve.
 */
function bbLimpSegments(bucket: StackBucket, wide: boolean): RangeSegment[] | null {
  const band = BB_VS_SB_LIMP
    .filter((item) => bucket >= item.fromBucket)
    .sort((left, right) => right.fromBucket - left.fromBucket)[0];
  if (band === undefined) return null;

  const k = isoKeys(bucket);
  const segments: RangeSegment[] = [];
  if (band.jam.length > 0) segments.push({ spec: band.jam.join(", "), strict: ["JAM"] });
  segments.push({ spec: band.iso.join(", "), strict: k.strict, lenient: k.lenient });
  // Checking the option is the rest of the grid, so the sheet leaves no folds -
  // which is right, since nobody folds a big blind that is already in for free.
  segments.push({ spec: band.check.join(", "), strict: ["LIMP"] });
  void wide; // the sheet is one measurement; it does not vary with ante.
  return segments;
}

function isoSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  const k = isoKeys(bucket);
  const isoVal = widenSpec(ISO_VALUE, ISO_VALUE_EXTRA, wide);
  if (pos === "BB") {
    const measured = bbLimpSegments(bucket, wide);
    if (measured !== null) return measured;
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

/**
 * Jam ranges from the owner's push/fold chart, which is the owner's own baseline.
 *
 * The Kompendium settles what were three disagreeing sources: section 4.2 says
 * "Chart jako baseline. Chart upravuj podle ICM..." and embeds this chart as its
 * appendix. So where the chart speaks, it wins - including over the RYE pushing
 * sheets, which had the button eleven points wider at 10BB than the chart and
 * seven points wider than the RYE opening sheet's own thresholds. A reading that
 * exceeds both of the other sources is not the lower bound it was taken for.
 *
 * The chart states 10 percent antes, so it is an ante-on source. That also makes
 * it a ceiling for ante-off: a smaller pot cannot justify a wider shove, so the
 * ante-off range is the narrower of what we held and what the chart gives.
 */
function chartJam(pos: Position, bucket: StackBucket, wide: boolean, fallback: string): string {
  const row = PUSH_FOLD_CHART.find((item) => item.bb === bucket && item.seat === pos);
  if (row === undefined) return fallback;
  if (wide) return row.hands.join(", ");
  // Ante-off: keep whichever is narrower, hand class by hand class. The held spec
  // is written in range shorthand ("22+, A2s+"), so it has to be expanded before
  // it can be intersected - comparing the shorthand directly matched almost
  // nothing and collapsed the 5BB ante-off ranges to about one percent.
  const chart = new Set(row.hands);
  const narrower = expandTokens(fallback).filter((hand) => chart.has(hand));
  return narrower.length > 0 ? narrower.join(", ") : row.hands.join(", ");
}

function jamSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  // A per-seat 10BB range wins over the group where the sheets establish one.
  // The ante widening still comes from the group, because ante is a property of
  // the dead money rather than of the seat.
  const table = bucket === 5 ? JAM_5 : JAM_10;
  const ce = table[posGroup(pos)];
  const measured = bucket === 10 ? JAM_10_BY_SEAT[pos] : undefined;
  const held = measured === undefined
    ? widen(ce, wide)
    : widenSpec(measured, ce.extra, wide);
  return [{ spec: chartJam(pos, bucket, wide, held), strict: ["JAM"], lenient: ["JAM"] }];
}

function callJamSegments(pos: Position, bucket: StackBucket, wide: boolean): RangeSegment[] {
  const table = bucket === 5 ? CALLJAM_5 : CALLJAM_10;
  const ce = table[posGroup(pos)];
  return [{ spec: widen(ce, wide), strict: ["CALL_JAM"], lenient: ["CALL_JAM"] }];
}

/**
 * Calling a re-jam between 15 and 30BB, from the owner's charts.
 *
 * The other half of rejamSegments. Teaching a player to shove over an open at
 * twenty big blinds without telling the opener what to call with would leave the
 * spot half described, and VS_ALLIN held nothing above 10BB - so an opener facing
 * a shove at those depths had no answer at all.
 *
 * Calibrated to the big blind shoving, for every hero: it is the widest re-jammer
 * by a distance, the only seat present on all the sheets, and it is the range we
 * now teach the big blind to shove, so both sides of the spot agree.
 *
 * Seats the sheets do not cover keep having nothing here rather than borrowing a
 * neighbour's range.
 */
function callRejamSegments(pos: Position, bucket: StackBucket): RangeSegment[] {
  const row = CALL_REJAM_RANGES.find(
    (item) => item.hero === pos && item.shover === CALL_REJAM_CALIBRATION_SHOVER,
  );
  if (row === undefined) return [];
  const call = Object.entries(row.thresholds)
    .filter(([, threshold]) => threshold >= bucket)
    .map(([hand]) => hand);
  if (call.length === 0) return [];
  return [{ spec: call.join(", "), strict: ["CALL_JAM"], lenient: ["CALL_JAM"] }];
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
    for (const bucket of DEEP_BUCKETS) {
      // The deepest charted band this bucket has reached, else the flat table.
      // The ante-on call extension stays with the flat table: ante is a property
      // of the dead money, not of the stack.
      const flat = DEFEND_RANGES[pos];
      const band = (DEPTH_DEFEND_RANGES[pos] ?? [])
        .filter((item) => bucket >= item.fromBucket)
        .sort((left, right) => right.fromBucket - left.fromBucket)[0];
      const def: DefendDef = band === undefined
        ? flat
        : { value: band.value, bluff: band.bluff, call: band.call, callExtra: flat.callExtra };
      // The re-jam goes in front of the flat defence, not instead of it: the
      // sheets it comes from describe only the shoving branch, and the pack keeps
      // flatting and three-betting on separate sheets of its own.
      entries.push(makeRecord(pos, bucket, "VS_OPEN", [
        ...rejamSegments(pos, bucket),
        ...defendSegments(def, wide),
      ]));
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
    // And the charted depths above them, where the answer used to be nothing.
    for (const bucket of CALL_REJAM_BUCKETS) {
      const segments = callRejamSegments(pos, bucket);
      if (segments.length > 0) entries.push(makeRecord(pos, bucket, "VS_ALLIN", segments));
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
