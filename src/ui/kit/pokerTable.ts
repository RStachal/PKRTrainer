import {
  villainActionBeforeHero,
  type PostflopTrainingSpot,
  type PostflopVillainAction,
} from "../../core/postflopTrainingSpot";
import type { AnteMode, Card, Position, Spot } from "../../core/types";
import { POSITION_ORDER } from "../../core/types";
import { localizedText } from "../cs";
import { colorForActionKey, colorForPostflopAction } from "../rangeMatrixView";
import { BADGE_LABEL, deriveSeats, seatSlot, type TableSeat } from "../tableModel";
import { startingPotBB } from "../tableRenderer";
import { formatBbAmount } from "./format";
import { playingCard, playingCardName } from "./playingCard";

/**
 * Stůl nové obrazovky tréninku (Agents/ui-redesign-plan.md, fáze 1).
 *
 * Kreslí totéž rozmístění jako starý stůl (`tableModel.ts`), jen úsporně:
 * sedadlo je štítek s pozicí, stackem a akcí, ne karta s ukazatelem stacku.
 * Starý stůl měl sedadla 104 px široká a na 360 px se překrývala; tady se
 * devět štítků vejde na elipsu i na nejužším telefonu.
 *
 * Pro čtečku je stůl jeden obrázek s popisem situace - pozice hráče, pot
 * a akce před ním -, protože devět štítků po jednom by nikdo neposlouchal.
 *
 * Preflop i postflop kreslí jedna funkce z jednoho modelu stolu. Postflop
 * přidává desku doprostřed a aktivní nechává jen hráče a soupeře.
 */

/** Poloměry elipsy sedadel v procentech šířky a výšky stolu. */
const RADIUS_X = 40;
const RADIUS_Y = 40;

/** Akce u sedadla. */
interface SeatBadge {
  /** Klíč akce pro styl a testy. */
  action: string;
  label: string;
  /** Barva akce; sázka soupeře, jejíž velikost spot nezná, žádnou nemá. */
  color?: string;
}

interface SeatView {
  position: Position;
  isHero: boolean;
  active: boolean;
  /** Stack aktivního sedadla. Složené sedadlo ho neukazuje. */
  stackBb: number;
  badge: SeatBadge | null;
}

interface TableView {
  seats: readonly SeatView[];
  heroPosition: Position;
  positionOrder: readonly Position[];
  potBb: number;
  heroCards: readonly Card[];
  /** Deska uprostřed stolu; preflop ji nemá. */
  board: readonly Card[];
  /** Popis celého stolu pro čtečku. */
  summary: string;
}

function seatPoint(slot: number, seatCount: number): { x: number; y: number } {
  // Slot 0 = hráč dole uprostřed, další sedadla po směru hodinových ručiček.
  const angle = Math.PI / 2 + slot * ((2 * Math.PI) / seatCount);
  return {
    x: Math.round((50 + RADIUS_X * Math.cos(angle)) * 10) / 10,
    y: Math.round((50 + RADIUS_Y * Math.sin(angle)) * 10) / 10,
  };
}

function drawTable(doc: Document, view: TableView): HTMLDivElement {
  const table = doc.createElement("div");
  table.className = "dx-table";
  table.setAttribute("role", "img");
  table.setAttribute("aria-label", view.summary);

  const felt = doc.createElement("div");
  felt.className = "dx-table__felt";
  felt.setAttribute("aria-hidden", "true");
  table.appendChild(felt);

  const center = doc.createElement("div");
  center.className = "dx-table__center";
  center.setAttribute("aria-hidden", "true");
  if (view.board.length > 0) {
    const board = doc.createElement("div");
    board.className = "dx-table__board";
    board.append(...view.board.map((card) => playingCard(doc, card)));
    center.appendChild(board);
  }
  const pot = doc.createElement("div");
  pot.className = "dx-table__pot";
  pot.textContent = `Pot ${formatBbAmount(view.potBb)}`;
  center.appendChild(pot);
  table.appendChild(center);

  for (const seat of view.seats) {
    const slot = seatSlot(seat.position, view.heroPosition, view.positionOrder);
    const point = seatPoint(slot, view.positionOrder.length);
    const node = doc.createElement("div");
    node.className = "dx-table__seat";
    node.setAttribute("aria-hidden", "true");
    node.dataset.position = seat.position;
    node.dataset.hero = String(seat.isHero);
    node.dataset.folded = String(!seat.active);
    node.style.setProperty("--seat-x", `${point.x}%`);
    node.style.setProperty("--seat-y", `${point.y}%`);

    const name = doc.createElement("span");
    name.className = "dx-table__pos";
    name.textContent = seat.isHero ? `${seat.position} · ${localizedText("you", "ty")}` : seat.position;
    node.appendChild(name);

    if (seat.active) {
      const stack = doc.createElement("span");
      stack.className = "dx-table__stack";
      stack.textContent = formatBbAmount(seat.stackBb);
      node.appendChild(stack);
    }

    if (seat.badge !== null) {
      const badge = doc.createElement("span");
      badge.className = "dx-table__badge";
      badge.dataset.action = seat.badge.action;
      if (seat.badge.color !== undefined) badge.style.setProperty("--action-accent", seat.badge.color);
      badge.textContent = seat.badge.label;
      node.appendChild(badge);
    }

    if (seat.position === "BTN") {
      const dealer = doc.createElement("span");
      dealer.className = "dx-table__dealer";
      dealer.textContent = "D";
      node.appendChild(dealer);
    }

    if (seat.isHero) {
      const cards = doc.createElement("span");
      cards.className = "dx-table__cards";
      cards.append(...view.heroCards.map((card) => playingCard(doc, card, "sm")));
      node.appendChild(cards);
    }

    table.appendChild(node);
  }

  return table;
}

function seatStackBb(spot: Spot, position: Position): number {
  // Se scénářem (ICM) má každá sedačka vlastní stack; jinak efektivní hloubka.
  return spot.seatStacks?.[position] ?? spot.effStack;
}

/** Popis stolu pro čtečku obrazovky. */
export function pokerTableSummary(spot: Spot, ante: AnteMode, seats: readonly TableSeat[]): string {
  const pot = formatBbAmount(startingPotBB(spot, ante));
  const actions = seats.flatMap((seat) => (
    seat.badge === null || seat.isHero ? [] : [`${seat.position} ${BADGE_LABEL[seat.badge]}`]
  ));
  const before = actions.length > 0
    ? actions.join(", ")
    : localizedText("no action before you", "před tebou žádná akce");
  return localizedText(
    `Table: you are ${spot.heroPos}, ${formatBbAmount(spot.effStack)}, pot ${pot}; ${before}.`,
    `Stůl: jsi na ${spot.heroPos}, ${formatBbAmount(spot.effStack)}, pot ${pot}; ${before}.`,
  );
}

export function pokerTable(
  doc: Document,
  spot: Spot,
  ante: AnteMode,
  positionOrder: readonly Position[] = POSITION_ORDER,
): HTMLDivElement {
  const seats = deriveSeats(spot, positionOrder);
  return drawTable(doc, {
    seats: seats.map((seat) => ({
      position: seat.position,
      isHero: seat.isHero,
      active: seat.active,
      stackBb: seatStackBb(spot, seat.position),
      badge: seat.badge === null
        ? null
        : { action: seat.badge, label: BADGE_LABEL[seat.badge], color: colorForActionKey(seat.badge) },
    })),
    heroPosition: spot.heroPos,
    positionOrder,
    potBb: startingPotBB(spot, ante),
    heroCards: spot.heroCards,
    board: [],
    summary: pokerTableSummary(spot, ante, seats),
  });
}

/** Sázka, které hráč čelí, když ji vyřešené pravidlo nese. */
function facingBetBb(spot: PostflopTrainingSpot): number | undefined {
  const source = spot.explanation.source;
  return source.kind === "STRATEGY_PACK" ? source.facingBetBB : undefined;
}

function villainBadge(spot: PostflopTrainingSpot, action: PostflopVillainAction): SeatBadge | null {
  if (action === "CHECK") {
    return { action: "CHECK", label: "CHECK", color: colorForPostflopAction("CHECK") };
  }
  if (action === "BET") {
    const bet = facingBetBb(spot);
    return { action: "BET", label: bet === undefined ? "BET" : `BET ${formatBbAmount(bet)}` };
  }
  return null;
}

/** Popis postflopového stolu pro čtečku: pozice, pot, deska a akce před hráčem. */
export function postflopTableSummary(spot: PostflopTrainingSpot): string {
  const hero = spot.heroPosition;
  const villain = spot.villainPosition;
  const board = spot.board.map(playingCardName).join(", ");
  const pot = formatBbAmount(spot.potBB);
  const stack = formatBbAmount(spot.effectiveStackBB);
  const action = villainActionBeforeHero(spot);
  const bet = facingBetBb(spot);
  const amount = bet === undefined ? "" : ` ${formatBbAmount(bet)}`;
  const before = action === "BET"
    ? localizedText(`${villain} bet${amount}`, `${villain} vsadil${amount}`)
    : action === "CHECK"
      ? localizedText(`${villain} checked`, `${villain} checknul`)
      : localizedText("you act first", "jednáš první");
  return localizedText(
    `Table: you are ${hero} against ${villain}, ${stack}, pot ${pot}; board ${board}; ${before}.`,
    `Stůl: jsi na ${hero} proti ${villain}, ${stack}, pot ${pot}; deska ${board}; ${before}.`,
  );
}

export function postflopPokerTable(
  doc: Document,
  spot: PostflopTrainingSpot,
  positionOrder: readonly Position[] = POSITION_ORDER,
): HTMLDivElement {
  const badge = villainBadge(spot, villainActionBeforeHero(spot));
  return drawTable(doc, {
    seats: positionOrder.map((position) => ({
      position,
      isHero: position === spot.heroPosition,
      active: position === spot.heroPosition || position === spot.villainPosition,
      stackBb: spot.effectiveStackBB,
      badge: position === spot.villainPosition ? badge : null,
    })),
    heroPosition: spot.heroPosition,
    positionOrder,
    potBb: spot.potBB,
    heroCards: spot.heroCards,
    board: spot.board,
    summary: postflopTableSummary(spot),
  });
}
