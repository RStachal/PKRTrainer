import { GRID_SIZE, RANKS, handLabel } from "../core/poker";
import type { Card, HandLabel } from "../core/types";
import type { PostflopActionNode, PostflopTrainingSpot } from "../core/postflopTrainingSpot";
import type { PostflopAction } from "../core/postflopGenerator";
import {
  classifyFlopHand,
  flopzillaLaneForCategory,
  type FlopzillaCategory,
  type FlopzillaLane,
} from "../core/flopHandCategory";
import { localizedText } from "./cs";

// Classification lives in core so the range matrix and the solver-content
// importer label hands the same way.
export {
  classifyFlopHand,
  flopzillaLaneForCategory,
  type FlopzillaCategory,
  type FlopzillaLane,
};

interface CategoryDef {
  label: string;
  color: string;
}

/**
 * Colours taken from the owner's own range charts, sampled from the images.
 *
 * The charts read at a glance because they use two families and a neutral tail
 * rather than a thirteen-step rainbow: a salmon-red for the hands you commit
 * with, greens for the hands still carrying equity, and near-white for the ones
 * you give up. The previous palette ran red-orange-yellow-green-blue-purple-grey
 * in category order, so a top pair was a brighter green than an overpair was
 * yellow and nothing about the colour told you how strong the hand was.
 *
 * Three of these are the chart colours exactly - #D87878 openraise, #304830 and
 * #90A890 the jam tiers, #F0F0F0 fold - with the rest interpolated inside those
 * families so the ramp stays monotonic in strength.
 */
const CATEGORY_DEFS: Record<FlopzillaCategory, CategoryDef> = {
  // Made hands: the salmon-red family, darkening with strength.
  SET_PLUS: { label: "Set+", color: "#a63a32" },
  MADE_STRAIGHT: { label: "Made straight", color: "#be4a3e" },
  TWO_PAIR: { label: "Two pair", color: "#cf5f50" },
  OVERPAIR: { label: "Overpair", color: "#d87878" },
  TOP_PAIR: { label: "Top pair", color: "#e29a8e" },
  PAIR: { label: "Pair", color: "#ebb9af" },
  UNDERPAIR: { label: "Underpair", color: "#f0d2cb" },
  // Draws: the jam greens, kept a distinct hue so equity reads apart from made
  // strength rather than blending into the same ramp.
  FLUSH_DRAW: { label: "Flush draw", color: "#304830" },
  OESD: { label: "OESD", color: "#4e7050" },
  GUTSHOT: { label: "Gutshot", color: "#90a890" },
  BACKDOOR_DRAW: { label: "Backdoor draw", color: "#b8c9b6" },
  // Nothing: the charts' fold shades.
  OVERCARDS: { label: "Overcards", color: "#d6d6ce" },
  AIR: { label: "Air", color: "#f0f0f0" },
};

/**
 * Black or white label, whichever the background can carry.
 *
 * The cells used to be uniformly white-on-dark. Half this palette is light, and
 * keeping white text would have made the widest part of every range - the air and
 * the folds - unreadable.
 */
function readableTextColor(hex: string): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? "#12161f" : "#ffffff";
}

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
  title.textContent = localizedText("Range matrix", "Matice range");
  header.appendChild(title);

  const meta = doc.createElement("div");
  meta.className = "postflop-flopzilla__meta";
  meta.textContent = `Board ${boardText} | Hero ${heroHand}: ${heroCategoryLabel}`;
  header.appendChild(meta);

  wrap.appendChild(header);

  const hint = doc.createElement("div");
  hint.className = "postflop-flopzilla__hint";
  hint.textContent = "Scroll horizontally on mobile";
  wrap.appendChild(hint);

  const matrix = doc.createElement("div");
  matrix.className = "postflop-flopzilla__matrix";
  matrix.setAttribute("role", "grid");
  matrix.setAttribute("aria-label", localizedText(
    `Range matrix for board ${boardText}`,
    `Matice range pro board ${boardText}`,
  ));
  matrix.style.gridTemplateColumns = `repeat(${GRID_SIZE + 1}, minmax(0, 1fr))`;
  matrix.appendChild(headerCell(doc, "", "corner"));
  const detail = detailPanel(doc);
  const productionByHand = productionLaneMap(spot);

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
      const cell = matrixCell(doc, hand, category, hand === heroHand, productionByHand.get(hand), spot.actionNode);
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

function matrixCell(
  doc: Document,
  hand: HandLabel,
  category: FlopzillaCategory,
  hero: boolean,
  production?: ProductionCell,
  actionNode?: PostflopActionNode,
): HTMLElement {
  const productionLane = production?.lane;
  const cell = doc.createElement("div");
  cell.className = `postflop-flopzilla__cell postflop-flopzilla__cell--${category}`;
  if (productionLane) cell.classList.add("postflop-flopzilla__cell--production-lane");
  if (hero) cell.classList.add("postflop-flopzilla__cell--hero");
  const lane = productionLane ?? flopzillaLaneForCategory(category);
  cell.setAttribute("role", "gridcell");
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-selected", "false");
  cell.setAttribute("aria-label", `${hand}: ${flopzillaCategoryLabel(category)}${hero ? ", Hero hand" : ""}`);
  cell.dataset.hand = hand;
  cell.dataset.category = category;
  cell.dataset.categoryLabel = flopzillaCategoryLabel(category);
  cell.dataset.lane = lane;
  cell.dataset.laneLabel = flopzillaLaneLabel(lane, actionNode);
  cell.dataset.laneSource = productionLane ? "production" : "taxonomy";
  // Facing a bet, the lane cannot say whether to call or fold - both sit in the
  // same lane - so the solved action rides along with the cell.
  if (production?.action !== undefined) {
    cell.dataset.action = production.action;
    cell.setAttribute(
      "aria-label",
      `${hand}: ${flopzillaCategoryLabel(category)}, ${production.action}${hero ? ", Hero hand" : ""}`,
    );
  }
  cell.title = production?.action !== undefined
    ? `${hand}: ${flopzillaCategoryLabel(category)} - ${production.action}`
    : `${hand}: ${flopzillaCategoryLabel(category)}`;
  cell.textContent = hand;
  const background = CATEGORY_DEFS[category].color;
  cell.style.background = background;
  cell.style.color = readableTextColor(background);
  // The shadow exists to lift white text off a dark fill; on a light fill it
  // only smears the label.
  cell.style.textShadow = readableTextColor(background) === "#ffffff"
    ? "0 1px 1px rgba(0,0,0,.55)"
    : "none";
  return cell;
}

interface ProductionCell {
  lane: FlopzillaLane;
  action: PostflopAction;
}

function productionLaneMap(spot: PostflopTrainingSpot): Map<HandLabel, ProductionCell> {
  const source = spot.explanation.source;
  const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets : undefined;
  const map = new Map<HandLabel, ProductionCell>();
  for (const bucket of buckets ?? []) {
    for (const hand of bucket.handClasses) {
      if (!map.has(hand)) map.set(hand, { lane: bucket.lane, action: bucket.action });
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
  title.textContent = `${hand}${hero ? " - Hero hand" : ""}`;
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
      return localizedText(
        "Bet primarily for value and protection; these hands can build the pot.",
        "Sázejte primárně pro value a ochranu; tyto handy mohou budovat pot.",
      );
    case "BLUFF":
      return localizedText(
        "Use natural bluffs with equity, blockers, or backdoors when the line requires pressure.",
        "Použijte jako přirozené bluffy s equity, blockery nebo backdoory, když line vyžaduje tlak.",
      );
    case "CHECK":
      return localizedText(
        "Keep these in the check range for showdown value, traps, or give-ups without sufficient equity.",
        "Ponechte v check range pro showdown value, trapy nebo give-up bez dostatečné equity.",
      );
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
    item.setAttribute("aria-label", `Highlight hands in category ${flopzillaCategoryLabel(category)}`);
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

/**
 * A lane's user-facing name at a given decision node.
 *
 * The three lanes are named for a betting node, where checking is what you do
 * when you are not betting. Facing a bet, checking is not a legal action at all,
 * so calling that lane "Check" told the player about a move they cannot make -
 * and it covers both calling and folding, which is the whole decision in that
 * spot. The lane vocabulary stays as it is; only the words change with the node,
 * and the per-hand action carries the call-or-fold distinction.
 */
export function flopzillaLaneLabel(lane: FlopzillaLane, actionNode?: PostflopActionNode): string {
  const facingBet = actionNode !== undefined && FACING_BET_NODES.has(actionNode);
  switch (lane) {
    case "VALUE":
      return facingBet ? "Value raise" : "Value";
    case "BLUFF":
      return facingBet ? "Bluff raise" : "Bluffy";
    case "CHECK":
      return facingBet ? "Call or fold" : "Check";
  }
}

const FACING_BET_NODES = new Set<PostflopActionNode>([
  "FLOP_FACING_BET",
  "TURN_FACING_BET",
  "RIVER_FACING_BET",
]);

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
