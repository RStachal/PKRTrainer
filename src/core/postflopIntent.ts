import {
  POSITION_ORDER,
  type ActionContext,
  type Filters,
  type Position,
  type StackBucket,
} from "./types";
import type {
  PostflopPositionContext,
  PostflopPotType,
  PostflopPositionPattern,
} from "./postflopGenerator";

export interface PostflopIntent {
  positionContext: PostflopPositionContext | null;
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
}

const NON_BLIND_POSITIONS: readonly Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
];

export function postflopPositionContextFromFilters(
  filters: Pick<Filters, "positions" | "contexts">,
): PostflopPositionContext | null {
  return postflopIntentFromFilters(filters).positionContext;
}

export function postflopIntentFromFilters(
  filters: Pick<Filters, "positions" | "contexts"> & Partial<Pick<Filters, "buckets">>,
): PostflopIntent {
  const positions = sortPositions(filters.positions);
  const contexts = filters.contexts;
  const potType = postflopPotTypeFromContexts(contexts);
  const effectiveStackBB = effectiveStackFromBuckets(filters.buckets ?? []);
  const potBB = defaultPostflopPotBB(potType);
  const positionContext = postflopPositionContextFromSortedPositions(positions, contexts, potType);

  return {
    positionContext,
    potType,
    potBB,
    effectiveStackBB,
  };
}

function postflopPositionContextFromSortedPositions(
  positions: readonly Position[],
  contexts: readonly ActionContext[],
  potType: PostflopPotType,
): PostflopPositionContext | null {
  if (positions.includes("SB") && positions.includes("BB") && prefersContext(contexts, "BVB")) {
    return sbVsBbContext();
  }

  const firstNonBlind = positions.find((position) => position !== "SB" && position !== "BB");
  const secondNonBlind = positions.find((position) => (
    position !== firstNonBlind &&
    position !== "SB" &&
    position !== "BB"
  ));

  if (firstNonBlind && secondNonBlind) {
    if (potType === "THREE_BET_POT") {
      return oopCallerVsIpThreeBettorContext(firstNonBlind, secondNonBlind);
    }
    return oopRaiserVsIpCallerContext(firstNonBlind, secondNonBlind);
  }

  if (positions.includes("BTN") && positions.includes("BB")) {
    return btnVsBbContext();
  }

  if (positions.includes("SB") && positions.includes("BB")) {
    return sbVsBbContext();
  }

  if (firstNonBlind && positions.includes("BB")) {
    return firstNonBlind === "BTN"
      ? btnVsBbContext()
      : epVsBbContext(firstNonBlind);
  }

  /*
   * Otvírač proti dorovnávajícímu **malému** blindu.
   *
   * Do 14. 10. 2026 tu tahle větev chyběla a výběr třeba „CO + SB" spadl až na
   * `return null`. Pohled pak `null` bere jako „hráč nic nevybral" a rozdá
   * **cokoli** z celého katalogu - hráč chtěl CO proti SB a dostal třeba UTG
   * proti BTN, bez jediného slova. Změřeno: 7 ze 45 výběrů pozic, které filtry
   * umí, takhle tiše propadalo (`npm run mtt:picked-situation`). Vyřešený obsah
   * přitom pro všech sedm existuje (`SRP_CO_VS_SB` a spol.) - noc 13.-14. 10.
   * dodala třeba `MTT9_50BB_LJ_SB_SRP`.
   *
   * Vzor je rovnou jemný (`SRP_CO_VS_SB`): hrubý pilotní vzor pro malý blind
   * jako dorovnávajícího neexistuje, takže není co zachovávat. Jen pro single
   * raised pot - „otvírač a SB" ve 3bet potu je jiný spot a zůstává, jak byl.
   */
  if (
    firstNonBlind
    && positions.includes("SB")
    && !positions.includes("BB")
    && potType !== "THREE_BET_POT"
  ) {
    return openerVsSbCallerContext(firstNonBlind);
  }

  if (positions.length === 1) {
    const only = positions[0];
    if (only === "BTN") return btnVsBbContext();
    if (only === "SB") return sbVsBbContext();
    if (only !== "BB" && prefersHeadsUpNonBlindContext(contexts)) {
      if (potType === "THREE_BET_POT") {
        return oopCallerVsIpThreeBettorContext(only, nextIpPosition(only));
      }
      return oopRaiserVsIpCallerContext(only, nextIpPosition(only));
    }
    if (only !== "BB") return epVsBbContext(only);
  }

  return null;
}

function postflopPotTypeFromContexts(contexts: readonly ActionContext[]): PostflopPotType {
  if (contexts.includes("VS_3BET") || contexts.includes("SQUEEZE")) {
    return "THREE_BET_POT";
  }
  return "SINGLE_RAISED";
}

function defaultPostflopPotBB(potType: PostflopPotType): number {
  switch (potType) {
    case "THREE_BET_POT":
      return 18;
    case "LIMPED_POT":
      return 4;
    case "SINGLE_RAISED":
      return 6;
  }
}

function effectiveStackFromBuckets(buckets: readonly StackBucket[]): number {
  if (buckets.length === 0) return 40;
  return [...buckets].sort((a, b) => a - b)[0];
}

function sortPositions(positions: readonly Position[]): Position[] {
  return [...positions].sort((a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b));
}

function prefersContext(
  contexts: readonly ActionContext[],
  context: ActionContext,
): boolean {
  return contexts.length === 0 || contexts.includes(context);
}

function prefersHeadsUpNonBlindContext(contexts: readonly ActionContext[]): boolean {
  return contexts.length === 0 || contexts.some((context) => (
    context === "VS_3BET" ||
    context === "VS_OPEN" ||
    context === "SQUEEZE"
  ));
}

function epVsBbContext(heroPosition: Position): PostflopPositionContext {
  return {
    heroPosition,
    villainPosition: "BB",
    aggressorPosition: heroPosition,
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "EP_VS_BB",
  };
}

/** Otvírač proti malému blindu, který dorovnal; zrcadlo `epVsBbContext`. */
function openerVsSbCallerContext(heroPosition: Position): PostflopPositionContext {
  return {
    heroPosition,
    villainPosition: "SB",
    aggressorPosition: heroPosition,
    callerPosition: "SB",
    // Malý blind jedná po flopu první proti každé sedačce, takže otvírač je
    // v pozici - stejně jako proti velkému blindu.
    inPosition: true,
    callerType: "OUT_OF_POSITION_CALLER",
    positionPattern: `SRP_${heroPosition.replace("+", "_")}_VS_SB` as PostflopPositionPattern,
  };
}

function btnVsBbContext(): PostflopPositionContext {
  return {
    heroPosition: "BTN",
    villainPosition: "BB",
    aggressorPosition: "BTN",
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "BTN_VS_BB",
  };
}

function sbVsBbContext(): PostflopPositionContext {
  return {
    heroPosition: "SB",
    villainPosition: "BB",
    aggressorPosition: "SB",
    callerPosition: "BB",
    inPosition: false,
    callerType: "BIG_BLIND",
    positionPattern: "SB_VS_BB",
  };
}

function oopRaiserVsIpCallerContext(
  heroPosition: Position,
  villainPosition: Position,
): PostflopPositionContext {
  return {
    heroPosition,
    villainPosition,
    aggressorPosition: heroPosition,
    callerPosition: villainPosition,
    inPosition: false,
    callerType: "IN_POSITION_CALLER",
    // By seat, for the reason the three-bet version is: both are arguments to
    // this function, and spelling the pattern by role discarded them at the one
    // point a solved pack has to be matched. This is the single-raised half of
    // the same defect.
    positionPattern: `SRP_${patternToken(heroPosition)}_VS_${patternToken(villainPosition)}` as PostflopPositionContext["positionPattern"],
  };
}

/**
 * The seat token a position takes inside a `3BP_` or `SRP_` pattern name.
 *
 * UTG+1 and UTG+2 carry a plus sign the pattern grammar spells with an
 * underscore; every other seat is written as it is named.
 */
function patternToken(position: Position): string {
  return position.replace("+", "_");
}

function oopCallerVsIpThreeBettorContext(
  heroPosition: Position,
  villainPosition: Position,
): PostflopPositionContext {
  return {
    heroPosition,
    villainPosition,
    aggressorPosition: villainPosition,
    callerPosition: heroPosition,
    inPosition: false,
    callerType: "OUT_OF_POSITION_CALLER",
    // Named by seat rather than by role. The seats are right here - the
    // three-bettor and the caller are both arguments - and spelling the pattern
    // OOP_CALLER_VS_IP_3BETTOR threw them away, so a solved pack carrying
    // 3BP_BTN_VS_CO could never match a spot that was exactly that. Measured
    // over 2000 button-versus-cutoff three-bet pots: none reached the solver,
    // and two of the seven pilot packs answer only this pattern.
    //
    // The role information is not lost; aggressorPosition and callerPosition
    // still carry it, and every consumer that wanted the role reads those.
    positionPattern: `3BP_${patternToken(villainPosition)}_VS_${patternToken(heroPosition)}` as PostflopPositionContext["positionPattern"],
  };
}

function nextIpPosition(position: Position): Position {
  const candidates = NON_BLIND_POSITIONS.filter((candidate) => (
    POSITION_ORDER.indexOf(candidate) > POSITION_ORDER.indexOf(position)
  ));
  return candidates[0] ?? "BTN";
}
