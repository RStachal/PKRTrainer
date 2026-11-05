/**
 * The single SPR each MTT pilot family was actually solved at.
 *
 * Recovered from the solver parameter files as set_effective_stack / set_pot,
 * which is fixed per family. A rule matches a wide SPR band but its content comes
 * from a solve at exactly one of these points, so pairing the shown SPR with the
 * solved SPR is what reveals how faithful a shown spot is - see
 * `assessSprFidelity`.
 *
 * Keyed by family id, upper-cased, as it appears at the head of every pilot rule
 * id (the part before the first "-"). The table is derived data; a test asserts
 * that every shipped pilot rule maps to an entry here, so a new family cannot ship
 * without its solved SPR being recorded.
 */
export const MTT_POSTFLOP_SOLVED_SPR: Readonly<Record<string, number>> = {
  MTT9_20BB_BTN_BB_SRP_LOWSPR: 2.0,
  MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR: 2.5,
  MTT9_25BB_CO_BB_SRP_CBET_LOWSPR: 2.5,
  MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR: 2.5,
  MTT9_35BB_CO_BTN_3BP: 1.82,
  MTT9_35BB_CO_BTN_3BP_REPAIR: 1.82,
  MTT9_40BB_UTG_BB_SRP: 3.2,
  MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR: 1.78,
  MTT9_50BB_BTN_BB_SRP: 4.0,
  MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR: 6.0,
  MTT9_50BB_CO_BB_SRP_CBET_MIDSPR: 6.0,
  MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR: 6.0,
  MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR: 3.31,
  MTT9_80BB_BTN_BB_SRP_HIGHSPR: 10.0,
  MTT9_80BB_CO_BTN_3BP_MIDSPR: 3.82,
  MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR: 13.0,
  MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR: 13.0,
  MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR: 13.0,
  MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH: 5.73,
  MTT9_150BB_CO_BTN_3BP_HIGHSPR: 9.55,
};

/**
 * The family id a pilot rule belongs to: the head of the rule id, upper-cased.
 * Rule ids look like `mtt9_50bb_btn_bb_srp-check-aggregate`, so the family is the
 * segment before the first "-".
 */
export function familyIdFromRuleId(ruleId: string): string {
  return ruleId.split("-", 1)[0].toUpperCase();
}

/** The solved SPR for a family, or undefined if it is not a recorded family. */
export function solvedSprForFamily(family: string): number | undefined {
  return MTT_POSTFLOP_SOLVED_SPR[family];
}

/** The solved SPR for a rule, recovered from its id, or undefined. */
export function solvedSprForRuleId(ruleId: string): number | undefined {
  return solvedSprForFamily(familyIdFromRuleId(ruleId));
}
