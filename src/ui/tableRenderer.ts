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
 * # Zjednodušení odvození akcí (dokumentováno k Req 8.4 / 8.6)
 *
 * `Spot.tableState` nenese plný akční log po jednotlivých sedadlech, pouze
 * souhrn (`facing`, `limpsBefore`, `callsBefore`, `isBvB`). Renderer z něj
 * **deterministicky odvodí** pravděpodobné rozmístění akcí:
 *  - Akční události (LIMP × n → OPEN → CALL × n → 3BET/4BET/JAM) se seřadí
 *    chronologicky a přiřadí se k sedadlům **bezprostředně před hrdinou**
 *    (nejbližší agresor je nejblíž hrdinovi). Jde o vizuální pomůcku, nikoli
 *    o rekonstrukci přesných sedadel skutečné akce.
 *  - Když spot **jmenuje** protihráče (`tableState.vsSeat`, osa otvírače od
 *    15. 9. 2026), otvírač sedí tam, kde ho spot říká: otevření je u té
 *    sedačky, dorovnání u sedaček mezi ní a hrdinou, ostatní před hrdinou
 *    složili. U čelení 3betu je otevření u hrdiny a 3bet u jmenované sedačky
 *    za ním; všichni ostatní složili. Do té doby obrázek dával otvírače na
 *    sedačku těsně před hrdinou - u BB tedy na SB - zatímco range i EV platily
 *    proti jiné, a hráč odpovídal na jinou otázku, než jakou viděl.
 *  - Sedadla před hrdinou bez přiřazené akce se považují za **složená**.
 *  - Sedadla za hrdinou (dosud nejednala) zůstávají **aktivní** (na tahu).
 *  - V režimu Blind-vs-blind je aktivní pouze SB a BB; ostatních 7 sedadel je
 *    složených a případná akce protivníka se zobrazí u druhého blindu.
 *
 * Efektivní hloubka: hrdina má `spot.effStack`. Ostatní aktivní sedadla
 * sdílejí stejnou efektivní hloubku (Efektivní_stack = menší z dvou stacků),
 * takže se u nich zobrazuje táž hodnota `spot.effStack`.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
 */

import type { ActionKey, AnteMode, Card, Position, Spot, Suit } from "../core/types";
import { POSITION_ORDER } from "../core/types";

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
// Akční odznaky (Req 8.4)
// ---------------------------------------------------------------------------

/** Druh odvozené akční události před hrdinou. */
type ActionEvent = "LIMP" | "OPEN" | "CALL" | "3BET" | "4BET" | "JAM";

/** Reprezentativní Akční_klíč pro každou odvozenou událost. */
const EVENT_KEY: Record<ActionEvent, ActionKey> = {
  LIMP: "LIMP",
  OPEN: "OPEN_25X",
  CALL: "CALL",
  "3BET": "3BET",
  "4BET": "4BET",
  JAM: "JAM",
};

/** Český / poker-standardní text odznaku pro daný Akční_klíč. */
const BADGE_LABEL: Record<ActionKey, string> = {
  FOLD: "FOLD",
  CALL: "CALL",
  LIMP: "LIMP",
  OVERLIMP: "OVERLIMP",
  OPEN_2X: "OPEN 2x",
  OPEN_25X: "OPEN 2.5x",
  OPEN_3X: "OPEN 3x",
  ISO_2X: "ISO 2x",
  ISO_25X: "ISO 2.5x",
  ISO_3X: "ISO 3x",
  "3BET": "3-BET",
  "4BET": "4-BET",
  SQUEEZE: "SQUEEZE",
  JAM: "ALL-IN",
  CALL_JAM: "CALL ALL-IN",
};

/** Stav jednoho sedadla pro vykreslení. */
interface SeatRender {
  position: Position;
  isHero: boolean;
  active: boolean;
  /** Akční odznak (Akční_klíč), nebo `null` pokud sedadlo nejednalo. */
  badge: ActionKey | null;
}

/**
 * Sestaví chronologickou sekvenci akčních událostí před hrdinou z `tableState`.
 * Pořadí: limpy → open → cally → poslední agrese (3bet/4bet/jam).
 */
function buildActionEvents(spot: Spot): ActionEvent[] {
  const { tableState } = spot;
  const events: ActionEvent[] = [];

  for (let i = 0; i < tableState.limpsBefore; i++) events.push("LIMP");

  switch (tableState.facing) {
    case "OPEN":
      events.push("OPEN");
      for (let i = 0; i < tableState.callsBefore; i++) events.push("CALL");
      break;
    case "3BET":
      events.push("OPEN");
      for (let i = 0; i < tableState.callsBefore; i++) events.push("CALL");
      events.push("3BET");
      break;
    case "4BET":
      events.push("OPEN");
      events.push("3BET");
      events.push("4BET");
      break;
    case "ALLIN":
      if (!tableState.pushFold) events.push("OPEN");
      events.push("JAM");
      break;
    case "NONE":
    default:
      break;
  }

  return events;
}

/**
 * Odvodí stav všech 9 sedadel (aktivita + akční odznaky) z `spot`.
 *
 * Viz dokumentační blok modulu pro popis zjednodušení.
 */
function deriveSeats(
  spot: Spot,
  positionOrder: readonly Position[] = POSITION_ORDER,
): SeatRender[] {
  const heroPos = spot.heroPos;
  const heroIdx = positionOrder.indexOf(heroPos);

  const seats: SeatRender[] = positionOrder.map((position) => ({
    position,
    isHero: position === heroPos,
    active: true,
    badge: null,
  }));

  const byPos = (p: Position): SeatRender => seats[positionOrder.indexOf(p)];

  if (spot.tableState.isBvB) {
    // Blind-vs-blind: aktivní pouze SB a BB, ostatní složeni.
    for (const seat of seats) {
      if (seat.position !== "SB" && seat.position !== "BB") seat.active = false;
    }
    // Akci (pokud nějaká) zobrazíme u protivníka hrdiny (druhý blind).
    const opponent: Position = heroPos === "SB" ? "BB" : "SB";
    const events = buildActionEvents(spot);
    if (events.length > 0) {
      // Poslední (nejvýznamnější) událost přiřadíme protivníkovi.
      const last = events[events.length - 1];
      byPos(opponent).badge = EVENT_KEY[last];
      byPos(opponent).active = true;
    }
    return seats;
  }

  // Jmenovaný protihráč: akce sedí tam, kde ji spot říká, ne těsně před hrdinou.
  const vsSeat = spot.tableState.vsSeat;
  const vsIdx = vsSeat === undefined ? -1 : positionOrder.indexOf(vsSeat);
  if (vsIdx >= 0 && vsIdx !== heroIdx) {
    const facing = spot.tableState.facing;
    if ((facing === "OPEN") && vsIdx < heroIdx) {
      // Před otvíračem všichni složili; mezi ním a hrdinou dorovnali ti, které
      // spot počítá (`callsBefore`), zbytek složil; za hrdinou se ještě hraje.
      for (let i = 0; i < heroIdx; i++) {
        const seat = seats[i];
        if (i < vsIdx) {
          seat.active = false;
        } else if (i === vsIdx) {
          seat.badge = EVENT_KEY.OPEN;
        } else if (i - vsIdx <= spot.tableState.callsBefore) {
          seat.badge = EVENT_KEY.CALL;
        } else {
          seat.active = false;
        }
      }
      return seats;
    }
    if (facing === "3BET" && vsIdx > heroIdx) {
      // Hrdina otevřel, jmenovaná sedačka za ním zvýšila, ostatní složili.
      for (const seat of seats) {
        if (seat.isHero) seat.badge = EVENT_KEY.OPEN;
        else if (seat.position === vsSeat) seat.badge = EVENT_KEY["3BET"];
        else seat.active = false;
      }
      return seats;
    }
  }

  // Standardní (ne-BvB) rozmístění: události na sedadla bezprostředně před hrdinou.
  const beforePositions = positionOrder.slice(0, heroIdx);
  const events = buildActionEvents(spot);
  const e = Math.min(events.length, beforePositions.length);
  const startIdx = beforePositions.length - e;

  // Sedadla před hrdinou bez přiřazené akce = složená.
  for (let i = 0; i < beforePositions.length; i++) {
    const seat = byPos(beforePositions[i]);
    if (i >= startIdx) {
      const ev = events[i - startIdx];
      seat.badge = EVENT_KEY[ev];
      seat.active = true;
    } else {
      seat.active = false;
    }
  }

  // Pokud událostí bylo víc než dostupných sedadel před hrdinou, zobraz
  // alespoň poslední (nejvýznamnější) agresi u sedadla těsně před hrdinou.
  if (events.length > beforePositions.length && beforePositions.length > 0) {
    const lastSeat = byPos(beforePositions[beforePositions.length - 1]);
    lastSeat.badge = EVENT_KEY[events[events.length - 1]];
    lastSeat.active = true;
  }

  // Sedadla za hrdinou zůstávají aktivní (dosud na tahu) — výchozí active=true.
  return seats;
}

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
  seat: SeatRender,
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
    stackValue.textContent = `${formatBB(spot.effStack)} BB`;
    stack.appendChild(stackChip);
    stack.appendChild(stackValue);
    node.appendChild(stack);
    const stackBar = el("div", "seat__stack-bar");
    const stackFill = el("span");
    stackFill.style.width = `${Math.max(18, Math.min(100, (spot.effStack / 150) * 100))}%`;
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

/** Minimální vložené styly, aby stůl fungoval i bez externího CSS. */
function tableStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
.poker-table{position:relative;isolation:isolate;width:100%;max-width:860px;aspect-ratio:16/10;margin:2px auto 18px;
  min-height:390px;font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;}
.poker-table::before{content:"";position:absolute;left:8%;right:8%;bottom:3%;height:18%;z-index:0;
  border-radius:50%;background:rgba(0,0,0,.34);filter:blur(18px);}
.poker-table__felt{position:absolute;inset:9% 6%;z-index:2;border-radius:50%/48%;
  background:
    radial-gradient(ellipse at 50% 34%,rgba(92,232,157,.22),rgba(92,232,157,0) 43%),
    radial-gradient(ellipse at center,#168052 0%,#0d603e 62%,#073425 100%);
  box-shadow:inset 0 0 0 2px rgba(146,244,190,.12),inset 0 0 52px rgba(0,0,0,.42),
    0 14px 30px rgba(0,0,0,.28);}
.poker-table__rail{position:absolute;inset:5% 2.5%;border-radius:50%/48%;z-index:1;
  background:linear-gradient(145deg,#59616d 0%,#272d36 34%,#4b2631 72%,#171b22 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 0 0 8px rgba(8,12,17,.34),
    inset 0 0 30px rgba(0,0,0,.48),0 18px 38px rgba(0,0,0,.3);}
.poker-table__center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  z-index:3;display:grid;gap:6px;justify-items:center;text-align:center;min-width:170px;
  padding:10px 13px;border-radius:8px;background:rgba(5,27,20,.58);
  border:1px solid rgba(203,255,226,.13);box-shadow:0 8px 18px rgba(0,0,0,.18);}
.poker-table .pot{color:#f2f7ff;font-weight:950;font-size:16px;text-align:center;
  text-shadow:0 1px 8px rgba(0,0,0,.45);}
.poker-table__chip-stack{display:flex;align-items:flex-end;justify-content:center;gap:4px;height:21px;}
.poker-table__chip-stack span{display:block;width:23px;height:10px;border-radius:999px;
  background:linear-gradient(180deg,#f8fbff,#9fb2d5 48%,#53617a);
  border:1px solid rgba(255,255,255,.45);box-shadow:0 5px 10px rgba(0,0,0,.24),
    inset 0 1px 0 rgba(255,255,255,.8);}
.poker-table__chip-stack span:nth-child(2){height:15px;background:linear-gradient(180deg,#7bd3ff,#2f87d8 52%,#174170);}
.poker-table__chip-stack span:nth-child(3){height:12px;background:linear-gradient(180deg,#ffd15b,#da8b25 52%,#7d4117);}
.poker-table .seat{position:absolute;left:var(--seat-left);top:var(--seat-top);
  transform:translate(-50%,-50%);width:132px;min-height:80px;padding:8px 9px;border-radius:8px;z-index:5;
  background:linear-gradient(180deg,rgba(39,43,50,.98),rgba(18,21,26,.98));
  color:#e8ecf7;border:1px solid rgba(188,199,214,.26);box-shadow:0 12px 26px rgba(0,0,0,.36),
  inset 0 1px 0 rgba(255,255,255,.08);font-size:12px;text-align:center;box-sizing:border-box;overflow:visible;}
.poker-table .seat__header{display:flex;align-items:center;justify-content:center;gap:6px;}
.poker-table .seat__status{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#2bd576;
  box-shadow:0 0 0 2px rgba(43,213,118,.14),0 0 8px rgba(43,213,118,.44);}
.poker-table .seat__status[data-state="folded"]{background:#7d8797;box-shadow:none;}
.poker-table .seat__pos{font-weight:950;color:#f8fbff;}
.poker-table .seat__stack{display:flex;align-items:center;justify-content:center;gap:5px;color:#d8e5f8;
  font-size:11px;font-weight:900;margin-top:4px;}
.poker-table .seat__stack-chip{width:10px;height:10px;flex:0 0 10px;border-radius:50%;background:#e84f5f;
  border:2px dashed rgba(255,255,255,.68);box-shadow:0 2px 4px rgba(0,0,0,.3);box-sizing:border-box;}
.poker-table .seat__stack-bar{height:4px;border-radius:999px;background:rgba(255,255,255,.13);overflow:hidden;margin-top:3px;}
.poker-table .seat__stack-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7bd3ff,#2bd576);}
.poker-table .seat__folded-label{color:#94a0b8;font-size:10px;font-style:italic;margin-top:5px;}
.poker-table .seat__tag{display:inline-block;font-size:9px;font-weight:950;color:#062a1b;
  background:#57e99a;border-radius:4px;padding:2px 6px;margin-top:4px;}
.poker-table .seat--hero{border-color:#57e99a;background:linear-gradient(180deg,rgba(25,105,69,.99),rgba(8,53,36,.99));
  box-shadow:0 0 0 2px rgba(87,233,154,.12),0 16px 32px rgba(0,0,0,.38);}
.poker-table .seat--folded{opacity:.46;filter:saturate(.35);}
.poker-table .position-mark{font-size:9px;font-weight:900;border-radius:50%;
  width:20px;height:20px;line-height:20px;display:inline-block;}
.poker-table .badge-btn{background:#f5f5f5;color:#1b1f2a;}
.poker-table .badge-sb{background:#7bd3ff;color:#08263a;}
.poker-table .badge-bb{background:#ffd15b;color:#3a2c08;}
.poker-table .action-badge{margin-top:5px;font-size:10px;font-weight:900;
  background:rgba(255,209,91,.18);border:1px solid rgba(255,209,91,.45);
  border-radius:4px;padding:2px 7px;display:inline-block;color:#ffe39a;}
.poker-table .hero-cards{display:flex;gap:4px;justify-content:center;margin-top:4px;}
.poker-table .hole-card{background:linear-gradient(180deg,#fff,#eef2f8);border-radius:6px;min-width:26px;height:34px;
  padding:1px 4px;font-weight:950;font-size:14px;display:flex;align-items:center;justify-content:center;gap:1px;
  box-shadow:0 7px 14px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.7);
  border:1px solid rgba(0,0,0,.06);}
@media (max-width:640px){
  .poker-table{aspect-ratio:auto;min-height:540px;max-width:390px;margin-bottom:28px;}
  .poker-table__rail{inset:8% 0;border-radius:44%;}
  .poker-table__felt{inset:12% 3%;border-radius:44%;}
  .poker-table__center{min-width:150px;padding:9px 10px;top:49%;}
  .poker-table__chip-stack{height:18px;}
  .poker-table__chip-stack span{width:20px;height:8px;}
  .poker-table__chip-stack span:nth-child(2){height:13px;}
  .poker-table__chip-stack span:nth-child(3){height:11px;}
  .poker-table .seat{left:var(--seat-mobile-left);top:var(--seat-mobile-top);
    width:104px;min-height:78px;padding:6px;border-radius:7px;}
  .poker-table .hole-card{min-width:24px;height:31px;font-size:13px;}
}
`;
  return style;
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
  table.appendChild(tableStyles());

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

  const chipStack = el("div", "poker-table__chip-stack");
  for (let i = 0; i < 3; i += 1) {
    chipStack.appendChild(document.createElement("span"));
  }
  center.appendChild(chipStack);
  table.appendChild(center);

  // 9 sedadel (Req 8.1, bijektivně přes POSITION_ORDER).
  const seats = deriveSeats(spot, positionOrder);
  const heroIdx = positionOrder.indexOf(spot.heroPos);
  for (const seat of seats) {
    // Slot 0 = hrdina dole; ostatní rotačně dle pořadí pozic.
    const slot = (positionOrder.indexOf(seat.position) - heroIdx + positionOrder.length) %
      positionOrder.length;
    table.appendChild(renderSeat(seat, spot, slot, positionOrder.length));
  }

  root.appendChild(table);
}
