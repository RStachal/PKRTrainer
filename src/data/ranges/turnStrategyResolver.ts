import type {
  PostflopRecommendation,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import { translateTurnActions } from "./turnActionTranslation";
import { actionNodeForSolvedHero } from "./solvedHeroActionNode";
import type { TurnStrategyPack } from "./turnStrategyPack";
import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * Serve a solved turn strategy to the trainer, or decline.
 *
 * Turn spots reach solved content zero percent of the time: the pilot packs are
 * flop packs by type, and 4.2 GB of solved turn output had no path to a player.
 * This is the end of that path - the same shape `flopProductionStrategyResolver`
 * has one street earlier, so the chain that already falls through to the
 * heuristic model can take a turn resolver without knowing it is new.
 *
 * ## Declining is the important half
 *
 * Eleven families exist and they cover eleven spots. Everything else is a turn
 * the solver has never seen, and answering it from a neighbouring family would
 * be worse than the heuristic: the heuristic is labelled as one, while a wrong
 * solved answer arrives wearing SOLVER_BACKED. So the match is exact on
 * position pattern, pot type and node, and near on depth, and anything else
 * returns null for the chain to handle.
 *
 * ## Why the hero's hand decides the action
 *
 * A rule holds several buckets - most of the range checking, some of it betting -
 * and the rule-wide most common action is the wrong answer for a hand in the
 * other bucket. The flop resolver learned this: a check-lane hand must be told
 * to check even when the rule as a whole most often bets. A hand in no bucket at
 * all was never solved here, and returns null rather than borrowing the rule's
 * average.
 */

/** How far a rule's stated depth may sit from the spot's, in big blinds. */
export const TURN_DEPTH_TOLERANCE_BB = 10;

/** "6s" from `{ rank: "6", suit: "s" }`, in the notation the solves use. */
function cardKey(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`.toLowerCase();
}

/**
 * Whether this rule was solved on the board in front of the player.
 *
 * The exact board, not a similar one. A family holds one flop per directory and
 * about twenty six turn groups within it, and the strategy on a deuce has
 * nothing in common with the strategy on an ace - so a rule that answered any
 * turn in its family would be serving one board's solve for every board, wearing
 * a solver-backed label. Suits matter as much as ranks: the same ranks with a
 * flush draw completed is a different game.
 *
 * A rule with no recorded spot is from before the spot was recorded, and cannot
 * establish that it matches anything. It declines.
 */
function boardMatches(rule: TurnStrategyRule, input: PostflopStrategyInput): boolean {
  if (rule.spot === undefined) return false;
  // A rule that cannot say whose strategy it holds is not servable, whatever
  // else matches. The directory name states the flop c-bet that defines the
  // family, not the player whose turn decision was solved, and a rule built
  // before that distinction was drawn can be filed under the wrong seat - which
  // shows one player the other's answers under a solver-backed label.
  if (rule.spot.hero === undefined) return false;
  const board = input.board;
  if (board === undefined || board.length < 4) return false;

  const flop = board.slice(0, 3).map(cardKey).sort();
  const solvedFlop = [...rule.spot.flop].map((card) => card.toLowerCase()).sort();
  if (flop.length !== solvedFlop.length) return false;
  if (flop.some((card, index) => card !== solvedFlop[index])) return false;

  const turn = cardKey(board[3]);
  return rule.spot.turnCards.some((card) => card.toLowerCase() === turn);
}

function ruleMatches(rule: TurnStrategyRule, input: PostflopStrategyInput): boolean {
  if (rule.positionPattern !== input.positionPattern) return false;
  if (rule.potType !== input.potType) return false;
  if (input.actionNode === undefined) return false;
  const hero = rule.spot?.hero;
  if (hero === undefined) return false;
  if (actionNodeForSolvedHero(hero, "TURN") !== input.actionNode) return false;
  // Strana stolu, když ji spot uvede. Vyřešené pravidlo drží rozhodnutí jednoho
  // hráče, ne obou: `SRP_CO_VS_BB` platí pro obě sedačky a bez tohohle by
  // pravidlo pro hráče mimo pozici odpovědělo tomu v pozici.
  //
  // Porovnává se `hero.side`, ne `rule.heroOutOfPosition`. To druhé pole se tak
  // jmenuje, ale popisuje rodinu, ne hrdinu: u `SRP_CO_VS_BB` je `false`, protože
  // cutoff je v pozici - jenže uzel drží strategii big blindu, který je mimo ni.
  // Porovnání proti němu odmítlo úplně všechno.
  if (
    input.heroOutOfPosition !== undefined &&
    input.heroOutOfPosition !== (hero.side === "OOP")
  ) return false;
  if (Math.abs(rule.stackBB - input.effectiveStackBB) > TURN_DEPTH_TOLERANCE_BB) return false;
  return boardMatches(rule, input);
}

/**
 * Pick the rule solved closest to this spot's depth.
 *
 * Depth is the only dimension a turn rule is matched loosely on, so it is the
 * only one where "closest" means anything. Ties keep the earlier rule, which is
 * the order the packs were built in - arbitrary, but stable, and a resolver that
 * answered differently on equal evidence would be worse than one that picks.
 */
function bestRule(
  rules: readonly TurnStrategyRule[],
  input: PostflopStrategyInput,
): TurnStrategyRule | null {
  let best: TurnStrategyRule | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const lines = new Set<string>();

  for (const rule of rules) {
    if (!ruleMatches(rule, input)) continue;
    lines.add((rule.spot?.priorLine ?? []).join("|"));
    const distance = Math.abs(rule.stackBB - input.effectiveStackBB);
    if (distance < bestDistance) {
      best = rule;
      bestDistance = distance;
    }
  }

  // The same board and turn card can be reached by more than one flop line, and
  // those are different spots with different ranges - a turn checked through is
  // not a turn that saw a bet and a call. The trainer does not yet tell the
  // resolver which line it dealt, so when several match there is no way to pick
  // the right one, and picking the first would answer one line's question with
  // another's strategy under a solver-backed label.
  if (lines.size > 1) return null;
  return best;
}

export function createTurnStrategyResolver(pack: TurnStrategyPack): PostflopStrategyResolver {
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (input.street !== "TURN") return null;

    const rule = bestRule(pack.rules, input);
    if (rule === null) return null;

    // The solver's bet labels are chips measured against the pot at that node,
    // so that pot is the denominator - not the trainer's pot, which is the same
    // spot in different units and would rescale every size. The plan recorded it;
    // where it did not, there is nothing to measure against and the trainer's own
    // pot is the only candidate left.
    const potForSizes = rule.spot?.potChips ?? input.potBB;
    const { actions, mergedCount } = translateTurnActions(rule.actions, potForSizes);
    if (actions.length === 0) return null;
    // Popisky se indexují proti původnímu seznamu, takže zkrácený překlad by
    // posunul odpověď o akci - hráči by u sázky vyšlo CHECK, s cedulkou od
    // solveru. `translateTurnActions` nepřeložitelný popisek zahodí, a to se
    // odsud nepozná. Změřeno na dodávaném obsahu: 0 z 9836 pravidel má takový
    // popisek, takže tahle větev dnes nenastává - proto se smí odmítnout.
    if (actions.length !== rule.actions.length) return null;

    const bucket = input.heroHand === undefined
      ? rule.buckets[0]
      : rule.buckets.find((item) => item.handClasses.includes(input.heroHand!));
    // A hand outside every bucket was never solved here. Returning the rule's
    // most common action would present an answer the solver never gave for this
    // holding, labelled solver-backed.
    if (bucket === undefined) return null;

    const bucketIndex = rule.actions.indexOf(bucket.action);
    const translated = bucketIndex >= 0 ? actions[bucketIndex] : undefined;
    if (translated === undefined) return null;

    return {
      action: translated.action,
      // Text pro hráče, ne pro toho, kdo ladí generátor.
      //
      // Dřív tu stálo `Solved turn strategy for ${rule.positionPattern}...` -
      // tedy `SRP_CO_VS_BB` a syrové názvy akcí jako `BET 28.000000`, anglicky, v
      // české aplikaci. Sedačky přitom ukazuje panel spotu vedle, takže je nemá
      // smysl opakovat, a interní enum hráči neřekne nic; jen prozradí, jak je
      // aplikace uvnitř poskládaná.
      explanation: [
        `Vyřešený turn pro hloubku ${rule.stackBB} BB.`,
        `Tahle ruka patří do skupiny, kterou solver hraje stejně: ${bucket.handClasses.length} tříd, ${bucket.combos} kombinací.`,
        mergedCount > 0
          ? `Solver nabídl víc velikostí sázky, než kolik jich trenažér rozlišuje; ${mergedCount} se sloučily do těch dvou, které má.`
          : "",
      ].filter(Boolean).join(" "),
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: pack.id,
        packVersion: pack.version,
        packVerifiedAt: pack.createdAt,
        ruleId: rule.sourceDirectory,
      },
    } as PostflopRecommendation;
  };
}
