import type { PostflopAction } from "../../core/postflopGenerator";
import type { Card } from "../../core/types";
import { riverEvManifest, type RiverEvManifestEntry } from "./riverEvManifest.generated";
import { readRiverEv, riverEvMatchesPack, type RiverEvPack } from "./riverEvPack";
import type { RiverStrategyPack } from "./riverSolvedRuntimeRegistry";
import { translateTurnActions } from "./turnActionTranslation";

/**
 * EV riverových akcí za běhu: stáhne se, až když ji hráč může chtít vidět.
 *
 * ## Proč vlastní stahování
 *
 * Tabulka je půl megabajtu na rodinu - zhruba jako celá rodina se strategií.
 * Kdyby se načítala s ní, platil by ji každý, kdo si otevře trénink, včetně
 * těch, kdo se k riveru nikdy nedostanou. Proto vlastní chunk a vlastní
 * manifest.
 *
 * ## Proč se nikde nečeká
 *
 * Resolver je synchronní a čekat na půl megabajtu uprostřed rozdání by znamenalo
 * prodlevu přesně v tu chvíli, kdy hráč kouká na karty. Místo toho se stahování
 * **nastartuje při prvním spotu rodiny** a použije se od chvíle, kdy dorazí. Kdo
 * dostane úplně první riverový spot dřív, než chunk přiletí, uvidí odpověď bez
 * čísel - a to je pořád lepší než čekání nebo vymyšlené EV.
 *
 * ## Proč se otisk ověřuje tady
 *
 * Tabulka platí pro jednu podobu packu. Přegenerovaný pack s nepřegenerovanou
 * tabulkou by ukazoval čísla k jiné strategii a **nic by to neřeklo**, protože
 * tvar dat zůstane v pořádku. Neshoda otisku proto znamená „EV není", ne „EV
 * nejspíš sedí".
 */

/** Co hráč uvidí u jedné akce, když si po odpovědi rozklikne EV. */
export interface RiverActionEvRow {
  action: PostflopAction;
  /** EV v blindech. Vždy v BB, protože v nich mluví celá aplikace. */
  evBB: number;
  /**
   * Kolik solverových velikostí se do téhle akce složilo.
   *
   * Trenažér má dvě velikosti sázky a solve jich běžně nabídne čtyři, takže se
   * slučuje. Když se sloučí, ukáže se EV té nejlepší z nich - hráč si vybírá
   * akci, ne velikost, a nejlepší dosažitelná hodnota je to, co ta volba stojí.
   */
  mergedFrom: number;
}

const loads = new Map<string, Promise<RiverEvPack | undefined>>();
const ready = new Map<string, RiverEvPack>();

/**
 * Načte tabulku k packu, nebo `undefined`, když k němu žádná neplatí.
 *
 * Neúspěch vypadne z cache, aby šel zkusit znovu; neshoda otisku ne - ta se
 * opakováním nespraví a druhý pokus by jen znovu stáhl půl megabajtu.
 */
export function loadRiverEvPack(
  pack: Pick<RiverStrategyPack, "id" | "contentHash">,
  manifest: readonly RiverEvManifestEntry[] = riverEvManifest,
): Promise<RiverEvPack | undefined> {
  const cached = loads.get(pack.id);
  if (cached) return cached;

  const entry = manifest.find((item) => item.packId === pack.id);
  if (entry === undefined) {
    const missing = Promise.resolve(undefined);
    loads.set(pack.id, missing);
    return missing;
  }

  const pending = entry.load()
    .then((table) => {
      if (!riverEvMatchesPack(table, pack)) return undefined;
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
export function readyRiverEvPack(packId: string): RiverEvPack | undefined {
  return ready.get(packId);
}

/** Nastartuje stahování a nečeká; chyba se spolkne, EV je nepovinná ozdoba. */
export function primeRiverEvPack(pack: Pick<RiverStrategyPack, "id" | "contentHash">): void {
  if (ready.has(pack.id) || loads.has(pack.id)) return;
  void loadRiverEvPack(pack).catch(() => undefined);
}

/** Zapomene načtené tabulky; pro testy, které mění manifest mezi případy. */
export function resetRiverEvCache(): void {
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
 * dvě hledání jsou dvě místa, kde se opravuje jedna chyba. Zároveň tím tenhle
 * modul nemusí sáhnout na resolver, takže mezi nimi nevzniká kruh.
 *
 * Vrací akce ve slovníku trenažéru, ne solverovy popisky: hráč nikdy neuvidí
 * `BET 17.000000`.
 */
export function riverActionEvRows(
  pack: RiverStrategyPack,
  table: RiverEvPack,
  ruleIndex: number,
  heroCards: readonly [Card, Card],
  potBBFallback: number,
): RiverActionEvRow[] | undefined {
  const rule = pack.rules[ruleIndex];
  if (rule === undefined) return undefined;

  const lookup = readRiverEv(table, (index) => pack.rules[index]?.actions.length);
  const [direct, swapped] = comboKeys(heroCards);
  const values = lookup.forCombo(ruleIndex, direct) ?? lookup.forCombo(ruleIndex, swapped);
  if (values === undefined) return undefined;

  const potForSizes = rule.riverSpot.potChips || potBBFallback;
  const { actions } = translateTurnActions(rule.actions, potForSizes);
  // Tatáž past jako v resolveru: nepřeložitelný popisek se zahodí a pole se
  // zkrátí, takže by se hodnoty přiřadily o akci vedle. Radši nic než posun.
  if (actions.length !== rule.actions.length) return undefined;

  const byAction = new Map<PostflopAction, RiverActionEvRow>();
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
}
