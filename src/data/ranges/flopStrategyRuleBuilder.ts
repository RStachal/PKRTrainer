import { buildTurnStrategyRule, type TurnStrategyRule } from "./turnStrategyRuleBuilder";
import type { TurnSubgameNode } from "./turnSubgameReader";

/**
 * Pravidlo z vyřešeného flopového uzlu, postavené turnovým builderem.
 *
 * Flopová strategie leží v monolitickém checkpointu, ze kterého se dosud bral
 * jen strom pro dekompozici turnu: kořen souboru **je** flopový akční uzel se
 * strategií po kombinacích. Čte se tedy totéž, co se už jednou celé přečetlo.
 *
 * ## Proč to není další typ pravidla
 *
 * Řádek strategie se mezi ulicemi neliší - deska, hloubka, uzel, kbelíky ruk.
 * Liší se jen počet karet na stole. Vyrábět třetí skoro totožný typ by znamenalo
 * tři místa, kde se opravuje jedna chyba.
 *
 * ## Co flop dodává navíc proti tomu, co má dnes
 *
 * Dnešní flopový obsah odpovídá na **třídy textur** - suchá deska, mokrá deska.
 * Tohle odpovídá na konkrétní desku, kterou někdo doopravdy vyřešil. Je to užší
 * a přesnější zároveň: na 218 desek, kam trenažér stejně naviguje, dá přesnou
 * odpověď, a na zbytek se nepřizná - tam dál platí agregát.
 */

export interface FlopSolvedSpot {
  /** Tři karty, na kterých se hrálo. */
  flop: readonly string[];
  /** Flopová linka, která sem vedla, v solverových popiscích. */
  priorLine: readonly string[];
  potChips: number;
  stackChips: number;
}

export interface FlopStrategyRule extends TurnStrategyRule {
  street: "FLOP";
  flopSpot: FlopSolvedSpot;
}

export interface FlopRuleContext {
  hero?: NonNullable<TurnStrategyRule["spot"]>["hero"];
  potBB?: number;
  stackBehindBB?: number;
  /** Jak často se hra do tohohle uzlu dostane, 0 až 1. */
  reach?: number;
}

export function buildFlopStrategyRule(
  familyDirectory: string,
  node: TurnSubgameNode,
  spot: { flop: readonly string[]; priorLine: readonly string[]; potChips: number; stackChips: number },
  context: FlopRuleContext = {},
): FlopStrategyRule | undefined {
  if (spot.flop.length !== 3) return undefined;

  // Turnová karta tu žádná není a prázdný seznam je správná odpověď: flopový
  // resolver porovnává tři karty a čtvrtou nemá kde vzít. Kdyby se sem vymyslela,
  // pravidlo by tvrdilo, že bylo vyřešeno na desce, která nikdy nepadla.
  const base = buildTurnStrategyRule(familyDirectory, node, {
    flop: [...spot.flop],
    turnCards: [],
    priorLine: [...spot.priorLine],
    potChips: spot.potChips,
    stackChips: spot.stackChips,
    ...(context.potBB === undefined ? {} : { potBB: context.potBB }),
    ...(context.stackBehindBB === undefined ? {} : { stackBehindBB: context.stackBehindBB }),
    ...(context.hero === undefined ? {} : { hero: context.hero }),
    reach: context.reach ?? 0,
  });
  if (base === undefined) return undefined;

  return {
    ...base,
    street: "FLOP",
    flopSpot: {
      flop: [...spot.flop],
      priorLine: [...spot.priorLine],
      potChips: spot.potChips,
      stackChips: spot.stackChips,
    },
  };
}
