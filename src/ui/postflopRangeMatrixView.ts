import { GRID_SIZE, R2V, RANKS, handLabel, isPair, isSuited } from "../core/poker";
import type { Card, HandLabel, Rank } from "../core/types";
import type { PostflopTrainingSpot } from "../core/postflopTrainingSpot";

export type FlopzillaCategory =
  | "SET_PLUS"
  | "MADE_STRAIGHT"
  | "TWO_PAIR"
  | "OVERPAIR"
  | "TOP_PAIR"
  | "PAIR"
  | "UNDERPAIR"
  | "FLUSH_DRAW"
  | "OESD"
  | "GUTSHOT"
  | "BACKDOOR_DRAW"
  | "OVERCARDS"
  | "AIR";

interface CategoryDef {
  label: string;
  color: string;
}

const CATEGORY_DEFS: Record<FlopzillaCategory, CategoryDef> = {
  SET_PLUS: { label: "Set+", color: "#d83b3b" },
  MADE_STRAIGHT: { label: "Made straight", color: "#ef6f2e" },
  TWO_PAIR: { label: "Two pair", color: "#f59f32" },
  OVERPAIR: { label: "Overpair", color: "#ffd15b" },
  TOP_PAIR: { label: "Top pair", color: "#3ddc84" },
  PAIR: { label: "Pair", color: "#2dbd6e" },
  UNDERPAIR: { label: "Underpair", color: "#1f8f63" },
  FLUSH_DRAW: { label: "Flush draw", color: "#3399ff" },
  OESD: { label: "OESD", color: "#7c83ff" },
  GUTSHOT: { label: "Gutshot", color: "#9b6cf0" },
  BACKDOOR_DRAW: { label: "Backdoor draw", color: "#6e7891" },
  OVERCARDS: { label: "Overcards", color: "#607d8b" },
  AIR: { label: "Air", color: "#343b49" },
};

const LEGEND_ORDER: readonly FlopzillaCategory[] = [
  "SET_PLUS",
  "MADE_STRAIGHT",
  "TWO_PAIR",
  "OVERPAIR",
  "TOP_PAIR",
  "PAIR",
  "UNDERPAIR",
  "FLUSH_DRAW",
  "OESD",
  "GUTSHOT",
  "BACKDOOR_DRAW",
  "OVERCARDS",
  "AIR",
];

interface ParsedHand {
  high: Rank;
  low: Rank;
  pair: boolean;
  suited: boolean;
}

export function renderPostflopRangeMatrix(
  spot: PostflopTrainingSpot,
  root: HTMLElement,
): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = doc.createElement("div");
  wrap.className = "postflop-flopzilla";
  wrap.dataset.board = spot.board.map(cardLabel).join("-");
  wrap.dataset.heroHand = handClassFromCards(spot.heroCards);

  const title = doc.createElement("div");
  title.className = "postflop-flopzilla__title";
  title.textContent = "Flopzilla matrix";
  wrap.appendChild(title);

  const hint = doc.createElement("div");
  hint.className = "postflop-flopzilla__hint";
  hint.textContent = "Swipe horizontally on mobile";
  wrap.appendChild(hint);

  const matrix = doc.createElement("div");
  matrix.className = "postflop-flopzilla__matrix";
  matrix.style.gridTemplateColumns = `repeat(${GRID_SIZE + 1}, minmax(0, 1fr))`;
  matrix.appendChild(headerCell(doc, ""));

  for (let j = 0; j < GRID_SIZE; j += 1) {
    matrix.appendChild(headerCell(doc, RANKS[j]));
  }

  const heroHand = handClassFromCards(spot.heroCards);
  const used = new Set<FlopzillaCategory>();

  for (let i = 0; i < GRID_SIZE; i += 1) {
    matrix.appendChild(headerCell(doc, RANKS[i]));
    for (let j = 0; j < GRID_SIZE; j += 1) {
      const hand = handLabel(i, j);
      const category = classifyFlopHand(hand, spot.board);
      used.add(category);
      matrix.appendChild(matrixCell(doc, hand, category, hand === heroHand));
    }
  }

  wrap.appendChild(matrix);
  wrap.appendChild(legend(doc, used));
  root.appendChild(wrap);
}

export function classifyFlopHand(
  hand: HandLabel,
  board: readonly Card[],
): FlopzillaCategory {
  const parsed = parseHand(hand);
  const boardRanks = board.map((card) => card.rank);
  const boardValues = boardRanks.map((rank) => R2V[rank]);
  const topBoard = Math.max(...boardValues);
  const handValues = parsed.pair
    ? [R2V[parsed.high], R2V[parsed.high]]
    : [R2V[parsed.high], R2V[parsed.low]];

  if (parsed.pair) {
    const pairValue = R2V[parsed.high];
    if (boardRanks.includes(parsed.high)) return "SET_PLUS";
    if (pairValue > topBoard) return "OVERPAIR";
    if (pairValue < Math.min(...boardValues)) return "UNDERPAIR";
    return "PAIR";
  }

  const highOnBoard = boardRanks.includes(parsed.high);
  const lowOnBoard = boardRanks.includes(parsed.low);
  if (highOnBoard && lowOnBoard) return "TWO_PAIR";
  if (highOnBoard || lowOnBoard) {
    const pairedRank = highOnBoard ? parsed.high : parsed.low;
    if (R2V[pairedRank] === topBoard) return "TOP_PAIR";
    return "PAIR";
  }

  const straightCategory = straightDrawCategory([...boardValues, ...handValues]);
  if (straightCategory === "MADE_STRAIGHT") return "MADE_STRAIGHT";

  const flushCategory = flushDrawCategory(parsed, board);
  if (flushCategory) return flushCategory;

  if (straightCategory === "OESD" || straightCategory === "GUTSHOT") {
    return straightCategory;
  }

  if (parsed.suited) return "BACKDOOR_DRAW";
  if (handValues.every((value) => value > topBoard)) return "OVERCARDS";
  return "AIR";
}

function parseHand(hand: HandLabel): ParsedHand {
  const high = hand[0] as Rank;
  const low = hand[1] as Rank;
  return {
    high,
    low,
    pair: isPair(hand),
    suited: isSuited(hand),
  };
}

function flushDrawCategory(
  hand: ParsedHand,
  board: readonly Card[],
): "FLUSH_DRAW" | null {
  if (!hand.suited) return null;
  const suitCounts = new Map<string, number>();
  for (const card of board) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }
  return [...suitCounts.values()].some((count) => count === 2) ? "FLUSH_DRAW" : null;
}

function straightDrawCategory(values: readonly number[]): "MADE_STRAIGHT" | "OESD" | "GUTSHOT" | null {
  const valueSet = new Set<number>(values);
  if (valueSet.has(14)) valueSet.add(1);

  let hasGutshot = false;
  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const present = window.filter((value) => valueSet.has(value));
    if (present.length === 5) return "MADE_STRAIGHT";
    if (present.length === 4) {
      const missing = window.find((value) => !valueSet.has(value));
      if (missing === window[0] || missing === window[4]) return "OESD";
      hasGutshot = true;
    }
  }
  return hasGutshot ? "GUTSHOT" : null;
}

function matrixCell(
  doc: Document,
  hand: HandLabel,
  category: FlopzillaCategory,
  hero: boolean,
): HTMLElement {
  const cell = doc.createElement("div");
  cell.className = `postflop-flopzilla__cell postflop-flopzilla__cell--${category}`;
  if (hero) cell.classList.add("postflop-flopzilla__cell--hero");
  cell.dataset.hand = hand;
  cell.dataset.category = category;
  cell.title = `${hand}: ${CATEGORY_DEFS[category].label}`;
  cell.textContent = hand;
  cell.style.background = CATEGORY_DEFS[category].color;
  return cell;
}

function headerCell(doc: Document, text: string): HTMLElement {
  const cell = doc.createElement("div");
  cell.className = "postflop-flopzilla__header-cell";
  cell.textContent = text;
  return cell;
}

function legend(doc: Document, used: ReadonlySet<FlopzillaCategory>): HTMLElement {
  const legendRoot = doc.createElement("div");
  legendRoot.className = "postflop-flopzilla__legend";

  for (const category of LEGEND_ORDER) {
    if (!used.has(category)) continue;
    const item = doc.createElement("div");
    item.className = "postflop-flopzilla__legend-item";
    item.dataset.category = category;

    const swatch = doc.createElement("span");
    swatch.className = "postflop-flopzilla__legend-swatch";
    swatch.style.background = CATEGORY_DEFS[category].color;

    const label = doc.createElement("span");
    label.textContent = CATEGORY_DEFS[category].label;

    item.appendChild(swatch);
    item.appendChild(label);
    legendRoot.appendChild(item);
  }

  return legendRoot;
}

function handClassFromCards(cards: readonly [Card, Card]): HandLabel {
  const [a, b] = cards;
  const ai = RANKS.indexOf(a.rank);
  const bi = RANKS.indexOf(b.rank);
  if (ai === bi) return `${a.rank}${b.rank}`;
  const high = ai < bi ? a : b;
  const low = ai < bi ? b : a;
  return `${high.rank}${low.rank}${high.suit === low.suit ? "s" : "o"}`;
}

function cardLabel(card: Card): string {
  return `${card.rank}${card.suit}`;
}
