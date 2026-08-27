/**
 * Drill_Engine — generování tréninkových spotů.
 *
 * Tento modul je čisté jádro (žádné DOM/localStorage I/O). Obsahuje
 * `generateSpot` a jeho pomocníky (task 6.1), sestavení Poolu (`buildPool`,
 * task 7.1) s deduplikací podle Question_ID, deterministickou sekvenci
 * (`spotSequence`, task 7.2) a filtrování dimenzí + obsluhu seedu
 * (`resolveSeed`, task 8.1).
 *
 * ## Filtrování dimenzí (task 8.1, Req 13.5/13.7/13.8, Property 31)
 *
 * Generování respektuje **logický průnik** tří dimenzí filtru:
 * `heroPos ∈ filters.positions` AND `effStack ∈ filters.buckets` AND
 * `context ∈ filters.contexts`. Prázdná dimenze (`[]`) je **neomezená** —
 * zahrnuje všechny své hodnoty (Req 13.7). Průnik se počítá vůči množinám
 * přípustným pro daný kontext (`positionsForContext` / `bucketsForContext`):
 * pokud je výsledný průnik prázdný (žádná povolená pozice nebo koš pro
 * kontext, případně kontext není zvolen), `generateSpot` vrátí `null` — pro
 * tu kombinaci nelze nic vygenerovat. Výběr stále probíhá přes `rng()` z
 * (případně zúžené) množiny, takže determinismus zůstává zachován: stejný
 * seed + tytéž filtry ⇒ identická sekvence (Property 14).
 *
 * ## Obsluha seedu (task 8.1, Req 6.7)
 *
 * `resolveSeed` zajistí platný 32-bit unsigned seed (0–4 294 967 295): zadaný
 * platný seed vrátí beze změny, jinak vygeneruje náhodný a vrátí jej volajícímu
 * (aby šel uložit a sekvenci později zopakovat). Náhodnost je **pouze** při
 * volbě chybějícího seedu; samotné generování spotů zůstává čistě
 * deterministické vůči zvolenému seedu.
 *
 * ## Determinismus (Req 6.2)
 *
 * `generateSpot` je čistá funkce RNG: veškerá náhodnost prochází výhradně
 * parametrem `rng`. Žádné `Math.random`, `Date.now` apod. Volání `rng()`
 * probíhají v pevném, deterministickém pořadí:
 *
 *   1. pozice hrdiny,
 *   2. efektivní stack (hloubkový koš),
 *   3. (kontextově) počet limperů / callerů,
 *   4. třída ruky,
 *   5. barvy karet.
 *
 * Pro daný `context` je počet i pořadí volání `rng()` jednoznačné, takže stejná
 * sekvence `rng()` ⇒ bitově shodný Spot.
 *
 * ## Konzistence kontextu a stavu stolu
 *
 * Pozice i hloubkové koše se vybírají z množin odpovídajících danému kontextu
 * (viz design „Mapování akčního kontextu na stav stolu"), takže `pushFold` a
 * `facing` vyjdou konzistentně:
 *   - PUSH_FOLD / VS_ALLIN → koše ≤ 12 BB (5, 10) ⇒ `pushFold = true`,
 *   - ostatní kontexty      → koše > 12 BB (15–150) ⇒ `pushFold = false`.
 *
 * ## Doporučené sizingy v `answers` (OPEN / ISO)
 *
 * Dle zadání task 6.1 mapuje engine každou nabízenou akci (`ActionKind`) na
 * **právě jeden** Akční_klíč (Property 8). Pro raise akce s variantním sizingem
 * (OPEN / ISO) zvolí reprezentativní klíč = sizing doporučený pro **konkrétní
 * ruku hrdiny** ve STRICT sadě Range_Store; pokud ruka v range není, použije
 * výchozí sizing dle hloubky. Tím je zaručeno, že doporučený klíč
 * (`strictCorrect`/`correctKeys`) je vždy mezi nabízenými `answers`.
 *
 * _Requirements: 1.3, 1.4, 2.1, 2.3, 2.4, 2.5, 2.6, 3.12, 4.4, 4.7, 4.8, 5.1, 5.2, 5.3, 6.7, 13.5, 13.7, 13.8_
 */

import {
  POSITION_ORDER,
  PUSH_FOLD_MAX,
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type ActionKind,
  type Answer,
  type AnteMode,
  type Card,
  type Filters,
  type HandLabel,
  type Position,
  type Rank,
  type SessionConfig,
  type Spot,
  type StackBucket,
  type Suit,
  type TableState,
} from "./types";
import { ALL_HAND_CLASSES, SUITS, isPair, isSuited } from "./poker";
import { offeredActions } from "./actionTree";
import { preflopActionKindToKey } from "./preflopActionOptions";
import { questionId } from "./questionId";
import { mulberry32, hashStr } from "./rng";
import { buildPreflopExplanation } from "./preflopExplanation";
import { cloneActionEvSet, isActionEvSetComplete, type ActionEvSet } from "./actionEv";
import {
  callAllInEv,
  combosInClass,
  shoveEv,
  strongestSlice,
} from "./preflopEquity";
import { OPPONENT_STYLES, type OpponentStyleId } from "./opponentStyle";
import { ACTION_KEY_LABEL } from "./actionKeyLabels";
import { rangeStore, type RangeKey, type RangeStore } from "../data/rangeStore";

// ---------------------------------------------------------------------------
// Rozdělení hloubkových košů (Req 2.3)
// ---------------------------------------------------------------------------

/** Koše v režimu Push/Fold (≤ 12 BB) — odvozeno z `PUSH_FOLD_MAX`. */
const PUSH_FOLD_BUCKETS: StackBucket[] = STACK_BUCKETS.filter((b) => b <= PUSH_FOLD_MAX);

/** Koše mimo push/fold (> 12 BB) — plný akční strom. */
const DEEP_BUCKETS: StackBucket[] = STACK_BUCKETS.filter((b) => b > PUSH_FOLD_MAX);

// ---------------------------------------------------------------------------
// Pozice přípustné pro daný kontext (sémantika Požadavku 3 + pokrytí dat)
// ---------------------------------------------------------------------------

/** Pozice schopné jednat jako první / RFI / čelit 3betu (vše kromě BB). */
const POS_NO_BB: Position[] = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB"];

/** Pozice bránící proti openu / 4betu / vs-limp (LJ a později + BB). */
const POS_DEFEND: Position[] = ["LJ", "HJ", "CO", "BTN", "SB", "BB"];

/** Pozice, kde se může nabídnout squeeze (open + 1–7 callerů před hrdinou). */
const POS_SQUEEZE: Position[] = ["HJ", "CO", "BTN", "SB", "BB"];

/** Blind-vs-blind: hrdina je výhradně SB nebo BB (Req 3.11, Property 7). */
const POS_BVB: Position[] = ["SB", "BB"];

/**
 * Vrátí přípustné pozice hrdiny pro daný kontext. Množiny odpovídají
 * sémantice akčního stromu (Req 3) i pokrytí referenčních dat, takže lookup
 * Range_Store pro vybranou kombinaci uspěje.
 *
 * Exportované schválně: tohle je **jediná autorita** na to, na kterou dvojici
 * (kontext, pozice) se trenažér umí zeptat, a testy se jí musí ptát, ne si ta
 * pravidla opisovat. Opsaná kopie by znamenala dvě místa, kde se opravuje jedna
 * změna - a přesně tenhle rozpor 27. 8. 2026 propustil 66 záznamů o spotu,
 * který nemůže nastat.
 */
export function positionsForContext(context: ActionContext): Position[] {
  switch (context) {
    case "RFI":
    case "VS_3BET":
      return POS_NO_BB;
    case "VS_OPEN":
    case "VS_4BET":
    case "VS_LIMP":
      return POS_DEFEND;
    case "SQUEEZE":
      return POS_SQUEEZE;
    case "BVB":
      return POS_BVB;
    case "PUSH_FOLD":
    case "VS_ALLIN":
      return POSITION_ORDER;
    default:
      return assertNever(context);
  }
}

/**
 * Hloubky, pro které daný výběr kontextů **doopravdy něco má**.
 *
 * Knihovna je na to, **na co se drill ptá, úplná**: změřeno 27. 8. 2026, že ze
 * 487 dvojic (kontext, hloubka × sedačka), na které se podle vlastních pravidel
 * ptá, chybí **nula**. Prázdné relace tedy nevznikají chybějícím obsahem.
 *
 * Vznikají tím, že **filtry jsou tři nezávislé dimenze**. Hráč si může vybrat
 * push/fold a k tomu 20 BB, jenže push/fold se hraje do 12 BB, takže se ta
 * dvojice nikdy nesejde a relace rozdá nula spotů. Hláška přitom zněla „vybrané
 * filtry neodpovídají žádnému spotu", což zní jako chyba jeho výběru - a je to
 * chyba nabídky, která tu kombinaci vůbec dovolila.
 *
 * Tahle funkce dovolí říct, co funguje. Počítá se z obsahu, takže když obsah
 * přibude, hláška se opraví sama.
 */
export function bucketsWithSpots(
  contexts: readonly ActionContext[],
  ante: AnteMode,
  store: RangeStore = rangeStore,
): StackBucket[] {
  const wanted = contexts.length > 0 ? contexts : ALL_CONTEXTS;
  const found = new Set<StackBucket>();
  for (const context of wanted) {
    for (const bucket of bucketsForContext(context)) {
      const hit = positionsForContext(context).some((position) => (
        store.lookup({ ante, position, bucket, context }) !== undefined
      ));
      if (hit) found.add(bucket);
    }
  }
  return [...found].sort((left, right) => left - right);
}

/**
 * Vrátí přípustné hloubkové koše pro daný kontext (push/fold vs hluboké).
 *
 * Exportované ze stejného důvodu jako `positionsForContext`: je to jediná
 * autorita na to, na kterou hloubku se trenažér u daného kontextu ptá. Rozdíl
 * mezi „hloubka se nabízí, ale nemáme obsah" a „hloubka se u tohohle kontextu
 * vůbec nerozdává" je jinak nepoznatelný - a plete se: obojí vypadá jako nula
 * spotů, přitom první se dá spravit obsahem a druhé ne.
 */
export function bucketsForContext(context: ActionContext): StackBucket[] {
  return context === "PUSH_FOLD" || context === "VS_ALLIN"
    ? PUSH_FOLD_BUCKETS
    : DEEP_BUCKETS;
}

// ---------------------------------------------------------------------------
// Logický průnik dimenzí filtru (task 8.1, Req 13.5/13.7/13.8, Property 31)
// ---------------------------------------------------------------------------

/**
 * Průnik množiny přípustné pro kontext (`allowed`) se zvoleným filtrem
 * (`selected`), se sémantikou „prázdný filtr = neomezeno" (Req 13.7).
 *
 *   - `selected` prázdné (`[]`) ⇒ dimenze je neomezená ⇒ vrátí celé `allowed`,
 *   - `selected` neprázdné ⇒ vrátí ty prvky `allowed`, které jsou zároveň ve
 *     `selected` (logický průnik, Req 13.8).
 *
 * Pořadí výsledku se řídí pořadím v `allowed` (kanonické pořadí kontextu), aby
 * výběr přes `rng()` byl deterministický a nezávislý na pořadí, v jakém
 * uživatel hodnoty filtru zadal (Property 14). Prázdný výsledek znamená, že pro
 * danou kombinaci kontextu a filtru není žádná přípustná hodnota.
 */
function intersectDimension<T>(allowed: readonly T[], selected: readonly T[]): T[] {
  if (selected.length === 0) return allowed.slice();
  const chosen = new Set<T>(selected);
  return allowed.filter((v) => chosen.has(v));
}

/**
 * Vrátí přípustné pozice hrdiny pro kontext **po aplikaci filtru pozic**
 * (`filters.positions`). Prázdný filtr = neomezeno (Req 13.7); jinak průnik s
 * množinou pozic přípustných pro kontext (Req 13.8).
 */
function allowedPositions(context: ActionContext, filters: Filters): Position[] {
  return intersectDimension(positionsForContext(context), filters.positions);
}

/**
 * Vrátí přípustné hloubkové koše pro kontext **po aplikaci filtru košů**
 * (`filters.buckets`). Prázdný filtr = neomezeno (Req 13.7, 2.6); jinak průnik
 * s množinou košů přípustných pro kontext (Req 13.8, 2.5).
 */
function allowedBuckets(context: ActionContext, filters: Filters): StackBucket[] {
  return intersectDimension(bucketsForContext(context), filters.buckets);
}

// ---------------------------------------------------------------------------
// Mapování kontextu na akci, které hrdina čelí
// ---------------------------------------------------------------------------

/**
 * Určí `FacingAction` pro daný kontext (a pozici v BvB).
 *
 * V BvB jedná SB jako první (facing = NONE, může otevřít), zatímco BB čelí
 * SB openu (facing = OPEN, brání se).
 */
function facingFor(context: ActionContext, heroPos: Position): TableState["facing"] {
  switch (context) {
    case "RFI":
    case "VS_LIMP":
    case "PUSH_FOLD":
      return "NONE";
    case "VS_OPEN":
    case "SQUEEZE":
      return "OPEN";
    case "VS_3BET":
      return "3BET";
    case "VS_4BET":
      return "4BET";
    case "VS_ALLIN":
      return "ALLIN";
    case "BVB":
      return heroPos === "SB" ? "NONE" : "OPEN";
    default:
      return assertNever(context);
  }
}

// ---------------------------------------------------------------------------
// České popisky akcí a kontextů (UI text — Req 12.3)
// ---------------------------------------------------------------------------

/** Český popisek pro každý Akční_klíč (label v `Answer`). */

/** Český popisek akčního kontextu (pro zdůvodnění). */
// ---------------------------------------------------------------------------
// Deterministické výběry z polí přes rng()
// ---------------------------------------------------------------------------

/**
 * Vrátí deterministický index v rozsahu [0, n) z jediného `rng()`.
 *
 * `mulberry32` vrací hodnoty z [0, 1), takže `Math.floor(rng() * n)` je z
 * [0, n-1]; clamp je čistě defenzivní pro případnou hodnotu 1.0.
 */
function randIndex(rng: () => number, n: number): number {
  const i = Math.floor(rng() * n);
  if (i < 0) return 0;
  if (i >= n) return n - 1;
  return i;
}

/** Deterministicky vybere jeden prvek z neprázdného pole. */
function pickFrom<T>(rng: () => number, arr: readonly T[]): T {
  return arr[randIndex(rng, arr.length)];
}

/** Sevře `n` do rozsahu [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Vybere dvě navzájem různé barvy (2 volání `rng()`). Druhý index se počítá z
 * (počet barev − 1) a posune se o 1, pokud koliduje s prvním — tím je zaručena
 * různost bez zahazování hodnot.
 */
function pickTwoDistinctSuits(rng: () => number): [Suit, Suit] {
  const i = randIndex(rng, SUITS.length);
  let j = randIndex(rng, SUITS.length - 1);
  if (j >= i) j += 1;
  return [SUITS[i], SUITS[j]];
}

/**
 * Rozdá hrdinovi dvě konkrétní karty konzistentní s třídou ruky:
 * pár ⇒ stejná hodnota, různé barvy; suited ⇒ různé hodnoty, stejná barva;
 * offsuit ⇒ různé hodnoty, různé barvy. (Req 8.3)
 */
function dealCards(rng: () => number, label: HandLabel): [Card, Card] {
  if (isPair(label)) {
    const rank = label[0] as Rank;
    const [s1, s2] = pickTwoDistinctSuits(rng);
    return [
      { rank, suit: s1 },
      { rank, suit: s2 },
    ];
  }

  const hi = label[0] as Rank;
  const lo = label[1] as Rank;

  if (isSuited(label)) {
    const suit = pickFrom(rng, SUITS);
    return [
      { rank: hi, suit },
      { rank: lo, suit },
    ];
  }

  // offsuit
  const [s1, s2] = pickTwoDistinctSuits(rng);
  return [
    { rank: hi, suit: s1 },
    { rank: lo, suit: s2 },
  ];
}

// ---------------------------------------------------------------------------
// Počet limperů / callerů (kontextově), realisticky omezený pozicí
// ---------------------------------------------------------------------------

/**
 * Počet limperů před hrdinou pro kontext VS_LIMP (1–8, Req 3.3/3.4/3.13),
 * realisticky omezený počtem sedadel jednajících před hrdinou.
 */
function pickLimpsBefore(rng: () => number, heroPos: Position): number {
  const seatsBefore = POSITION_ORDER.indexOf(heroPos);
  const maxLimps = clamp(seatsBefore, 1, 8);
  return 1 + randIndex(rng, maxLimps);
}

/**
 * Počet callerů před hrdinou pro kontext SQUEEZE (1–7, Req 3.6), realisticky
 * omezený počtem sedadel před hrdinou (jedno z nich je opener).
 */
function pickCallsBefore(rng: () => number, heroPos: Position): number {
  const seatsBefore = POSITION_ORDER.indexOf(heroPos);
  const maxCalls = clamp(seatsBefore - 1, 1, 7);
  return 1 + randIndex(rng, maxCalls);
}

// ---------------------------------------------------------------------------
// Startovní pot (Req 5.3, Property 13)
// ---------------------------------------------------------------------------

/**
 * Startovní velikost potu v BB před akcí hrdiny.
 *   - ante = ON  ⇒ 2,5 BB (SB 0,5 + BB 1 + ante 1),
 *   - ante = OFF ⇒ 1,5 BB (SB 0,5 + BB 1).
 */
/**
 * Hands a range entry actually plays, as a list of classes.
 */
function playedClasses(entry: { strict: Record<string, readonly ActionKey[]> } | undefined): HandLabel[] {
  if (entry === undefined) return [];
  return Object.entries(entry.strict)
    .filter(([, keys]) => keys.some((key) => key !== "FOLD"))
    .map(([hand]) => hand);
}

/**
 * EV per offered action, computed where the spot fixes a price.
 *
 * Only two contexts do. Facing an all-in the opponent has staked their stack and
 * the hero's call is priced against it; shoving stakes a stack to win the blinds.
 * Everywhere else the price depends on a sizing the drill never fixes, so no EV is
 * offered rather than one being invented - the UI hides the bubbles when the set
 * is incomplete, which is the honest outcome.
 *
 * The opponent's range has to come from somewhere, and this model has no opener
 * identity: a spot knows the hero's seat, not who shoved or who will call. So one
 * seat is named for each side and stated here, the same way REJAM_CALIBRATION_OPENER
 * handles the same gap. The big blind is the last player who can call a shove and
 * the most common one; the button is the seat that shoves most.
 */
function computeActionEvs(
  context: ActionContext,
  heroPos: Position,
  hand: HandLabel,
  effStack: StackBucket,
  ante: AnteMode,
  startingPot: number,
  offered: readonly ActionKey[],
  store: RangeStore,
  opponentStyle?: OpponentStyleId,
  callsBefore = 0,
): ActionEvSet<ActionKey> | undefined {
  // An open-shove at fifteen big blinds is the same decision as a push/fold
  // shove, just reached from a different context: the hero is first in, the pot
  // is the blinds, and everyone behind can still wake up. Priced identically
  // rather than left blank because the context label happens to differ.
  if (
    (context === "PUSH_FOLD" || context === "RFI") &&
    offered.includes("JAM") &&
    offered.includes("FOLD")
  ) {
    const measured = shoveCallerClasses(effStack, ante, store);
    if (measured.length === 0) return undefined;
    // A named opponent replaces the measured range with the slice their folding
    // implies. The players behind have not acted, so the pool is the whole deck.
    const caller = styledCallers(measured, ALL_HAND_CLASSES, opponentStyle);
    // Everyone still to act has to fold, so the shove is priced against all of
    // them rather than against one. From under the gun that is eight players.
    const behind = Math.max(1, POSITION_ORDER.length - 1 - POSITION_ORDER.indexOf(heroPos));
    const ev = shoveEv(hand, caller, effStack, startingPot, behind);
    if (ev === undefined) return undefined;
    return {
      source: "ALL_IN_EQUITY",
      unit: "BB",
      values: [
        { action: "JAM" as ActionKey, evBb: Math.round(ev.jamBB * 100) / 100 },
        { action: "FOLD" as ActionKey, evBb: 0 },
      ],
      // The table is sampled to about half a point, which on a ten big blind
      // shove is a tenth of a blind. Two actions inside that are not
      // distinguishable by this method, and grading should say so rather than
      // award a mistake for noise.
      equivalentThresholdBb: 0.1,
      acceptableThresholdBb: 0.3,
    };
  }

  if (context === "VS_ALLIN" && offered.includes("CALL_JAM") && offered.includes("FOLD")) {
    const shover = playedClasses(store.lookup({ ante, position: "BTN", bucket: effStack, context: "PUSH_FOLD" }));
    if (shover.length === 0) return undefined;
    // The shover is all in for their stack, so the pot the hero contests is the
    // blinds plus that stack, and the call is the hero's own stack.
    const ev = callAllInEv(hand, shover, effStack, startingPot + effStack);
    if (ev === undefined) return undefined;
    return {
      source: "ALL_IN_EQUITY",
      unit: "BB",
      values: [
        { action: "CALL_JAM" as ActionKey, evBb: Math.round(ev.callBB * 100) / 100 },
        { action: "FOLD" as ActionKey, evBb: 0 },
      ],
      equivalentThresholdBb: 0.1,
      acceptableThresholdBb: 0.3,
    };
  }

  // Re-jamming over an open. The hero's action is all in, so its size is fixed;
  // the only other number needed is what the opener put in, and that is not an
  // assumption either - the product teaches one open size per depth and says so
  // in its own action keys.
  if (context === "VS_OPEN" && offered.includes("JAM") && offered.includes("FOLD")) {
    const openBB = openSizeAtDepth(effStack, ante, store);
    if (openBB === undefined) return undefined;
    const measured = callRejamClasses(effStack, ante, store);
    if (measured.length === 0) return undefined;
    // The opener has already raised, so they do not hold a random hand. Fold
    // equity has to be measured against what they can actually have, which is
    // their opening range at this depth - not against the deck.
    const opener = openerClasses(heroPos, effStack, ante, store);
    const openerCombos = comboCount(opener);
    if (openerCombos === 0) return undefined;
    // Here the pool is what the opener can hold, not the deck: they have already
    // raised. A calling station calls a larger share of that, a rock a smaller
    // one, and both are slices of the same range rather than new charts.
    const caller = styledCallers(measured, opener, opponentStyle);
    // One opponent, not the field: the hero is jamming over a raise, and the
    // players behind have already folded to it. This is the case where pricing
    // against a single caller is right rather than flattering.
    const ev = shoveEv(hand, caller, effStack, startingPot + openBB, 1, openerCombos);
    if (ev === undefined) return undefined;
    return {
      source: "ALL_IN_EQUITY",
      unit: "BB",
      values: [
        { action: "JAM" as ActionKey, evBb: Math.round(ev.jamBB * 100) / 100 },
        { action: "FOLD" as ActionKey, evBb: 0 },
      ],
      equivalentThresholdBb: 0.1,
      acceptableThresholdBb: 0.3,
    };
  }

  // Facing a four-bet, where the hero's only fixed-price action is the five-bet
  // jam. The pot needs two sizes the product does not teach - the three-bet the
  // hero made and the four-bet in front of them - so those are chosen here and
  // named as choices rather than left blank.
  //
  // Two and a bit times the previous raise in position, three times out of it,
  // is the standard tournament shape and the one every public chart is drawn
  // against. Getting the pot slightly wrong moves the jam's price by a fraction
  // of a blind; showing no number at all was the thing a player actually
  // noticed, and the honest fix is a stated assumption rather than silence.
  if (context === "VS_4BET" && offered.includes("JAM") && offered.includes("FOLD")) {
    const openBB = openSizeAtDepth(effStack, ante, store);
    if (openBB === undefined) return undefined;
    // Násobek se nesmí dostat přes stack. Při 20 BB vyjde tří-bet krát 2,2 na
    // šestnáct blindů a čtyři-bet nad celý stack - to není velký raise, to je
    // all-in, a pot spočítaný z takového čísla dá jamu cenu vyšší, než kolik je
    // vůbec na stole. Zastropování na efektivní stack tu situaci popíše
    // správně: mělký čtyři-bet je fakticky shove.
    const threeBetBB = Math.min(
      effStack,
      openBB * (isInPositionForThreeBet(heroPos) ? THREE_BET_MULTIPLE_IP : THREE_BET_MULTIPLE_OOP),
    );
    const fourBetBB = Math.min(effStack, threeBetBB * FOUR_BET_MULTIPLE);
    // Kdo vložil víc, ten určuje, o kolik se hraje. Soupeř je po čtyři-betu v
    // potu hlouběji než hrdina po tří-betu, takže zbytek jeho stacku je strop -
    // ne zbytek hrdinova. Počítáno z hrdinova zbytku vycházelo při 150 BB EV
    // 112 blindů: jam vyhrával víc, než kolik soupeř vůbec mohl doplatit.
    const atRisk = effStack - fourBetBB;
    const pot = startingPot + openBB + threeBetBB + fourBetBB;

    // Kdo čtyři-betuje celý stack, nemůže složit. Při mělkých hloubkách vyjde
    // modelovaný čtyři-bet na celý stack nebo přes něj, a tehdy to není
    // pětibetový jam s fold equity, ale dorovnání all-inu. Počítat tam fold
    // equity znamená připsat jamu hodnotu za akci, kterou soupeř nemá.
    const committedRange = fourBetClasses(heroPos, effStack, ante, store);
    if (committedRange.length === 0) return undefined;
    const committedCombos = comboCount(committedRange);
    if (committedCombos === 0) return undefined;

    if (atRisk <= 0) {
      const called = callAllInEv(hand, committedRange, effStack - threeBetBB, pot);
      if (called === undefined) return undefined;
      return {
        source: "ALL_IN_EQUITY",
        unit: "BB",
        values: [
          { action: "JAM" as ActionKey, evBb: Math.round(called.callBB * 100) / 100 },
          { action: "FOLD" as ActionKey, evBb: 0 },
        ],
        equivalentThresholdBb: 0.1,
        acceptableThresholdBb: 0.3,
      };
    }

    // Kdo dorovná pětibet. Range čtyři-betujícího je měřená - ruce, které
    // charty značí 4BET proti tří-betu - a v těchhle hloubkách je čtyři-bet
    // blízko commitu, takže pokračuje prakticky s celou. To je měřená data
    // zúžená vyřčeným čtením, ne nový chart.
    const caller = styledCallers(committedRange, committedRange, opponentStyle);
    const ev = shoveEv(hand, caller, atRisk, pot, 1, committedCombos);
    if (ev === undefined) return undefined;
    return {
      source: "ALL_IN_EQUITY",
      unit: "BB",
      values: [
        { action: "JAM" as ActionKey, evBb: Math.round(ev.jamBB * 100) / 100 },
        { action: "FOLD" as ActionKey, evBb: 0 },
      ],
      equivalentThresholdBb: 0.1,
      acceptableThresholdBb: 0.3,
    };
  }

  // Jamming over limpers is deliberately left unpriced, and the reason is not the
  // one this file used to give.
  //
  // The stated obstacle was a missing limping range. There is one - the charts
  // mark a hundred and five classes as LIMP or OVERLIMP - so that reading was
  // simply wrong. Measured instead: every spot in this context that offers a jam
  // is the big blind's, and not one of them offers a fold. That is correct poker
  // rather than missing data, because the big blind has already posted and can
  // check into a limped pot for free.
  //
  // Every other priced branch compares a jam against folding, worth zero. Here
  // the alternative is a free flop, which is worth something this product cannot
  // yet compute - so scoring the jam against zero would not be an approximation,
  // it would flatter jamming in the one context where the alternative is
  // cheapest. A number biased toward the aggressive line is worse than no number.

  // Blind versus blind, and squeezing over an open with callers. Both put the
  // hero all in and both have a pot the spot determines: the blinds alone in the
  // first case, the blinds plus the open plus one open-sized call for each caller
  // in the second, and `callsBefore` is recorded.
  //
  // The calling range is the approximation, and it is the same one the re-jam
  // uses: whichever charted seat answers a shove at this depth. Blind-versus-
  // blind that is the big blind, which the sheets do not draw, so it falls back
  // as everywhere else and says so rather than producing nothing.
  if (
    (context === "BVB" || context === "SQUEEZE") &&
    offered.includes("JAM") &&
    offered.includes("FOLD")
  ) {
    const caller = shoveCallerClasses(effStack, ante, store);
    if (caller.length === 0) return undefined;
    const openBB = openSizeAtDepth(effStack, ante, store) ?? 0;
    const pot = context === "SQUEEZE"
      ? startingPot + openBB * (1 + callsBefore)
      : startingPot;
    // One opponent blind versus blind; everyone still in the hand facing a
    // squeeze, since any of them can call.
    const opponents = context === "SQUEEZE" ? 1 + callsBefore : 1;
    const ev = shoveEv(hand, caller, effStack, pot, opponents);
    if (ev === undefined) return undefined;
    return {
      source: "ALL_IN_EQUITY",
      unit: "BB",
      values: [
        { action: "JAM" as ActionKey, evBb: Math.round(ev.jamBB * 100) / 100 },
        { action: "FOLD" as ActionKey, evBb: 0 },
      ],
      equivalentThresholdBb: 0.1,
      acceptableThresholdBb: 0.3,
    };
  }

  return undefined;
}

/**
 * What an open costs at this depth, read from the product's own action keys.
 *
 * Not a constant and not a guess. The shipped table offers OPEN_2X up to 25BB
 * and OPEN_25X from 30 up, uniformly across every seat, so the size is already
 * decided by the depth - this reads it back rather than restating it. If the
 * table ever teaches a different size, this follows without being edited.
 */
export function openSizeAtDepth(
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
): number | undefined {
  // The STRICT set, not the lenient one. Lenient offers every sizing the spot
  // tolerates, so at 15BB it holds both OPEN_2X and OPEN_25X and reading it
  // returned 2.5 - the largest size present rather than the one taught. That
  // priced every re-jam below 30BB against a pot half a blind too big, and it
  // stood until decisionPricePanel.test.ts compared this against the panel's
  // mirror of the same rule and found them disagreeing at 15BB.
  for (const position of POSITION_ORDER) {
    const entry = store.lookup({ ante, position, bucket, context: "RFI" });
    if (entry === undefined) continue;
    for (const keys of Object.values(entry.strict)) {
      if (keys.includes("OPEN_25X" as ActionKey)) return 2.5;
      if (keys.includes("OPEN_2X" as ActionKey)) return 2;
    }
  }
  return undefined;
}

/**
 * The opener's calling range against a re-jam at this depth.
 *
 * Taken from the seat the calling-rejam sheets were drawn for, stated here the
 * same way the other two calibrations are: the sheets cover named pairs of
 * seats, not every pair, and borrowing one for another is an approximation that
 * has to be visible rather than buried.
 */
function callRejamClasses(
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
): HandLabel[] {
  return playedClasses(store.lookup({
    ante,
    position: REJAM_EV_CALIBRATION_CALLER,
    bucket,
    context: "VS_ALLIN",
  }));
}

/**
 * The calling range to price against, once the player has named an opponent.
 *
 * With no read, the measured sheet stands - it is what the shipped ranges
 * describe and what the trainer teaches. Naming an opponent is the player
 * saying this one is not the baseline, and the style model turns that into a
 * single number: how often they fold to a shove. The calling range is then the
 * strongest slice of what they can hold.
 *
 * Slicing rather than swapping in a second chart is the whole point of the
 * design. Four styles times every seat and depth would be four times the
 * material and none of it measured; one number moving one threshold is the same
 * shape the bubble factor uses, and it leaves the baseline untouched.
 */
function styledCallers(
  measured: readonly HandLabel[],
  pool: readonly HandLabel[],
  style: OpponentStyleId | undefined,
): HandLabel[] {
  if (style === undefined) return [...measured];
  const sliced = strongestSlice(pool, 1 - OPPONENT_STYLES[style].foldsToShove);
  return sliced.length === 0 ? [...measured] : sliced;
}

/**
 * Who calls a first-in shove at this depth.
 *
 * The big blind is the natural answer and the only one at five and ten big
 * blinds, where the push/fold chart draws it. Above that the sheets change hands:
 * the calling-rejam charts cover UTG, the lojack, the cutoff, the button and the
 * small blind, and explicitly not the big blind - so an open-shove at fifteen
 * found nothing under "BB" and silently produced no EV at all.
 *
 * Falling back to the small blind, then the button. Both are charted at those
 * depths and both are the seat immediately behind a late-position shove, which is
 * the caller that matters most. Stated here rather than hidden because it is an
 * approximation: the range that answers is not always the seat the spot implies.
 */
function shoveCallerClasses(
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
): HandLabel[] {
  for (const position of ["BB", "SB", "BTN"] as Position[]) {
    const classes = playedClasses(store.lookup({ ante, position, bucket, context: "VS_ALLIN" }));
    if (classes.length > 0) return classes;
  }
  return [];
}

/** The opener's own range at this depth, from the seat the sheets calibrate to. */
function openerClasses(
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
): HandLabel[] {
  const opener = REJAM_EV_OPENER_BY_HERO[heroPos];
  if (opener === undefined) return [];
  return playedClasses(store.lookup({ ante, position: opener, bucket, context: "RFI" }));
}

/**
 * Kolikrát se zvedá nad předchozí raise, když se v produktu žádná velikost neučí.
 *
 * Tohle jsou volby, ne měření. Produkt učí jednu velikost otevření na hloubku a
 * dál už nic, takže tři-bet a čtyři-bet nemá odkud vzít - a přesně kvůli tomu se
 * u `VS_4BET` dosud nezobrazovalo žádné EV. Standardní turnajový tvar je zhruba
 * 2,2× v pozici a 3× mimo ni; čtyři-bet o něco menší, protože už je sám o sobě
 * velký.
 *
 * Chyba v potu posouvá cenu jamu o zlomek blindu. Chybějící číslo si hráč všiml.
 */
const THREE_BET_MULTIPLE_IP = 2.2;
const THREE_BET_MULTIPLE_OOP = 3;
const FOUR_BET_MULTIPLE = 2.2;

/** Sedačky, které po flopu hrají poslední, a tak tři-betují menší. */
function isInPositionForThreeBet(heroPos: Position): boolean {
  return heroPos === "BTN" || heroPos === "CO";
}

/**
 * Range, kterou soupeř čtyři-betuje, z měřených chartů.
 *
 * Bere se ze `VS_3BET`: to je pohled hráče, který otevřel a čelí tři-betu, tedy
 * přesně toho, kdo v tomhle spotu čtyři-betuje. Sedačka se volí stejným
 * kalibračním mechanismem jako u re-jamu, protože spot ani tady neví, kdo
 * otevřel - ví jen, kde sedí hrdina.
 */
function fourBetClasses(
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
): HandLabel[] {
  const opener = REJAM_EV_OPENER_BY_HERO[heroPos];
  if (opener === undefined) return [];
  const entry = store.lookup({ ante, position: opener, bucket, context: "VS_3BET" });
  if (entry === undefined) return [];
  return Object.entries(entry.strict)
    .filter(([, keys]) => keys.includes("4BET" as ActionKey))
    .map(([hand]) => hand);
}

function comboCount(classes: readonly HandLabel[]): number {
  return classes.reduce((sum, hand) => sum + combosInClass(hand), 0);
}

/**
 * Which opener prices a re-jam: the one the sheet was drawn against.
 *
 * The spot records that the hero faces an open, not who opened, so a seat has to
 * be chosen - and the choice decides the answer, because fold equity is the
 * calling range as a share of the *opener's* range. A wide opener folds more.
 *
 * Two wrong answers came before this one. The button, with a comment claiming
 * its width made the shove look worse; backwards, and it made every hand
 * profitable including 52o. Then under the gun, chosen as the tightest seat on
 * the reasoning that an approximation should not flatter the aggressive line.
 *
 * That second one was better reasoning applied to the wrong question. The sheets
 * are not drawn against an unspecified opener: `REJAM_CALIBRATION_OPENER` names
 * one per hero seat - the hijack for the blinds, button and cutoff, the lojack
 * for the hijack, UTG+1 for the lojack - and that mapping has been in the
 * repository since the ranges were extracted. Picking a safe constant overrode
 * data that was already there, and it showed: at 15BB the model called 167 hands
 * negative that the sheet jams, all of them suited hands whose shove only makes
 * sense against a seat that opens wider than under the gun does.
 *
 * Where the source says who the opponent is, use it. A conservative default is
 * for when nothing is known, not for overruling a measurement.
 */
const REJAM_EV_OPENER_BY_HERO: Readonly<Record<string, Position>> = {
  BB: "HJ",
  BTN: "HJ",
  CO: "HJ",
  HJ: "LJ",
  LJ: "UTG+1",
  SB: "HJ",
};

const REJAM_EV_CALIBRATION_CALLER: Position = "BTN";

function startingPotFor(ante: AnteMode): number {
  return ante === "ON" ? 2.5 : 1.5;
}

// ---------------------------------------------------------------------------
// Hlavní generátor jednoho spotu
// ---------------------------------------------------------------------------

/**
 * Vygeneruje jeden deterministický Spot z RNG a akčního kontextu.
 *
 * Postup:
 *   1. vybere pozici hrdiny a efektivní stack z množin odpovídajících kontextu,
 *   2. určí `pushFold` (eff ≤ 12 BB) a sestaví `TableState` konzistentní s
 *      kontextem (facing, limpy/cally, BvB),
 *   3. vybere třídu ruky a rozdá konkrétní karty,
 *   4. provede lookup do Range_Store; chybí-li záznam pro kombinaci, vrátí
 *      `null` (Req 4.8),
 *   5. sestaví `answers` (bijekce akce → Akční_klíč), `correctKeys` (LENIENT) a
 *      `strictCorrect` (STRICT); ruka bez záznamu = nejlevnější offered akce
 *      (FOLD, resp. LIMP/check pro BB vs limp), takže obě sady jsou neprázdné
 *      (Property 9),
 *   6. doplní Question_ID, startovní pot a zdůvodnění.
 *
 * Záznam s ≥ 1 klíčem (i bez kompletního sizingu) je generovatelný (Req 4.7).
 *
 * @param rng Deterministický generátor (zdroj veškeré náhodnosti).
 * @param context Akční kontext (kategorie), pro který se Spot generuje.
 * @param filters Konfigurace relace. Využívá se `filters.ante` a dimenze
 *   filtru (`positions`, `buckets`, `contexts`) — výběr pozice/koše probíhá z
 *   průniku množiny přípustné pro kontext s filtrem (prázdná dimenze =
 *   neomezeno, Req 13.7); je-li průnik prázdný nebo kontext není mezi
 *   zvolenými, vrátí `null` (Req 13.5/13.8, Property 31).
 * @param store Range_Store (injektovatelný; výchozí = reálný singleton).
 * @returns Sestavený Spot, nebo `null`, pokud pro kombinaci nejsou data
 *   (Req 4.8), Range_Store není načten (Req 4.6), nebo filtr danou kombinaci
 *   nepřipouští (Req 13.5/13.8).
 */
export function generateSpot(
  rng: () => number,
  context: ActionContext,
  filters: Filters,
  store: RangeStore = rangeStore,
): Spot | null {
  // Req 4.6 — bez konzistentně načtených dat se Spoty negenerují.
  if (!store.isLoaded()) return null;

  // Dimenze kontextu (Req 13.8): kontext mimo zvolené filtry ⇒ nic negenerovat.
  // Prázdné `filters.contexts` = neomezeno (Req 13.7).
  if (filters.contexts.length > 0 && !filters.contexts.includes(context)) {
    return null;
  }

  const ante = filters.ante;
  // Pozice a koše po aplikaci filtru (průnik s množinou přípustnou pro kontext;
  // prázdná dimenze = neomezeno, Req 13.7/13.8, Property 31).
  const positions = allowedPositions(context, filters);
  const buckets = allowedBuckets(context, filters);

  // Prázdný průnik některé dimenze ⇒ pro tuto kombinaci nelze nic vybrat.
  // (Spot se tiše vynechá; prázdný výsledek Poolu řeší výše ležící vrstva.)
  if (positions.length === 0 || buckets.length === 0) return null;

  // (1) pozice + (2) efektivní stack — pevné pořadí volání rng().
  const heroPos = pickFrom(rng, positions);
  const effStack = pickFrom(rng, buckets);
  const pushFold = effStack <= PUSH_FOLD_MAX;

  // (3) kontextově: počet limperů / callerů.
  let limpsBefore = 0;
  let callsBefore = 0;
  if (context === "VS_LIMP") {
    limpsBefore = pickLimpsBefore(rng, heroPos);
  } else if (context === "SQUEEZE") {
    callsBefore = pickCallsBefore(rng, heroPos);
  }

  const tableState: TableState = {
    heroPos,
    pushFold,
    effectiveStackBB: effStack,
    limpsBefore,
    callsBefore,
    facing: facingFor(context, heroPos),
    isBvB: context === "BVB",
  };

  // (4) ruka + (5) karty.
  const hand = pickFrom(rng, ALL_HAND_CLASSES);
  const heroCards = dealCards(rng, hand);

  // Lookup Range_Store; chybějící kombinace ⇒ null (Req 4.8).
  const key: RangeKey = { position: heroPos, bucket: effStack, context, ante };
  const entry = store.lookup(key);
  if (entry === undefined) return null;

  const handStrict = entry.strict[hand] as ActionKey[] | undefined;
  const handLenient = entry.actions[hand] as ActionKey[] | undefined;

  // Nabídka akcí dle stavových stráží Požadavku 3.
  const offeredKinds = offeredActions(tableState);

  // Výchozí akce pro ruku bez záznamu (= fold): FOLD, kde je nabízen, jinak
  // LIMP/check (BB vs limp), jinak první nabízená akce. Tím je doporučení vždy
  // mezi nabízenými možnostmi a obě sady jsou neprázdné (Property 9).
  const defaultKind: ActionKind = offeredKinds.includes("FOLD")
    ? "FOLD"
    : offeredKinds.includes("LIMP")
      ? "LIMP"
      : offeredKinds[0];
  const defaultKey = preflopActionKindToKey(defaultKind, handStrict, effStack);

  const strictCorrect: ActionKey[] =
    handStrict && handStrict.length > 0 ? [...handStrict] : [defaultKey];
  const correctKeys: ActionKey[] =
    handLenient && handLenient.length > 0 ? [...handLenient] : strictCorrect.slice();

  // answers: bijekce nabízená akce → právě jeden Akční_klíč (Property 8).
  const answers: Answer[] = offeredKinds.map((kind) => {
    const akey = preflopActionKindToKey(kind, handStrict, effStack);
    return { key: akey, label: ACTION_KEY_LABEL[akey] };
  });
  const candidateActionEvs = entry.actionEvs?.[hand];
  const offeredActionKeys = answers.map((answer) => answer.key);
  const id = questionId({ context, heroPos, effStack, hand, ante });
  const startingPot = startingPotFor(ante);

  // A reviewed export wins where one exists; otherwise the two contexts whose
  // price the spot fixes are computed. Nothing is invented for the rest.
  const actionEvs = isActionEvSetComplete(candidateActionEvs, offeredActionKeys)
    ? cloneActionEvSet(candidateActionEvs)
    : computeActionEvs(
      context,
      heroPos,
      hand,
      effStack,
      ante,
      startingPot,
      offeredActionKeys,
      store,
      filters.opponentStyle,
      tableState.callsBefore,
    );
  const explanation = buildPreflopExplanation({
    context,
    heroPos,
    effStack,
    hand,
    recommended: strictCorrect,
    tableState,
  });

  return {
    id,
    context,
    heroPos,
    effStack,
    ante,
    pushFold,
    hand,
    heroCards,
    tableState,
    answers,
    correctKeys,
    strictCorrect,
    ...(actionEvs ? { actionEvs } : {}),
    explanation,
    startingPot,
  };
}

// ---------------------------------------------------------------------------
// Obsluha seedu relace (task 8.1, Req 6.1, 6.7)
// ---------------------------------------------------------------------------

/** Horní hranice 32-bit unsigned seedu (4 294 967 295), tj. 2^32 − 1. */
const SEED_MAX = 0xffffffff;

/** Počet hodnot 32-bit unsigned prostoru (2^32) pro generování seedu. */
const SEED_SPACE = 0x1_0000_0000;

/**
 * Ověří, že `seed` je platný seed relace: celé číslo v rozsahu
 * 0 až 4 294 967 295 (32-bit unsigned, doména `mulberry32`).
 */
function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= SEED_MAX;
}

/**
 * Vrátí platný 32-bit unsigned seed relace (0–4 294 967 295) a zpřístupní jej
 * volajícímu (Req 6.7).
 *
 *   - Je-li `seed` platné celé číslo v rozsahu, vrátí jej beze změny — relace
 *     je tak reprodukovatelná pro zadaný seed.
 *   - Jinak (chybí, `null`, není celé číslo, mimo rozsah, `NaN`) vygeneruje
 *     náhodný seed v platném rozsahu a vrátí jej, aby si uživatel mohl seed
 *     uložit a stejnou sekvenci Spotů později zopakovat.
 *
 * **Náhodnost je zde výjimkou** a uplatní se **pouze** při volbě chybějícího
 * seedu (úvodní volba, nikoli generování spotů). Po zvolení seedu je veškeré
 * generování spotů čistě deterministické vůči tomuto seedu (Req 6.1/6.2):
 * `buildPool`/`generateSpot` čerpají náhodnost výhradně z `mulberry32(seed)`.
 *
 * @param seed Volitelný uživatelský seed (může chybět nebo být neplatný).
 * @returns Platný 32-bit unsigned seed použitý pro relaci.
 */
export function resolveSeed(seed?: number | null): number {
  if (seed !== null && seed !== undefined && isValidSeed(seed)) {
    return seed;
  }
  // Úvodní volba seedu — jediné povolené použití nederministické náhodnosti.
  return Math.floor(Math.random() * SEED_SPACE);
}

// ---------------------------------------------------------------------------
// Sestavení Poolu unikátních spotů (task 7.1, Req 6.3, Property 15)
// ---------------------------------------------------------------------------

/**
 * Strop počtu po sobě jdoucích neúspěšných pokusů (duplicita / `null`), po
 * jejichž dosažení se sestavování Poolu ukončí.
 *
 * Prostor unikátních Question_ID je pro danou kategorii konečný — je dán
 * součinem množin (Pozice × Hloubkový_koš × ruka), neboť kontext i ante jsou
 * pro jedno volání `buildPool` fixní. Horní hranice je tedy
 * `|pozice| × |koše| × 169`. Nejhůře je to 9 × 13 × 169 = 19 773 kombinací;
 * limit 50 000 po sobě jdoucích „neúspěchů" je dostatečně velký, aby RNG
 * prakticky vyčerpal dostupný prostor, ale zároveň tvrdě ohraničuje běh
 * (ochrana proti nekonečné smyčce). Hodnota je konstantní ⇒ ukončení je
 * deterministické a reprodukovatelné.
 */
const POOL_MAX_CONSECUTIVE_MISSES = 50_000;

/**
 * Absolutní strop velikosti Poolu — druhá, redundantní pojistka konečnosti.
 *
 * Je nastaven nad teoretické maximum unikátních kombinací (9 × 13 × 169), takže
 * za běžných okolností se neuplatní; existuje pouze pro tvrdé ohraničení paměti
 * a doby běhu.
 */
const POOL_MAX_SIZE = 20_000;

/**
 * Volitelné limity pro sestavení Poolu.
 *
 * Ve výchozím běhu se používají produkční konstanty výše, takže existující
 * chování aplikace zůstává beze změny. Menší hodnoty jsou užitečné pro cílené
 * testy determinismu, kde nepotřebujeme vyčerpat celý prostor kombinací.
 */
export interface PoolBuildOptions {
  maxConsecutiveMisses?: number;
  maxSize?: number;
}

function poolLimitOptions(options: PoolBuildOptions = {}): {
  maxConsecutiveMisses: number;
  maxSize: number;
} {
  return {
    maxConsecutiveMisses:
      options.maxConsecutiveMisses ?? POOL_MAX_CONSECUTIVE_MISSES,
    maxSize: options.maxSize ?? POOL_MAX_SIZE,
  };
}

/**
 * Odvodí 32-bit seed pro `mulberry32` z uživatelského `seed` a kategorie.
 *
 * Bez promíchání s kontextem by stejný `seed` produkoval pro všechny kategorie
 * identickou sekvenci `rng()`, a tím (po projekci přes pozice/koše dané
 * kontextem) korelované Pooly. Kombinujeme proto `seed` s `hashStr(context)`:
 *
 *   1. `hashStr(context)` → stabilní 32-bit otisk názvu kategorie,
 *   2. XOR se `seed` rozprostře vliv kategorie do celého slova,
 *   3. `>>> 0` normalizuje na uint32 (vstupní doména `mulberry32`).
 *
 * Operace jsou čistě aritmetické nad 32-bit celými čísly bez vnějšího stavu, a
 * `hashStr` je deterministický, takže stejné `(seed, context)` vždy dají
 * identický odvozený seed — a tedy identickou sekvenci spotů (Req 6.2).
 */
function derivePoolSeed(seed: number, context: ActionContext): number {
  return ((seed ^ hashStr(context)) >>> 0);
}

/**
 * Vygeneruje deterministický Pool unikátních spotů pro kombinaci
 * `(kategorie, seed, filtry)`.
 *
 * ## Determinismus a pořadí (Property 15, Req 6.2/6.3)
 *
 * RNG se inicializuje výhradně z `derivePoolSeed(seed, context)` (žádný vnější
 * stav), takže opakované volání se shodnými parametry projde tutéž sekvenci
 * `rng()`, vygeneruje tytéž spoty ve stejném pořadí a deduplikuje je stejně.
 * Pořadí Poolu je dáno pořadím **prvního** výskytu každého unikátního
 * Question_ID v této sekvenci.
 *
 * ## Deduplikace (Req 6.3)
 *
 * Spoty se sbírají v pořadí generování; spot, jehož `id` (Question_ID) už v
 * Poolu je, se zahodí. Výsledek tedy neobsahuje dvě položky se shodným `id`.
 *
 * ## Vynechání kombinací bez dat (Req 4.8)
 *
 * `generateSpot` vrací `null`, pokud pro vylosovanou kombinaci nejsou data
 * (nebo Range_Store není načten). Takové pokusy se tiše přeskakují.
 *
 * ## Konečnost (ochrana proti nekonečné smyčce)
 *
 * Prostor unikátních Question_ID je pro fixní kategorii a ante konečný. Aby byl
 * Pool reprezentativní a přitom konečný, generujeme dokud nacházíme nové
 * unikáty; ukončíme po `POOL_MAX_CONSECUTIVE_MISSES` po sobě jdoucích
 * neúspěšných pokusech (duplicita nebo `null`), případně po dosažení
 * `POOL_MAX_SIZE`. Čítač neúspěchů se nuluje při každém přidání nového unikátu.
 * Obě meze jsou konstantní ⇒ ukončení je deterministické.
 *
 * ## Filtry
 *
 * `filters` se předávají beze změny do `generateSpot`, který aplikuje logický
 * průnik dimenzí (pozice/koše/kontexty; prázdná dimenze = neomezeno, Req
 * 13.7/13.8, task 8.1). Pokud filtr danou kombinaci nepřipouští (kontext mimo
 * `filters.contexts`, nebo prázdný průnik pozic/košů), `generateSpot` vrací
 * `null` a Pool může vyjít prázdný. Volba a obsluha seedu se řeší v
 * `resolveSeed` mimo `buildPool` (ten už dostává konkrétní platný seed).
 *
 * @param seed Uživatelský seed relace (32-bit unsigned, Req 6.1).
 * @param context Akční kontext (kategorie), pro který se Pool sestavuje.
 * @param filters Konfigurace relace; zde se předává dál do `generateSpot`.
 * @param store Range_Store (injektovatelný; výchozí = reálný singleton).
 * @returns Pole unikátních spotů v deterministickém pořadí; prázdné, pokud pro
 *   kategorii nejsou data nebo Range_Store není načten.
 */
export function buildPool(
  seed: number,
  context: ActionContext,
  filters: Filters,
  store: RangeStore = rangeStore,
  options: PoolBuildOptions = {},
): Spot[] {
  const rng = mulberry32(derivePoolSeed(seed, context));
  const limits = poolLimitOptions(options);

  const pool: Spot[] = [];
  const seen = new Set<string>();
  let consecutiveMisses = 0;

  while (
    consecutiveMisses < limits.maxConsecutiveMisses &&
    pool.length < limits.maxSize
  ) {
    const spot = generateSpot(rng, context, filters, store);

    // null (chybějící data / nenačtený store) nebo již viděné id = neúspěch.
    if (spot === null || seen.has(spot.id)) {
      consecutiveMisses += 1;
      continue;
    }

    seen.add(spot.id);
    pool.push(spot);
    consecutiveMisses = 0;
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Deterministická sekvence spotů (task 7.2, Req 6.5/6.6, Property 14/17/18)
// ---------------------------------------------------------------------------

/**
 * Pevné, deterministické pořadí všech akčních kontextů.
 *
 * Slouží jako kanonické pořadí pro sestavení kombinovaného Poolu, když uživatel
 * nezvolí žádné kontexty (`filters.contexts === []` ⇒ neomezeno). Pořadí je
 * konstantní, takže pro stejné `(seed, filters)` vyjde vždy identická sekvence
 * (Property 14). Pořadí odpovídá deklaraci `ActionContext` v `types.ts`.
 */
const ALL_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

/**
 * Vrátí akční kontexty, z nichž se má sestavit sekvence, v deterministickém
 * pořadí.
 *
 * - `filters.contexts` neprázdné ⇒ použijí se zvolené kontexty, promítnuté do
 *   kanonického pořadí `ALL_CONTEXTS` (nezávisle na pořadí, v jakém je uživatel
 *   zadal — tím je pořadí stabilní a determinismus nezávisí na vstupním pořadí
 *   filtru). Případné duplicity ve filtru se ignorují.
 * - `filters.contexts` prázdné (`[]` = neomezeno, Req 13.7) ⇒ všech 9 kontextů
 *   v kanonickém pořadí.
 */
function contextsForSequence(filters: Filters): ActionContext[] {
  if (filters.contexts.length === 0) return ALL_CONTEXTS.slice();
  const chosen = new Set<ActionContext>(filters.contexts);
  return ALL_CONTEXTS.filter((c) => chosen.has(c));
}

/**
 * Sestaví deterministicky uspořádaný, napříč kontexty deduplikovaný Pool.
 *
 * Postup (vše deterministické — žádná externí náhodnost):
 *   1. urči zvolené kontexty v kanonickém pořadí (`contextsForSequence`),
 *   2. pro každý kontext sestav jeho Pool přes `buildPool` (sám deterministický
 *      a vnitřně deduplikovaný dle Question_ID, Property 15),
 *   3. zřetěz Pooly v pořadí kontextů a deduplikuj napříč kontexty podle
 *      Question_ID — každé `id` se do výsledku dostane jen při prvním výskytu
 *      (Property 17 / Req 6.5).
 *
 * Pořadí kontextů je pevné a `buildPool` je deterministický, takže výsledný
 * kombinovaný Pool je pro stejné `(seed, filters)` vždy identický (Property 14).
 */
function buildCombinedPool(
  cfg: SessionConfig,
  store: RangeStore,
  options: PoolBuildOptions = {},
): Spot[] {
  const contexts = contextsForSequence(cfg.filters);
  const combined: Spot[] = [];
  const seen = new Set<string>();

  for (const context of contexts) {
    const pool = buildPool(cfg.seed, context, cfg.filters, store, options);
    for (const spot of pool) {
      // Deduplikace napříč kontexty: každé Question_ID nejvýše jednou v rámci
      // jednoho průchodu (Req 6.5 / Property 17).
      if (seen.has(spot.id)) continue;
      seen.add(spot.id);
      combined.push(spot);
    }
  }

  return combined;
}

/**
 * Vrátí deterministickou, nekonečně cyklící sekvenci spotů napříč zvolenými
 * kategoriemi.
 *
 * ## Sestavení (jednou, mimo cyklus)
 *
 * Kombinovaný Pool se sestaví **jednou** před zahájením cyklení
 * (`buildCombinedPool`): zřetězením per-kontextových Poolů v pevném pořadí
 * kontextů a deduplikací napříč kontexty podle Question_ID. Tím je cyklení
 * levné a každý průchod má identické pořadí.
 *
 * ## Determinismus (Property 14, Req 6.2)
 *
 * Veškerá náhodnost prochází přes `buildPool` (RNG odvozené ze `seed` a
 * kontextu). Pořadí kontextů i deduplikace jsou deterministické, takže stejné
 * `(seed, filters)` dají identickou sekvenci — stejný počet, pořadí i
 * Question_ID.
 *
 * ## Jeden průchod (Property 17, Req 6.5)
 *
 * V rámci jednoho průchodu (indexy 0..poolSize-1) je každé Question_ID nejvýše
 * jednou — zaručeno deduplikací při sestavení Poolu.
 *
 * ## Cyklení (Property 18, Req 6.6)
 *
 * Po vyčerpání všech unikátních spotů začíná nový průchod od **prvního** spotu
 * ve stejném pořadí (`index % poolSize` resp. reset na 0). Question_ID se napříč
 * průchody opakují, ale pořadí je identické.
 *
 * ## Edge case: prázdný Pool
 *
 * Pokud je kombinovaný Pool prázdný (žádná data / Range_Store není načten /
 * filtry bez dat), iterátor **neyielduje nic** a okamžitě skončí — nezacyklí se
 * nekonečně naprázdno.
 *
 * ## Bezpečnost nekonečného iterátoru
 *
 * Při neprázdném Poolu je iterátor nekonečný. Konzument si bere jen tolik
 * spotů, kolik potřebuje (`for...of` s `break`, nebo `.next()`); generátor je
 * líný a nevykonává práci nad rámec vyžádaných položek.
 *
 * @param cfg Konfigurace relace (`seed` + `filters`).
 * @param store Range_Store (injektovatelný; výchozí = reálný singleton).
 * @returns `Iterable<Spot>` — prázdné při prázdném Poolu, jinak nekonečně cyklící.
 */
export function spotSequence(
  cfg: SessionConfig,
  store: RangeStore = rangeStore,
  options: PoolBuildOptions = {},
): Iterable<Spot> {
  // Pool sestavíme JEDNOU před cyklením (ne opakovaně), aby cyklení dávalo
  // identické pořadí a bylo levné.
  const pool = buildCombinedPool(cfg, store, options);

  return (function* cycle(): Generator<Spot, void, unknown> {
    // Edge case: prázdný Pool ⇒ žádný yield, žádná nekonečná smyčka naprázdno.
    if (pool.length === 0) return;

    // Nekonečné cyklení od indexu 0 ve stejném deterministickém pořadí.
    let index = 0;
    while (true) {
      yield pool[index];
      index += 1;
      if (index >= pool.length) index = 0;
    }
  })();
}

// ---------------------------------------------------------------------------
// Pomocníci pro vyčerpávající kontrolu unionů (kompilační záruka totality)
// ---------------------------------------------------------------------------

function assertNever(x: never): never {
  throw new Error(`Unexpected action context: ${String(x)}`);
}
