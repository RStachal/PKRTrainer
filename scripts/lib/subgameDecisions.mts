/**
 * Každé vyřešené rozhodnutí uvnitř jedné podhry, ne jen to kořenové.
 *
 * Generátor dosud četl z podhry jediný uzel - ten na vrcholu. Jeho děti jsou
 * přitom plnohodnotná vyřešená rozhodnutí a leží na disku už teď: hráč v pozici
 * čelící sázce, hráč v pozici sázející po checku, hráč mimo pozici čelící sázce
 * nebo raisu. Právě proto brána hlásí, že `TURN_FACING_BET` nemá nic - a přitom
 * to je situace, do které se hráč dostane pořád.
 *
 * ## Aritmetika potu
 *
 * Solver píše velikosti jako částku, na kterou se sází ("BET 17" znamená do
 * sedmnácti), ne jako přírůstek. Vloženo se proto sleduje po hráčích: sázka a
 * raise nastaví hráčův vklad na tu částku, call ho srovná se soupeřem, check
 * nemění nic. Pot v uzlu je kořenový pot plus oba vklady, zbytek stacku je
 * kořenový stack mínus vklad hráče na tahu.
 *
 * Referencí je `plan_river.py`, který totéž počítá pro dokončené linky jako
 * `pot + 2 * level` a `stack - level`. Na dokončených linkách musí obě
 * implementace dát stejná čísla; test to nad skutečným plánem ověřuje na všech
 * jeho položkách. Odhadovat tuhle aritmetiku by znamenalo hlásit hráči jinou
 * velikost sázky, než jakou solver počítal.
 */

export interface SubgameNode {
  node_type?: unknown;
  player?: unknown;
  actions?: unknown;
  strategy?: { actions?: unknown; strategy?: Record<string, unknown> };
  childrens?: Record<string, SubgameNode>;
}

export interface SubgameDecision {
  /** Akce, které sem vedly, v solverových popiscích. */
  line: readonly string[];
  /** Uzel s vlastní strategií. */
  node: SubgameNode;
  /** `1` je OOP, `0` je IP - indexy, které používá plán i dump. */
  player: 0 | 1;
  /** Pot v tomhle uzlu, v žetonech. */
  potChips: number;
  /** Kolik má hráč na tahu za sebou, v žetonech. */
  stackChips: number;
  /** Kolik musí dorovnat, aby zůstal ve hře; nula znamená, že sázka nestojí. */
  toCallChips: number;
  /** Kolikátá je to akce na téhle ulici; kořen je nula. */
  depth: number;
  /** Kolik má každý hráč vloženo v tomhle uzlu; index 1 je OOP, 0 je IP. */
  committed: readonly [number, number];
}

/** Částka, na kterou akce sází, nebo `undefined`, když se nesází. */
function amountOf(action: string): number | undefined {
  const match = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
  return match === null ? undefined : Number(match[2]);
}

/**
 * Vklady po jedné akci.
 *
 * Jedno místo pro celé pravidlo, protože ho potřebuje i ověření proti
 * `plan_river.py`: ten popisuje stav *po* dokončené lince, kde uzel v podhře už
 * není. Kdyby si tohle pravidlo počítal test sám, ověřoval by vlastní kopii a
 * chyba v knihovně by prošla - přesně to se stalo, než tahle funkce vznikla.
 */
export function committedAfterAction(
  action: string,
  player: 0 | 1,
  committed: readonly [number, number],
): [number, number] {
  const next: [number, number] = [committed[0], committed[1]];
  const opponent = player === 1 ? 0 : 1;
  const amount = amountOf(action);
  if (amount !== undefined) {
    // Sázka i raise se píšou jako částka, na kterou se jde, takže se vklad
    // nastavuje, nepřičítá.
    next[player] = amount;
  } else if (/^CALL$/i.test(action.trim())) {
    next[player] = committed[opponent];
  }
  return next;
}

/**
 * Projde podhru a vydá každé rozhodnutí, které v ní solver spočítal.
 *
 * Chance uzel (rozdaná další karta) je konec téhle ulice - tam se strategie už
 * netýká tohohle rozhodnutí a `plan_river.py` od něj plánuje další vrstvu.
 */
export function subgameDecisions(
  root: SubgameNode,
  rootPotChips: number,
  rootStackChips: number,
): SubgameDecision[] {
  const found: SubgameDecision[] = [];

  const walk = (
    node: SubgameNode,
    line: string[],
    committed: [number, number],
    depth: number,
  ): void => {
    if (node.node_type !== "action_node") return;
    const block = node.strategy;
    if (block === undefined || block.strategy === undefined) return;
    const player = node.player === 1 ? 1 : node.player === 0 ? 0 : undefined;
    if (player === undefined) return;

    const opponent = player === 1 ? 0 : 1;
    found.push({
      line: [...line],
      node,
      player,
      potChips: rootPotChips + committed[0] + committed[1],
      stackChips: rootStackChips - committed[player],
      toCallChips: Math.max(0, committed[opponent] - committed[player]),
      depth,
      committed: [committed[0], committed[1]],
    });

    const actions = (node.actions ?? []) as string[];
    for (const action of actions) {
      const child = node.childrens?.[action];
      if (child === undefined) continue;
      const next = committedAfterAction(action, player, committed);
      line.push(action);
      walk(child, line, next, depth + 1);
      line.pop();
    }
  };

  walk(root, [], [0, 0], 0);
  return found;
}
