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
 *   3b. (kontextově) protihráč - otvírač u `VS_OPEN` a `SQUEEZE`, tříbetující
 *       u `VS_3BET`; losuje se jen mezi sedačkami, o kterých knihovna něco
 *       tvrdí (`opponentSeatCandidates`), a bez kandidáta se `rng()` nevolá,
 *   4. třída ruky,
 *   5. barvy karet.
 *
 * Pro daný `context` a obsah knihovny je počet i pořadí volání `rng()`
 * jednoznačné, takže stejná sekvence `rng()` ⇒ bitově shodný Spot. Krok 3b
 * přibyl 15. 9. 2026 (osa otvírače, bod 234): sekvence pro daný seed se u
 * `VS_OPEN` a `SQUEEZE` od té verze liší, obsah odpovědí ne.
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
import { offeredActions, rangeTeachesJam } from "./actionTree";
import { preflopActionKindToKey } from "./preflopActionOptions";
import { questionId } from "./questionId";
import { mulberry32, hashStr } from "./rng";
import { buildPreflopExplanation } from "./preflopExplanation";
import { bestActionsForActionEv, cloneActionEvSet, isActionEvSetComplete } from "./actionEv";
import { ACTION_KEY_LABEL } from "./actionKeyLabels";
import { nashActionEvs } from "./preflop/nashTable";
import { REJAM_EV_OPENER_BY_HERO, agreesWithChart, computeActionEvs, openSizeAtDepth } from "./preflop/preflopEv";
import { preflopFocusSeat } from "./villain/tableCast";
import { rangeStore, type RangeKey, type RangeStore } from "../data/rangeStore";

export { REJAM_EV_OPENER_BY_HERO, openSizeAtDepth };

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

/**
 * Blind-vs-blind: hrdina je SB, který jde první do potu (Req 3.11, Property 7).
 *
 * Do 17. 9. 2026 sem patřil i BB, který brání proti otevření SB. Tatáž
 * situace ale od 16. 9. existuje jako `VS_OPEN` z SB se zpřesněným záznamem
 * (osa otvírače, RYE ji čte tak, parser historie taky), takže jedna otázka
 * měla dvě ID a dvě odpovědi. Vlastník rozhodl držet RYE: obrana BB proti SB
 * je `VS_OPEN|BB|vsSB`, `BVB` zůstává jen pro SB. Uložené výsledky BB v BvB
 * tím dostaly jiné ID (bod 254).
 */
const POS_BVB: Position[] = ["SB"];

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

/**
 * Sedačky, které mohly jednat proti hrdinovi a mezi kterými se losuje.
 *
 * Losuje se jen mezi sedačkami, **o kterých knihovna něco tvrdí**: buď má
 * proti nim zpřesněný záznam (`RangeEntry.vsSeat`), nebo je to otvírač, proti
 * kterému je obecný záznam kalibrovaný (`REJAM_EV_OPENER_BY_HERO`). Losovat
 * libovolnou sedačku před hrdinou by otázka říkala „UTG otevírá“ a odpověď
 * brala z range proti HJ - hráč by odpovídal na jinou otázku než range
 * (bod 234). Takhle obrázek, text otázky i EV jmenují téhož otvírače a z
 * předpokladu produktu se stává pravda na stole (rozhodnutí majitele
 * 4. 9. 2026).
 *
 * `VS_3BET` kalibrovaného protihráče nemá (EV se tam nepočítá), takže se losuje
 * jen mezi zpřesněnými záznamy; bez nich zůstává spot bez sedačky jako dřív.
 *
 * SB jako otvírač u BB se losuje jen se zpřesněným záznamem: kalibrovaný
 * otvírač BB je HJ a obecný záznam o SB nic netvrdí. Vlastník 16. 9. 2026
 * rozhodl, že se tu drží RYE: otevření SB proti BB je `VS_OPEN` z SB, ne
 * zvláštní kontext. `BVB` v drillu zůstává vedle toho; sjednocení je
 * samostatný krok (bod 254).
 */
export function opponentSeatCandidates(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
): Position[] {
  const heroIdx = POSITION_ORDER.indexOf(heroPos);
  let seats: Position[];
  switch (context) {
    case "VS_OPEN":
    case "SQUEEZE":
      seats = POSITION_ORDER.slice(0, heroIdx);
      break;
    case "VS_3BET":
      seats = POSITION_ORDER.slice(heroIdx + 1);
      break;
    default:
      return [];
  }
  // Sedačka je kandidát, když o ní knihovna něco tvrdí - ať bez scénáře, nebo
  // pod některým scénářem. Pack se scénáři (ICM) obecné záznamy nemá, takže
  // hledat jen bez scénáře by o jeho sedačkách nenašlo nic a profil by
  // nerozdal ani jeden spot. Prázdný katalog scénářů se chová jako dřív.
  const setups = Object.keys(store.stackSetups ?? {});
  const candidates = new Set<Position>(seats.filter((seat) => (
    store.lookup({ ante, position: heroPos, bucket, context, vsSeat: seat })?.vsSeat === seat
    || setups.some((stackSetupId) => (
      store.lookup({ ante, position: heroPos, bucket, context, vsSeat: seat, stackSetupId })?.vsSeat === seat
    ))
  )));
  if (context !== "VS_3BET") {
    const calibrated = REJAM_EV_OPENER_BY_HERO[heroPos];
    const general = store.lookup({ ante, position: heroPos, bucket, context });
    if (calibrated !== undefined && seats.includes(calibrated)
      && general !== undefined && general.vsSeat === undefined) {
      candidates.add(calibrated);
    }
  }
  return POSITION_ORDER.filter((seat) => candidates.has(seat));
}

/**
 * Scénáře (rozložení stacků), pro které knihovna v téhle buňce něco tvrdí.
 *
 * Táž konstrukce jako `opponentSeatCandidates`: losuje se jen mezi scénáři se
 * záznamem pro tu sedačku, hloubku, kontext a otvírače - vylosovat scénář bez
 * záznamu by stůl kreslil rozložení, na které odpověď neplatí. Pack bez
 * katalogu scénářů (všechny chipEV packy) vrací prázdno a `rng()` se nevolá,
 * takže seedované sekvence zůstávají bajt po bajtu jako dřív.
 */
export function scenarioCandidates(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
  vsSeat?: Position,
): string[] {
  const catalog = store.stackSetups ?? {};
  return Object.keys(catalog).sort().filter((stackSetupId) => (
    store.lookup({
      ante, position: heroPos, bucket, context, stackSetupId, ...(vsSeat === undefined ? {} : { vsSeat }),
    })?.stackSetupId === stackSetupId
  ));
}

/**
 * Kombinace dorovnávajících, které spot v téhle buňce smí rozdat.
 *
 * Táž zásada jako u otvírače a scénáře: **losuje se jen mezi tím, o čem
 * knihovna něco tvrdí.** Losovat libovolnou sedačku před hrdinou by znamenalo,
 * že otázka řekne „CO dorovnal" a odpověď se vezme z range proti MP - hráč by
 * odpovídal na jinou otázku než range (tatáž vada jako bod 234, jen o osu dál).
 *
 * Kontroluje se to dotazem, ne jen katalogem: záznam musí po `lookup` doopravdy
 * vyjít s tou osou. Katalog říká, co v packu leží; dotaz říká, co se vrátí -
 * a mezi tím je řetěz pádu, který může vrátit něco obecnějšího.
 *
 * Pack, který tu osu neumí (`flatCallerSets` chybí), nedá kandidáta a `rng()`
 * se nevolá, takže seedované sekvence zůstávají bajt po bajtu jako dřív.
 */
export function flatCallerCandidates(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
  vsSeat?: Position,
): readonly string[][] {
  const sets = store.flatCallerSets?.({
    ante, position: heroPos, bucket, context, ...(vsSeat === undefined ? {} : { vsSeat }),
  }) ?? [];
  return sets
    .filter((flatCallers) => {
      const entry = store.lookup({
        ante, position: heroPos, bucket, context, flatCallers,
        ...(vsSeat === undefined ? {} : { vsSeat }),
      });
      return entry?.flatCallers?.join("+") === flatCallers.join("+");
    })
    .map((flatCallers) => [...flatCallers]);
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

  // (3b) protihráč, jen mezi sedačkami, o kterých knihovna něco tvrdí.
  const opponents = opponentSeatCandidates(context, heroPos, effStack, ante, store);
  const vsSeat = opponents.length === 0 ? undefined : pickFrom(rng, opponents);
  // (3c) scénář (rozložení stacků), jen mezi těmi, pro které je záznam.
  const scenarios = scenarioCandidates(context, heroPos, effStack, ante, store, vsSeat);
  const stackSetupId = scenarios.length === 0 ? undefined : pickFrom(rng, scenarios);
  /*
   * (3d) kdo otevření dorovnal, jen mezi kombinacemi, pro které je záznam
   * (rozhodnutí vlastníka 4a, 1. 10. 2026).
   *
   * Pořadí je podstatné: losuje se **po** scénáři, takže pack bez téhle osy
   * `rng()` nezavolá a seedované sekvence zůstanou jako dřív - tatáž vlastnost,
   * jakou má osa scénáře od 22. 9. 2026.
   */
  const flatSets = flatCallerCandidates(context, heroPos, effStack, ante, store, vsSeat);
  const flatCallers = flatSets.length === 0 ? undefined : pickFrom(rng, flatSets);

  // (4) ruka + (5) karty.
  const hand = pickFrom(rng, ALL_HAND_CLASSES);
  const heroCards = dealCards(rng, hand);

  // Lookup Range_Store; chybějící kombinace ⇒ null (Req 4.8). Se sedačkou se
  // zkusí zpřesněný záznam a bez něj se vrátí obecný (`RangeKey.vsSeat`).
  const key: RangeKey = {
    position: heroPos, bucket: effStack, context, ante,
    ...(vsSeat === undefined ? {} : { vsSeat }),
    ...(stackSetupId === undefined ? {} : { stackSetupId }),
    ...(flatCallers === undefined ? {} : { flatCallers }),
  };
  const entry = store.lookup(key);
  if (entry === undefined) return null;

  // Stav stolu až po záznamu: nabídka shove nad listy vlastníka závisí na tom,
  // jestli ho tahle range učí (`jamTaught`, rozhodnutí 8a).
  const tableState: TableState = {
    heroPos,
    pushFold,
    effectiveStackBB: effStack,
    limpsBefore,
    /*
     * Počet dorovnávajících musí sedět na **jmenované** dorovnávající.
     *
     * `pickCallsBefore` losuje 1 az 7 callerů a o jejich jménech neví nic. Když
     * spot dostane záznam s osou (`@BU+SB`), stůl by jinak nakreslil tři callery
     * k range, která platí pro dva - a hráč by odpovídal na jinou situaci, než
     * jakou vidí. Bere se `entry`, ne `flatCallers`: po pádu v `lookup` může
     * přijít obecnější záznam a stav stolu má přiznat, co se doopravdy vrátilo.
     */
    callsBefore: entry.flatCallers?.length ?? callsBefore,
    facing: facingFor(context, heroPos),
    isBvB: context === "BVB",
    ...(vsSeat === undefined ? {} : { vsSeat }),
    ...(entry.stackSetupId === undefined ? {} : { stackSetupId: entry.stackSetupId }),
    ...(entry.flatCallers === undefined ? {} : { flatCallers: entry.flatCallers }),
    jamTaught: rangeTeachesJam(entry),
  };
  const seatStacks = entry.stackSetupId === undefined
    ? undefined
    : store.stackSetups?.[entry.stackSetupId]?.stacksBB;

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
  const defaultKey = preflopActionKindToKey(defaultKind, handStrict, effStack, handLenient);

  const strictCorrect: ActionKey[] =
    handStrict && handStrict.length > 0 ? [...handStrict] : [defaultKey];
  const correctKeys: ActionKey[] =
    handLenient && handLenient.length > 0 ? [...handLenient] : strictCorrect.slice();

  // answers: bijekce nabízená akce → právě jeden Akční_klíč (Property 8).
  const answers: Answer[] = offeredKinds.map((kind) => {
    const akey = preflopActionKindToKey(kind, handStrict, effStack, handLenient);
    return { key: akey, label: ACTION_KEY_LABEL[akey] };
  });
  const candidateActionEvs = entry.actionEvs?.[hand];
  const offeredActionKeys = answers.map((answer) => answer.key);
  // Zpřesněná odpověď je jiná otázka a dostane jiné ID; obecná odpověď pod
  // vylosovanou sedačkou má ID bajt po bajtu jako dřív (viz `questionId`).
  const id = questionId({
    context, heroPos, effStack, hand, ante,
    ...(entry.vsSeat === undefined ? {} : { vsSeat: entry.vsSeat }),
    ...(entry.stackSetupId === undefined ? {} : { stackSetupId: entry.stackSetupId }),
    ...(entry.flatCallers === undefined ? {} : { flatCallers: entry.flatCallers }),
  });
  const startingPot = startingPotFor(ante);

  // A reviewed export wins where one exists; otherwise the two contexts whose
  // price the spot fixes are computed. Nothing is invented for the rest.
  // Under an ICM scenario nothing is priced at all: the chip-EV equity model
  // would put a chip price on a $EV question (owner's decision 5b, 2026-09-22:
  // ranges only, no price, until payouts are known).
  const nashEvs = isActionEvSetComplete(candidateActionEvs, offeredActionKeys) || entry.stackSetupId !== undefined
    ? undefined
    : nashActionEvs({
      context,
      heroPos,
      hand,
      effStack,
      ante,
      offered: offeredActionKeys,
      ...(context === "VS_ALLIN" ? { shover: preflopFocusSeat({ heroPos, tableState }) } : {}),
    });
  const computedActionEvs = isActionEvSetComplete(candidateActionEvs, offeredActionKeys) ||
    entry.stackSetupId !== undefined || nashEvs !== undefined
    ? undefined
    : computeActionEvs(
      context,
      heroPos,
      hand,
      effStack,
      ante,
      startingPot,
      offeredActionKeys,
      store,
      tableState.callsBefore,
      vsSeat,
    );
  const actionEvs = isActionEvSetComplete(candidateActionEvs, offeredActionKeys)
    ? cloneActionEvSet(candidateActionEvs)
    : nashEvs ?? (computedActionEvs !== undefined && agreesWithChart(computedActionEvs, strictCorrect)
      ? computedActionEvs
      : undefined);
  const explanation = buildPreflopExplanation({
    context,
    heroPos,
    effStack,
    hand,
    // Kde rozhoduje rovnováha, musí text říkat totéž co známka.
    recommended: nashEvs === undefined ? strictCorrect : bestActionsForActionEv(nashEvs),
    tableState,
    ...(seatStacks === undefined ? {} : { seatStacks }),
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
    ...(seatStacks === undefined ? {} : { seatStacks }),
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
