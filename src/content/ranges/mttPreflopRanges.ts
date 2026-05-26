import type { ActionId, RangeCell, RangeCellWeight } from "../../domain/spot";
import type { RangeProfile } from "../../domain/rangeProfile";

function makeCells(
  action: ActionId,
  weight: RangeCellWeight,
  hands: readonly string[],
): readonly RangeCell[] {
  return hands.map((hand) => ({ hand, action, weight }));
}

function makeRange(groups: readonly (readonly RangeCell[])[]): readonly RangeCell[] {
  const byHand = new Map<string, RangeCell>();

  for (const group of groups) {
    for (const cell of group) {
      byHand.set(cell.hand, cell);
    }
  }

  return Array.from(byHand.values());
}

function makeProfile(profile: RangeProfile): RangeProfile {
  return profile;
}

const PAIRS = ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22"] as const;
const SUITED_ACES = ["AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s"] as const;
const OFFSUIT_ACES = ["AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o"] as const;
const SUITED_KINGS = ["KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s"] as const;
const OFFSUIT_KINGS = ["KQo", "KJo", "KTo", "K9o", "K8o", "K7o", "K6o", "K5o", "K4o", "K3o", "K2o"] as const;
const SUITED_QUEENS = ["QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s"] as const;
const OFFSUIT_QUEENS = ["QJo", "QTo", "Q9o", "Q8o", "Q7o", "Q6o", "Q5o", "Q4o", "Q3o", "Q2o"] as const;
const SUITED_JACKS = ["JTs", "J9s", "J8s", "J7s", "J6s", "J5s", "J4s", "J3s", "J2s"] as const;
const OFFSUIT_JACKS = ["JTo", "J9o", "J8o", "J7o", "J6o", "J5o", "J4o", "J3o", "J2o"] as const;
const SUITED_TENS = ["T9s", "T8s", "T7s", "T6s", "T5s", "T4s", "T3s", "T2s"] as const;
const OFFSUIT_TENS = ["T9o", "T8o", "T7o", "T6o", "T5o", "T4o", "T3o", "T2o"] as const;
const SUITED_NINES = ["98s", "97s", "96s", "95s", "94s", "93s", "92s"] as const;
const OFFSUIT_NINES = ["98o", "97o", "96o", "95o", "94o", "93o", "92o"] as const;
const SUITED_EIGHTS = ["87s", "86s", "85s", "84s", "83s", "82s"] as const;
const OFFSUIT_EIGHTS = ["87o", "86o", "85o", "84o", "83o", "82o"] as const;
const SUITED_SEVENS = ["76s", "75s", "74s", "73s", "72s"] as const;
const OFFSUIT_SEVENS = ["76o", "75o", "74o", "73o", "72o"] as const;
const SUITED_SIXES = ["65s", "64s", "63s", "62s"] as const;
const OFFSUIT_SIXES = ["65o", "64o", "63o", "62o"] as const;
const SUITED_FIVES = ["54s", "53s", "52s"] as const;
const OFFSUIT_FIVES = ["54o", "53o", "52o"] as const;
const SUITED_FOURS = ["43s", "42s"] as const;
const OFFSUIT_FOURS = ["43o", "42o"] as const;
const SUITED_THREES = ["32s"] as const;
const OFFSUIT_THREES = ["32o"] as const;

export const MTT_OPEN_BTN_21_25BB = makeRange([
  makeCells("OPEN", "pure", [
    ...PAIRS,
    ...SUITED_ACES,
    ...SUITED_KINGS,
    ...SUITED_QUEENS,
    ...SUITED_JACKS,
    ...SUITED_TENS,
    ...SUITED_NINES,
    ...SUITED_EIGHTS,
    ...SUITED_SEVENS,
    "65s",
    "64s",
    "54s",
    ...OFFSUIT_ACES,
    "KQo",
    "KJo",
    "KTo",
    "QJo",
    "QTo",
    "JTo",
    "T9o",
  ]),
  makeCells("OPEN", "mix", [
    "K9o",
    "K8o",
    "K7o",
    "Q9o",
    "Q8o",
    "Q7o",
    "J9o",
    "J8o",
    "T8o",
    "98o",
    "63s",
    "53s",
    "43s",
    "Q5s",
    "J5s",
    "T5s",
    "95s",
    "85s",
    "75s",
  ]),
  makeCells("FOLD", "pure", ["Q5o", "Q4o", "J5o", "T4o", "94o", "83o", "72o"]),
]);

export const MTT_OPEN_CO_HJ_21_25BB = makeRange([
  makeCells("OPEN", "pure", [
    ...PAIRS,
    ...SUITED_ACES,
    "KQs",
    "KJs",
    "KTs",
    "K9s",
    "QJs",
    "QTs",
    "Q9s",
    "JTs",
    "J9s",
    "T9s",
    "T8s",
    "98s",
    "87s",
    "76s",
    "65s",
    "54s",
    "AKo",
    "AQo",
    "AJo",
    "ATo",
    "KQo",
    "KJo",
    "QJo",
    "QTo",
    "JTo",
  ]),
  makeCells("OPEN", "mix", [
    "K8s",
    "K7s",
    "K6s",
    "K5s",
    "Q8s",
    "J8s",
    "T7s",
    "97s",
    "86s",
    "75s",
    "64s",
    "A9o",
    "A8o",
    "KTo",
    "K9o",
    "Q9o",
    "J9o",
    "T9o",
  ]),
  makeCells("FOLD", "pure", ["Q8o", "K9o", "J8o", "T8o", "96o", "72o"]),
]);

export const MTT_OPEN_SB_21_25BB = makeRange([
  makeCells("OPEN", "pure", [
    ...PAIRS,
    ...SUITED_ACES,
    ...SUITED_KINGS,
    ...SUITED_QUEENS,
    ...SUITED_JACKS,
    ...SUITED_TENS,
    ...SUITED_NINES,
    ...SUITED_EIGHTS,
    ...SUITED_SEVENS,
    ...SUITED_SIXES,
    ...SUITED_FIVES,
    ...SUITED_FOURS,
    ...SUITED_THREES,
    ...OFFSUIT_ACES,
    "KQo",
    "KJo",
    "KTo",
    "K9o",
    "K8o",
    "QJo",
    "QTo",
    "Q9o",
    "JTo",
    "J9o",
    "T9o",
  ]),
  makeCells("OPEN", "mix", [
    "K7o",
    "K6o",
    "K5o",
    "K4o",
    "Q8o",
    "Q7o",
    "Q6o",
    "Q5o",
    "Q4o",
    "J8o",
    "J7o",
    "J6o",
    "T8o",
    "T7o",
    "T6o",
    "T5o",
    "T4o",
    "98o",
    "97o",
    "96o",
    "86o",
    "85o",
    "75o",
    "64o",
    "54o",
  ]),
  makeCells("FOLD", "pure", ["94o", "92o", "83o", "82o", "72o", "62o", "52o", "42o", "32o"]),
]);

export const MTT_OPEN_BTN_15_20BB = makeRange([
  MTT_OPEN_BTN_21_25BB,
  makeCells("OPEN", "mix", ["K8o", "Q8o", "J9o", "Q5s", "J5s", "T5s", "95s", "85s"]),
  makeCells("FOLD", "pure", [
    "K7o",
    "Q7o",
    "J8o",
    "T8o",
    "98o",
    "63s",
    "53s",
    "43s",
    "75s",
  ]),
]);

export const MTT_OPEN_CO_HJ_15_20BB = makeRange([
  MTT_OPEN_CO_HJ_21_25BB,
  makeCells("OPEN", "mix", ["K8s", "K7s", "A9o"]),
  makeCells("FOLD", "pure", [
    "K6s",
    "K5s",
    "Q8s",
    "J8s",
    "T7s",
    "97s",
    "86s",
    "75s",
    "64s",
    "A8o",
    "KTo",
    "K9o",
    "Q9o",
    "J9o",
    "T9o",
  ]),
]);

export const MTT_OPEN_SB_15_20BB = makeRange([
  MTT_OPEN_SB_21_25BB,
  makeCells("OPEN", "mix", ["K6o", "Q7o", "J8o", "T7o", "98o", "86o"]),
  makeCells("FOLD", "pure", [
    "K5o",
    "K4o",
    "Q6o",
    "Q5o",
    "Q4o",
    "J7o",
    "J6o",
    "T6o",
    "T5o",
    "T4o",
    "97o",
    "96o",
    "85o",
    "75o",
    "64o",
    "54o",
  ]),
]);

export const MTT_ISO_CO_HJ_LIMP_15_25BB = makeRange([
  makeCells("RAISE", "pure", [
    "AA",
    "KK",
    "QQ",
    "JJ",
    "TT",
    "99",
    "88",
    ...SUITED_ACES,
    "AKo",
    "AQo",
    "AJo",
    "ATo",
    "KQs",
    "KJs",
    "KTs",
    "QJs",
    "QTs",
    "JTs",
    "KQo",
    "KJo",
    "QJo",
  ]),
  makeCells("RAISE", "mix", [
    "77",
    "66",
    "55",
    "44",
    "A9o",
    "A8o",
    "A7o",
    "KTo",
    "QTo",
    "JTo",
    "K9s",
    "Q9s",
    "J9s",
    "T9s",
    "98s",
    "87s",
    "76s",
    "65s",
    "54s",
  ]),
  makeCells("CALL", "mix", ["33", "22", "T8s", "97s", "86s", "75s", "64s", "53s"]),
  makeCells("FOLD", "pure", ["K8o", "Q9o", "J8o", "T7o", "72o"]),
]);

export const MTT_ISO_BTN_LIMP_15_25BB = makeRange([
  MTT_ISO_CO_HJ_LIMP_15_25BB,
  makeCells("RAISE", "mix", ["K9o", "K8s", "Q9o", "Q8s", "J8s", "T8o", "98o", "85s", "74s", "63s", "A6o", "A5o"]),
  makeCells("FOLD", "pure", ["K8o", "Q7o", "J7o", "72o"]),
]);

export const MTT_ISO_SB_VS_BTN_LIMP_15_25BB = makeRange([
  makeCells("RAISE", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", ...SUITED_ACES, "AKo", "AQo", "AJo", "ATo", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "KQo", "KJo", "QJo"]),
  makeCells("RAISE", "mix", ["77", "66", "55", "A9o", "A8o", "KTo", "QTo", "JTo", "T9s", "98s", "87s", "86s"]),
  makeCells("CALL", "mix", ["44", "33", "22", "T8s", "97s", "76s", "65s", "64s", "54s"]),
  makeCells("FOLD", "mix", ["54s", "43s", "K8o", "Q8o", "J7o"]),
]);

export const MTT_ISO_BB_VS_SB_LIMP_15_25BB = makeRange([
  makeCells("RAISE", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", ...SUITED_ACES, "AKo", "AQo", "AJo", "ATo", "A9o", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "KQo", "KJo", "QJo"]),
  makeCells("RAISE", "mix", ["66", "55", "44", "A8o", "A7o", "A2o", "KTo", "K9o", "Q9s", "Q9o", "J9s", "T9s", "98s", "87s"]),
  makeCells("CHECK", "pure", ["74o", "73o", "72o", "63o", "62o", "53o", "52o", "43o", "42o", "32o"]),
  makeCells("CHECK", "mix", ["T4o", "94o", "84o", "75o", "65o", "54o"]),
]);

export const MTT_ISO_CO_HJ_LIMP_21_25BB = MTT_ISO_CO_HJ_LIMP_15_25BB;
export const MTT_ISO_BTN_LIMP_21_25BB = MTT_ISO_BTN_LIMP_15_25BB;
export const MTT_ISO_SB_VS_BTN_LIMP_21_25BB = MTT_ISO_SB_VS_BTN_LIMP_15_25BB;
export const MTT_ISO_BB_VS_SB_LIMP_21_25BB = MTT_ISO_BB_VS_SB_LIMP_15_25BB;

export const MTT_ISO_CO_HJ_LIMP_15_20BB = makeRange([
  MTT_ISO_CO_HJ_LIMP_21_25BB,
  makeCells("CALL", "mix", ["A7o", "KTo", "QTo", "JTo", "K9s", "Q9s", "J9s", "T9s", "98s", "87s"]),
  makeCells("FOLD", "pure", ["77", "66", "55", "44", "A8o", "76s", "65s", "54s"]),
]);

export const MTT_ISO_BTN_LIMP_15_20BB = makeRange([
  MTT_ISO_BTN_LIMP_21_25BB,
  makeCells("CALL", "mix", ["A6o", "A5o", "K9o", "K8s", "Q9o", "Q8s", "J8s", "T8o", "98o"]),
  makeCells("FOLD", "pure", ["74s", "63s", "A4s", "85s"]),
]);

export const MTT_ISO_SB_VS_BTN_LIMP_15_20BB = makeRange([
  MTT_ISO_SB_VS_BTN_LIMP_21_25BB,
  makeCells("FOLD", "pure", ["77", "66", "55", "A9o", "A8o", "KTo", "QTo", "JTo", "T9s", "98s", "87s", "86s"]),
  makeCells("CALL", "mix", ["44", "33", "22"]),
]);

export const MTT_ISO_BB_VS_SB_LIMP_15_20BB = makeRange([
  MTT_ISO_BB_VS_SB_LIMP_21_25BB,
  makeCells("CHECK", "pure", ["66", "55", "44", "A8o", "A7o", "A2o", "KTo", "K9o", "Q9o", "T9s", "98s", "87s"]),
  makeCells("RAISE", "mix", ["74o", "73o", "72o", "63o", "62o", "53o", "52o", "43o", "42o", "32o"]),
]);

export const MTT_BB_DEFEND_BTN_2_5X = makeRange([
  makeCells("RAISE", "mix", ["AA", "KK", "QQ", "JJ", "TT", "AKs", "AQs", "AJs", "ATs", "A5s", "A4s", "AKo", "AQo", "KQs"]),
  makeCells("CALL", "pure", [
    "99",
    "88",
    "77",
    "66",
    "55",
    "44",
    "33",
    "22",
    ...SUITED_ACES,
    ...SUITED_KINGS,
    ...SUITED_QUEENS,
    "JTs",
    "J9s",
    "J8s",
    "J7s",
    "T9s",
    "T8s",
    "T7s",
    "98s",
    "97s",
    "87s",
    "86s",
    "76s",
    "75s",
    "65s",
    "64s",
    "54s",
    "KQo",
    "KJo",
    "KTo",
    "QJo",
    "QTo",
    "JTo",
  ]),
  makeCells("CALL", "mix", [
    ...OFFSUIT_ACES,
    "K9o",
    "K8o",
    "K7o",
    "Q9o",
    "Q8o",
    "Q7o",
    "J9o",
    "J8o",
    "T9o",
    "T8o",
    "98o",
    "J6s",
    "J5s",
    "J4s",
    "T6s",
    "T5s",
    "T4s",
    "96s",
    "95s",
    "94s",
    "85s",
    "84s",
    "74s",
    "63s",
    "53s",
    "43s",
  ]),
  makeCells("FOLD", "pure", ["K2o", "Q3o", "Q2o", "J3o", "T3o", "93o", "83o", "72o"]),
]);

export const MTT_BB_DEFEND_BTN_2_2X = makeRange([
  MTT_BB_DEFEND_BTN_2_5X,
  makeCells("CALL", "pure", ["Q6o", "J7o", "T7o", "97o", "87o", "K6o", "K5o", "Q6s", "J6s", "T6s", "96s", "85s", "84s", "74s", "73s", "62s"]),
  makeCells("CALL", "mix", ["K4o", "K3o", "Q5o", "Q4o", "J6o", "T6o", "96o", "86o", "76o", "65o", "T3s", "93s", "83s", "82s", "72s", "52s", "42s", "32s"]),
  makeCells("FOLD", "pure", ["Q3o", "Q2o", "J2o", "T2o", "92o", "82o", "72o", "62o"]),
]);

export const MTT_BB_DEFEND_BTN_2X = makeRange([
  MTT_BB_DEFEND_BTN_2_2X,
  makeCells("CALL", "pure", [...PAIRS, ...SUITED_ACES, ...SUITED_KINGS, ...SUITED_QUEENS, ...SUITED_JACKS, ...SUITED_TENS, ...SUITED_NINES, ...SUITED_EIGHTS, ...SUITED_SEVENS, ...SUITED_SIXES, ...SUITED_FIVES, ...SUITED_FOURS, ...SUITED_THREES]),
  makeCells("CALL", "mix", ["K2o", "Q3o", "Q2o", "J5o", "J4o", "T5o", "T4o", "95o", "85o", "75o", "64o", "54o"]),
  makeCells("FOLD", "pure", ["J2o", "T2o", "92o", "82o", "72o", "62o", "52o", "42o", "32o"]),
]);

export const MTT_BB_DEFEND_CO_2_3X = makeRange([
  makeCells("RAISE", "mix", ["AA", "KK", "QQ", "JJ", "TT", "99", "AKs", "AQs", "AJs", "ATs", "A5s", "A4s", "AKo", "AQo"]),
  makeCells("CALL", "pure", ["88", "77", "66", "55", "44", "33", "22", ...SUITED_ACES, "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "QJs", "QTs", "Q9s", "Q8s", "JTs", "J9s", "J8s", "T9s", "T8s", "98s", "97s", "87s", "86s", "76s", "65s", "54s", "KQo", "KJo", "QJo", "JTo"]),
  makeCells("CALL", "mix", ["A9o", "A8o", "A7o", "KTo", "K9o", "QTo", "Q9o", "J9o", "T9o", "A2s", "K6s", "K5s", "Q7s", "J7s", "T7s", "96s", "75s", "64s", "53s"]),
  makeCells("FOLD", "mix", ["A2o", "A3o", "K8o", "Q8o"]),
]);

export const MTT_BB_DEFEND_CO_2X = makeRange([
  MTT_BB_DEFEND_CO_2_3X,
  makeCells("CALL", "mix", ["A6o", "A5o", "A4o", "A3o", "A2o", "K8o", "K7o", "Q8o", "J8o", "T8o", "98o", "Q6s", "J6s", "T6s", "95s", "85s", "74s", "43s"]),
  makeCells("FOLD", "pure", ["K2o", "Q3o", "J3o", "T3o", "72o"]),
]);

export const MTT_BB_DEFEND_SB_2_5X = makeRange([
  makeCells("RAISE", "mix", ["AA", "KK", "QQ", "JJ", "TT", "99", "AKs", "AQs", "AJs", "ATs", "A5s", "A4s", "AKo", "AQo", "AJo", "KQs", "KJs", "QJs"]),
  makeCells("CALL", "pure", [...PAIRS, ...SUITED_ACES, ...SUITED_KINGS, ...SUITED_QUEENS, ...SUITED_JACKS, ...SUITED_TENS, ...SUITED_NINES, ...SUITED_EIGHTS, ...SUITED_SEVENS, ...SUITED_SIXES, ...SUITED_FIVES, ...SUITED_FOURS, "KQo", "KJo", "KTo", "QJo", "QTo", "JTo", "T9o", "98o", "T8o"]),
  makeCells("CALL", "mix", ["A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o", ...OFFSUIT_KINGS, ...OFFSUIT_QUEENS, ...OFFSUIT_JACKS, ...OFFSUIT_TENS, "98o", "97o", "96o", "87o", "86o", "76o", "65o", "T2s", "92s", "82s", "72s", "62s", "52s", "42s", "32s"]),
  makeCells("FOLD", "pure", ["72o", "62o", "52o", "42o", "32o"]),
]);

export const MTT_BB_DEFEND_SB_2X = makeRange([
  MTT_BB_DEFEND_SB_2_5X,
  makeCells("CALL", "mix", [...OFFSUIT_NINES, ...OFFSUIT_EIGHTS, ...OFFSUIT_SEVENS, ...OFFSUIT_SIXES, "54o", "53o", "43o"]),
  makeCells("FOLD", "pure", ["72o", "62o", "52o", "42o", "32o"]),
]);

export const MTT_BB_DEFEND_BTN_2_5X_21_25BB = MTT_BB_DEFEND_BTN_2_5X;
export const MTT_BB_DEFEND_BTN_2_2X_21_25BB = MTT_BB_DEFEND_BTN_2_2X;
export const MTT_BB_DEFEND_BTN_2X_21_25BB = MTT_BB_DEFEND_BTN_2X;
export const MTT_BB_DEFEND_CO_2_3X_21_25BB = MTT_BB_DEFEND_CO_2_3X;
export const MTT_BB_DEFEND_CO_2X_21_25BB = MTT_BB_DEFEND_CO_2X;
export const MTT_BB_DEFEND_SB_2_5X_21_25BB = MTT_BB_DEFEND_SB_2_5X;
export const MTT_BB_DEFEND_SB_2X_21_25BB = MTT_BB_DEFEND_SB_2X;

export const MTT_BB_DEFEND_BTN_2_5X_15_20BB = makeRange([
  MTT_BB_DEFEND_BTN_2_5X_21_25BB,
  makeCells("FOLD", "pure", ["Q8o", "Q7o", "J8o", "T8o", "98o", "J5s", "J4s", "T4s", "95s", "84s", "74s", "63s", "53s", "43s"]),
]);

export const MTT_BB_DEFEND_BTN_2_2X_15_20BB = makeRange([
  MTT_BB_DEFEND_BTN_2_2X_21_25BB,
  makeCells("FOLD", "pure", ["K5o", "K4o", "Q5o", "Q4o", "T6o", "96o", "86o", "65o", "93s", "83s", "82s", "72s", "52s", "42s", "32s"]),
]);

export const MTT_BB_DEFEND_BTN_2X_15_20BB = makeRange([
  MTT_BB_DEFEND_BTN_2X_21_25BB,
  makeCells("FOLD", "pure", ["J5o", "J4o", "T5o", "T4o", "95o", "85o", "75o", "64o", "54o"]),
]);

export const MTT_BB_DEFEND_CO_2_3X_15_20BB = makeRange([
  MTT_BB_DEFEND_CO_2_3X_21_25BB,
  makeCells("FOLD", "pure", ["A8o", "A7o", "KTo", "K9o", "QTo", "Q9o", "J9o", "T9o", "K5s", "Q7s", "J7s", "T7s", "75s", "64s", "53s"]),
]);

export const MTT_BB_DEFEND_CO_2X_15_20BB = makeRange([
  MTT_BB_DEFEND_CO_2X_21_25BB,
  makeCells("FOLD", "pure", ["A5o", "A4o", "A3o", "A2o", "K8o", "K7o", "Q8o", "J8o", "T8o", "98o", "Q6s", "J6s", "T6s", "95s", "85s", "74s", "43s"]),
]);

export const MTT_BB_DEFEND_SB_2_5X_15_20BB = makeRange([
  MTT_BB_DEFEND_SB_2_5X_21_25BB,
  makeCells("FOLD", "pure", ["A4o", "A3o", "A2o", "K3o", "K2o", "Q4o", "Q3o", "Q2o", "J3o", "J2o", "T3o", "T2o", "93o", "83o", "73o", "63o", "53o", "43o"]),
]);

export const MTT_BB_DEFEND_SB_2X_15_20BB = makeRange([
  MTT_BB_DEFEND_SB_2X_21_25BB,
  makeCells("FOLD", "pure", ["96o", "86o", "76o", "65o", "54o", "53o", "43o"]),
]);

export const MTT_REJAM_BB_VS_BTN_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo", "KQs"]),
  makeCells("JAM", "mix", ["66", "55", "44", "33", "22", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "ATo", "A9o", "A8o", "KQo", "KJs", "KTs", "K9s", "QJs", "QTs", "JTs"]),
  makeCells("CALL", "mix", ["K7s", "K6s", "K5s", "Q9s", "J9s", "T9s", "98s", "87s", "76s"]),
  makeCells("FOLD", "pure", ["K2o", "Q5o", "J5o", "T4o", "72o"]),
]);

export const MTT_REJAM_BB_VS_CO_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo", "KQs"]),
  makeCells("JAM", "mix", ["55", "44", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "ATo", "KQo", "KJs", "KTs", "QJs", "QTs", "JTs"]),
  makeCells("CALL", "mix", ["33", "22", "A9o", "K9s", "K8s", "K7s", "Q9s", "J9s", "T9s", "98s", "87s"]),
  makeCells("FOLD", "mix", ["K5s", "A2o", "KJo"]),
]);

export const MTT_REJAM_SB_VS_CO_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo", "KQs"]),
  makeCells("JAM", "mix", ["55", "44", "33", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "ATo", "KQo", "KJs", "KTs", "QJs", "QTs", "JTs"]),
  makeCells("FOLD", "mix", ["22", "A8o", "KJo", "QJo"]),
]);

export const MTT_REJAM_BTN_VS_CO_HJ_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo"]),
  makeCells("JAM", "mix", ["66", "55", "44", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "AJo", "ATo", "KQs", "KQo", "KJs", "QJs", "JTs"]),
  makeCells("CALL", "mix", ["KQo", "A8s", "KQs", "QJs", "T9s", "98s"]),
  makeCells("FOLD", "mix", ["33", "22", "KJo", "QTo"]),
]);

export const MTT_REJAM_SB_VS_BTN_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo", "ATo", "KQs", "KJs", "KTs"]),
  makeCells("JAM", "mix", ["66", "55", "44", "33", "22", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "A9o", "A8o", "KQo", "KJo", "QJs", "QTs", "JTs"]),
  makeCells("CALL", "mix", ["Q9s", "J9s", "T9s", "98s"]),
  makeCells("FOLD", "mix", ["A5o", "K8o", "QTo"]),
]);

export const MTT_REJAM_BB_VS_SB_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo", "ATo", "KQs", "KJs", "KTs", "KJo"]),
  makeCells("JAM", "mix", ["66", "55", "44", "33", "22", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s", "A9o", "A8o", "A7o", "KQo", "KTo", "K9o", "QJs", "QTs", "QTo", "JTs", "J9s", "T9s"]),
  makeCells("CALL", "mix", ["J8o", "Q9s", "T8s", "98s", "87s", "76s"]),
  makeCells("FOLD", "mix", ["K5o", "Q7o", "J6o", "72o"]),
]);

export const MTT_REJAM_CO_VS_HJ_15_20BB = makeRange([
  makeCells("JAM", "pure", ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "AKs", "AQs", "AJs", "ATs", "AKo", "AQo"]),
  makeCells("JAM", "mix", ["77", "66", "55", "A9s", "A8s", "A7s", "A5s", "A4s", "AJo", "ATo", "KQs", "KJs", "QJs", "JTs"]),
  makeCells("CALL", "mix", ["A8s", "KQs", "KJs", "QJs", "T9s"]),
  makeCells("FOLD", "mix", ["44", "A7o", "KQo"]),
]);

export const MTT_REJAM_BB_VS_BTN_21_25BB = makeRange([
  MTT_REJAM_BB_VS_BTN_15_20BB,
  makeCells("CALL", "pure", [
    "77",
    "66",
    "55",
    "A9s",
    "A8s",
    "A7s",
    "A6s",
    "ATo",
    "A9o",
    "KQo",
    "KJs",
    "KTs",
    "QJs",
    "QTs",
    "JTs",
  ]),
  makeCells("FOLD", "mix", ["44", "33", "22", "A5s", "A4s", "A3s", "A2s", "A8o", "K9s"]),
]);

export const MTT_REJAM_BB_VS_CO_21_25BB = makeRange([
  MTT_REJAM_BB_VS_CO_15_20BB,
  makeCells("CALL", "pure", ["66", "55", "44", "A9s", "A8s", "A7s", "ATo", "KQo", "KJs", "QJs", "JTs"]),
  makeCells("FOLD", "mix", ["33", "22", "A6s", "A5s", "A4s", "A3s", "A2s", "A9o", "KTs", "QTs"]),
]);

export const MTT_REJAM_SB_VS_CO_21_25BB = makeRange([
  MTT_REJAM_SB_VS_CO_15_20BB,
  makeCells("CALL", "pure", ["66", "55", "44", "33", "A9s", "A8s", "A7s", "ATo", "KQo", "KJs", "QJs", "JTs"]),
  makeCells("FOLD", "mix", ["22", "A6s", "A5s", "A4s", "A3s", "A2s", "KTs", "QTs", "A8o"]),
]);

export const MTT_REJAM_BTN_VS_CO_HJ_21_25BB = makeRange([
  MTT_REJAM_BTN_VS_CO_HJ_15_20BB,
  makeCells("CALL", "pure", [
    "77",
    "66",
    "55",
    "44",
    "A9s",
    "A8s",
    "A7s",
    "A6s",
    "A5s",
    "A4s",
    "A3s",
    "A2s",
    "AJo",
    "ATo",
    "KQs",
    "KQo",
    "KJs",
    "QJs",
    "JTs",
  ]),
  makeCells("FOLD", "mix", ["33", "22", "QTo"]),
]);

export const MTT_REJAM_SB_VS_BTN_21_25BB = makeRange([
  MTT_REJAM_SB_VS_BTN_15_20BB,
  makeCells("CALL", "pure", [
    "77",
    "66",
    "55",
    "44",
    "33",
    "22",
    "A9s",
    "A8s",
    "A7s",
    "A6s",
    "A5s",
    "A4s",
    "A3s",
    "A2s",
    "A9o",
    "A8o",
    "KQo",
    "KJo",
    "QJs",
    "QTs",
    "JTs",
  ]),
  makeCells("FOLD", "mix", ["ATo", "KTs", "A5o", "K8o", "QTo"]),
]);

export const MTT_REJAM_BB_VS_SB_21_25BB = makeRange([
  MTT_REJAM_BB_VS_SB_15_20BB,
  makeCells("CALL", "pure", [
    "77",
    "66",
    "55",
    "44",
    "33",
    "22",
    "A9s",
    "A8s",
    "A7s",
    "A6s",
    "A5s",
    "A4s",
    "A3s",
    "A2s",
    "A9o",
    "A8o",
    "A7o",
    "KQo",
    "KTo",
    "K9o",
    "QJs",
    "QTs",
    "QTo",
    "JTs",
    "J9s",
    "T9s",
  ]),
  makeCells("FOLD", "mix", ["KJo", "J8o", "K5o", "Q7o", "J6o", "72o"]),
]);

export const MTT_REJAM_CO_VS_HJ_21_25BB = makeRange([
  MTT_REJAM_CO_VS_HJ_15_20BB,
  makeCells("CALL", "pure", ["77", "66", "55", "A9s", "A8s", "A7s", "A5s", "A4s", "AJo", "ATo", "KQs", "KJs", "QJs", "JTs"]),
  makeCells("FOLD", "mix", ["44", "A7o", "KQo"]),
]);

export const MTT_PREFLOP_RANGE_PROFILES = [
  makeProfile({
    id: "mtt-15-20-open-btn",
    format: "MTT_15_25BB",
    spotType: "OPEN",
    title: "BTN open 15-20 BB",
    summary:
      "Pri 15-20 BB na BTN porad otevirame siroce, ale nejspodnejsi offsuit cast uz vice zahazuje a mene mixuje.",
    heroPosition: "BTN",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_OPEN_BTN_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-open-btn",
    format: "MTT_15_25BB",
    spotType: "OPEN",
    title: "BTN open 21-25 BB",
    summary:
      "Pri 21-25 BB muzeme na BTN drzet o neco sirsi low-end open cast a vice mixovat hranicni offsuit kombinace.",
    heroPosition: "BTN",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_OPEN_BTN_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-open-co-hj",
    format: "MTT_15_25BB",
    spotType: "OPEN",
    title: "CO/HJ open 15-20 BB",
    summary:
      "Pri 15-20 BB z CO/HJ zpomalujeme nejspodnejsi otevreni, hlavne offsuit broadwaye a slabsi suited trash.",
    heroPosition: "CO/HJ",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_OPEN_CO_HJ_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-open-co-hj",
    format: "MTT_15_25BB",
    spotType: "OPEN",
    title: "CO/HJ open 21-25 BB",
    summary:
      "CO/HJ open range je uzsi nez BTN, ale pri 21-25 BB porad obsahuje suited esa, suited broadwaye, pary a cast suited konektoru.",
    heroPosition: "CO/HJ",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_OPEN_CO_HJ_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-open-sb",
    format: "MTT_15_25BB",
    spotType: "SB_OPEN",
    title: "SB open 15-20 BB",
    summary:
      "V BvB pri 15-20 BB otevirame siroce, ale cast nizkych offsuit kombinaci uz radsi zahazujeme.",
    heroPosition: "SB",
    villainPosition: "BB",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_OPEN_SB_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-open-sb",
    format: "MTT_15_25BB",
    spotType: "SB_OPEN",
    title: "SB open 21-25 BB",
    summary:
      "V BvB pri 21-25 BB otevirame velmi siroce a cast hranicnich offsuit hand muzeme jeste mixovat.",
    heroPosition: "SB",
    villainPosition: "BB",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_OPEN_SB_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-btn-2-5x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs BTN 2.5x (15-20 BB)",
    summary: "Na 15-20 BB proti 2.5x BTN defend lehce pritahujeme a cast low-end offsuit/suited hand poustime.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "15-20BB",
    openSize: "2.5x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_BTN_2_5X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-btn-2-5x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs BTN 2.5x (21-25 BB)",
    summary: "MTT BB proti BTN 2.5x brani porad siroce: suited handy, pary, broadwaye a cast lepsich offsuit kombinaci.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "21-25BB",
    openSize: "2.5x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for BTN 2.5x.",
    cells: MTT_BB_DEFEND_BTN_2_5X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-btn-2-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs BTN 2.2x (15-20 BB)",
    summary: "Proti 2.2x BTN defend zustava siroky, ale 15-20 BB vyrazuje nejslabsi offsuit i suited okraje.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "15-20BB",
    openSize: "2.2x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_BTN_2_2X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-btn-2-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs BTN 2.2x (21-25 BB)",
    summary: "Proti 2.2x BTN openu ma BB lepsi cenu nez proti 2.5x, proto pribyva vice suited trash a slabsi broadwaye.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "21-25BB",
    openSize: "2.2x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for BTN 2.2x.",
    cells: MTT_BB_DEFEND_BTN_2_2X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-btn-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND_2X",
    title: "BB defend vs BTN 2x (15-20 BB)",
    summary: "Proti BTN minraisu i na 15-20 BB defendujeme hodne, ale cast nejslabsich offsuit kombinaci uz folduje.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "15-20BB",
    openSize: "2x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_BTN_2X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-btn-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND_2X",
    title: "BB defend vs BTN 2x (21-25 BB)",
    summary: "Proti BTN minraisu ma BB vybornou cenu a v MTT brani opravdu siroce.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "21-25BB",
    openSize: "2x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for BTN 2x.",
    cells: MTT_BB_DEFEND_BTN_2X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-co-2-3x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs CO 2.3x (15-20 BB)",
    summary: "Na 15-20 BB proti CO 2.3x orezavame slabsi offsuit esa a nejspodnejsi suited mix cast.",
    heroPosition: "BB",
    villainPosition: "CO",
    stackBand: "15-20BB",
    openSize: "2.3x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_CO_2_3X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-co-2-3x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs CO 2.3x (21-25 BB)",
    summary: "Proti CO je opening range silnejsi nez BTN, ale pri 21-25 BB BB stale brani suited equity a pary.",
    heroPosition: "BB",
    villainPosition: "CO",
    stackBand: "21-25BB",
    openSize: "2.3x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for CO 2.3x.",
    cells: MTT_BB_DEFEND_CO_2_3X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-co-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND_2X",
    title: "BB defend vs CO 2x (15-20 BB)",
    summary: "CO minraise 2x je stale defend spot, ale 15-20 BB vyrazuje cast nejslabsich offsuit/suited callu.",
    heroPosition: "BB",
    villainPosition: "CO",
    stackBand: "15-20BB",
    openSize: "2x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_CO_2X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-co-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND_2X",
    title: "BB defend vs CO 2x (21-25 BB)",
    summary: "CO minraise 2x pri 21-25 BB otevre BB defend o dalsi suited handy a cast offsuit broadway konektivity.",
    heroPosition: "BB",
    villainPosition: "CO",
    stackBand: "21-25BB",
    openSize: "2x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for CO 2x.",
    cells: MTT_BB_DEFEND_CO_2X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-sb-2-5x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs SB 2.5x (15-20 BB)",
    summary: "BvB defend zustava siroky, ale 15-20 BB vice folduje low-end offsuit spodek.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "15-20BB",
    openSize: "2.5x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_SB_2_5X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-sb-2-5x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND",
    title: "BB defend vs SB 2.5x (21-25 BB)",
    summary: "BvB je BB v pozici a proti SB openu pri 21-25 BB brani velmi siroce.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "21-25BB",
    openSize: "2.5x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for SB 2.5x.",
    cells: MTT_BB_DEFEND_SB_2_5X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-bb-defend-sb-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND_2X",
    title: "BB defend vs SB 2x (15-20 BB)",
    summary: "Proti SB minraisu 2x je defend siroky, ale 15-20 BB zahazuje cast nejslabsich offsuit callu.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "15-20BB",
    openSize: "2x",
    sourceQuality: "draft",
    cells: MTT_BB_DEFEND_SB_2X_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-bb-defend-sb-2x",
    format: "MTT_15_25BB",
    spotType: "BB_DEFEND_2X",
    title: "BB defend vs SB 2x (21-25 BB)",
    summary: "Proti SB minraisu brani BB nejvetsi cast range, protoze hraje v pozici.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "21-25BB",
    openSize: "2x",
    sourceQuality: "reviewed",
    reviewedAt: "2026-05-26",
    reviewedBy: "stachal",
    reviewNotes: "First-pass MTT BB defend baseline reviewed for SB 2x.",
    cells: MTT_BB_DEFEND_SB_2X_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-iso-co-hj-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "CO/HJ iso vs limp (15-20 BB)",
    summary: "Na 15-20 BB proti limpu vice orezavame spekulativni spodek a cast margin hand jen dorovnava.",
    heroPosition: "CO/HJ",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_ISO_CO_HJ_LIMP_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-iso-co-hj-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "CO/HJ iso vs limp (21-25 BB)",
    summary: "Proti limpu chceme izolovat value a dobre hratelne suited broadwaye/esa, zatimco spodek casto mixuje.",
    heroPosition: "CO/HJ",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_ISO_CO_HJ_LIMP_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-iso-btn-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "BTN iso vs limp (15-20 BB)",
    summary: "Na 15-20 BB BTN stale izoluje siroce, ale cast slabsich suited/offsuit hand uz vice opousti.",
    heroPosition: "BTN",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_ISO_BTN_LIMP_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-iso-btn-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "BTN iso vs limp (21-25 BB)",
    summary: "BTN muze izolovat sirsi cast range diky pozici, hlavne handy, ktere dominuji limp/call range.",
    heroPosition: "BTN",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_ISO_BTN_LIMP_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-iso-sb-vs-btn-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "SB iso vs BTN limp (15-20 BB)",
    summary: "Ze SB na 15-20 BB cast margin iso hand prechazi do call/fold, aby range byla mene volatilni.",
    heroPosition: "SB",
    villainPosition: "BTN",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_ISO_SB_VS_BTN_LIMP_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-iso-sb-vs-btn-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "SB iso vs BTN limp (21-25 BB)",
    summary: "Ze SB mimo pozici izolujeme silnejsi value a blocker handy, cast suited spekulativnich kombinaci jen mixuje.",
    heroPosition: "SB",
    villainPosition: "BTN",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_ISO_SB_VS_BTN_LIMP_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-iso-bb-vs-sb-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "BB iso vs SB limp (15-20 BB)",
    summary: "Na 15-20 BB BB casteji voli check cast u hranicnich hand a izoluje selektivneji.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_ISO_BB_VS_SB_LIMP_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-iso-bb-vs-sb-limp",
    format: "MTT_15_25BB",
    spotType: "ISO",
    title: "BB iso vs SB limp (21-25 BB)",
    summary: "Proti SB limpu muze BB raisovat value a blocker handy, zatimco trash cast zdarma realizuje equity checkem.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_ISO_BB_VS_SB_LIMP_21_25BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-bb-vs-btn",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BB rejam vs BTN 15-20 BB",
    summary:
      "BB pri 15-20 BB proti BTN kombinuje value jamy, blocker jamy a call cast s dobre hratelnymi suited handami.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BB_VS_BTN_15_20BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-bb-vs-co",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BB rejam vs CO 15-20 BB",
    summary:
      "Proti CO je open range silnejsi nez BTN, proto jsou rejamy uzsi a cast suited kingu zustava call nebo fold.",
    heroPosition: "BB",
    villainPosition: "CO",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BB_VS_CO_15_20BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-bb-vs-sb",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BB rejam vs SB 15-20 BB",
    summary:
      "BvB jsou range siroke a pri 15 BB mnoho broadwayi prirozene tlaci all-in.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BB_VS_SB_15_20BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-sb-vs-co",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "SB rejam vs CO 15-20 BB",
    summary:
      "SB proti CO pri 15-20 BB casto preferuje rejam pred callem mimo pozici, hlavne s pary, silnymi broadwayi a blocker esy.",
    heroPosition: "SB",
    villainPosition: "CO",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_SB_VS_CO_15_20BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-sb-vs-btn",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "SB rejam vs BTN 15-20 BB",
    summary:
      "Proti sirokemu BTN openu jsou stredni offsuit esa a suited broadwaye casto rejam pro blocker a equity.",
    heroPosition: "SB",
    villainPosition: "BTN",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_SB_VS_BTN_15_20BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-btn-vs-co-hj",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BTN rejam/call vs CO/HJ 15-20 BB",
    summary:
      "BTN proti HJ/CO openu ma vyhodu pozice, proto cast silnych, ale ne ciste jam hand muze zustat call.",
    heroPosition: "BTN",
    villainPosition: "CO/HJ",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BTN_VS_CO_HJ_15_20BB,
  }),
  makeProfile({
    id: "mtt-15-20-rejam-co-vs-hj",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "CO rejam vs HJ 15-20 BB",
    summary:
      "ATs ma blocker, equity a realizaci, casto funguje jako rejam proti HJ pri 19 BB.",
    heroPosition: "CO",
    villainPosition: "HJ",
    stackBand: "15-20BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_CO_VS_HJ_15_20BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-bb-vs-btn",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BB rejam vs BTN 21-25 BB",
    summary:
      "Pri 21-25 BB je jam cast uzsi, vice hand prechazi do call/fold a tlak je selektivnejsi nez na 15-20 BB.",
    heroPosition: "BB",
    villainPosition: "BTN",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BB_VS_BTN_21_25BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-bb-vs-co",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BB rejam vs CO 21-25 BB",
    summary:
      "Proti CO pri 21-25 BB jeste vic pritahujeme jam cast, cast strednich hand zustava call nebo fold.",
    heroPosition: "BB",
    villainPosition: "CO",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BB_VS_CO_21_25BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-bb-vs-sb",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BB rejam vs SB 21-25 BB",
    summary:
      "BvB pri 21-25 BB zustava aktivni, ale nejvice borderline jamy prechazi do callu nebo foldu.",
    heroPosition: "BB",
    villainPosition: "SB",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BB_VS_SB_21_25BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-sb-vs-co",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "SB rejam vs CO 21-25 BB",
    summary:
      "Ze SB pri 21-25 BB proti CO jams zuzujeme a cast suited broadwayi/paru nechavame mimo jam cast.",
    heroPosition: "SB",
    villainPosition: "CO",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_SB_VS_CO_21_25BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-sb-vs-btn",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "SB rejam vs BTN 21-25 BB",
    summary:
      "Proti BTN na 21-25 BB stale tlacime silnou blocker cast, ale nejnizsi jamy casto prechazi na call/fold.",
    heroPosition: "SB",
    villainPosition: "BTN",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_SB_VS_BTN_21_25BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-btn-vs-co-hj",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "BTN rejam/call vs CO/HJ 21-25 BB",
    summary:
      "Na vyssim stacku BTN casto drzi vice callu v pozici a jamuje uzsi, vyberovejsi cast range.",
    heroPosition: "BTN",
    villainPosition: "CO/HJ",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_BTN_VS_CO_HJ_21_25BB,
  }),
  makeProfile({
    id: "mtt-21-25-rejam-co-vs-hj",
    format: "MTT_15_25BB",
    spotType: "REJAM",
    title: "CO rejam vs HJ 21-25 BB",
    summary:
      "CO proti HJ pri 21-25 BB preferuje uzsi jam cast a vice hand presouva do call/fold rozhodnuti.",
    heroPosition: "CO",
    villainPosition: "HJ",
    stackBand: "21-25BB",
    sourceQuality: "draft",
    cells: MTT_REJAM_CO_VS_HJ_21_25BB,
  }),
] as const satisfies readonly RangeProfile[];
