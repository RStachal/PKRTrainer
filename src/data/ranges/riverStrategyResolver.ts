import type {
  PostflopAction,
  PostflopRecommendation,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import type { ActionEvSet } from "../../core/actionEv";
import { primeRiverEvPack, readyRiverEvPack, riverActionEvRows } from "./riverEvRuntime";
import { createPostflopResolverChain } from "./postflopResolverChain";
import type { RiverStrategyPack } from "./riverSolvedRuntimeRegistry";
import { runtimeSolvedRiverPacks } from "./riverSolvedRuntimeRegistry";
import type { RiverStrategyRule } from "./riverStrategyRuleBuilder";
import { translateTurnActions } from "./turnActionTranslation";
import { actionNodeForSolvedHero } from "./solvedHeroActionNode";

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
  // Které rozhodnutí uzel drží. Bez téhle kontroly odpovídal resolver na
  // kterýkoli riverový spot na správné desce - takže hráči, který čelí sázce,
  // vydal strategii pro hraní první, a to s cedulkou, že to spočítal solver.
  // Deska seděla, hloubka seděla, situace byla jiná.
  if (input.actionNode === undefined) return false;
  const hero = rule.spot?.hero;
  if (hero === undefined) return false;
  if (actionNodeForSolvedHero(hero, "RIVER") !== input.actionNode) return false;
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
  if (Math.abs(rule.stackBB - input.effectiveStackBB) > RIVER_DEPTH_TOLERANCE_BB) return false;
  return boardMatches(rule, input);
}

/**
 * Které pravidlo packu na tenhle spot odpovídá, nebo -1.
 *
 * Vrací se index, ne pravidlo: tabulka EV je zarovnaná s `pack.rules` podle
 * pořadí a bez indexu by se musela hledat podruhé, vlastním porovnáváním. Dvě
 * hledání jsou dvě místa, kde se opravuje jedna chyba - a rozejít se můžou tak,
 * že hráč uvidí EV jiného spotu, než na který odpověděl.
 */
export function findRiverRuleIndex(
  pack: RiverStrategyPack,
  input: PostflopStrategyInput,
): number {
  if (input.street !== "RIVER") return -1;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, rule] of pack.rules.entries()) {
    if (!ruleMatches(rule, input)) continue;
    const distance = Math.abs(rule.stackBB - input.effectiveStackBB);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

/**
 * Práh, pod kterým se dvě akce nedají rozlišit, v blindech.
 *
 * Dvě čísla se sčítají. Tabulka ukládá desetiny blindu, takže cokoli pod 0,1 BB
 * je zaokrouhlení. A solve má vlastní nepřesnost, vyjádřenou jako podíl potu -
 * při cíli kolem procenta je to na desetiblindovém potu zhruba další desetina.
 * Brát menší rozdíl jako chybu hráče by znamenalo trestat ho za šum ve vlastních
 * datech.
 */
const EV_EQUIVALENT_POT_SHARE = 0.01;
const EV_EQUIVALENT_FLOOR_BB = 0.1;

/**
 * EV nabízených akcí, když už tabulka dorazila.
 *
 * Když ne, nastartuje se stahování a vrátí se nic: čekat na půl megabajtu
 * uprostřed rozdání by byla prodleva přesně v tu chvíli, kdy hráč kouká na
 * karty. Odpověď bez čísel je pořád odpověď.
 */
function actionEvsFor(
  pack: RiverStrategyPack,
  ruleIndex: number,
  input: PostflopStrategyInput,
  offered: readonly PostflopAction[],
): { actionEvs: ActionEvSet<PostflopAction> } | undefined {
  if (input.heroCards === undefined) return undefined;
  const table = readyRiverEvPack(pack.id);
  if (table === undefined) {
    primeRiverEvPack(pack);
    return undefined;
  }

  const rows = riverActionEvRows(pack, table, ruleIndex, input.heroCards, input.potBB);
  if (rows === undefined) return undefined;

  // Neúplnou sadu nemá smysl skládat: hráč by u některých akcí viděl číslo a u
  // jiných ne, a rozdíl by vypadal jako vlastnost akce, ne jako mezera v datech.
  const byAction = new Map(rows.map((row) => [row.action, row.evBB]));
  if (offered.some((action) => !byAction.has(action))) return undefined;

  const potBB = pack.rules[ruleIndex].spot?.potBB ?? input.potBB;
  const equivalent = Math.max(EV_EQUIVALENT_FLOOR_BB, potBB * EV_EQUIVALENT_POT_SHARE);
  return {
    actionEvs: {
      // Ne `SOLVER`: tohle je expektace nad soupeřovou range za předpokladu, že
      // obě strany hrají zapsanou strategii, ne solverova counterfactual value.
      source: "SOLVED_TREE",
      unit: "BB",
      values: offered.map((action) => ({ action, evBb: byAction.get(action)! })),
      equivalentThresholdBb: equivalent,
      acceptableThresholdBb: equivalent * 3,
    },
  };
}

export function createRiverStrategyResolver(pack: RiverStrategyPack): PostflopStrategyResolver {
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (input.street !== "RIVER") return null;

    const bestIndex = findRiverRuleIndex(pack, input);
    const best: RiverStrategyRule | null = bestIndex < 0 ? null : pack.rules[bestIndex];
    if (best === null) return null;

    // Jmenovatelem je pot toho uzlu v žetonech, ne trenažérův pot v blindech.
    //
    // Solverovy popisky jsou žetony ("BET 83"), a dělit je potem vyjádřeným v
    // blindech znamená dělit jiným řádem: sázka za třetinu potu vyjde nad každou
    // hranici a hráči se ukáže jako velká. Turnový resolver to dělá takhle od
    // začátku; tenhle to zdědit zapomněl.
    const potForSizes = best.riverSpot.potChips || input.potBB;
    const { actions, mergedCount } = translateTurnActions(best.actions, potForSizes);
    if (actions.length === 0) return null;
    // Popisky se indexují proti původnímu seznamu, takže zkrácený překlad by
    // posunul odpověď o akci - hráči by u sázky vyšlo CHECK, s cedulkou od
    // solveru. `translateTurnActions` nepřeložitelný popisek zahodí, a to se
    // odsud nepozná. Změřeno na dodávaném obsahu: 0 z 9836 pravidel má takový
    // popisek, takže tahle větev dnes nenastává - proto se smí odmítnout.
    if (actions.length !== best.actions.length) return null;

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
      ...(actionEvsFor(pack, bestIndex, input, actions.map((item) => item.action)) ?? {}),
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
