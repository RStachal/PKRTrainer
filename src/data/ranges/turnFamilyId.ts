import type { Position, StackBucket } from "../../core/types";

/**
 * What a decomposition family name says about the spot it solved.
 *
 * The solver writes its output under names like
 * `MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR__432mono`, and every field a strategy
 * rule needs is in there: the depth, both seats, the pot type, the node and the
 * SPR band, with the board after the double underscore. Nothing else records
 * this - there is no manifest tying a directory to a spot - so parsing the name
 * is how 35,144 solved subgames find out what they are about.
 *
 * That makes the name load-bearing, which is worth saying out loud. It was
 * chosen as a directory label, not as a schema, and a rename would silently
 * orphan the output. The parser therefore refuses anything it does not fully
 * understand rather than filling gaps with defaults: a family that stops parsing
 * is a loud failure, where a family parsed into the wrong seats would ship a
 * solved strategy under someone else's name.
 *
 * ## The grammar, as the ten families actually written use it
 *
 * ```
 *   MTT9 _ <depth>BB _ <hero> _ <villain> _ <potType> [_ modifiers] __ <board>
 *
 *   MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR__432mono
 *   MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR__643r
 *   MTT9_40BB_UTG_BB_SRP__(no board segment)
 * ```
 *
 * Modifiers are a set rather than a sequence - FACING, CBET, OOP, LOWSPR,
 * MIDHIGH, HIGHSPR and REPAIR appear in varying combinations and orders - so
 * they are read as flags. REPAIR marks a re-solve of a family that had a
 * problem, and carries no strategic meaning.
 */

export type TurnPotType = "SINGLE_RAISED" | "THREE_BET_POT";

/** Which decision the solved node holds. */
export type TurnNodeKind = "CBET" | "FACING_BET";

/** The band the family name states, where it states one. */
export type TurnSprBand = "LOW" | "MID" | "MIDHIGH" | "HIGH";

export interface TurnFamilyId {
  /** The full family segment, before any board. */
  familyId: string;
  stackBB: StackBucket;
  hero: Position;
  villain: Position;
  potType: TurnPotType;
  node: TurnNodeKind;
  /** Absent when the name states no band. */
  sprBand?: TurnSprBand;
  /** True when the hero is out of position, which the name marks explicitly. */
  heroOutOfPosition: boolean;
  /** A re-solve of a family that had a problem; no strategic meaning. */
  repair: boolean;
  /** The board segment after the double underscore, when present. */
  board?: string;
}

const SEATS: Readonly<Record<string, Position>> = {
  UTG: "UTG", UTG1: "UTG+1", UTG2: "UTG+2",
  LJ: "LJ", HJ: "HJ", CO: "CO", BTN: "BTN", SB: "SB", BB: "BB",
};

const SPR_BANDS: Readonly<Record<string, TurnSprBand>> = {
  LOWSPR: "LOW", MIDSPR: "MID", MIDHIGH: "MIDHIGH", HIGHSPR: "HIGH",
};

/**
 * Parse a family directory name, or return undefined.
 *
 * Undefined rather than a partial result on purpose. Every field here ends up
 * keyed into a strategy rule, and a family parsed into the wrong seats would
 * publish a solved strategy under a spot it was not solved for - which is worse
 * than the family being skipped and counted.
 */
export function parseTurnFamilyId(directoryName: string): TurnFamilyId | undefined {
  const [familyId, board] = directoryName.split("__");
  if (familyId === undefined || familyId.length === 0) return undefined;

  const parts = familyId.split("_");
  if (parts.length < 5) return undefined;
  if (parts[0] !== "MTT9") return undefined;

  const depth = /^(\d+)BB$/.exec(parts[1]);
  if (depth === null) return undefined;
  const stackBB = Number(depth[1]) as StackBucket;

  const hero = SEATS[parts[2]];
  const villain = SEATS[parts[3]];
  if (hero === undefined || villain === undefined || hero === villain) return undefined;

  const potType = parts[4] === "SRP"
    ? "SINGLE_RAISED"
    : parts[4] === "3BP" ? "THREE_BET_POT" : undefined;
  if (potType === undefined) return undefined;

  const modifiers = new Set(parts.slice(5));
  for (const modifier of modifiers) {
    const known = modifier === "FACING" || modifier === "CBET" || modifier === "OOP" ||
      modifier === "REPAIR" || modifier in SPR_BANDS;
    // An unknown modifier means the grammar has moved on without this parser.
    // Refusing is the point: guessing would attach a solve to the wrong spot.
    if (!known) return undefined;
  }

  const sprBand = [...modifiers].map((item) => SPR_BANDS[item]).find(Boolean);

  return {
    familyId,
    stackBB,
    hero,
    villain,
    potType,
    // FACING marks the hero answering a bet; everything else is the hero betting,
    // whether or not the name bothers to say CBET.
    node: modifiers.has("FACING") ? "FACING_BET" : "CBET",
    ...(sprBand ? { sprBand } : {}),
    heroOutOfPosition: modifiers.has("OOP"),
    repair: modifiers.has("REPAIR"),
    ...(board ? { board } : {}),
  };
}

/**
 * The position pattern this family answers, spelled the way rules are matched.
 *
 * The same spelling the flop packs use and the same one postflopIntent now
 * produces, so a turn rule built from a family can be matched without any
 * translation - which is exactly the gap that made two flop packs unreachable
 * until they were spelled by seat.
 */
export function positionPatternForFamily(family: TurnFamilyId): string {
  const token = (seat: Position) => seat.replace("+", "_");
  if (family.potType !== "THREE_BET_POT") {
    // A single-raised family names the raiser then the caller, which is the
    // order the pattern wants: `SRP_<raiser>_VS_<caller>`.
    return `SRP_${token(family.hero)}_VS_${token(family.villain)}`;
  }
  // A three-bet family names the seats in the order they acted preflop - the
  // opener, then the player who three-bet them. The pattern names the aggressor
  // first, and in a three-bet pot the aggressor is the second of those two. Kept
  // in the family's order this produced `3BP_CO_VS_BTN` for a pot the button
  // three-bet, which is the button's spot filed under the cutoff's name.
  return `3BP_${token(family.villain)}_VS_${token(family.hero)}`;
}
