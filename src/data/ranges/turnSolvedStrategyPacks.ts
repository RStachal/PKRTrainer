import type { PostflopStrategyResolver } from "../../core/postflopGenerator";
import { createPostflopResolverChain } from "./postflopResolverChain";
import type { SolvedTurnManifestEntry } from "./turnSolvedManifest.generated";
import { registerSolvedTurnPack, runtimeSolvedTurnPacks } from "./turnSolvedRuntimeRegistry";
import type { TurnStrategyPack } from "./turnStrategyPack";
import { createTurnStrategyResolver } from "./turnStrategyResolver";

/**
 * Manifest se stahuje zvlášť, ne s instalační cestou.
 *
 * Seznam vyřešených rodin **roste s obsahem** - naměřeno zhruba 23 B gzipu na
 * rodinu (bod 107) - a staticky importovaný se usadil v hlavním balíku, který
 * platí každý hráč hned při instalaci. Změřeno 5. 9. 2026: `main` byl na
 * **324,08 z 325 KiB raw**, tedy necelý kilobajt pod stropem.
 *
 * Manifest čte jen asynchronní cesta, takže dynamický import nic nerozbije:
 * synchronní resolver se ptá na už načtené packy, ne na seznam.
 */
let manifestPromise: Promise<readonly SolvedTurnManifestEntry[]> | undefined;

function solvedTurnManifestAsync(): Promise<readonly SolvedTurnManifestEntry[]> {
  manifestPromise ??= import("./turnSolvedManifest.generated").then((module) => module.solvedTurnManifest);
  return manifestPromise;
}


/**
 * The solved turn packs the app ships, one downloadable chunk per family.
 *
 * Eleven families were solved overnight. Each is roughly thirty five kilobytes
 * built, which is nothing on its own and four hundred together - and the first
 * one, statically imported, landed inside the postflop runtime chunk and left it
 * five kilobytes under its own five-hundred-and-twelve limit. A second family
 * would have failed the budget, and the fix would have been to raise the number
 * rather than to stop shipping strategy, which is how a phone-sized app stops
 * being one.
 *
 * So a family is its own chunk, fetched when a player's profile wants turn
 * content and never otherwise. The eleventh family then costs exactly what the
 * first did.
 *
 * ## Why the resolver reads the array late
 *
 * Chunks land during a session, so a chain built once at boot over whatever had
 * arrived would answer from an empty list for the rest of the run. The chain
 * therefore rebuilds from the live registry per call. That is a map over a
 * handful of packs on each turn decision - not free, but immeasurable against a
 * download, and it removes an ordering bug that would look exactly like missing
 * content.
 *
 * Every pack carries LOW confidence until a player has read it. The review gate
 * checked that the solve is traceable, complete, converged and internally
 * coherent; none of that says the strategy is good.
 */

export const turnSolvedStrategyPacks: readonly TurnStrategyPack[] = runtimeSolvedTurnPacks;

/**
 * Manifest entries a profile wants.
 *
 * A runtime profile key carries an ante segment - `...|TURN|OFF` - and a solved
 * turn pack does not split on ante, because the solves were run without one and
 * a turn strategy four streets from the antes that were posted is the same
 * strategy either way. So the manifest key is the profile key without its ante,
 * and the comparison drops that segment rather than listing both values twice.
 */
export function solvedTurnEntriesForProfile(
  profileKey: string,
  manifest: readonly SolvedTurnManifestEntry[],
): readonly SolvedTurnManifestEntry[] {
  const segments = profileKey.split("|");
  const withoutAnte = segments.length > 4 ? segments.slice(0, 4).join("|") : profileKey;
  return manifest.filter((entry) => entry.profileKey === withoutAnte);
}

const loads = new Map<string, Promise<TurnStrategyPack>>();

function loadOne(entry: SolvedTurnManifestEntry): Promise<TurnStrategyPack> {
  // Registrace při každém čekání, ne jen při prvním stažení; zápis je
  // idempotentní podle id. Kdo registr vyprázdní, dostane ho od dalšího načtení
  // zpátky - jinak resolver mlčky odmítá všechno a test nad tím projde, aniž by
  // cokoli ověřil.
  const cached = loads.get(entry.packId);
  if (cached) return cached.then((pack) => {
    registerSolvedTurnPack(pack);
    return pack;
  });
  const pending = entry.load()
    .then((pack) => {
      if (pack.id !== entry.packId) {
        throw new Error(`Solved turn manifest expected ${entry.packId}, loaded ${pack.id}.`);
      }
      registerSolvedTurnPack(pack);
      return pack;
    })
    .catch((error: unknown) => {
      // Neúspěšný chunk vypadne z cache, aby šel zkusit znovu: jedno selhání na
      // vratkém připojení nesmí vypnout turnový obsah na celou relaci.
      loads.delete(entry.packId);
      throw error;
    });
  loads.set(entry.packId, pending);
  return pending;
}

/**
 * Načte první rodinu a zbytek dotáhne na pozadí.
 *
 * Rodin je jedenáct a dohromady 345 kB po kompresi. Když se čekalo na všechny,
 * relace nezačala, dokud se nestáhly - a to číslo rostlo tiše: s jednou rodinou
 * to bylo třicet kilobajtů, s jedenácti skoro půl megabajtu před první rukou, na
 * telefonu mezi dvěma turnaji.
 *
 * Čekat na nic ale nejde. Katalog vyřešených turnů se staví z nahraných packů, a
 * dokud je prázdný, trenér rozdá náhodný board - tedy „vyřešený turn", na který
 * odpoví heuristika. Prázdný katalog je horší než pomalý start.
 *
 * Kompromis: počká se na jednu rodinu, což katalog naplní, a ostatní se dotáhnou
 * během hraní. Prvních pár spotů proto pochází z té rodiny, která dorazila
 * první, a výběr se během chvíle rozšíří. To je vychýlení na pár vteřin, ne
 * chybný obsah - resolver dál odmítá všechno, co nevyřešil.
 */
export async function loadSolvedTurnPacks(
  profileKey: string,
  manifest?: readonly SolvedTurnManifestEntry[],
): Promise<readonly TurnStrategyPack[]> {
  const list = manifest ?? await solvedTurnManifestAsync();
  const entries = solvedTurnEntriesForProfile(profileKey, list);
  if (entries.length === 0) return [];

  const [first, ...rest] = entries;
  for (const entry of rest) {
    // Chyba na pozadí se spolkne tady. Kdyby se nechala probublat, byla by z ní
    // neodchycená rejekce a spadl by běh kvůli chunku, bez kterého se hraje dál.
    void loadOne(entry).catch(() => undefined);
  }
  return loadOne(first).then((pack) => [pack]);
}

/**
 * Počká na všechny rodiny. Pro nástroje, ne pro hráče.
 *
 * Brána a měření dosahu musí vidět celý obsah, jinak by hlásily 1 z 11 a
 * vypadalo by to jako ztráta dat. V aplikaci se tohle nepoužívá: tam je půl
 * megabajtu před první rukou přesně ten problém, kvůli kterému se čeká jen na
 * jednu rodinu.
 */
export async function loadAllSolvedTurnPacks(
  profileKey: string,
  manifest?: readonly SolvedTurnManifestEntry[],
): Promise<readonly TurnStrategyPack[]> {
  const all = manifest ?? await solvedTurnManifestAsync();
  return Promise.all(solvedTurnEntriesForProfile(profileKey, all).map(loadOne));
}

/** Kolik rodin už dorazilo, pro testy a diagnostiku. */
export function loadedSolvedTurnPackCount(): number {
  return runtimeSolvedTurnPacks.length;
}

export function createTurnSolvedStrategyResolverChain(
  packs?: readonly TurnStrategyPack[],
): PostflopStrategyResolver {
  if (packs !== undefined) {
    return createPostflopResolverChain(packs.map(createTurnStrategyResolver));
  }
  return (input) => createPostflopResolverChain(
    runtimeSolvedTurnPacks.map(createTurnStrategyResolver),
  )(input);
}
