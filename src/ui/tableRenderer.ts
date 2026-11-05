/**
 * Table_Renderer — vykreslení 9-handed full ring stolu připomínajícího klienta
 * pokerové herny (Req 8).
 *
 * Zodpovědnosti:
 * - Ovál stolu s právě 9 sedadly, každé označené právě jednou z 9 Pozic
 *   (bijektivně dle `POSITION_ORDER`) — Req 8.1.
 * - Vizuální odlišení právě jednoho sedadla hrdiny — Req 8.2.
 * - Hrdinovy právě 2 hole karty (hodnota + barva, vzájemně rozlišitelné) — Req 8.3.
 * - Akční odznak u sedadel, která provedla akci — Req 8.4.
 * - Velikost potu v BB na ≤ 1 desetinné místo dle stavu ante — Req 8.5.
 * - Efektivní stack v BB na ≤ 1 desetinné místo u aktivních sedadel — Req 8.6.
 * - Rozlišitelné značky BTN / SB / BB — Req 8.7.
 * - Vizuální odlišení složených / neaktivních sedadel — Req 8.8.
 *
 * Kdo složil, kdo jakou akci udělal a kde sedí jmenovaný protihráč, odvozuje
 * `tableModel.ts` (`deriveSeats`); tenhle soubor to jen kreslí. Nový stůl
 * redesignu kreslí totéž z téhož modelu.
 *
 * Efektivní hloubka: hrdina má `spot.effStack`. Ostatní aktivní sedadla
 * sdílejí stejnou efektivní hloubku (Efektivní_stack = menší z dvou stacků),
 * takže se u nich zobrazuje táž hodnota `spot.effStack`.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
 */

import type { AnteMode, Card, Position, Spot, Suit } from "../core/types";
import { POSITION_ORDER } from "../core/types";
import { BADGE_LABEL, deriveSeats, seatSlot, type TableSeat } from "./tableModel";

// ---------------------------------------------------------------------------
// Čistá funkce formátování hodnot v BB (Property 21, Req 8.5 / 8.6)
// ---------------------------------------------------------------------------

/**
 * Naformátuje hodnotu v BB do textu s **nejvýše jedním desetinným místem**.
 *
 * Pravidla:
 * - Zaokrouhlí na 1 desetinné místo (matematicky, "half up").
 * - Celé hodnoty vrací bez desetinné části (např. `100` → `"100"`).
 * - Necelé hodnoty vrací s právě jedním desetinným místem (`12.34` → `"12.3"`,
 *   `2.5` → `"2.5"`).
 * - Nečíselné / nekonečné vstupy mapuje na `"0"` (defenzivní fallback).
 *
 * Funkce je **čistá** (bez vedlejších efektů) a testovatelná samostatně
 * (Property 21).
 *
 * @param value Hodnota v BB.
 * @returns Textová reprezentace s ≤ 1 desetinným místem.
 */
export function formatBB(value: number): string {
  if (!Number.isFinite(value)) return "0";
  // Zaokrouhlení na 1 desetinné místo; +0 normalizuje případnou -0.
  const rounded = Math.round(value * 10) / 10 + 0;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

// ---------------------------------------------------------------------------
// Startovní pot dle stavu ante (Req 8.5, Property 13)
// ---------------------------------------------------------------------------

/** Startovní pot s aktivním big blind ante (SB 0,5 + BB 1 + ante 1). */
const POT_ANTE_ON = 2.5;
/** Startovní pot bez ante (SB 0,5 + BB 1). */
const POT_ANTE_OFF = 1.5;

/**
 * Vrátí startovní velikost potu v BB.
 *
 * Použije `spot.startingPot`, je-li k dispozici; jinak dopočítá z `ante`
 * (ON ⇒ 2,5 BB, OFF ⇒ 1,5 BB). (Req 8.5)
 */
export function startingPotBB(spot: Spot, ante: AnteMode): number {
  if (typeof spot.startingPot === "number" && Number.isFinite(spot.startingPot)) {
    return spot.startingPot;
  }
  return ante === "ON" ? POT_ANTE_ON : POT_ANTE_OFF;
}

// ---------------------------------------------------------------------------
// Mapování barev a hodnot karet (Req 8.3)
// ---------------------------------------------------------------------------

/** Unicode symboly barev pro zobrazení karet. */
const SUIT_SYMBOL: Record<Suit, string> = {
  s: "\u2660", // ♠
  h: "\u2665", // ♥
  d: "\u2666", // ♦
  c: "\u2663", // ♣
};

/** Four-color deck — vzájemně rozlišitelné barvy textu karet. */
const SUIT_COLOR: Record<Suit, string> = {
  s: "#1b1f2a", // spade — tmavá
  h: "#e23b3b", // heart — červená
  d: "#2b7de0", // diamond — modrá
  c: "#1f9d57", // club — zelená
};

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Geometrie sedadla na oválu (v procentech kontejneru). */
function seatPosition(slot: number, seatCount: number): { left: number; top: number } {
  // slot 0 = hrdina dole uprostřed; další sedadla po 40° dokola.
  const angle = Math.PI / 2 + slot * ((2 * Math.PI) / seatCount);
  const left = 50 + 44 * Math.cos(angle);
  const top = 50 + 42 * Math.sin(angle);
  return { left, top };
}

function seatPositionMobile(slot: number, seatCount: number): { left: number; top: number } {
  const angle = Math.PI / 2 + slot * ((2 * Math.PI) / seatCount);
  return {
    left: 50 + 34 * Math.cos(angle),
    top: 50 + 40 * Math.sin(angle),
  };
}

/** Vykreslí jednu hole kartu hrdiny (Req 8.3). */
function renderHoleCard(card: Card): HTMLElement {
  const node = el("div", `hole-card hole-card--${card.suit}`);
  node.dataset.rank = card.rank;
  node.dataset.suit = card.suit;
  node.style.color = SUIT_COLOR[card.suit];

  const rank = el("span", "hole-card__rank");
  rank.textContent = card.rank;
  const suit = el("span", "hole-card__suit");
  suit.textContent = SUIT_SYMBOL[card.suit];

  node.appendChild(rank);
  node.appendChild(suit);
  return node;
}

/** Vykreslí značku pozice (BTN / SB / BB), pokud sedadlu náleží (Req 8.7). */
function renderPositionMark(position: Position): HTMLElement | null {
  if (position === "BTN") {
    const m = el("span", "position-mark badge-btn");
    m.textContent = "BTN";
    return m;
  }
  if (position === "SB") {
    const m = el("span", "position-mark badge-sb");
    m.textContent = "SB";
    return m;
  }
  if (position === "BB") {
    const m = el("span", "position-mark badge-bb");
    m.textContent = "BB";
    return m;
  }
  return null;
}

/** Vykreslí jedno sedadlo. */
function renderSeat(
  seat: TableSeat,
  spot: Spot,
  slot: number,
  seatCount: number,
): HTMLElement {
  const classes = ["seat"];
  if (seat.isHero) classes.push("seat--hero");
  classes.push(seat.active ? "seat--active" : "seat--folded");

  const node = el("div", classes.join(" "));
  node.dataset.position = seat.position;
  node.dataset.active = String(seat.active);
  const pos = seatPosition(slot, seatCount);
  const mobilePos = seatPositionMobile(slot, seatCount);
  node.style.setProperty("--seat-left", `${pos.left}%`);
  node.style.setProperty("--seat-top", `${pos.top}%`);
  node.style.setProperty("--seat-mobile-left", `${mobilePos.left}%`);
  node.style.setProperty("--seat-mobile-top", `${mobilePos.top}%`);

  // Hlavička sedadla: název pozice + případná značka BTN/SB/BB.
  const header = el("div", "seat__header");
  const status = el("span", "seat__status");
  status.dataset.state = seat.active ? "active" : "folded";
  status.setAttribute("aria-hidden", "true");
  header.appendChild(status);
  const posLabel = el("span", "seat__pos");
  posLabel.textContent = seat.position;
  header.appendChild(posLabel);
  const mark = renderPositionMark(seat.position);
  if (mark) header.appendChild(mark);
  node.appendChild(header);

  // Hrdinův štítek (Req 8.2).
  if (seat.isHero) {
    const tag = el("span", "seat__tag");
    tag.textContent = "YOU";
    node.appendChild(tag);
  }

  // Efektivní stack pouze u aktivních sedadel (Req 8.6).
  if (seat.active) {
    const stack = el("div", "seat__stack");
    const stackChip = el("span", "seat__stack-chip");
    stackChip.setAttribute("aria-hidden", "true");
    const stackValue = el("span", "seat__stack-value");
    // Se scénářem (ICM) má každá sedačka vlastní stack; bez něj se kreslí
    // efektivní hloubka, protože o ostatních stacích spot nic netvrdí.
    const seatStackBB = spot.seatStacks?.[seat.position] ?? spot.effStack;
    stackValue.textContent = `${formatBB(seatStackBB)} BB`;
    stack.appendChild(stackChip);
    stack.appendChild(stackValue);
    node.appendChild(stack);
    const stackBar = el("div", "seat__stack-bar");
    const stackFill = el("span");
    stackFill.style.width = `${Math.max(18, Math.min(100, (seatStackBB / 150) * 100))}%`;
    stackBar.appendChild(stackFill);
    node.appendChild(stackBar);
  } else {
    const folded = el("div", "seat__folded-label");
    folded.textContent = "folded";
    node.appendChild(folded);
  }

  // Akční odznak (Req 8.4).
  if (seat.badge) {
    const badge = el("div", "action-badge");
    badge.dataset.action = seat.badge;
    badge.textContent = BADGE_LABEL[seat.badge];
    node.appendChild(badge);
  }

  // Hrdinovy 2 hole karty (Req 8.3).
  if (seat.isHero) {
    const cards = el("div", "hero-cards");
    const [c1, c2] = spot.heroCards;
    cards.appendChild(renderHoleCard(c1));
    cards.appendChild(renderHoleCard(c2));
    node.appendChild(cards);
  }

  return node;
}

// ---------------------------------------------------------------------------
// Hlavní vykreslovací funkce (Req 8)
// ---------------------------------------------------------------------------

/**
 * Vykreslí grafiku stolu pro daný `spot` do `root`.
 *
 * Idempotentní: před vykreslením vyprázdní `root`. Vytváří DOM elementy se
 * sémantickými třídami pro testovatelnost (`.seat`, `.seat--hero`,
 * `.seat--folded`, `.hole-card`, `.action-badge`, `.pot`, `.badge-btn`,
 * `.badge-sb`, `.badge-bb`).
 *
 * @param spot Tréninková situace.
 * @param ante Aktuální stav big blind ante (ovlivňuje velikost potu).
 * @param root Cílový kontejner.
 */
export function renderTable(
  spot: Spot,
  ante: AnteMode,
  root: HTMLElement,
  positionOrder: readonly Position[] = POSITION_ORDER,
): void {
  root.innerHTML = "";

  const table = el("div", "poker-table");

  const felt = el("div", "poker-table__felt");
  table.appendChild(felt);

  const rail = el("div", "poker-table__rail");
  table.appendChild(rail);

  const center = el("div", "poker-table__center");

  // Pot uprostřed stolu (Req 8.5).
  const potBB = startingPotBB(spot, ante);
  const pot = el("div", "pot");
  pot.dataset.potBb = String(potBB);
  pot.textContent = `Pot: ${formatBB(potBB)} BB`;
  center.appendChild(pot);
  // Scénář: hráč musí vidět, pod jakým rozložením stacků range platí - to je
  // celý rozdíl mezi dvěma ICM mřížkami téže buňky (bod 256).
  if (spot.seatStacks !== undefined) {
    const scenario = el("div", "poker-table__scenario");
    scenario.textContent = `ICM: ${positionOrder
      .filter((position) => spot.seatStacks?.[position] !== undefined)
      .map((position) => `${position} ${formatBB(spot.seatStacks?.[position] ?? 0)}`)
      .join(" · ")} BB`;
    center.appendChild(scenario);
  }

  const chipStack = el("div", "poker-table__chip-stack");
  for (let i = 0; i < 3; i += 1) {
    chipStack.appendChild(document.createElement("span"));
  }
  center.appendChild(chipStack);
  table.appendChild(center);

  // 9 sedadel (Req 8.1, bijektivně přes POSITION_ORDER).
  const seats = deriveSeats(spot, positionOrder);
  for (const seat of seats) {
    // Slot 0 = hrdina dole; ostatní rotačně dle pořadí pozic.
    const slot = seatSlot(seat.position, spot.heroPos, positionOrder);
    table.appendChild(renderSeat(seat, spot, slot, positionOrder.length));
  }

  root.appendChild(table);
}
