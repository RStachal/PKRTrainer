import { buildTurnStrategyRule, type TurnStrategyRule } from "./turnStrategyRuleBuilder";
import type { TurnSubgameNode } from "./turnSubgameReader";

/**
 * Pravidlo z vyřešené riverové podhry, postavené turnovým builderem.
 *
 * Riverová podhra má stejný tvar jako turnová - akční uzel se strategií a dětmi,
 * jen po ní nenásleduje další chance uzel, protože ruka končí. Ověřeno na
 * skutečném solvu, ne odhadem: turnová čtečka riverový dump přečte beze změny a
 * rozdělí ruce do akcí.
 *
 * Tenhle modul proto nic nepočítá znovu. Dělá dvě věci, které turnový builder
 * udělat nemůže, protože o riveru neví:
 *
 * 1. **Najde rodinu.** Riverová podhra leží zanořená pod turnovou
 *    (`<rodina>__<deska>/river/<turnová-podhra>/`), takže jméno adresáře, ze
 *    kterého se čte identita rodiny, je až o dvě úrovně výš.
 * 2. **Doplní pátou kartu.** Rodina i turnová podhra znají čtyři karty; ta pátá
 *    je v riverovém plánu a bez ní by pravidlo neumělo říct, na kterou desku
 *    vlastně odpovídá - a resolver by servíroval jednu odpověď na všechny.
 *
 * ## Zbytek cesty
 *
 * Pack, manifest, loader i resolver existují od 13. srpna a vznikly až nad
 * skutečnou vyřešenou vrstvou - 65 riverových podher z jedné turnové. Čekat na
 * data bylo správné rozhodnutí: cesta cestou skrývala dvě tiché vady, které by
 * odhad tvaru neodhalil, protože obě se projevují jen tím, že na disku nic není.
 */

export interface RiverSolvedSpot {
  /** Čtyři karty, na kterých se hrál turn. */
  turnBoard: readonly string[];
  /** Pátá karta, kterou tohle pravidlo odpovídá. */
  riverCard: string;
  /** Turnová linka, která sem vedla, v solverových popiscích. */
  priorLine: readonly string[];
  /** Pot a zbytek stacku v žetonech, které potřebuje překlad velikostí. */
  potChips: number;
  stackChips: number;
}

export interface RiverStrategyRule extends TurnStrategyRule {
  street: "RIVER";
  riverSpot: RiverSolvedSpot;
}

/** Položka riverového plánu, jak ji zapisuje `plan_river.py`. */
export interface RiverPlanItem {
  line: readonly string[];
  river: string;
  board: readonly string[];
  pot: number;
  stack: number;
  /** Jak často se tahle linka na riveru vůbec hraje, 0 až 1. */
  reach?: number;
}

/**
 * Jméno rodiny z cesty k riverové podhře.
 *
 * `MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/river/CHECK_CHECK__2c` nese identitu rodiny
 * v první části. Odstranit ji nejde jinak než ustřihnutím u `/river/`: rodinu
 * pojmenovává adresář desky, ne adresář podhry.
 */
export function familyDirectoryOfRiverPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const marker = normalized.indexOf("/river/");
  const head = marker >= 0 ? normalized.slice(0, marker) : normalized;
  const name = head.split("/").filter(Boolean).pop();
  return name === undefined || !name.includes("__") ? undefined : name;
}

/**
 * Co o spotu ví generátor a podhra sama ne.
 *
 * Čí strategii uzel drží, se z jména adresáře přečíst nedá - u turnu to stálo
 * chybu, kdy sedačka cutoffu dostala odpovědi big blindu. Určuje se stejně jako
 * tam, z ranží, které plán zapsal k téhle lince, a generátor ho sem předá
 * hotové. Pot a hloubka v blindech se počítají z poměru, který zná jen build.
 */
export interface RiverRuleContext {
  hero?: NonNullable<TurnStrategyRule["spot"]>["hero"];
  potBB?: number;
  stackBehindBB?: number;
}

export function buildRiverStrategyRule(
  riverDirectoryPath: string,
  node: TurnSubgameNode,
  item: RiverPlanItem,
  context: RiverRuleContext = {},
): RiverStrategyRule | undefined {
  const familyDirectory = familyDirectoryOfRiverPath(riverDirectoryPath);
  if (familyDirectory === undefined) return undefined;
  if (item.board.length !== 5) return undefined;

  // Turnový spot popisuje prvních čtyři karty; pátá patří do `riverSpot`. Bez
  // něj by pravidlo neslo jen rodinu a nikdo by nepoznal, na které desce vzniklo
  // - a hlavně by neneslo hrdinu, takže by se filovalo pod sedačku z názvu.
  const base = buildTurnStrategyRule(familyDirectory, node, {
    flop: item.board.slice(0, 3),
    turnCards: [item.board[3]],
    priorLine: [...item.line],
    potChips: item.pot,
    stackChips: item.stack,
    ...(context.potBB === undefined ? {} : { potBB: context.potBB }),
    ...(context.stackBehindBB === undefined ? {} : { stackBehindBB: context.stackBehindBB }),
    ...(context.hero === undefined ? {} : { hero: context.hero }),
    reach: item.reach ?? 0,
  });
  if (base === undefined) return undefined;

  return {
    ...base,
    // Cesta k riverové podhře, ne k desce. Bez toho by dvě riverové karty na
    // téže desce ukazovaly na tentýž zdroj a nešlo by je od sebe odlišit.
    sourceDirectory: riverDirectoryPath.replace(/\\/g, "/"),
    street: "RIVER",
    riverSpot: {
      turnBoard: item.board.slice(0, 4),
      riverCard: item.river,
      priorLine: [...item.line],
      potChips: item.pot,
      stackChips: item.stack,
    },
  };
}
