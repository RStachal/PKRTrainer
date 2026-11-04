import { GRID_SIZE, handLabel } from "../../core/poker";
import type { HandLabel } from "../../core/types";
import { localizedText } from "../cs";

/** Jedna buňka matice: čím je ruka obarvená a co o ní slyší čtečka. */
export interface HandMatrixCell {
  /** Barva akce; bez ní ruka v range není a buňka zůstane prázdná. */
  color?: string;
  /** Šrafování (blaf): význam nesmí nést jen barva (směr, bod 6). */
  hatched?: boolean;
  /**
   * Klíče legendy, podle kterých se matice zúží na jednu skupinu. Buňka jich
   * může mít víc: blaf sází, takže patří k sázce i k blafům.
   */
  groups?: readonly string[];
  /**
   * Strategie té třídy jako pruhy akcí zleva doprava. Bez ní má buňka plnou
   * barvu `color`. Podíly se převedou na procenta, součet nemusí být 1.
   */
  mix?: readonly { color: string; share: number }[];
  /** Co buňka znamená, slovy: popisek pro čtečku i bublina. */
  description: string;
}

/**
 * Pruhy akcí jako jeden gradient s ostrými přechody: žádné prvky navíc ve 169
 * buňkách a žádné CSS navíc (rozpočet stylů je na 79,96 z 80 KiB).
 */
function mixGradient(mix: readonly { color: string; share: number }[]): string | undefined {
  const parts = mix.filter((part) => Number.isFinite(part.share) && part.share > 0);
  const total = parts.reduce((sum, part) => sum + part.share, 0);
  if (parts.length === 0 || total <= 0) return undefined;
  let from = 0;
  const stops = parts.map((part, index) => {
    const to = index === parts.length - 1 ? 100 : from + (part.share / total) * 100;
    const stop = `${part.color} ${Number(from.toFixed(2))}% ${Number(to.toFixed(2))}%`;
    from = to;
    return stop;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Šrafování blafu, jak ho má CSS (`[data-hatched]`), nad pruhy akcí. */
const HATCH = "repeating-linear-gradient(135deg, var(--dx-matrix-hatch) 0 2px, transparent 2px 6px)";

export interface HandMatrixConfig {
  /** Název mřížky pro čtečku. */
  label: string;
  cell: (hand: HandLabel) => HandMatrixCell;
  /** Ruka hráče: má vlastní rámeček, jiný než barva i výběr. */
  hero?: HandLabel;
  /** Ruka vybraná na začátku; výchozí je ruka hráče. */
  selected?: HandLabel;
  onSelect: (hand: HandLabel) => void;
}

export interface HandMatrix {
  readonly element: HTMLDivElement;
  /** Vybere ruku; s `focus` na ni přesune i zaměření. Neohlásí `onSelect`. */
  select(hand: HandLabel, focus?: boolean): void;
  /** Ztlumí buňky mimo skupinu; `null` vrátí všechny. */
  highlight(group: string | null): void;
}

/**
 * Matice 13×13 pro nové GUI (Agents/ui-redesign-plan.md, fáze 2).
 *
 * Řádky nesou vlastní mřížku třinácti sloupců, takže sloupce sedí pod sebou
 * a matice se na telefonu zúží, místo aby se posouvala do strany. Záhlaví
 * s hodnotami karet nemá: popisek buňky je nese a čtrnáctý sloupec by na
 * 360 px vzal buňkám dva pixely.
 *
 * Ovládá se podle vzoru mřížky WAI-ARIA: do matice vede tabulátor jen na
 * vybranou buňku, šipky, Home a End přesouvají zaměření a výběr jde s ním.
 */
export function handMatrix(doc: Document, config: HandMatrixConfig): HandMatrix {
  const root = doc.createElement("div");
  root.className = "dx-matrix";
  root.setAttribute("role", "grid");
  root.setAttribute("aria-label", config.label);

  const grid: HTMLElement[][] = [];
  const byHand = new Map<HandLabel, HTMLElement>();
  for (let row = 0; row < GRID_SIZE; row += 1) {
    const line = doc.createElement("div");
    line.className = "dx-matrix__row";
    line.setAttribute("role", "row");
    grid.push([]);
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const hand = handLabel(row, column);
      const data = config.cell(hand);
      const cell = doc.createElement("div");
      cell.className = "dx-matrix__cell";
      cell.setAttribute("role", "gridcell");
      cell.tabIndex = -1;
      cell.setAttribute("aria-selected", "false");
      cell.dataset.hand = hand;
      if (data.color === undefined) cell.dataset.empty = "true";
      else cell.style.setProperty("--action-accent", data.color);
      if (data.hatched === true) cell.dataset.hatched = "true";
      const gradient = data.color === undefined || data.mix === undefined ? undefined : mixGradient(data.mix);
      if (gradient !== undefined) {
        cell.dataset.mixed = "true";
        cell.style.backgroundImage = data.hatched === true ? `${HATCH}, ${gradient}` : gradient;
      }
      if (data.groups !== undefined) cell.dataset.groups = data.groups.join(" ");
      const hero = hand === config.hero;
      if (hero) cell.dataset.hero = "true";
      const description = hero
        ? `${data.description} (${localizedText("your hand", "tvoje ruka")})`
        : data.description;
      cell.title = `${hand}: ${description}`;
      cell.setAttribute("aria-label", cell.title);
      const label = doc.createElement("span");
      label.className = "dx-matrix__label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = hand;
      cell.appendChild(label);
      line.appendChild(cell);
      grid[row].push(cell);
      byHand.set(hand, cell);
    }
    root.appendChild(line);
  }

  let selected: HTMLElement | null = null;

  function select(hand: HandLabel, focus = false): void {
    const cell = byHand.get(hand);
    if (cell === undefined) return;
    if (selected !== null && selected !== cell) {
      selected.setAttribute("aria-selected", "false");
      selected.tabIndex = -1;
    }
    selected = cell;
    cell.setAttribute("aria-selected", "true");
    cell.tabIndex = 0;
    if (focus) cell.focus();
  }

  function choose(cell: HTMLElement): void {
    const hand = cell.dataset.hand as HandLabel;
    select(hand, true);
    config.onSelect(hand);
  }

  root.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const cell = target?.closest<HTMLElement>(".dx-matrix__cell");
    if (cell && root.contains(cell)) choose(cell);
  });

  root.addEventListener("keydown", (event) => {
    // Od buňky se zaměřením, ne od vybrané: obvykle jsou totéž, ale zaměření
    // se dá přesunout i jinak než klávesou (čtečka, skript).
    const current = (event.target as Element | null)?.closest<HTMLElement>(".dx-matrix__cell");
    if (!current || !root.contains(current)) return;
    const row = grid.findIndex((cells) => cells.includes(current));
    const column = grid[row].indexOf(current);
    const last = GRID_SIZE - 1;
    let target: [number, number] | null = null;
    switch (event.key) {
      case "ArrowRight": target = [row, Math.min(last, column + 1)]; break;
      case "ArrowLeft": target = [row, Math.max(0, column - 1)]; break;
      case "ArrowDown": target = [Math.min(last, row + 1), column]; break;
      case "ArrowUp": target = [Math.max(0, row - 1), column]; break;
      case "Home": target = event.ctrlKey ? [0, 0] : [row, 0]; break;
      case "End": target = event.ctrlKey ? [last, last] : [row, last]; break;
      case "Enter":
      case " ": target = [row, column]; break;
      default: return;
    }
    event.preventDefault();
    choose(grid[target[0]][target[1]]);
  });

  // Bez výběru by se do matice tabulátorem nedalo vstoupit vůbec.
  select(config.selected ?? config.hero ?? handLabel(0, 0));

  return {
    element: root,
    select,
    highlight(group) {
      for (const cell of byHand.values()) {
        const groups = cell.dataset.groups?.split(" ") ?? [];
        if (group !== null && !groups.includes(group)) cell.dataset.muted = "true";
        else delete cell.dataset.muted;
      }
    },
  };
}

/** Kombinace v třídě: 6 u páru, 4 suited, 12 offsuit. */
export function combosInClass(hand: HandLabel): number {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}
