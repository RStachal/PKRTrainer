import type { HandLabel } from "../../core/types";
import { localizedText } from "../cs";
import { handMatrix, type HandMatrixCell } from "./handMatrix";
import { formatSharePercent, strategyBar, type StrategySegment } from "./strategyBar";

/**
 * Podíl do legendy. Nenulový podíl pod půl procenta je „<1 %“: „0 %“ u
 * položky, která v matici svítí, by tvrdilo, že tam nic není.
 */
export function formatLegendShare(share: number): string {
  if (share > 0 && share < 0.005) return localizedText("<1%", "<1 %");
  return formatSharePercent(share);
}

/** Položka legendy: zvýrazní svou skupinu buněk v matici. */
export interface RangeLegendEntry {
  group: string;
  label: string;
  color: string;
  hatched?: boolean;
  /** Číslo za názvem, například „42 %“; bez něj jen název. */
  value?: string;
}

export interface RangeViewConfig {
  /** Název matice pro čtečku. */
  label: string;
  cell: (hand: HandLabel) => HandMatrixCell;
  hero?: HandLabel;
  /** Ruka vybraná na začátku, když to nemá být ruka hráče. */
  selected?: HandLabel;
  /** Celá range: pruh, věta pod ním a legenda, která zvýrazňuje. */
  summary: {
    title: string;
    segments: readonly StrategySegment[];
    text?: string;
    legend: readonly RangeLegendEntry[];
  };
  /** Obsah detailu vybrané ruky pod nadpisem s rukou. */
  detail: (hand: HandLabel) => readonly (Node | string)[];
  /** Věty pod souhrnem: co matice ukazuje a z čeho. */
  notes?: readonly string[];
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Range v dialogu nového GUI (Agents/ui-redesign-plan.md, fáze 2): matice,
 * detail vybrané ruky a souhrn celé range s legendou.
 *
 * Detail stojí hned pod maticí. Na telefonu je pod ní a klepnutí na buňku
 * ukáže výsledek tam, kam hráč právě dívá; na desktopu je vedle ní.
 */
export function rangeView(doc: Document, config: RangeViewConfig): HTMLElement {
  const root = el(doc, "div", "dx-range");
  const side = el(doc, "div", "dx-range__side");

  const detail = el(doc, "section", "dx-panel dx-range__panel dx-range__detail");
  const heading = el(doc, "h3", "dx-range__title");
  const body = el(doc, "div", "dx-range__body");
  detail.append(heading, body);

  function showDetail(hand: HandLabel): void {
    detail.dataset.hand = hand;
    heading.replaceChildren(hand);
    if (hand === config.hero) {
      heading.append(el(doc, "span", "dx-range__hero", ` · ${localizedText("your hand", "tvoje ruka")}`));
    }
    body.replaceChildren(...config.detail(hand));
  }

  const matrix = handMatrix(doc, {
    label: config.label,
    cell: config.cell,
    ...(config.hero === undefined ? {} : { hero: config.hero }),
    ...(config.selected === undefined ? {} : { selected: config.selected }),
    onSelect: showDetail,
  });
  const matrixWrap = el(doc, "div", "dx-range__grid");
  matrixWrap.appendChild(matrix.element);

  const summary = el(doc, "section", "dx-panel dx-range__panel dx-range__summary");
  summary.appendChild(el(doc, "h3", "dx-range__title", config.summary.title));
  if (config.summary.segments.length > 0) {
    summary.appendChild(strategyBar(doc, config.summary.segments, { label: config.summary.title }));
  }
  if (config.summary.text !== undefined) {
    summary.appendChild(el(doc, "p", "dx-trainer__note", config.summary.text));
  }

  const legend = el(doc, "div", "dx-range__legend");
  legend.setAttribute("role", "group");
  legend.setAttribute("aria-label", localizedText("Highlight in the matrix", "Zvýraznit v matici"));
  let active: string | null = null;
  const keys = config.summary.legend.map((entry) => {
    const key = el(doc, "button", "dx-btn dx-btn--secondary dx-range__key");
    key.type = "button";
    key.dataset.group = entry.group;
    key.setAttribute("aria-pressed", "false");
    const swatch = el(doc, "span", "dx-range__swatch");
    swatch.setAttribute("aria-hidden", "true");
    swatch.style.setProperty("--action-accent", entry.color);
    if (entry.hatched === true) swatch.dataset.hatched = "true";
    key.append(swatch, entry.label);
    if (entry.value !== undefined) key.append(el(doc, "span", "dx-range__value", entry.value));
    key.addEventListener("click", () => {
      active = active === entry.group ? null : entry.group;
      for (const other of keys) other.setAttribute("aria-pressed", String(other.dataset.group === active));
      matrix.highlight(active);
    });
    return key;
  });
  if (keys.length > 0) {
    legend.append(...keys);
    summary.appendChild(legend);
  }

  side.append(detail, summary);
  for (const note of config.notes ?? []) side.appendChild(el(doc, "p", "dx-trainer__note", note));
  root.append(matrixWrap, side);

  const first = matrix.element.querySelector<HTMLElement>('[aria-selected="true"]')?.dataset.hand;
  showDetail((first ?? config.hero ?? "AA") as HandLabel);
  return root;
}

/** Řádek detailu „Název: hodnota“, s názvem tlumeně. */
export function rangeDetailLine(doc: Document, name: string, value: string): HTMLParagraphElement {
  const line = el(doc, "p", "dx-range__line");
  line.append(el(doc, "span", "dx-range__line-name", `${name}: `), value);
  return line;
}
