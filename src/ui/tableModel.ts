/**
 * Kdo u stolu sedí, kdo složil a kdo jakou akci udělal - bez DOM.
 *
 * Vytaženo 23. 10. 2026 z `tableRenderer.ts`, aby starý stůl i nový stůl
 * redesignu (Agents/ui-redesign-plan.md, fáze 1) kreslily totéž rozmístění.
 * Dvě kopie téhle logiky by se rozešly v tom nejdražším: obrázek by ukazoval
 * jinou situaci, než pro kterou platí range (bod 234 deníku).
 *
 * # Zjednodušení odvození akcí (dokumentováno k Req 8.4 / 8.6)
 *
 * `Spot.tableState` nenese plný akční log po jednotlivých sedadlech, pouze
 * souhrn (`facing`, `limpsBefore`, `callsBefore`, `isBvB`). Z něj se
 * **deterministicky odvodí** pravděpodobné rozmístění akcí:
 *  - Akční události (LIMP × n → OPEN → CALL × n → 3BET/4BET/JAM) se seřadí
 *    chronologicky a přiřadí se k sedadlům **bezprostředně před hrdinou**
 *    (nejbližší agresor je nejblíž hrdinovi). Jde o vizuální pomůcku, nikoli
 *    o rekonstrukci přesných sedadel skutečné akce.
 *  - Když spot **jmenuje** protihráče (`tableState.vsSeat`, osa otvírače od
 *    15. 9. 2026), otvírač sedí tam, kde ho spot říká: otevření je u té
 *    sedačky, dorovnání u sedaček mezi ní a hrdinou, ostatní před hrdinou
 *    složili. U čelení 3betu je otevření u hrdiny a 3bet u jmenované sedačky
 *    za ním; všichni ostatní složili.
 *  - Sedadla před hrdinou bez přiřazené akce se považují za **složená**.
 *  - Sedadla za hrdinou (dosud nejednala) zůstávají **aktivní** (na tahu).
 *  - V režimu Blind-vs-blind je aktivní pouze SB a BB; ostatních 7 sedadel je
 *    složených a případná akce protivníka se zobrazí u druhého blindu.
 */

import type { ActionKey, Position, Spot } from "../core/types";
import { POSITION_ORDER } from "../core/types";

/** Stav jednoho sedadla pro vykreslení. */
export interface TableSeat {
  position: Position;
  isHero: boolean;
  active: boolean;
  /** Akční odznak (Akční_klíč), nebo `null` pokud sedadlo nejednalo. */
  badge: ActionKey | null;
}

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

/** Poker-standardní text odznaku pro daný Akční_klíč. */
export const BADGE_LABEL: Readonly<Record<ActionKey, string>> = {
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
export function deriveSeats(
  spot: Spot,
  positionOrder: readonly Position[] = POSITION_ORDER,
): TableSeat[] {
  const heroPos = spot.heroPos;
  const heroIdx = positionOrder.indexOf(heroPos);

  const seats: TableSeat[] = positionOrder.map((position) => ({
    position,
    isHero: position === heroPos,
    active: true,
    badge: null,
  }));

  const byPos = (p: Position): TableSeat => seats[positionOrder.indexOf(p)];

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
      /*
       * Před otvíračem všichni složili; mezi ním a hrdinou dorovnali ti, které
       * spot počítá, zbytek složil; za hrdinou se ještě hraje.
       *
       * Když spot **jmenuje** dorovnávající (osa 4a), kreslí se call na ně, ne
       * na sedačky těsně za otvíračem. Bez toho by stůl u záznamu `vsUTG @CO`
       * nakreslil call na UTG+1 - tedy na jinou sedačku, než pro kterou ta range
       * platí, a hráč by odpovídal na jinou otázku než obrázek. Je to tatáž vada
       * jako bod 234 u otvírače, jen o osu dál; vlastník si v T4 vyžádal, aby
       * drill rozdanou sedačku **ukázal**.
       */
      const named = spot.tableState.flatCallers;
      const namedIdx = named === undefined
        ? undefined
        : new Set(named.map((seat) => positionOrder.indexOf(seat as Position)));
      for (let i = 0; i < heroIdx; i++) {
        const seat = seats[i];
        if (i < vsIdx) {
          seat.active = false;
        } else if (i === vsIdx) {
          seat.badge = EVENT_KEY.OPEN;
        } else if (namedIdx === undefined
          ? i - vsIdx <= spot.tableState.callsBefore
          : namedIdx.has(i)) {
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

/** Pořadí sedadla od hrdiny po směru: hrdina 0, další dokola. */
export function seatSlot(
  position: Position,
  heroPos: Position,
  positionOrder: readonly Position[] = POSITION_ORDER,
): number {
  const count = positionOrder.length;
  return (positionOrder.indexOf(position) - positionOrder.indexOf(heroPos) + count) % count;
}
