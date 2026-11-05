import { bestActionsForActionEv, type ActionEvSet } from "../actionEv";
import { ALL_HAND_CLASSES } from "../poker";
import {
  TOTAL_COMBOS,
  callAllInEv,
  equityCallers,
  shoveEv,
  shoveEvVsField,
  type ShoveEv,
} from "../preflopEquity";
import {
  FOUR_BET_MULTIPLE,
  THREE_BET_MULTIPLE_IP,
  THREE_BET_MULTIPLE_OOP,
  isInPositionForThreeBet,
} from "../preflopSizes";
import {
  POSITION_ORDER,
  type ActionContext,
  type ActionKey,
  type AnteMode,
  type HandLabel,
  type Position,
  type StackBucket,
} from "../types";
import type { VillainArchetype } from "../villain/archetypes";
import {
  comboCount,
  preflopVillainModel,
  rangeOfCombos,
  resizedRange,
  type PreflopVillainModel,
} from "../villain/preflopModel";
import type { RangeStore } from "../../data/rangeStore";

/**
 * EV akcí na preflopu z equity a chartů, bez generování spotů.
 *
 * Vytaženo z `drillEngine.ts` 5. 11. 2026 (Agents/plan-gto-real-2026-11.md, oddíl
 * 6, bod 2): tentýž výpočet potřebuje rozdání spotu i režim REAL.
 */

/**
 * Kdo sedí proti hráči, když se oceňuje proti typům hráčů (režim REAL). Bez typu na
 * místě platí chart, tedy rovnováha.
 */
export interface PreflopPricingPlayers {
  /** Soupeř ve hře: kdo otevřel, zvýšil nebo shovnul. */
  villain?: VillainArchetype;
  /** Kdo může shove dorovnat, v pořadí, jak jednají. */
  callers: readonly (VillainArchetype | undefined)[];
}

export interface PricedActions {
  evs: ActionEvSet<ActionKey>;
  /** Jak často všichni složí shove hráče; u dorovnání all-inu není. */
  foldFrequency?: number;
  /** Jak široko soupeř sám jde all-in, podíl všech kombinací; jen u dorovnání. */
  shoveShare?: number;
}

export function allInEvs(
  action: ActionKey,
  evBb: number,
  source: "ALL_IN_EQUITY" | "NASH_PUSH_FOLD" = "ALL_IN_EQUITY",
): ActionEvSet<ActionKey> {
  return {
    source,
    unit: "BB",
    values: [
      { action, evBb: Math.round(evBb * 100) / 100 },
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

/** Model typu, jen když proti chartu něco mění: žralok je rovnováha sama. */
function shiftingModel(archetype: VillainArchetype | undefined): PreflopVillainModel | undefined {
  if (archetype === undefined) return undefined;
  const model = preflopVillainModel(archetype);
  return model.callWidth === 1 && model.raiseWidth === 1 ? undefined : model;
}

/**
 * Shove proti hráčům, kteří drží cokoli: každému se range z chartu posune podle jeho
 * typu. Když se nikomu nic nezměnilo, je to přesně výpočet GTO.
 */
function shoveAgainstField(
  hand: HandLabel,
  measured: readonly HandLabel[],
  players: PreflopPricingPlayers | undefined,
  opponents: number,
  stackBB: number,
  potBB: number,
): ShoveEv | undefined {
  const field = Array.from({ length: opponents }, (_, seat) => {
    const archetype = players?.callers[seat];
    return archetype === undefined
      ? measured
      : resizedRange(measured, preflopVillainModel(archetype).callWidth);
  });
  return field.every((range) => range === measured)
    ? shoveEv(hand, measured, stackBB, potBB, opponents)
    : shoveEvVsField(hand, field, stackBB, potBB);
}

/** Dorovnávající uvnitř range soupeře, který už zvýšil: `share` z toho, co může mít. */
function callersWithin(
  measured: readonly HandLabel[],
  pool: readonly HandLabel[],
  share: number,
): HandLabel[] {
  const inPool = new Set(pool);
  return rangeOfCombos(
    measured.filter((hand) => inPool.has(hand)),
    Math.min(1, share) * comboCount(pool),
    pool,
  );
}

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
export function priceActions(
  context: ActionContext,
  heroPos: Position,
  hand: HandLabel,
  effStack: StackBucket,
  ante: AnteMode,
  startingPot: number,
  offered: readonly ActionKey[],
  store: RangeStore,
  players?: PreflopPricingPlayers,
  callsBefore = 0,
  opponentSeat?: Position,
): PricedActions | undefined {
  const villain = shiftingModel(players?.villain);

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
    // Everyone still to act has to fold, so the shove is priced against all of
    // them rather than against one. From under the gun that is eight players.
    const behind = Math.max(1, POSITION_ORDER.length - 1 - POSITION_ORDER.indexOf(heroPos));
    const ev = shoveAgainstField(hand, measured, players, behind, effStack, startingPot);
    if (ev === undefined) return undefined;
    return { evs: allInEvs("JAM" as ActionKey, ev.jamBB), foldFrequency: ev.foldFrequency };
  }

  if (context === "VS_ALLIN" && offered.includes("CALL_JAM") && offered.includes("FOLD")) {
    const charted = playedClasses(store.lookup({ ante, position: "BTN", bucket: effStack, context: "PUSH_FOLD" }));
    if (charted.length === 0) return undefined;
    // Kdo zvyšuje široko, široko i shovuje, a dorovnat se pak vyplatí víc rukám.
    const shover = villain === undefined ? charted : resizedRange(charted, villain.raiseWidth);
    // The shover is all in for their stack, so the pot the hero contests is the
    // blinds plus that stack, and the call is the hero's own stack.
    const ev = callAllInEv(hand, shover, effStack, startingPot + effStack);
    if (ev === undefined) return undefined;
    return { evs: allInEvs("CALL_JAM" as ActionKey, ev.callBB), shoveShare: comboCount(shover) / TOTAL_COMBOS };
  }

  // Re-jamming over an open. The hero's action is all in, so its size is fixed;
  // the only other number needed is what the opener put in, and that is not an
  // assumption either - the product teaches one open size per depth and says so
  // in its own action keys.
  if (context === "VS_OPEN" && offered.includes("JAM") && offered.includes("FOLD")) {
    const openBB = openSizeAtDepth(effStack, ante, store);
    if (openBB === undefined) return undefined;
    // The opener has already raised, so they do not hold a random hand. Fold
    // equity has to be measured against what they can actually have, which is
    // their opening range at this depth - not against the deck.
    const opener = openerClasses(heroPos, effStack, ante, store, opponentSeat);
    const openerCombos = comboCount(opener);
    if (openerCombos === 0) return undefined;
    // The charted caller where a sheet exists (up to 30BB); past the sheets the
    // caller is derived from equity against the hero's own jam range (decision
    // 8a, 2026-09-22): the opener calls the shove with whatever of their opening
    // range shows a non-negative call. Pot at the call: blinds, the open and the
    // hero's stack; to call: the rest of the opener's stack.
    const charted = callRejamClasses(effStack, ante, store);
    const measured = charted.length > 0 ? charted : equityCallers(
      jamClasses(context, heroPos, effStack, ante, store, opponentSeat),
      opener, effStack - openBB, startingPot + openBB + effStack,
    );
    if (measured.length === 0) return undefined;
    // Typ soupeře posouvá dvě věci: s čím otevírá a jaký podíl z toho dorovná.
    // Here the pool is what the opener can hold, not the deck: they have already
    // raised. A calling station calls a larger share of that, a rock a smaller
    // one, and both are shifts of the same range rather than new charts.
    const openerRange = villain === undefined ? opener : resizedRange(opener, villain.raiseWidth);
    const caller = villain === undefined
      ? measured
      : callersWithin(measured, openerRange, (comboCount(measured) / openerCombos) * villain.callWidth);
    // One opponent, not the field: the hero is jamming over a raise, and the
    // players behind have already folded to it. This is the case where pricing
    // against a single caller is right rather than flattering.
    const ev = shoveEv(hand, caller, effStack, startingPot + openBB, 1, comboCount(openerRange));
    if (ev === undefined) return undefined;
    return { evs: allInEvs("JAM" as ActionKey, ev.jamBB), foldFrequency: ev.foldFrequency };
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
    const chartedRange = fourBetClasses(heroPos, effStack, ante, store);
    if (chartedRange.length === 0) return undefined;
    const committedRange = villain === undefined ? chartedRange : resizedRange(chartedRange, villain.raiseWidth);
    const committedCombos = comboCount(committedRange);
    if (committedCombos === 0) return undefined;

    if (atRisk <= 0) {
      const called = callAllInEv(hand, committedRange, effStack - threeBetBB, pot);
      if (called === undefined) return undefined;
      return { evs: allInEvs("JAM" as ActionKey, called.callBB), shoveShare: committedCombos / TOTAL_COMBOS };
    }

    // Kdo dorovná pětibet. Range čtyři-betujícího je měřená - ruce, které
    // charty značí 4BET proti tří-betu - a v těchhle hloubkách je čtyři-bet
    // blízko commitu, takže pokračuje prakticky s celou. To je měřená data
    // zúžená vyřčeným čtením, ne nový chart. Širší už být nemůže, takže typ, který
    // dorovnává víc než chart, pokračuje s celou.
    const caller = villain === undefined
      ? committedRange
      : resizedRange(committedRange, Math.min(1, villain.callWidth), committedRange);
    const ev = shoveEv(hand, caller, atRisk, pot, 1, committedCombos);
    if (ev === undefined) return undefined;
    return { evs: allInEvs("JAM" as ActionKey, ev.jamBB), foldFrequency: ev.foldFrequency };
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
    const openBB = openSizeAtDepth(effStack, ante, store) ?? 0;
    const pot = context === "SQUEEZE"
      ? startingPot + openBB * (1 + callsBefore)
      : startingPot;
    // Charted caller up to 30BB; beyond the sheets, derived from equity against
    // the hero's jam range (decision 8a). The pool is the whole deck here: blind
    // versus blind the opponent holds anything, and facing a squeeze the callers
    // are not one named range either. To call: the stack behind whatever they
    // already put in, which the open size stands for.
    const charted = shoveCallerClasses(effStack, ante, store);
    const caller = charted.length > 0 ? charted : equityCallers(
      jamClasses(context, heroPos, effStack, ante, store, opponentSeat),
      ALL_HAND_CLASSES, effStack - openBB, pot + effStack,
    );
    if (caller.length === 0) return undefined;
    // One opponent blind versus blind; everyone still in the hand facing a
    // squeeze, since any of them can call.
    const opponents = context === "SQUEEZE" ? 1 + callsBefore : 1;
    const ev = shoveAgainstField(hand, caller, players, opponents, effStack, pot);
    if (ev === undefined) return undefined;
    return { evs: allInEvs("JAM" as ActionKey, ev.jamBB), foldFrequency: ev.foldFrequency };
  }

  return undefined;
}

/**
 * Smí odhad all-inu hodnotit tenhle spot?
 *
 * Jen když nejde proti chartu. Chart je rovnováha: kdyby jam s tou rukou vydělával,
 * solver by ho hrál. Když tedy jednokrokový odhad říká něco jiného, chybuje odhad -
 * počítá s pevným rangem dorovnávajících, ať shovuje kdokoli a čímkoli, a oceňuje jen
 * jam a fold, ne call nebo menší zvýšení vedle nich.
 *
 * Známkování dává EV přednost před chartem, takže rozpor nebyl vidět jako dvě čísla,
 * ale jako špatná známka. Změřeno 5. 11. 2026 na produkčním packu: na squeeze model
 * doporučoval jam se všemi rukami a fold podle chartu byl chyba v 490 z 490 spotů (HJ
 * 20 BB KTo, „jam +4 BB“), na BVB v 55 z 55 a na VS_4BET ve 324 z 1 426. Stejný princip
 * platí pro jam přes limpery výš: číslo tažené k agresivní lajně je horší než žádné.
 *
 * Režim REAL se řídí totéž (plán GTO/REAL, 4.4): s GTO statistikami musí model
 * zopakovat chart, jinak se spot hodnotí jen podle GTO.
 */
export function agreesWithChart(
  evs: ActionEvSet<ActionKey>,
  chart: readonly ActionKey[],
): boolean {
  const best = bestActionsForActionEv(evs);
  return chart.some((action) => best.includes(action));
}

/** EV proti chartům, jak ji nese rozdaný spot. */
export function computeActionEvs(
  context: ActionContext,
  heroPos: Position,
  hand: HandLabel,
  effStack: StackBucket,
  ante: AnteMode,
  startingPot: number,
  offered: readonly ActionKey[],
  store: RangeStore,
  callsBefore = 0,
  opponentSeat?: Position,
): ActionEvSet<ActionKey> | undefined {
  return priceActions(
    context, heroPos, hand, effStack, ante, startingPot, offered, store, undefined, callsBefore, opponentSeat,
  )?.evs;
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
 * The hero's own jam range at this spot: what the derived caller answers.
 *
 * Read from the record the spot teaches - refined by opener where one exists,
 * general otherwise - so the caller is derived against exactly the shove the
 * player is being taught to make.
 */
function jamClasses(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
  opponentSeat?: Position,
): HandLabel[] {
  const entry = store.lookup({
    ante, position: heroPos, bucket, context, ...(opponentSeat === undefined ? {} : { vsSeat: opponentSeat }),
  });
  if (entry === undefined) return [];
  return Object.entries(entry.strict)
    .filter(([, keys]) => keys.includes("JAM" as ActionKey))
    .map(([hand]) => hand as HandLabel);
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

/**
 * The opener's own range at this depth.
 *
 * From the seat the spot names when it names one (`TableState.vsSeat`, drawn
 * only among seats the library says something about), otherwise from the seat
 * the sheets calibrate to. Since 2026-09-15 the two agree for today's content:
 * a spot without a refined record draws the calibrated opener.
 */
function openerClasses(
  heroPos: Position,
  bucket: StackBucket,
  ante: AnteMode,
  store: RangeStore,
  opponentSeat?: Position,
): HandLabel[] {
  const opener = opponentSeat ?? REJAM_EV_OPENER_BY_HERO[heroPos];
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
 *
 * Exported since 2026-09-04, because a second place needs the same answer. The
 * imported chart draft carries the opening seat and the product does not: two
 * drafted grids for one cell differ only by who opened, and only one can be
 * stored. The one to keep is the one this mapping already assumes, so that the
 * product's standing assumption becomes true instead of approximate. Two copies
 * of this table would drift apart silently and each side would then claim
 * something different about the same range.
 */
export const REJAM_EV_OPENER_BY_HERO: Readonly<Record<string, Position>> = {
  BB: "HJ",
  BTN: "HJ",
  CO: "HJ",
  HJ: "LJ",
  LJ: "UTG+1",
  SB: "HJ",
};

const REJAM_EV_CALIBRATION_CALLER: Position = "BTN";
