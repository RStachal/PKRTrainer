import type { PostflopAction, PostflopStrategyInput } from "../../core/postflopGenerator";
import { riverEvManifest, type RiverEvManifestEntry } from "./riverEvManifest.generated";
import { readRiverEv, riverEvMatchesPack, type RiverEvLookup, type RiverEvPack } from "./riverEvPack";
import type { RiverStrategyPack } from "./riverSolvedRuntimeRegistry";
import { findRiverRuleIndex } from "./riverStrategyResolver";
import { translateTurnActions } from "./turnActionTranslation";

/**
 * EV riverových akcí za běhu: stáhne se, až když ji hráč chce vidět.
 *
 * ## Proč vlastní stahování
 *
 * Tabulka je půl megabajtu na rodinu - zhruba jako celá rodina se strategií.
 * Kdyby se načítala s ní, platil by ji každý, kdo si otevře trénink, včetně
 * těch, kdo si EV nikdy nezobrazí. Proto vlastní chunk a vlastní manifest.
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

function entryFor(
  packId: string,
  manifest: readonly RiverEvManifestEntry[],
): RiverEvManifestEntry | undefined {
  return manifest.find((item) => item.packId === packId);
}

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

  const entry = entryFor(pack.id, manifest);
  if (entry === undefined) {
    const missing = Promise.resolve(undefined);
    loads.set(pack.id, missing);
    return missing;
  }

  const pending = entry.load()
    .then((table) => (riverEvMatchesPack(table, pack) ? table : undefined))
    .catch((error: unknown) => {
      loads.delete(pack.id);
      throw error;
    });
  loads.set(pack.id, pending);
  return pending;
}

/** Zapomene načtené tabulky; pro testy, které mění manifest mezi případy. */
export function resetRiverEvCache(): void {
  loads.clear();
}

function lookupFor(pack: RiverStrategyPack, table: RiverEvPack): RiverEvLookup {
  // Počet akcí se bere z pravidla packu, ne z tabulky: tabulka nese jen hodnoty
  // a kolik jich na kombinaci připadá, je odvozené. Kdyby se ty dva rozešly,
  // četly by se posunuté - hráči by u sázky vyšlo EV složení.
  return readRiverEv(table, (index) => pack.rules[index]?.actions.length);
}

/**
 * EV akcí pro jednu kombinaci na spotu, na který pack odpovídá.
 *
 * Vrací akce ve slovníku trenažéru, ne solverovy popisky: hráč nikdy neuvidí
 * `BET 17.000000`. Když se dvě velikosti složí do jedné akce, zůstane ta s vyšším
 * EV a `mergedFrom` řekne, kolik jich za ní stojí.
 */
export function riverActionEvForCombo(
  pack: RiverStrategyPack,
  table: RiverEvPack,
  input: PostflopStrategyInput,
  combo: string,
): RiverActionEvRow[] | undefined {
  const ruleIndex = findRiverRuleIndex(pack, input);
  if (ruleIndex < 0) return undefined;
  const rule = pack.rules[ruleIndex];

  const values = lookupFor(pack, table).forCombo(ruleIndex, combo);
  if (values === undefined) return undefined;

  const potForSizes = rule.riverSpot.potChips || input.potBB;
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
