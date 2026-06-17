/**
 * HH_Parser — totální, defenzivní parser hand history (PokerStars-like text).
 *
 * Tento modul je čisté jádro (žádné DOM/localStorage I/O). Jeho jediným
 * veřejným vstupem je `parseHandHistory(text)`, který je **totální funkcí**:
 * pro JAKÝKOLIV vstup (prázdný, bílé znaky, nevalidní, neúplný, příliš dlouhý)
 * doběhne bez vyhození výjimky a vrátí `HHResult` (případně částečný), v němž
 * označí, která pole hrdiny (pozice / akce / hloubky / karty) se nepodařilo
 * vytěžit. Veškerá logika běží uvnitř `try/catch`.
 *
 * ## Podporovaný formát (rozumná podmnožina PokerStars textu)
 *
 * Parser cílí na klasický PokerStars-like výpis jednoho rozdání. Rozpoznává:
 *
 * - **Hlavička / oddělovač rozdání:** řádky začínající `PokerStars Hand #`,
 *   `PokerStars Game #`, `GAME #` nebo `Hand #` (vícero rozdání ve vstupu se
 *   rozdělí; použije se blok obsahující `Dealt to`).
 * - **Sedadla:** `Seat N: Jméno (X in chips)` — z nich se zjistí počet
 *   obsazených sedadel a zásobníky hráčů.
 * - **Button:** `... Seat #N is the button` (případně `Seat N is the button`).
 *   Není-li uveden, odvodí se z postu malého/velkého blindu.
 * - **Blindy a ante:** `Jméno: posts small blind X`, `Jméno: posts big blind Y`,
 *   `Jméno: posts the ante Z` (přítomnost ante ⇒ `ante = ON`).
 * - **Karty hrdiny:** `Dealt to Jméno [Ah Kd]` — určuje jméno hrdiny i jeho
 *   dvě hole karty.
 * - **Preflop akce:** mezi `*** HOLE CARDS ***` a `*** FLOP ***` / `*** SUMMARY ***`
 *   řádky `Jméno: folds | checks | calls X | bets X | raises X to Y [and is all-in]`.
 *
 * ## Odvození pozice hrdiny (jen 9-handed)
 *
 * Pozice se odvozují z buttonu a pořadí obsazených sedadel. Pro plně obsazený
 * 9-handed stůl platí mapování od buttonu po směru rozdávání:
 * `BTN, SB, BB, UTG, UTG+1, UTG+2, LJ, HJ, CO`. Pozice hrdiny = pozice na jeho
 * offsetu od buttonu. Pokud počet obsazených sedadel není přesně 9, jde o
 * **nekompatibilní** model (Req 11.5) a pozice se nemapuje.
 *
 * ## Efektivní stack a mapování na koš
 *
 * Efektivní stack = `min(zásobník hrdiny, největší zásobník soupeře)`, vyjádřený
 * v BB jako `eff / velikost_big_blindu`. Zvolená politika: surová hloubka v BB
 * musí ležet v rozsahu **5–150 BB**; pak se **namapuje na nejbližší
 * `StackBucket`**. Hloubka mimo 5–150 BB ⇒ nekompatibilní (Req 11.5).
 *
 * ## Sestavení Spotu (Req 11.4)
 *
 * Spot se sestaví, jen když je model kompatibilní (9 obsazených sedadel a
 * hloubka v rozsahu) a podařilo se vytěžit pozici i karty hrdiny. Akční kontext
 * a `TableState.facing` se odvodí z preflop akcí před hrdinou; nabídka akcí
 * vychází z `offeredActions`, doporučení z `rangeStore.lookup` (s konzervativním
 * fallbackem na FOLD, není-li ruka v range). Sestavený Spot je typově validní a
 * zobrazitelný v Table_Rendereru.
 *
 * _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
 */

import {
  PUSH_FOLD_MAX,
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type ActionKind,
  type Answer,
  type AnteMode,
  type Card,
  type FacingAction,
  type HandLabel,
  type Position,
  type Rank,
  type Spot,
  type StackBucket,
  type Suit,
  type TableState,
} from "./types";
import { RANKS } from "./poker";
import { offeredActions } from "./actionTree";
import { questionId } from "./questionId";
import { buildPreflopExplanation } from "./preflopExplanation";
import { rangeStore, type RangeKey, type RangeStore } from "../data/rangeStore";

// ---------------------------------------------------------------------------
// Veřejné typy výsledku
// ---------------------------------------------------------------------------

/** Názvy polí hrdiny tak, jak je hlásíme v `unreadableFields` (Req 11.2). */
export type HHFieldName = "position" | "actions" | "stack" | "cards";

/** Částečně vytěžená pole hrdiny. Každé pole je volitelné (Req 11.3). */
export interface HHFields {
  /** Odvozená pozice hrdiny (jen kompatibilní 9-handed model). */
  position?: Position;
  /** Dvě hole karty hrdiny. */
  heroCards?: [Card, Card];
  /** Surová efektivní hloubka v BB (zaokrouhlená na 1 desetinné místo). */
  effStackBB?: number;
  /** Efektivní hloubka namapovaná na nejbližší `StackBucket`. */
  effStackBucket?: StackBucket;
  /** Akce hrdiny v preflopu (textové tokeny, např. "raises 120 to 180"). */
  actions?: string[];
  flop?: [Card, Card, Card];
  turn?: [Card, Card, Card, Card];
  river?: [Card, Card, Card, Card, Card];
  postflopActions?: HHPostflopActionHistoryByStreet;
  /** Počet obsazených sedadel u stolu (pro diagnostiku kompatibility). */
  tableSize?: number;
  /** Detekovaný režim ante (ON, pokud se objevil post ante). */
  ante?: AnteMode;
}

export interface HHStreetActionHistory {
  actions: readonly string[];
  actionsBeforeHero: readonly string[];
  heroActions: readonly string[];
}

export interface HHPostflopActionHistoryByStreet {
  flop?: HHStreetActionHistory;
  turn?: HHStreetActionHistory;
  river?: HHStreetActionHistory;
}

/** Výsledek parsování hand history. */
export interface HHResult {
  /** True, pokud se podařilo sestavit zobrazitelný Spot (Req 11.4). */
  ok: boolean;
  /** Sestavený Spot (jen když jsou data kompatibilní a úplná). */
  spot?: Spot;
  /** Vytěžená (případně částečná) pole hrdiny. */
  fields: HHFields;
  /** Která pole hrdiny se nepodařilo přečíst (Req 11.2, 11.3). */
  unreadableFields: HHFieldName[];
  /** České chybové / informační zprávy. */
  errors: string[];
  /** Data přečtena, ale nekompatibilní s modelem trenažéru (Req 11.5). */
  incompatible?: boolean;
}

// ---------------------------------------------------------------------------
// Konstanty
// ---------------------------------------------------------------------------

/** Maximální povolená délka vstupu ve znacích (Req 11.6). */
export const MAX_INPUT_LENGTH = 100_000;

/** Nejmenší přípustná hloubka v BB (dolní hranice košů). */
const MIN_BB = 5;
/** Největší přípustná hloubka v BB (horní hranice košů). */
const MAX_BB = 150;

/** Mapování offsetu od buttonu na pozici u plně obsazeného 9-handed stolu. */
const POS_BY_OFFSET_FROM_BUTTON: Position[] = [
  "BTN", // offset 0 = button
  "SB",
  "BB",
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
];

/** Počet pozic / sedadel plně obsazeného full ring stolu. */
const FULL_RING = 9;

/** Český popisek pro každý Akční_klíč (label v `Answer`). */
const ACTION_KEY_LABEL: Record<ActionKey, string> = {
  FOLD: "Fold",
  CALL: "Call",
  LIMP: "Limp / Check",
  OVERLIMP: "Over-limp",
  OPEN_2X: "Raise 2x",
  OPEN_25X: "Raise 2.5x",
  OPEN_3X: "Raise 3x",
  ISO_2X: "Iso-raise 2x",
  ISO_25X: "Iso-raise 2.5x",
  ISO_3X: "Iso-raise 3x",
  "3BET": "3-bet",
  "4BET": "4-bet",
  SQUEEZE: "Squeeze",
  JAM: "All-in",
  CALL_JAM: "Call all-in",
};

/** Český popisek akčního kontextu (pro zdůvodnění). */
// ---------------------------------------------------------------------------
// Interní mezistruktury
// ---------------------------------------------------------------------------

/** Jedno sedadlo zjištěné z řádku `Seat N: ...`. */
interface SeatInfo {
  seat: number;
  name: string;
  chips: number;
}

/** Surová data vytěžená z jednoho bloku rozdání. */
interface ParsedHand {
  seats: SeatInfo[];
  buttonSeat?: number;
  heroName?: string;
  heroCards?: [Card, Card];
  smallBlind?: number;
  bigBlind?: number;
  anteSeen: boolean;
  heroPreActions: string[]; // raw preflop akce hrdiny
  /** Akce před první akcí hrdiny (pro odvození facing). */
  actionsBeforeHero: string[];
  flop?: [Card, Card, Card];
  turn?: [Card, Card, Card, Card];
  river?: [Card, Card, Card, Card, Card];
  postflopActions: HHPostflopActionHistoryByStreet;
}

// ---------------------------------------------------------------------------
// Pomocné čisté funkce
// ---------------------------------------------------------------------------

/** Zaokrouhlí na 1 desetinné místo. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Je `rank` platná hodnota karty? */
function isRank(ch: string): ch is Rank {
  return (RANKS as string[]).includes(ch);
}

/** Je `suit` platná barva? */
function isSuit(ch: string): ch is Suit {
  return ch === "s" || ch === "h" || ch === "d" || ch === "c";
}

/**
 * Naparsuje token karty (např. "Ah", "Td", "2c") na `Card`, nebo `undefined`.
 * Hodnota se normalizuje na velké písmeno, barva na malé.
 */
function parseCard(token: string): Card | undefined {
  const normalized = normalizeCardToken(token);
  if (normalized.length !== 2) return undefined;
  const rank = normalized[0].toUpperCase();
  const suit = normalized[1].toLowerCase();
  if (!isRank(rank) || !isSuit(suit)) return undefined;
  return { rank, suit };
}

function normalizeCardToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length < 2) return trimmed;
  const suit = trimmed.slice(-1);
  const rank = trimmed.slice(0, -1).toUpperCase();
  const suitMap: Record<string, Suit> = {
    s: "s",
    S: "s",
    "\u2660": "s",
    h: "h",
    H: "h",
    "\u2665": "h",
    d: "d",
    D: "d",
    "\u2666": "d",
    c: "c",
    C: "c",
    "\u2663": "c",
  };
  return `${rank}${suitMap[suit] ?? suit}`;
}

function parseCardsFromBracket(raw: string): [Card, Card] | undefined {
  const compact = raw.trim().replace(/\s+/g, " ");
  const spaced = compact.match(
    /([2-9TJQKA][shdcSHDC\u2660\u2665\u2666\u2663])\s+([2-9TJQKA][shdcSHDC\u2660\u2665\u2666\u2663])/u,
  );
  const glued = compact.match(
    /^([2-9TJQKA][shdcSHDC\u2660\u2665\u2666\u2663])([2-9TJQKA][shdcSHDC\u2660\u2665\u2666\u2663])$/u,
  );
  const match = spaced ?? glued;
  if (!match) return undefined;
  const c1 = parseCard(match[1]);
  const c2 = parseCard(match[2]);
  return c1 && c2 ? [c1, c2] : undefined;
}

function parseBoardFromBracket(raw: string): Card[] | undefined {
  const tokens = raw.match(/[2-9TJQKA][shdcSHDC\u2660\u2665\u2666\u2663]/gu) ?? [];
  if (tokens.length < 3 || tokens.length > 5) return undefined;
  const cards = tokens.map(parseCard);
  if (cards.some((card) => card === undefined)) return undefined;
  const parsed = cards as Card[];
  const labels = parsed.map((card) => `${card.rank}${card.suit}`);
  if (new Set(labels).size !== labels.length) return undefined;
  return parsed;
}

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[$€£,\s]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Odvodí třídu startovní ruky (`HandLabel`) ze dvou karet hrdiny:
 * pár ("AA"), suited ("AKs") nebo offsuit ("AKo"), vyšší hodnota první.
 */
function handLabelFromCards(cards: [Card, Card]): HandLabel {
  const [a, b] = cards;
  const ia = RANKS.indexOf(a.rank);
  const ib = RANKS.indexOf(b.rank);
  // RANKS je sestupně, takže menší index = vyšší hodnota.
  const hi = ia <= ib ? a : b;
  const lo = ia <= ib ? b : a;
  if (a.rank === b.rank) return a.rank + b.rank; // pár
  const suited = a.suit === b.suit;
  return hi.rank + lo.rank + (suited ? "s" : "o");
}

/** Najde nejbližší `StackBucket` k surové hloubce v BB. */
function nearestBucket(bb: number): StackBucket {
  let best: StackBucket = STACK_BUCKETS[0];
  let bestDist = Math.abs(bb - best);
  for (const b of STACK_BUCKETS) {
    const d = Math.abs(bb - b);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** Vyřízne jméno hráče z řádku akce `Jméno: folds` → "Jméno". */
function actorOfActionLine(line: string): string | undefined {
  const idx = line.indexOf(":");
  if (idx <= 0) return undefined;
  return line.slice(0, idx).trim();
}

// ---------------------------------------------------------------------------
// Rozdělení vstupu na bloky rozdání a výběr bloku hrdiny
// ---------------------------------------------------------------------------

/**
 * Rozdělí vstup na bloky rozdání podle hlaviček. Pokud žádná hlavička není,
 * vrátí celý vstup jako jeden blok (defenzivní — parsujeme, co lze).
 */
function splitHands(raw: string): string[] {
  const norm = raw.replace(/\r/g, "");
  // Rozdělíme na začátcích řádků s hlavičkou rozdání.
  const parts = ("\n" + norm).split(/\n(?=(?:PokerStars (?:Hand|Game) #|GAME #|Hand #))/);
  const blocks = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  return blocks.length > 0 ? blocks : [norm];
}

/**
 * Vybere blok obsahující `Dealt to ...` (rozdání hrdiny); jinak první blok.
 */
function pickHeroBlock(blocks: string[]): string {
  for (const b of blocks) {
    if (/Dealt to .+\[/.test(b)) return b;
  }
  return blocks[0] ?? "";
}

// ---------------------------------------------------------------------------
// Extrakce surových dat z jednoho bloku rozdání
// ---------------------------------------------------------------------------

/**
 * Vytěží z bloku rozdání surová data (sedadla, button, blindy, ante, karty
 * hrdiny a preflop akce). Defenzivní: chybějící části nechá `undefined`.
 */
function extractHand(block: string): ParsedHand {
  const lines = block.split("\n").map((l) => l.trim());

  const seats: SeatInfo[] = [];
  let buttonSeat: number | undefined;
  let heroName: string | undefined;
  let heroCards: [Card, Card] | undefined;
  let smallBlind: number | undefined;
  let bigBlind: number | undefined;
  let anteSeen = false;
  let flop: [Card, Card, Card] | undefined;
  let turn: [Card, Card, Card, Card] | undefined;
  let river: [Card, Card, Card, Card, Card] | undefined;

  // Hlavička s buttonem: "... Seat #3 is the button" nebo "Seat 3 is the button".
  for (const line of lines) {
    const m =
      line.match(/Seat #?(\d+) is the button/i) ??
      line.match(/button is in seat #?(\d+)/i);
    if (m) {
      buttonSeat = Number(m[1]);
      break;
    }
  }

  // Sedadla: "Seat N: Jméno (X in chips)".
  for (const line of lines) {
    const m = line.match(
      /^Seat (\d+):\s+(.+?)\s+\((?:\$|€|£)?([\d.,]+)(?:\s+(?:in chips|chips))?\)/i,
    );
    if (m) {
      const seat = Number(m[1]);
      const name = m[2].trim();
      const chips = parseAmount(m[3]);
      if (Number.isFinite(seat) && name && chips !== undefined) {
        seats.push({ seat, name, chips });
      }
    }
  }

  // Karty hrdiny: "Dealt to Jméno [Ah Kd]".
  for (const line of lines) {
    const m = line.match(/Dealt to (.+?) \[(.+?)\]/iu);
    if (m) {
      heroName = m[1].trim();
      heroCards = parseCardsFromBracket(m[2]);
      break;
    }
  }
  // Fallback: jen jméno hrdiny bez čitelných karet.
  if (!heroName) {
    for (const line of lines) {
      const m = line.match(/Dealt to (.+?) \[/i);
      if (m) {
        heroName = m[1].trim();
        break;
      }
    }
  }

  // Blindy a ante.
  for (const line of lines) {
    let m = line.match(/posts (?:the )?small blind\s+(?:\$|€|£)?([\d.,]+)/i);
    if (m) {
      const v = parseAmount(m[1]);
      if (v !== undefined) smallBlind = v;
      continue;
    }
    m = line.match(/posts (?:the )?big blind\s+(?:\$|€|£)?([\d.,]+)/i);
    if (m) {
      const v = parseAmount(m[1]);
      if (v !== undefined) bigBlind = v;
      continue;
    }
    if (/posts (?:the )?ante\s+(?:\$|€|£)?[\d.,]+/i.test(line)) {
      anteSeen = true;
    }
  }

  if (smallBlind === undefined || bigBlind === undefined) {
    const header = lines.find((line) =>
      /(?:PokerStars|GAME|Hand|Tournament|Level|Blinds)/i.test(line),
    );
    const blindMatch = header?.match(
      /(?:^|[,( -])(?:Blinds\s*)?(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)(?:\)|,|\s|$)/i,
    );
    if (blindMatch) {
      smallBlind ??= parseAmount(blindMatch[1]);
      bigBlind ??= parseAmount(blindMatch[2]);
    }
  }

  for (const line of lines) {
    const board = /^\*\*\* (?:FLOP|TURN|RIVER) \*\*\*/iu.test(line)
      ? parseBoardFromBracket(line)
      : undefined;
    if (!board) continue;
    if (board.length >= 3 && flop === undefined) {
      flop = [board[0], board[1], board[2]];
    }
    if (board.length >= 4 && turn === undefined) {
      turn = [board[0], board[1], board[2], board[3]];
    }
    if (board.length >= 5 && river === undefined) {
      river = [board[0], board[1], board[2], board[3], board[4]];
    }
  }

  // Preflop akce mezi HOLE CARDS a FLOP/SUMMARY.
  const holeIdx = block.indexOf("*** HOLE CARDS ***");
  const heroPreActions: string[] = [];
  const actionsBeforeHero: string[] = [];
  if (heroName) {
    const dealtIdx = block.indexOf("Dealt to");
    const startIdx = holeIdx !== -1 ? holeIdx : dealtIdx;
    const afterHole = startIdx !== -1 ? block.slice(startIdx) : block;
    const iFlop = afterHole.indexOf("*** FLOP ***");
    const iSummary = afterHole.indexOf("*** SUMMARY ***");
    let end = afterHole.length;
    if (iFlop !== -1) end = iFlop;
    else if (iSummary !== -1) end = iSummary;
    const preLines = afterHole.slice(0, end).split("\n").map((l) => l.trim());

    let heroActed = false;
    const actionRe = /:\s+(folds|checks|calls|bets|raises)\b/i;
    for (const line of preLines) {
      if (!actionRe.test(line)) continue;
      const actor = actorOfActionLine(line);
      if (actor === undefined) continue;
      const actionText = line.slice(line.indexOf(":") + 1).trim();
      if (actor === heroName) {
        heroPreActions.push(actionText);
        heroActed = true;
      } else if (!heroActed) {
        actionsBeforeHero.push(actionText);
      }
    }
  }

  return {
    seats,
    buttonSeat,
    heroName,
    heroCards,
    smallBlind,
    bigBlind,
    anteSeen,
    heroPreActions,
    actionsBeforeHero,
    flop,
    turn,
    river,
    postflopActions: heroName ? extractPostflopActionHistory(lines, heroName) : {},
  };
}

function extractPostflopActionHistory(
  lines: readonly string[],
  heroName: string,
): HHPostflopActionHistoryByStreet {
  return {
    flop: extractStreetActionHistory(lines, heroName, "FLOP"),
    turn: extractStreetActionHistory(lines, heroName, "TURN"),
    river: extractStreetActionHistory(lines, heroName, "RIVER"),
  };
}

function extractStreetActionHistory(
  lines: readonly string[],
  heroName: string,
  street: "FLOP" | "TURN" | "RIVER",
): HHStreetActionHistory | undefined {
  const start = lines.findIndex((line) => new RegExp(`^\\*\\*\\* ${street} \\*\\*\\*`, "iu").test(line));
  if (start === -1) return undefined;

  const nextStreetMarkers: Record<typeof street, readonly string[]> = {
    FLOP: ["TURN", "SUMMARY"],
    TURN: ["RIVER", "SUMMARY"],
    RIVER: ["SHOW DOWN", "SHOWDOWN", "SUMMARY"],
  };
  const end = lines.findIndex((line, index) => (
    index > start &&
    nextStreetMarkers[street].some((marker) => new RegExp(`^\\*\\*\\* ${marker} \\*\\*\\*`, "iu").test(line))
  ));
  const streetLines = lines.slice(start + 1, end === -1 ? lines.length : end);
  const actions: string[] = [];
  const actionsBeforeHero: string[] = [];
  const heroActions: string[] = [];
  let heroActed = false;
  const actionRe = /:\s+(folds|checks|calls|bets|raises)\b/i;

  for (const line of streetLines) {
    if (!actionRe.test(line)) continue;
    const actor = actorOfActionLine(line);
    if (actor === undefined) continue;
    const actionText = line.slice(line.indexOf(":") + 1).trim();
    actions.push(actionText);
    if (actor === heroName) {
      heroActions.push(actionText);
      heroActed = true;
    } else if (!heroActed) {
      actionsBeforeHero.push(actionText);
    }
  }

  return { actions, actionsBeforeHero, heroActions };
}

// ---------------------------------------------------------------------------
// Odvození pozice hrdiny (9-handed)
// ---------------------------------------------------------------------------

/**
 * Odvodí pozici hrdiny z buttonu a pořadí obsazených sedadel. Vrací pozici jen
 * pro plně obsazený 9-handed stůl; jinak `undefined` (model nekompatibilní).
 */
function deriveHeroPosition(hand: ParsedHand): Position | undefined {
  if (hand.seats.length !== FULL_RING) return undefined;
  if (hand.heroName === undefined) return undefined;

  // Seřaď sedadla podle čísla.
  const sorted = [...hand.seats].sort((a, b) => a.seat - b.seat);
  const heroSeat = sorted.find((s) => s.name === hand.heroName);
  if (heroSeat === undefined) return undefined;

  let buttonSeat = hand.buttonSeat;
  // Bez explicitního buttonu jej zkusíme odvodit z SB (button = sedadlo před SB).
  if (buttonSeat === undefined) return undefined;

  const btnIdx = sorted.findIndex((s) => s.seat === buttonSeat);
  if (btnIdx === -1) return undefined;

  const heroIdx = sorted.findIndex((s) => s.seat === heroSeat.seat);
  if (heroIdx === -1) return undefined;

  // Offset od buttonu po směru rozdávání (rostoucí index sedadel, cyklicky).
  const offset = (heroIdx - btnIdx + FULL_RING) % FULL_RING;
  return POS_BY_OFFSET_FROM_BUTTON[offset];
}

// ---------------------------------------------------------------------------
// Odvození efektivního stacku v BB
// ---------------------------------------------------------------------------

/**
 * Spočítá surovou efektivní hloubku v BB: `min(stack hrdiny, max stack soupeře)`
 * děleno velikostí big blindu. Vrací `undefined`, pokud chybí potřebná data.
 */
function deriveEffStackBB(hand: ParsedHand): number | undefined {
  if (hand.bigBlind === undefined || hand.bigBlind <= 0) return undefined;
  if (hand.heroName === undefined) return undefined;
  const hero = hand.seats.find((s) => s.name === hand.heroName);
  if (hero === undefined) return undefined;
  const opponents = hand.seats.filter((s) => s.name !== hand.heroName);
  if (opponents.length === 0) return undefined;
  const maxOpp = Math.max(...opponents.map((s) => s.chips));
  const effChips = Math.min(hero.chips, maxOpp);
  return round1(effChips / hand.bigBlind);
}

// ---------------------------------------------------------------------------
// Odvození akčního kontextu / facing z akcí před hrdinou
// ---------------------------------------------------------------------------

/**
 * Z akcí soupeřů před hrdinou odvodí, čemu hrdina čelí, a vybere odpovídající
 * akční kontext. Počítá raisy: 0 ⇒ NONE (RFI/limp), 1 ⇒ OPEN, 2 ⇒ 3BET,
 * ≥3 ⇒ 4BET; jakýkoli all-in ⇒ ALLIN. Limpy/cally se počítají pro VS_LIMP /
 * SQUEEZE / BvB rozlišení.
 */
function deriveContext(
  hand: ParsedHand,
  heroPos: Position,
  pushFold: boolean,
): { context: ActionContext; facing: FacingAction; limps: number; calls: number; isBvB: boolean } {
  let raises = 0;
  let calls = 0;
  let limps = 0;
  let allIn = false;

  for (const a of hand.actionsBeforeHero) {
    if (/all-in/i.test(a)) allIn = true;
    if (/^raises\b/i.test(a)) {
      raises += 1;
    } else if (/^calls\b/i.test(a)) {
      if (raises === 0) limps += 1; // call bez předchozího raise = limp
      else calls += 1;
    } else if (/^bets\b/i.test(a)) {
      raises += 1;
    }
  }

  const heroIsBlind = heroPos === "SB" || heroPos === "BB";
  // BvB: hrdina je v blindu a před ním nebyl žádný dobrovolný vstup mimo blindy.
  const isBvB = heroIsBlind && raises === 0 && calls === 0 && limps === 0;

  let facing: FacingAction;
  if (allIn) facing = "ALLIN";
  else if (raises >= 3) facing = "4BET";
  else if (raises === 2) facing = "3BET";
  else if (raises === 1) facing = "OPEN";
  else facing = "NONE";

  let context: ActionContext;
  if (facing === "ALLIN") {
    context = "VS_ALLIN";
  } else if (pushFold) {
    context = "PUSH_FOLD";
  } else if (isBvB) {
    context = "BVB";
  } else if (facing === "OPEN") {
    context = calls >= 1 ? "SQUEEZE" : "VS_OPEN";
  } else if (facing === "3BET") {
    context = "VS_3BET";
  } else if (facing === "4BET") {
    context = "VS_4BET";
  } else {
    // facing NONE, ne push/fold: limpy ⇒ VS_LIMP, jinak RFI.
    context = limps >= 1 ? "VS_LIMP" : "RFI";
  }

  return { context, facing, limps, calls, isBvB };
}

// ---------------------------------------------------------------------------
// Sestavení zobrazitelného Spotu (Req 11.4)
// ---------------------------------------------------------------------------

/** Výchozí raise-sizing klíč dle hloubky (mimo range hrdinovy ruky). */
function defaultOpenKey(bucket: StackBucket): ActionKey {
  return bucket <= 25 ? "OPEN_2X" : "OPEN_25X";
}

/**
 * Reprezentativní raise-sizing klíč pro daný prefix (OPEN/ISO): přednostně
 * sizing doporučený pro konkrétní ruku ve STRICT sadě, jinak výchozí dle hloubky.
 */
function pickSizingKey(
  prefix: "OPEN" | "ISO",
  handStrict: ActionKey[] | undefined,
  bucket: StackBucket,
): ActionKey {
  const found = handStrict?.find((k) => k.startsWith(`${prefix}_`));
  if (found) return found;
  return prefix === "OPEN" ? defaultOpenKey(bucket) : "ISO_25X";
}

/** Přeloží druh akce (`ActionKind`) na konkrétní Akční_klíč. */
function actionKindToKey(
  kind: ActionKind,
  handStrict: ActionKey[] | undefined,
  bucket: StackBucket,
): ActionKey {
  switch (kind) {
    case "OPEN":
      return pickSizingKey("OPEN", handStrict, bucket);
    case "ISO":
      return pickSizingKey("ISO", handStrict, bucket);
    case "FOLD":
      return "FOLD";
    case "CALL":
      return "CALL";
    case "LIMP":
      return "LIMP";
    case "OVERLIMP":
      return "OVERLIMP";
    case "3BET":
      return "3BET";
    case "4BET":
      return "4BET";
    case "SQUEEZE":
      return "SQUEEZE";
    case "JAM":
      return "JAM";
    case "CALL_JAM":
      return "CALL_JAM";
    default:
      return "FOLD";
  }
}

/** Startovní pot v BB dle ante. */
function startingPotFor(ante: AnteMode): number {
  return ante === "ON" ? 2.5 : 1.5;
}

/**
 * Sestaví typově validní, zobrazitelný Spot z kompatibilních dat hrdiny.
 *
 * Doporučení čerpá z Range_Store (`store.lookup`); chybí-li ruka v range nebo
 * záznam pro kombinaci, použije konzervativní fallback (nejlevnější nabízená
 * akce — typicky FOLD, u BB vs limp LIMP/check), aby byl Spot typově validní a
 * obě sady doporučení neprázdné.
 */
function buildSpot(
  heroPos: Position,
  bucket: StackBucket,
  heroCards: [Card, Card],
  ante: AnteMode,
  ctx: { context: ActionContext; facing: FacingAction; limps: number; calls: number; isBvB: boolean },
  store: RangeStore,
): Spot {
  const hand = handLabelFromCards(heroCards);
  const pushFold = bucket <= PUSH_FOLD_MAX;

  const tableState: TableState = {
    heroPos,
    pushFold,
    limpsBefore: ctx.limps,
    callsBefore: ctx.calls,
    facing: ctx.facing,
    isBvB: ctx.isBvB,
  };

  const offeredKinds = offeredActions(tableState);

  // Lookup doporučení (může chybět ⇒ fallback).
  const key: RangeKey = { position: heroPos, bucket, context: ctx.context, ante };
  const entry = store.isLoaded() ? store.lookup(key) : undefined;
  const handStrict = entry?.strict[hand] as ActionKey[] | undefined;
  const handLenient = entry?.actions[hand] as ActionKey[] | undefined;

  const defaultKind: ActionKind = offeredKinds.includes("FOLD")
    ? "FOLD"
    : offeredKinds.includes("LIMP")
      ? "LIMP"
      : offeredKinds[0];
  const defaultKey = actionKindToKey(defaultKind, handStrict, bucket);

  const strictCorrect: ActionKey[] =
    handStrict && handStrict.length > 0 ? [...handStrict] : [defaultKey];
  const correctKeys: ActionKey[] =
    handLenient && handLenient.length > 0 ? [...handLenient] : strictCorrect.slice();

  const answers: Answer[] = offeredKinds.map((kind) => {
    const akey = actionKindToKey(kind, handStrict, bucket);
    return { key: akey, label: ACTION_KEY_LABEL[akey] };
  });

  const id = questionId({ context: ctx.context, heroPos, effStack: bucket, hand, ante });
  const explanation = buildPreflopExplanation({
    context: ctx.context,
    heroPos,
    effStack: bucket,
    hand,
    recommended: strictCorrect,
    tableState,
    importedFromHandHistory: true,
  });

  return {
    id,
    context: ctx.context,
    heroPos,
    effStack: bucket,
    ante,
    pushFold,
    hand,
    heroCards,
    tableState,
    answers,
    correctKeys,
    strictCorrect,
    explanation,
    startingPot: startingPotFor(ante),
  };
}

// ---------------------------------------------------------------------------
// Veřejné API: totální parser
// ---------------------------------------------------------------------------

/**
 * Naparsuje text hand history a vytěží pole hrdiny (pozice, akce, hloubky v BB,
 * karty). **Totální funkce** (Req 11.2/11.3, Property 29): pro jakýkoli vstup
 * doběhne bez vyhození výjimky a vrátí `HHResult`.
 *
 * Pravidla:
 *  - Vstup > {@link MAX_INPUT_LENGTH} znaků ⇒ odmítnutí s chybou délky, žádný
 *    Spot, žádný pád (Req 11.6 — kontroluje se jako první).
 *  - Prázdný / bílé znaky / nevalidní ⇒ `ok = false`, neprázdné
 *    `unreadableFields`, žádný pád (Req 11.2).
 *  - Validní 9-handed data v rozsahu 5–150 BB ⇒ sestaví Spot, `ok = true`
 *    (Req 11.4).
 *  - Přečtená, ale nekompatibilní data (≠ 9 sedadel nebo hloubka mimo 5–150 BB)
 *    ⇒ `incompatible = true`, žádný Spot, chyba o nekompatibilitě (Req 11.5).
 *
 * @param text Vstupní text hand history.
 * @param store Range_Store (injektovatelný; výchozí = reálný singleton).
 * @returns Výsledek parsování (vždy definovaný, nikdy nevyhodí výjimku).
 */
export function parseHandHistory(text: string, store: RangeStore = rangeStore): HHResult {
  // Req 11.6 — kontrola délky jako úplně první krok, ještě před jakoukoli prací.
  // Defenzivně i pro nestringový vstup.
  const raw = typeof text === "string" ? text : "";
  if (typeof text === "string" && text.length > MAX_INPUT_LENGTH) {
    return {
      ok: false,
      fields: {},
      unreadableFields: ["position", "actions", "stack", "cards"],
      errors: [
        `Input exceeds the maximum allowed length of ${MAX_INPUT_LENGTH} characters ` +
          `(received ${text.length}). Processing was rejected.`,
      ],
    };
  }

  try {
    // Req 11.2 — prázdný / jen bílé znaky.
    if (raw.trim().length === 0) {
      return {
        ok: false,
        fields: {},
        unreadableFields: ["position", "actions", "stack", "cards"],
        errors: ["Input is empty or contains only whitespace."],
      };
    }

    const blocks = splitHands(raw);
    const block = pickHeroBlock(blocks);
    const hand = extractHand(block);

    const fields: HHFields = {};
    const unreadable: HHFieldName[] = [];
    const errors: string[] = [];

    const ante: AnteMode = hand.anteSeen ? "ON" : "OFF";
    fields.ante = ante;
    fields.tableSize = hand.seats.length;

    // --- Karty hrdiny ---
    if (hand.heroCards) {
      fields.heroCards = hand.heroCards;
    } else {
      unreadable.push("cards");
    }

    // --- Akce hrdiny ---
    if (hand.heroPreActions.length > 0) {
      fields.actions = [...hand.heroPreActions];
    } else {
      unreadable.push("actions");
    }

    if (hand.flop) {
      fields.flop = hand.flop;
    }
    if (hand.turn) {
      fields.turn = hand.turn;
    }
    if (hand.river) {
      fields.river = hand.river;
    }
    if (
      hand.postflopActions.flop ||
      hand.postflopActions.turn ||
      hand.postflopActions.river
    ) {
      fields.postflopActions = hand.postflopActions;
    }

    // --- Pozice hrdiny (jen kompatibilní 9-handed) ---
    const heroPos = deriveHeroPosition(hand);
    if (heroPos) {
      fields.position = heroPos;
    } else {
      unreadable.push("position");
    }

    // --- Hloubky ---
    const effBB = deriveEffStackBB(hand);
    if (effBB !== undefined) {
      fields.effStackBB = effBB;
      if (effBB >= MIN_BB && effBB <= MAX_BB) {
        fields.effStackBucket = nearestBucket(effBB);
      }
    } else {
      unreadable.push("stack");
    }

    if (unreadable.length > 0) {
      errors.push(
        `Input is incomplete or in an unsupported format. Could not read: ` +
          `${unreadable.join(", ")}.`,
      );
    }

    // --- Posouzení kompatibility a sestavení Spotu (Req 11.4 / 11.5) ---
    const tableOk = hand.seats.length === FULL_RING;
    const depthInRange =
      effBB !== undefined && effBB >= MIN_BB && effBB <= MAX_BB;

    // Data nečitelná v klíčových polích ⇒ částečný výsledek, žádný Spot (Req 11.3).
    const heroCards = fields.heroCards;
    const bucket = fields.effStackBucket;
    const haveCore = heroPos !== undefined && heroCards !== undefined;

    if (haveCore && heroPos !== undefined && heroCards !== undefined && tableOk && depthInRange && bucket !== undefined) {
      // Kompatibilní a úplná data ⇒ sestav Spot (Req 11.4).
      const ctx = deriveContext(hand, heroPos, bucket <= PUSH_FOLD_MAX);
      const spot = buildSpot(
        heroPos,
        bucket,
        heroCards,
        ante,
        ctx,
        store,
      );
      return {
        ok: true,
        spot,
        fields,
        unreadableFields: unreadable,
        errors,
      };
    }

    // Data se přečetla (alespoň z části), ale nekompatibilní s modelem.
    // Req 11.5 — rozliš důvod nekompatibility, pokud byla data čitelná.
    const dataReadable = haveCore || fields.effStackBB !== undefined || tableOk;
    if (dataReadable && (!tableOk || effBB !== undefined)) {
      const reasons: string[] = [];
      if (!tableOk) {
        reasons.push(
          `table is not 9-handed (found ${hand.seats.length} seats)`,
        );
      }
      if (effBB !== undefined && !depthInRange) {
        reasons.push(
          `effective depth ${effBB} BB is outside ${MIN_BB}-${MAX_BB} BB`,
        );
      }
      if (reasons.length > 0) {
        errors.push(
          `Data is not compatible with the trainer model: ${reasons.join("; ")}. ` +
            `No spot was built.`,
        );
        return {
          ok: false,
          fields,
          unreadableFields: unreadable,
          errors,
          incompatible: true,
        };
      }
    }

    // Jinak: částečný výsledek bez Spotu (chybí klíčová čitelná pole).
    return {
      ok: false,
      fields,
      unreadableFields: unreadable,
      errors,
    };
  } catch (err) {
    // Totalita (Req 11.2/11.3): žádná výjimka nesmí uniknout ven.
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fields: {},
      unreadableFields: ["position", "actions", "stack", "cards"],
      errors: [`Error while processing hand history: ${msg}`],
    };
  }
}
