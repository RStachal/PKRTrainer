import { solvedFlopManifest, type SolvedFlopManifestEntry } from "./flopSolvedManifest.generated";
import { registerSolvedFlopPack, runtimeSolvedFlopPacks } from "./flopSolvedRuntimeRegistry";
import type { FlopSolvedStrategyPack } from "./flopSolvedStrategyPack";

/**
 * Vyřešené flopové packy, jeden stahovatelný chunk na rodinu.
 *
 * Stejná stavba jako u turnu a riveru a ze stejných důvodů: rodina je vlastní
 * chunk, protože staticky importovaná by se usadila v postflopovém chunku a
 * druhá by shodila rozpočet.
 */

export const flopSolvedStrategyPacks: readonly FlopSolvedStrategyPack[] = runtimeSolvedFlopPacks;

/** Položky manifestu, které profil chce; ante segment se ignoruje jako jinde. */
export function solvedFlopEntriesForProfile(
  profileKey: string,
  manifest: readonly SolvedFlopManifestEntry[] = solvedFlopManifest,
): readonly SolvedFlopManifestEntry[] {
  const segments = profileKey.split("|");
  const withoutAnte = segments.length > 4 ? segments.slice(0, 4).join("|") : profileKey;
  return manifest.filter((entry) => entry.profileKey === withoutAnte);
}

const loads = new Map<string, Promise<FlopSolvedStrategyPack>>();

function loadOne(entry: SolvedFlopManifestEntry): Promise<FlopSolvedStrategyPack> {
  // Registrace při každém čekání, ne jen při prvním stažení; zápis je
  // idempotentní podle id. Kdo registr vyprázdní, dostane ho zpátky - jinak
  // resolver mlčky odmítá všechno a test nad tím projde, aniž by co ověřil.
  const cached = loads.get(entry.packId);
  if (cached) return cached.then((pack) => {
    registerSolvedFlopPack(pack);
    return pack;
  });
  const pending = entry.load()
    .then((pack) => {
      if (pack.id !== entry.packId) {
        throw new Error(`Solved flop manifest expected ${entry.packId}, loaded ${pack.id}.`);
      }
      registerSolvedFlopPack(pack);
      return pack;
    })
    .catch((error: unknown) => {
      loads.delete(entry.packId);
      throw error;
    });
  loads.set(entry.packId, pending);
  return pending;
}

/**
 * Načte flopové rodiny na pozadí.
 *
 * Nečeká se ani na jednu. Flopový katalog trenažér neplní - na desku, kterou
 * nikdo nevyřešil, odpoví texturní agregát jako dosud - takže čekání by jen
 * zdrželo první ruku.
 */
export function loadSolvedFlopPacks(
  profileKey: string,
  manifest: readonly SolvedFlopManifestEntry[] = solvedFlopManifest,
): Promise<readonly FlopSolvedStrategyPack[]> {
  return Promise.all(solvedFlopEntriesForProfile(profileKey, manifest).map(loadOne));
}

/** Kolik rodin už dorazilo, pro testy a diagnostiku. */
export function loadedSolvedFlopPackCount(): number {
  return runtimeSolvedFlopPacks.length;
}
