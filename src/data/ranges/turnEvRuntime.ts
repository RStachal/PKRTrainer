import type { PostflopAction } from "../../core/postflopGenerator";
import type { Card } from "../../core/types";
import type { TurnEvManifestEntry } from "./turnEvManifest.generated";
import { decodeComboMask } from "../../core/evCodec";
import { readTurnEv, turnEvMatchesPack, type TurnEvPack } from "./turnEvPack";
import type { TurnStrategyPack } from "./turnStrategyPack";
import { translateTurnActions } from "./turnActionTranslation";

/**
 * Manifest se stahuje zvlášť, ne s instalační cestou.
 *
 * Táž úvaha jako u riveru: seznam rodin roste s obsahem a staticky importovaný
 * se usadí v hlavním balíku, který platí každý hráč hned při instalaci. `main`
 * byl 5. 9. 2026 na 324,08 z 325 KiB raw, tedy necelý kilobajt pod stropem.
 *
 * Manifest čte jen asynchronní cesta, takže dynamický import nic nerozbije:
 * synchronní resolver se ptá na už načtené packy, ne na seznam.
 */
let manifestPromise: Promise<readonly TurnEvManifestEntry[]> | undefined;

function turnEvManifestAsync(): Promise<readonly TurnEvManifestEntry[]> {
  manifestPromise ??= import("./turnEvManifest.generated").then((module) => module.turnEvManifest);
  return manifestPromise;
}

/**
 * EV turnových akcí za běhu: stáhne se, až když ji hráč může chtít vidět.
 *
 * ## Proč se nikde nečeká
 *
 * Resolver je synchronní a čekat na stovky kilobajtů uprostřed rozdání by byla
 * prodleva přesně v tu chvíli, kdy hráč kouká na karty. Stahování se proto
 * **nastartuje při prvním spotu rodiny** a použije se od chvíle, kdy dorazí.
 * Kdo dostane úplně první turnový spot dřív, uvidí odpověď bez čísel - a to je
 * pořád lepší než čekání nebo vymyšlené EV.
 *
 * ## Proč se otisk ověřuje tady
 *
 * Tabulka platí pro jednu podobu packu. Neshoda otisku znamená „EV není", ne
 * „EV nejspíš sedí" - noc packy přegeneruje a spočítaná EV se tím zahodí.
 */

/** Co hráč uvidí u jedné akce, když si po odpovědi rozklikne EV. */
export interface TurnActionEvRow {
  action: PostflopAction;
  /** EV v blindech. Vždy v BB, protože v nich mluví celá aplikace. */
  evBB: number;
  /**
   * Kolik solverových velikostí se do téhle akce složilo.
   *
   * Trenažér má dvě velikosti sázky a solve jich běžně nabídne čtyři, takže se
   * slučuje. Když se sloučí, ukáže se EV té nejlepší z nich - hráč si vybírá
   * akci, ne velikost.
   */
  mergedFrom: number;
}

const loads = new Map<string, Promise<TurnEvPack | undefined>>();
const ready = new Map<string, TurnEvPack>();

/**
 * Načte tabulku k packu, nebo `undefined`, když k němu žádná neplatí.
 *
 * Neúspěch vypadne z cache, aby šel zkusit znovu; neshoda otisku ne - ta se
 * opakováním nespraví a druhý pokus by jen znovu stáhl tutéž tabulku.
 */
export async function loadTurnEvPack(
  pack: Pick<TurnStrategyPack, "id" | "contentHash">,
  manifest?: readonly TurnEvManifestEntry[],
): Promise<TurnEvPack | undefined> {
  const cached = loads.get(pack.id);
  if (cached) return cached;

  const list = manifest ?? await turnEvManifestAsync();
  const entry = list.find((item) => item.packId === pack.id);
  if (entry === undefined) {
    const missing = Promise.resolve(undefined);
    loads.set(pack.id, missing);
    return missing;
  }

  const pending = entry.load()
    .then((table) => {
      if (!turnEvMatchesPack(table, pack)) return undefined;
      ready.set(pack.id, table);
      return table;
    })
    .catch((error: unknown) => {
      loads.delete(pack.id);
      throw error;
    });
  loads.set(pack.id, pending);
  return pending;
}

/**
 * Tabulka, která už dorazila, bez čekání.
 *
 * Rozhraní pro synchronní cesty: resolver se ptá uprostřed rozdání a nemůže
 * čekat. `undefined` znamená „ještě není", ne „není".
 */
export function readyTurnEvPack(packId: string): TurnEvPack | undefined {
  return ready.get(packId);
}

/** Nastartuje stahování a nečeká; chyba se spolkne, EV je nepovinná ozdoba. */
export function primeTurnEvPack(pack: Pick<TurnStrategyPack, "id" | "contentHash">): void {
  if (ready.has(pack.id) || loads.has(pack.id)) return;
  void loadTurnEvPack(pack).catch(() => undefined);
}

/** Zapomene načtené tabulky; pro testy, které mění manifest mezi případy. */
export function resetTurnEvCache(): void {
  loads.clear();
  ready.clear();
}

/** Kombinace tak, jak ji zapisuje tabulka: `"AhKh"`, v pořadí, které tam je. */
function comboKeys(cards: readonly [Card, Card]): [string, string] {
  const first = `${cards[0].rank}${cards[0].suit}`;
  const second = `${cards[1].rank}${cards[1].suit}`;
  return [`${first}${second}`, `${second}${first}`];
}

/**
 * EV akcí pro jednu kombinaci na pravidle, které už někdo našel.
 *
 * Index pravidla se předává, místo aby se hledalo znovu: hledá ho resolver a
 * dvě hledání jsou dvě místa, kde se opravuje jedna chyba.
 */
export function turnActionEvRows(
  pack: TurnStrategyPack,
  table: TurnEvPack,
  ruleIndex: number,
  heroCards: readonly [Card, Card],
  potBBFallback: number,
): TurnActionEvRow[] | undefined {
  const context = evContext(pack, table, ruleIndex, potBBFallback);
  if (context === undefined) return undefined;
  const [direct, swapped] = comboKeys(heroCards);
  return context.rowsFor(direct) ?? context.rowsFor(swapped);
}

/**
 * EV všech kombinací, které pravidlo drží.
 *
 * Pro matici: hráč po odpovědi chce vidět nejen svou ruku, ale i co by stálo
 * držet jinou. Dekóduje se jednou, ne pro každou kombinaci zvlášť.
 */
export function turnComboEvTable(
  pack: TurnStrategyPack,
  table: TurnEvPack,
  ruleIndex: number,
  potBBFallback: number,
): { combo: string; rows: TurnActionEvRow[] }[] | undefined {
  const context = evContext(pack, table, ruleIndex, potBBFallback);
  if (context === undefined) return undefined;
  const out: { combo: string; rows: TurnActionEvRow[] }[] = [];
  for (const index of decodeComboMask(table.rules[ruleIndex]?.m ?? "", table.combos.length)) {
    const combo = table.combos[index];
    if (combo === undefined) continue;
    const rows = context.rowsFor(combo);
    if (rows !== undefined && rows.length > 0) out.push({ combo, rows });
  }
  return out;
}

/** Společná část obou pohledů: jedno dekódování a jeden překlad akcí. */
function evContext(
  pack: TurnStrategyPack,
  table: TurnEvPack,
  ruleIndex: number,
  potBBFallback: number,
): { rowsFor(combo: string): TurnActionEvRow[] | undefined } | undefined {
  const rule = pack.rules[ruleIndex];
  if (rule === undefined) return undefined;

  // Velikosti sázek jsou žetony proti potu v tom uzlu, takže ten pot je
  // jmenovatel - ne trenažérův, který je týž spot v jiných jednotkách.
  const potForSizes = rule.spot?.potChips ?? potBBFallback;
  const { actions } = translateTurnActions(rule.actions, potForSizes);
  // Tatáž past jako v resolveru: nepřeložitelný popisek se zahodí a pole se
  // zkrátí, takže by se hodnoty přiřadily o akci vedle. Radši nic než posun.
  if (actions.length !== rule.actions.length) return undefined;

  const lookup = readTurnEv(table, (index) => pack.rules[index]?.actions.length);
  return {
    rowsFor(combo) {
      const values = lookup.forCombo(ruleIndex, combo);
      if (values === undefined) return undefined;
      const byAction = new Map<PostflopAction, TurnActionEvRow>();
      for (const [index, translated] of actions.entries()) {
        const evBB = values[index];
        if (evBB === null || evBB === undefined) continue;
        const existing = byAction.get(translated.action);
        if (existing === undefined) {
          byAction.set(translated.action, { action: translated.action, evBB, mergedFrom: 1 });
          continue;
        }
        existing.mergedFrom += 1;
        if (evBB > existing.evBB) existing.evBB = evBB;
      }
      return [...byAction.values()];
    },
  };
}
