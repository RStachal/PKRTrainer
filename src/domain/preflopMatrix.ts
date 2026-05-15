export const PREFLOP_RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

export type PreflopRank = (typeof PREFLOP_RANKS)[number];

export function getPreflopHand(row: PreflopRank, column: PreflopRank): string {
  if (row === column) return `${row}${column}`;

  const rowIndex = PREFLOP_RANKS.indexOf(row);
  const columnIndex = PREFLOP_RANKS.indexOf(column);

  return rowIndex < columnIndex ? `${row}${column}s` : `${column}${row}o`;
}

export const PREFLOP_HAND_MATRIX = PREFLOP_RANKS.map((row) =>
  PREFLOP_RANKS.map((column) => getPreflopHand(row, column)),
);

export const PREFLOP_HANDS = PREFLOP_HAND_MATRIX.flat();
