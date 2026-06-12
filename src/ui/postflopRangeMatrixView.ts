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

export type FlopzillaLane = "VALUE" | "BLUFF" | "CHECK";

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

type CategoryCounts = Partial<Record<FlopzillaCategory, number>>;

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
  wrap.dataset.heroHand = postflopHandClassFromCards(spot.heroCards);

  const boardText = spot.board.map(cardLabel).join(" ");
  const heroHand = postflopHandClassFromCards(spot.heroCards);
  const heroCategory = classifyFlopHand(heroHand, spot.board);
  const heroCategoryLabel = flopzillaCategoryLabel(heroCategory);
  wrap.dataset.heroCategory = heroCategory;
  wrap.dataset.heroCategoryLabel = heroCategoryLabel;

  const header = doc.createElement("div");
  header.className = "postflop-flopzilla__header";

  const title = doc.createElement("div");
  title.className = "postflop-flopzilla__title";
  title.textContent = "Flopzilla range matrix";
  header.appendChild(title);

  const meta = doc.createElement("div");
  meta.className = "postflop-flopzilla__meta";
  meta.textContent = `Board ${boardText} | Hero ${heroHand}: ${heroCategoryLabel}`;
  header.appendChild(meta);

  wrap.appendChild(header);

  const hint = doc.createElement("div");
  hint.className = "postflop-flopzilla__hint";
  hint.textContent = "Swipe horizontally on mobile";
  wrap.appendChild(hint);

  const matrix = doc.createElement("div");
  matrix.className = "postflop-flopzilla__matrix";
  matrix.setAttribute("role", "grid");
  matrix.setAttribute("aria-label", `Flopzilla range matrix for board ${boardText}`);
  matrix.style.gridTemplateColumns = `repeat(${GRID_SIZE + 1}, minmax(0, 1fr))`;
  matrix.appendChild(headerCell(doc, "", "corner"));
  const detail = detailPanel(doc);
  const productionLaneByHand = productionLaneMap(spot);

  for (let j = 0; j < GRID_SIZE; j += 1) {
    matrix.appendChild(headerCell(doc, RANKS[j], "column"));
  }

  const used = new Set<FlopzillaCategory>();
  const counts: CategoryCounts = {};

  for (let i = 0; i < GRID_SIZE; i += 1) {
    matrix.appendChild(headerCell(doc, RANKS[i], "row"));
    for (let j = 0; j < GRID_SIZE; j += 1) {
      const hand = handLabel(i, j);
      const category = classifyFlopHand(hand, spot.board);
      used.add(category);
      counts[category] = (counts[category] ?? 0) + 1;
      const cell = matrixCell(doc, hand, category, hand === heroHand, productionLaneByHand.get(hand));
      cell.addEventListener("click", () => showCellDetail(matrix, detail, cell));
      cell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        cell.click();
      });
      matrix.appendChild(cell);
    }
  }

  wrap.appendChild(matrix);
  wrap.appendChild(legend(doc, used, counts, matrix));
  wrap.appendChild(detail);
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
  productionLane?: FlopzillaLane,
): HTMLElement {
  const cell = doc.createElement("div");
  cell.className = `postflop-flopzilla__cell postflop-flopzilla__cell--${category}`;
  if (productionLane) cell.classList.add("postflop-flopzilla__cell--production-lane");
  if (hero) cell.classList.add("postflop-flopzilla__cell--hero");
  const lane = productionLane ?? flopzillaLaneForCategory(category);
  cell.setAttribute("role", "gridcell");
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-selected", "false");
  cell.setAttribute("aria-label", `${hand}: ${flopzillaCategoryLabel(category)}${hero ? " hero hand" : ""}`);
  cell.dataset.hand = hand;
  cell.dataset.category = category;
  cell.dataset.categoryLabel = flopzillaCategoryLabel(category);
  cell.dataset.lane = lane;
  cell.dataset.laneLabel = flopzillaLaneLabel(lane);
  cell.dataset.laneSource = productionLane ? "production" : "taxonomy";
  cell.title = `${hand}: ${flopzillaCategoryLabel(category)}`;
  cell.textContent = hand;
  cell.style.background = CATEGORY_DEFS[category].color;
  return cell;
}

function productionLaneMap(spot: PostflopTrainingSpot): Map<HandLabel, FlopzillaLane> {
  const source = spot.explanation.source;
  const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets : undefined;
  const map = new Map<HandLabel, FlopzillaLane>();
  for (const bucket of buckets ?? []) {
    for (const hand of bucket.handClasses) {
      if (!map.has(hand)) map.set(hand, bucket.lane);
    }
  }
  return map;
}

function detailPanel(doc: Document): HTMLElement {
  const detail = doc.createElement("div");
  detail.className = "postflop-flopzilla__detail";
  detail.hidden = true;
  detail.setAttribute("role", "status");
  detail.setAttribute("tabindex", "-1");
  return detail;
}

function showCellDetail(
  matrix: HTMLElement,
  detail: HTMLElement,
  cell: HTMLElement,
): void {
  matrix.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell--selected")
    .forEach((selected) => {
      selected.classList.remove("postflop-flopzilla__cell--selected");
      selected.setAttribute("aria-selected", "false");
    });

  cell.classList.add("postflop-flopzilla__cell--selected");
  cell.setAttribute("aria-selected", "true");

  const doc = detail.ownerDocument ?? document;
  const hand = cell.dataset.hand ?? "";
  const category = cell.dataset.category as FlopzillaCategory;
  const lane = cell.dataset.lane as FlopzillaLane;
  const categoryLabel = cell.dataset.categoryLabel ?? flopzillaCategoryLabel(category);
  const laneLabel = cell.dataset.laneLabel ?? flopzillaLaneLabel(lane);
  const hero = cell.classList.contains("postflop-flopzilla__cell--hero");

  detail.hidden = false;
  detail.dataset.hand = hand;
  detail.dataset.category = category;
  detail.dataset.categoryLabel = categoryLabel;
  detail.dataset.lane = lane;
  detail.dataset.laneLabel = laneLabel;
  detail.innerHTML = "";

  const title = doc.createElement("div");
  title.className = "postflop-flopzilla__detail-title";
  title.textContent = `${hand}${hero ? " - hero hand" : ""}`;
  detail.appendChild(title);

  const grid = doc.createElement("div");
  grid.className = "postflop-flopzilla__detail-grid";
  grid.appendChild(detailLine(doc, "Category", categoryLabel));
  grid.appendChild(detailLine(doc, "Lane", laneLabel));
  grid.appendChild(detailLine(doc, "Plan", laneExplanation(lane)));
  detail.appendChild(grid);
  detail.focus();
}

function detailLine(doc: Document, label: string, value: string): HTMLElement {
  const line = doc.createElement("div");
  line.className = "postflop-flopzilla__detail-line";

  const labelEl = doc.createElement("span");
  labelEl.className = "postflop-flopzilla__detail-label";
  labelEl.textContent = label;

  const valueEl = doc.createElement("span");
  valueEl.className = "postflop-flopzilla__detail-value";
  valueEl.textContent = value;

  line.appendChild(labelEl);
  line.appendChild(valueEl);
  return line;
}

function laneExplanation(lane: FlopzillaLane): string {
  switch (lane) {
    case "VALUE":
      return "Prioritize betting for value and protection; these hands can build the pot.";
    case "BLUFF":
      return "Use as natural bluffs with equity, blockers or backdoors when the line wants pressure.";
    case "CHECK":
      return "Keep in the check range for showdown value, traps or give-ups without enough equity.";
  }
}

function headerCell(
  doc: Document,
  text: string,
  axis: "corner" | "column" | "row" = "column",
): HTMLElement {
  const cell = doc.createElement("div");
  cell.className = `postflop-flopzilla__header-cell postflop-flopzilla__header-cell--${axis}`;
  cell.dataset.axis = axis;
  cell.textContent = text;
  return cell;
}

function legend(
  doc: Document,
  used: ReadonlySet<FlopzillaCategory>,
  counts: CategoryCounts,
  matrix: HTMLElement,
): HTMLElement {
  const legendRoot = doc.createElement("div");
  legendRoot.className = "postflop-flopzilla__legend";
  let activeCategory: FlopzillaCategory | null = null;

  for (const category of LEGEND_ORDER) {
    if (!used.has(category)) continue;
    const item = doc.createElement("div");
    item.className = "postflop-flopzilla__legend-item";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-pressed", "false");
    item.setAttribute("aria-label", `Highlight ${flopzillaCategoryLabel(category)} hands`);
    item.dataset.category = category;
    item.dataset.count = String(counts[category] ?? 0);
    item.dataset.share = categoryShare(counts[category] ?? 0);

    const swatch = doc.createElement("span");
    swatch.className = "postflop-flopzilla__legend-swatch";
    swatch.style.background = CATEGORY_DEFS[category].color;

    const label = doc.createElement("span");
    label.textContent = flopzillaCategoryLabel(category);

    const count = doc.createElement("span");
    count.className = "postflop-flopzilla__legend-count";
    count.textContent = `${counts[category] ?? 0}/169 (${categoryShare(counts[category] ?? 0)})`;

    item.appendChild(swatch);
    item.appendChild(label);
    item.appendChild(count);
    item.addEventListener("click", () => {
      activeCategory = activeCategory === category ? null : category;
      applyLegendHighlight(legendRoot, matrix, activeCategory);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      item.click();
    });
    legendRoot.appendChild(item);
  }

  return legendRoot;
}

function applyLegendHighlight(
  legendRoot: HTMLElement,
  matrix: HTMLElement,
  activeCategory: FlopzillaCategory | null,
): void {
  legendRoot.querySelectorAll<HTMLElement>(".postflop-flopzilla__legend-item")
    .forEach((item) => {
      const active = item.dataset.category === activeCategory;
      item.classList.toggle("postflop-flopzilla__legend-item--active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });

  matrix.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")
    .forEach((cell) => {
      const muted = activeCategory !== null && cell.dataset.category !== activeCategory;
      cell.classList.toggle("postflop-flopzilla__cell--muted", muted);
    });
}

function categoryShare(count: number): string {
  return `${Math.round((count / (GRID_SIZE * GRID_SIZE)) * 100)}%`;
}

export function flopzillaCategoryLabel(category: FlopzillaCategory): string {
  return CATEGORY_DEFS[category].label;
}

export function flopzillaLaneForCategory(category: FlopzillaCategory): FlopzillaLane {
  switch (category) {
    case "SET_PLUS":
    case "MADE_STRAIGHT":
    case "TWO_PAIR":
    case "OVERPAIR":
    case "TOP_PAIR":
      return "VALUE";
    case "FLUSH_DRAW":
    case "OESD":
    case "GUTSHOT":
    case "BACKDOOR_DRAW":
    case "OVERCARDS":
      return "BLUFF";
    case "PAIR":
    case "UNDERPAIR":
    case "AIR":
      return "CHECK";
  }
}

export function flopzillaLaneLabel(lane: FlopzillaLane): string {
  switch (lane) {
    case "VALUE":
      return "Value";
    case "BLUFF":
      return "Bluffs";
    case "CHECK":
      return "Check";
  }
}

export function postflopHandClassFromCards(cards: readonly [Card, Card]): HandLabel {
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
