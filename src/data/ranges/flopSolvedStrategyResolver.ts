import { facingBetBB } from "./facingBetSize";
import type {
  PostflopRecommendation,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import { createPostflopResolverChain } from "./postflopResolverChain";
import type { FlopStrategyRule } from "./flopStrategyRuleBuilder";
import type { FlopSolvedStrategyPack } from "./flopSolvedStrategyPack";
import { runtimeSolvedFlopPacks } from "./flopSolvedRuntimeRegistry";
import { actionNodeForSolvedHero } from "./solvedHeroActionNode";
import { solvedRangeBuckets, solvedStrategySource } from "./solvedStrategySource";
import { translateTurnActions } from "./turnActionTranslation";

/**
 * Vyřešená flopová strategie na konkrétní desce, nebo odmítnutí.
 *
 * Odmítnout je zase ta důležitější polovina. Desek s checkpointem je konečně
 * mnoho a odpovědět na jinou z rodiny odvedle by bylo horší než texturní
 * agregát, který za tímhle resolverem stojí - ten aspoň nepředstírá, že zná
 * zrovna tuhle desku.
 *
 * ## Hloubka
 *
 * Deset blindů jako u turnu. Po flopu zbývají dvě ulice, na kterých se pot
 * stihne srovnat, takže drobný rozdíl v hloubce nepřevrací rozhodnutí; na riveru
 * je to jinak a tam se drží čtyři.
 */

export const FLOP_DEPTH_TOLERANCE_BB = 10;

function cardKey(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`.toLowerCase();
}

function boardMatches(rule: FlopStrategyRule, input: PostflopStrategyInput): boolean {
  const board = input.board ?? [];
  if (board.length < 3) return false;
  // Flop bez pořadí: solver ho zapsal v jednom pořadí a trenažér rozdá v jiném,
  // ale je to táž deska. Barvy se porovnávají jako hodnoty - stejné hodnoty s
  // dokončeným flush drawem jsou jiná hra.
  const solved = [...rule.flopSpot.flop].map((card) => card.toLowerCase()).sort();
  const actual = board.slice(0, 3).map(cardKey).sort();
  return solved.every((card, index) => card === actual[index]);
}

function ruleMatches(rule: FlopStrategyRule, input: PostflopStrategyInput): boolean {
  if (input.street !== "FLOP") return false;
  if (rule.positionPattern !== input.positionPattern) return false;
  if (rule.potType !== input.potType) return false;
  if (input.actionNode === undefined) return false;
  const hero = rule.spot?.hero;
  if (hero === undefined) return false;
  if (actionNodeForSolvedHero(hero, "FLOP", rule.potType) !== input.actionNode) return false;
  // Strana stolu, když ji spot uvede: `SRP_CO_VS_BB` platí pro obě sedačky a
  // pravidlo drží rozhodnutí jednoho hráče, ne obou.
  if (
    input.heroOutOfPosition !== undefined &&
    input.heroOutOfPosition !== (hero.side === "OOP")
  ) return false;
  if (Math.abs(rule.stackBB - input.effectiveStackBB) > FLOP_DEPTH_TOLERANCE_BB) return false;
  return boardMatches(rule, input);
}

export function createFlopSolvedStrategyResolver(
  pack: FlopSolvedStrategyPack,
): PostflopStrategyResolver {
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (input.street !== "FLOP") return null;

    let best: FlopStrategyRule | null = null;
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

    // Jmenovatelem je pot toho uzlu v žetonech, ne trenažérův pot v blindech:
    // solver píše žetony a dělit je jiným řádem znamená označit třetinovou sázku
    // za potovou.
    const { actions, mergedCount } = translateTurnActions(
      best.actions,
      best.flopSpot.potChips || input.potBB,
    );
    if (actions.length === 0) return null;

    const bucket = input.heroHand === undefined
      ? best.buckets[0]
      : best.buckets.find((item) => item.handClasses.includes(input.heroHand!));
    if (bucket === undefined) return null;

    const bucketIndex = best.actions.indexOf(bucket.action);
    const translated = bucketIndex >= 0 ? actions[bucketIndex] : undefined;
    if (translated === undefined) return null;

    return {
      action: translated.action,
      explanation: [
        `Vyřešený flop pro hloubku ${best.stackBB} BB.`,
        `Tahle ruka patří do skupiny, kterou solver hraje stejně: ${bucket.handClasses.length} tříd, ${bucket.combos} kombinací.`,
        mergedCount > 0
          ? `Solver nabídl víc velikostí sázky, než kolik jich trenažér rozlišuje; ${mergedCount} se sloučily do těch dvou, které má.`
          : "",
      ].filter(Boolean).join(" "),
      // Úplný zdroj, ne šest polí protlačených přes `as`. Kontrakt jich chce
      // šestnáct a přetypování to umlčelo: obrazovka s výsledkem pak volala
      // `.map()` nad `undefined` a **18 z 18 spotů mělo nula bloků vysvětlení**.
      source: solvedStrategySource({
        packId: pack.id,
        packVersion: pack.version,
        packVerifiedAt: pack.createdAt,
        confidence: pack.confidence,
        assumptions: pack.assumptions,
        positionPattern: best.positionPattern,
        ruleId: best.sourceDirectory,
        potBB: best.spot?.potBB,
        stackBehindBB: best.spot?.stackBehindBB,
        // Skutečná velikost sázky z linie, kterou solver hrál.
        facingBetBB: facingBetBB(best.spot),
        // Co se dělá s každou třídou rukou. Bez tohohle nemá matice range
        // jedinou buňku s akcí a blafovací část je od složených rukou
        // nerozeznatelná - změřeno 25. 8. 2026 na 0 tříd ze 169.
        rangeBuckets: solvedRangeBuckets(best.buckets, best.actions, actions, input.board ?? []),
      }),
    };
  };
}

export function createFlopSolvedStrategyResolverChain(
  packs?: readonly FlopSolvedStrategyPack[],
): PostflopStrategyResolver {
  if (packs !== undefined) {
    return createPostflopResolverChain(packs.map(createFlopSolvedStrategyResolver));
  }
  return (input) => createPostflopResolverChain(
    runtimeSolvedFlopPacks.map(createFlopSolvedStrategyResolver),
  )(input);
}
