import { hashStr } from "./rng";
import type { HHResult } from "./hhParser";
import {
  generatePostflopSpot,
  postflopDefenderContextsForFormat,
  postflopPositionContextsForFormat,
  type PostflopAction,
  type PostflopPotType,
  type PostflopStreet,
  type PostflopPositionContext,
  type PostflopStrategyResolver,
} from "./postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  type PostflopExplanationLanguage,
  type PostflopTrainingSpot,
} from "./postflopTrainingSpot";
import type { Card, Position, Spot } from "./types";
import type { TableFormat } from "./trainingProfile";

export function buildImportedFlopTrainingSpot(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
  options: ImportedPostflopStrategyOptions = {},
): PostflopTrainingSpot | undefined {
  return buildImportedPostflopTrainingSpots(result, strategyResolver, options)[0];
}

export interface ImportedPostflopStrategyOptions {
  allowFallback?: boolean;
  language?: PostflopExplanationLanguage;
}

export function buildImportedPostflopTrainingSpots(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
  options: ImportedPostflopStrategyOptions = {},
): readonly PostflopTrainingSpot[] {
  if (!result.ok || !result.spot) return [];
  if (!result.fields.flop || !result.fields.heroCards) return [];
  const bigBlindDefence = isSupportedBigBlindDefence(result.spot, result);
  if (!bigBlindDefence && !isSupportedPreflopAggressor(result.spot, result.fields.actions)) {
    return [];
  }

  // Hrdina jen dorovnal, takze pot zustal single-raised bez ohledu na to, jaky
  // preflopovy kontext trenazer te ruce priradil.
  const potType = bigBlindDefence ? "SINGLE_RAISED" : importedPotType(result.spot);
  const positionContext = positionContextFromPreflopSpot(
    result.spot,
    result.fields.tableFormat ?? "FULL_RING_9",
    potType,
    result.fields.preflopAggressorPosition,
  );
  if (!positionContext) return [];

  const spots: PostflopTrainingSpot[] = [];
  spots.push(buildImportedPostflopTrainingSpot({
    result,
    heroCards: result.fields.heroCards,
    street: "FLOP",
    potType,
    positionContext,
    board: result.fields.flop,
    strategyResolver,
    allowFallback: options.allowFallback,
    language: options.language,
  }));

  if (result.fields.turn) {
    spots.push(buildImportedPostflopTrainingSpot({
      result,
      heroCards: result.fields.heroCards,
      street: "TURN",
      potType,
      positionContext,
      board: result.fields.turn,
      strategyResolver,
      allowFallback: options.allowFallback,
      language: options.language,
    }));
  }

  if (result.fields.river) {
    spots.push(buildImportedPostflopTrainingSpot({
      result,
      heroCards: result.fields.heroCards,
      street: "RIVER",
      potType,
      positionContext,
      board: result.fields.river,
      strategyResolver,
      allowFallback: options.allowFallback,
      language: options.language,
    }));
  }

  return spots;
}

function buildImportedPostflopTrainingSpot(input: {
  result: HHResult;
  heroCards: [Card, Card];
  street: PostflopStreet;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  board: readonly Card[];
  positionContext: PostflopPositionContext;
  strategyResolver?: PostflopStrategyResolver;
  allowFallback?: boolean;
  language?: PostflopExplanationLanguage;
}): PostflopTrainingSpot {
  const {
    result,
    heroCards,
    street,
    potType,
    board,
    positionContext,
    strategyResolver,
    allowFallback,
    language,
  } = input;
  const history = historyForStreet(result, street);
  const financial = financialStateForStreet(result, street);
  return postflopSpotToTrainingSpot(generatePostflopSpot({
    seed: hashStr(`HH_${street}|${result.spot?.id ?? "unknown"}|${cardLabels(board)}`),
    street,
    heroCards,
    board: [...board],
    potType,
    potBB: financial?.potBeforeBB ?? defaultImportedPotBB(street),
    effectiveStackBB:
      financial?.effectiveStackBeforeBB ??
      result.fields.effStackBB ??
      result.spot?.effStack ??
      40,
    positionContext,
    actionNode: actionNodeForStreet(street, history, positionContext, potType),
    priorFlopAction: street === "TURN" ? postflopActionFromRaw(
      result.fields.postflopActions?.flop?.heroActions[0],
    ) : undefined,
    priorTurnAction: street === "RIVER" ? postflopActionFromRaw(
      result.fields.postflopActions?.turn?.heroActions[0],
    ) : undefined,
    strategyResolver,
    allowFallback,
  }), language);
}

function financialStateForStreet(result: HHResult, street: PostflopStreet) {
  switch (street) {
    case "FLOP":
      return result.fields.financialState?.flop;
    case "TURN":
      return result.fields.financialState?.turn;
    case "RIVER":
      return result.fields.financialState?.river;
  }
}

function defaultImportedPotBB(street: PostflopStreet): number {
  switch (street) {
    case "FLOP":
      return 6;
    case "TURN":
      return 10;
    case "RIVER":
      return 18;
  }
}

function isSupportedPreflopAggressor(
  spot: Spot,
  actions: readonly string[] | undefined,
): boolean {
  const firstAction = actions?.[0]?.toLowerCase() ?? "";
  if (!firstAction.startsWith("raise") && !firstAction.startsWith("bet")) return false;
  return spot.context === "RFI" ||
    spot.context === "BVB" ||
    spot.context === "VS_OPEN" ||
    spot.context === "SQUEEZE";
}

/**
 * Obrana velkeho blindu dorovnanim - nejcastejsi postflopovy spot v turnajich.
 *
 * Rozbor dosud bral jen ruce, kde hrdina sam zvedal, takze tenhle spot v nem
 * nebyl vubec. Prochazi jen ciste provedeni: hrdina je BB, jeho jedina
 * preflopova akce je call, nekdo jiny naposledy zvedal a k flopu doslo ve dvou.
 * Cokoli slozitejsiho - re-raise po dorovnani, tri hraci na flopu - zustava
 * venku, protoze postflopovy model je stavany na dva hrace a domyslet zbytek by
 * znamenalo ukazovat strategii ke stolu, ktery u toho nesedel.
 */
function isSupportedBigBlindDefence(
  spot: Spot,
  result: HHResult,
): boolean {
  if (spot.heroPos !== "BB") return false;

  const heroActions = result.fields.actions ?? [];
  if (heroActions.length !== 1) return false;
  if (!heroActions[0].toLowerCase().startsWith("call")) return false;

  const aggressor = result.fields.preflopAggressorPosition;
  if (aggressor === undefined || aggressor === "BB") return false;

  return headsUpToTheFlop(result);
}

/** Kolik hracu doslo k flopu, podle posledni preflopove akce kazdeho z nich. */
function headsUpToTheFlop(result: HHResult): boolean {
  const details = result.fields.preflopActionDetails;
  if (details === undefined || details.length === 0) return false;
  const lastByActor = new Map<string, string>();
  for (const action of details) lastByActor.set(action.actor, action.kind);
  let live = 0;
  for (const kind of lastByActor.values()) if (kind !== "FOLD") live += 1;
  return live === 2;
}

function importedPotType(
  spot: Spot,
): Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT"> {
  return spot.context === "VS_OPEN" || spot.context === "SQUEEZE"
    ? "THREE_BET_POT"
    : "SINGLE_RAISED";
}

/**
 * Posadí hrdinu tam, kde v ruce skutečně seděl.
 *
 * Obrana velkého blindu se sem dřív vůbec nedostala: kontexty jsou psané ze
 * strany raisera, takže pro hráče, který jen dorovnal, žádná židle neexistovala
 * a rozbor takovou ruku tiše přeskočil. Teď se z historie čte, kdo naposledy
 * zvedal, a když je to někdo jiný než hrdina, sestaví se kontext obránce.
 */
function positionContextFromPreflopSpot(
  spot: Spot,
  tableFormat: TableFormat,
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  preflopAggressorPosition?: Position,
): PostflopPositionContext | undefined {
  if (spot.heroPos === "BB") {
    if (potType !== "SINGLE_RAISED") return undefined;
    if (preflopAggressorPosition === undefined) return undefined;
    if (preflopAggressorPosition === "BB") return undefined;
    return postflopDefenderContextsForFormat(tableFormat)
      .find((context) => context.villainPosition === preflopAggressorPosition);
  }
  return postflopPositionContextsForFormat(tableFormat, potType)
    .find((context) => (
      context.heroPosition === spot.heroPos &&
      context.villainPosition === "BB" &&
      context.aggressorPosition === spot.heroPos
    ));
}

function cardLabels(cards: readonly { rank: string; suit: string }[]): string {
  return cards.map((card) => `${card.rank}${card.suit}`).join("-");
}

function historyForStreet(result: HHResult, street: PostflopStreet) {
  switch (street) {
    case "FLOP":
      return result.fields.postflopActions?.flop;
    case "TURN":
      return result.fields.postflopActions?.turn;
    case "RIVER":
      return result.fields.postflopActions?.river;
  }
}

/**
 * Which decision the hand actually presented, from the history and the seats.
 *
 * Nobody having bet yet is two different decisions, not one. If hero took the
 * betting lead before the flop, acting first is a continuation; if hero called
 * the last raise, it is a lead into the player who has it. Collapsing both into
 * the barrel told a defender they held initiative they never had, and matched
 * their hand against the aggressor's strategy.
 *
 * Only the turn is split today, because that is the street with content for the
 * distinction. The flop and river keep the aggressor's naming until they have
 * the same, rather than gaining a node with nothing behind it.
 */
function actionNodeForStreet(
  street: PostflopStreet,
  history: ReturnType<typeof historyForStreet>,
  positionContext: PostflopPositionContext,
  potType: PostflopPotType,
) {
  const facingBet = history?.actionsBeforeHero.some(isPressureAction) ?? false;
  const heroHasInitiative = positionContext.heroPosition === positionContext.aggressorPosition;
  switch (street) {
    case "FLOP":
      if (facingBet) return "FLOP_FACING_BET";
      if (heroHasInitiative) {
        return potType === "THREE_BET_POT" ? "THREE_BET_POT_CBET" : "SINGLE_RAISED_POT_CBET";
      }
      return "FLOP_OOP_LEAD";
    case "TURN":
      if (facingBet) return "TURN_FACING_BET";
      return heroHasInitiative ? "TURN_BARREL" : "TURN_OOP_LEAD";
    case "RIVER":
      if (facingBet) return "RIVER_FACING_BET";
      return heroHasInitiative ? "RIVER_PRESSURE" : "RIVER_OOP_LEAD";
  }
}

function isPressureAction(raw: string): boolean {
  return /^(bets|raises)\b/i.test(raw.trim());
}

function postflopActionFromRaw(raw: string | undefined): PostflopAction | undefined {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value.startsWith("fold")) return "FOLD";
  if (value.startsWith("check")) return "CHECK";
  if (value.startsWith("call")) return "CALL";
  if (value.startsWith("raise")) return "RAISE";
  if (value.startsWith("bet")) return "BET_SMALL";
  return undefined;
}
