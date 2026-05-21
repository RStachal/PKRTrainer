import type { ActionId, RangeCell, RangeCellWeight } from "../../domain/spot";

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
const SUITED_FOURS = ["43s", "42s"] as const;
const SUITED_THREES = ["32s"] as const;

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
