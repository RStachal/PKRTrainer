import type {
  PostflopRecommendation,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import { createPostflopResolverChain } from "./postflopResolverChain";
import type { RiverStrategyPack } from "./riverSolvedRuntimeRegistry";
import { runtimeSolvedRiverPacks } from "./riverSolvedRuntimeRegistry";
import type { RiverStrategyRule } from "./riverStrategyRuleBuilder";
import { translateTurnActions } from "./turnActionTranslation";

/**
 * Vyřešená riverová strategie, nebo odmítnutí.
 *
 * Stejný tvar jako turnový resolver a se stejnou hlavní vlastností: odmítnout je
 * ta důležitější polovina. Rodin je konečně mnoho a desek, na kterých někdo
 * počítal, taky; odpovědět na desku, kterou nikdo neřešil, z rodiny odvedle by
 * bylo horší než heuristika, protože heuristika se aspoň jako heuristika
 * označuje.
 *
 * ## Co je na riveru jinak
 *
 * Deska má pět karet místo čtyř, takže se porovnává i pátá. A hloubka se
 * neporovnává volně: turn snese odchylku deseti blindů, protože po něm ještě
 * jedna ulice zbývá a pot se stihne srovnat. Na riveru už nic nenásleduje - kdo
 * hraje o zbytek stacku, hraje o přesnou částku, a rozdíl deseti blindů je
 * rozdíl mezi sázkou za třetinu potu a za celý pot.
 */

/** Jak daleko smí ležet hloubka pravidla od hloubky spotu, v blindech. */
export const RIVER_DEPTH_TOLERANCE_BB = 4;

function cardKey(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`.toLowerCase();
}

function boardMatches(rule: RiverStrategyRule, input: PostflopStrategyInput): boolean {
  const board = input.board ?? [];
  if (board.length !== 5) return false;
  const solved = [...rule.riverSpot.turnBoard].map((card) => card.toLowerCase());
  const actual = board.slice(0, 4).map(cardKey);
  // Prvních pět karet v pořadí, ne jako množina: flop se porovnává bez pořadí,
  // ale turnová karta je čtvrtá a riverová pátá, a prohodit je znamená jinou
  // ruku.
  const solvedFlop = [...solved.slice(0, 3)].sort();
  const actualFlop = [...actual.slice(0, 3)].sort();
  if (solvedFlop.some((card, index) => card !== actualFlop[index])) return false;
  if (solved[3] !== actual[3]) return false;
  return rule.riverSpot.riverCard.toLowerCase() === cardKey(board[4]);
}

function ruleMatches(rule: RiverStrategyRule, input: PostflopStrategyInput): boolean {
  if (input.street !== "RIVER") return false;
  if (rule.positionPattern !== input.positionPattern) return false;
  if (rule.potType !== input.potType) return false;
  if (Math.abs(rule.stackBB - input.effectiveStackBB) > RIVER_DEPTH_TOLERANCE_BB) return false;
  return boardMatches(rule, input);
}

export function createRiverStrategyResolver(pack: RiverStrategyPack): PostflopStrategyResolver {
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (input.street !== "RIVER") return null;

    let best: RiverStrategyRule | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const rule of pack.rules) {
      if (!ruleMatches(rule, input)) continue;
      const distance = Math.abs(rule.stackBB - input.effectiveStackBB);
      if (distance < bestDistance) {
        best = rule;
        bestDistance = distance;
      }
    }
    if (best === null) return null;

    // Bez potu nejde říct, jestli je sázka malá nebo velká - solver píše žetony,
    // produkt mluví o podílu potu. Spot bez potu tenhle resolver neumí.
    const { actions, mergedCount } = translateTurnActions(best.actions, input.potBB);
    if (actions.length === 0) return null;

    const bucket = input.heroHand === undefined
      ? best.buckets[0]
      : best.buckets.find((item) => item.handClasses.includes(input.heroHand!));
    // Ruka mimo všechny kbelíky tu nebyla vyřešená. Vydat za ni průměr pravidla
    // by hráči ukázalo odpověď, kterou solver pro tuhle ruku nikdy nedal.
    if (bucket === undefined) return null;

    const bucketIndex = best.actions.indexOf(bucket.action);
    const translated = bucketIndex >= 0 ? actions[bucketIndex] : undefined;
    if (translated === undefined) return null;

    return {
      action: translated.action,
      explanation: [
        `Vyřešený river pro hloubku ${best.stackBB} BB.`,
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
        ruleId: best.sourceDirectory,
      },
    } as PostflopRecommendation;
  };
}

export function createRiverSolvedStrategyResolverChain(
  packs?: readonly RiverStrategyPack[],
): PostflopStrategyResolver {
  if (packs !== undefined) {
    return createPostflopResolverChain(packs.map(createRiverStrategyResolver));
  }
  // Bez argumentu se čte živý registr při každém volání, protože chunky
  // přistávají během relace.
  return (input) => createPostflopResolverChain(
    runtimeSolvedRiverPacks.map(createRiverStrategyResolver),
  )(input);
}
