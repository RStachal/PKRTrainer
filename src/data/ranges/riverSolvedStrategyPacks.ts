import type { SolvedRiverManifestEntry } from "./riverSolvedManifest.generated";
import { registerSolvedRiverPack, runtimeSolvedRiverPacks } from "./riverSolvedRuntimeRegistry";
import type { RiverStrategyPack } from "./riverStrategyPack";

/**
 * Vyřešené riverové packy, jeden stahovatelný chunk na rodinu.
 *
 * Stejná stavba jako u turnu a ze stejných důvodů, které tam stály chybu: rodina
 * je vlastní chunk, protože staticky importovaná první rodina se usadila v
 * postflopovém chunku a druhá by shodila rozpočet - a oprava by pak byla zvednout
 * limit místo přestat dodávat strategii.
 *
 * Riverových rodin je zatím jedna a je malá. Chunk na rodinu proto teď nic
 * neušetří; ušetří to, až jich noc udělá dvacet, a přestavovat to v tu chvíli by
 * znamenalo přestavovat i to, co už hráči stahují.
 */

export const riverSolvedStrategyPacks: readonly RiverStrategyPack[] = runtimeSolvedRiverPacks;

/**
 * Manifest se stahuje zvlášť, ne s instalační cestou.
 *
 * Seznam vyřešených rodin **roste s obsahem** - naměřeno zhruba 23 B gzipu na
 * rodinu (bod 107) - a staticky importovaný se usadil v hlavním balíku, který
 * platí každý hráč hned při instalaci. Změřeno 5. 9. 2026: `main` byl na
 * **324,08 z 325 KiB raw**, tedy necelý kilobajt pod stropem, a čtyři manifesty
 * dohromady nesly 59,8 kB zdroje.
 *
 * Dynamický import ho posune do vlastního chunku, který se stáhne teprve když
 * se o vyřešený obsah někdo přihlásí. Synchronní cesta ho nepotřebuje: manifest
 * čte jen tahle funkce a `loadSolvedRiverPacks`, obojí asynchronní.
 */
let manifestPromise: Promise<readonly SolvedRiverManifestEntry[]> | undefined;

function solvedRiverManifestAsync(): Promise<readonly SolvedRiverManifestEntry[]> {
  manifestPromise ??= import("./riverSolvedManifest.generated")
    .then((module) => module.solvedRiverManifest);
  return manifestPromise;
}

/** Položky manifestu, které profil chce; ante segment se ignoruje jako u turnu. */
export function solvedRiverEntriesForProfile(
  profileKey: string,
  manifest: readonly SolvedRiverManifestEntry[],
): readonly SolvedRiverManifestEntry[] {
  const segments = profileKey.split("|");
  const withoutAnte = segments.length > 4 ? segments.slice(0, 4).join("|") : profileKey;
  return manifest.filter((entry) => entry.profileKey === withoutAnte);
}

const loads = new Map<string, Promise<RiverStrategyPack>>();

function loadOne(entry: SolvedRiverManifestEntry): Promise<RiverStrategyPack> {
  // Registrace se dělá při každém čekání, ne jen při prvním stažení.
  //
  // Cache drží slib, takže druhé volání dostane tentýž pack - ale zápis do
  // registru se dřív stal jen jednou, uvnitř prvního `then`. Kdo registr
  // vyprázdnil (v testech se to dělá mezi případy), dostal od dalšího načtení
  // prázdno a resolver pak odmítal všechno. Test tím procházel a netvrdil nic.
  // Zápis je idempotentní podle id, takže opakování nic nestojí.
  const cached = loads.get(entry.packId);
  if (cached) return cached.then((pack) => {
    registerSolvedRiverPack(pack);
    return pack;
  });
  const pending = entry.load()
    .then((pack) => {
      if (pack.id !== entry.packId) {
        throw new Error(`Solved river manifest expected ${entry.packId}, loaded ${pack.id}.`);
      }
      registerSolvedRiverPack(pack);
      return pack;
    })
    .catch((error: unknown) => {
      // Neúspěšný chunk vypadne z cache, aby šel zkusit znovu.
      loads.delete(entry.packId);
      throw error;
    });
  loads.set(entry.packId, pending);
  return pending;
}

/**
 * Načte riverové rodiny na pozadí.
 *
 * Na rozdíl od turnu se nečeká ani na jednu. Turnový katalog musí být neprázdný,
 * než se rozdá spot, jinak trenažér rozdá náhodný board a vydá heuristickou
 * odpověď na „vyřešený turn". Riverový obsah takový katalog neplní - resolver
 * buď na tu desku odpoví, nebo se přizná - takže čekání by jen zdrželo první
 * ruku.
 */
export async function loadSolvedRiverPacks(
  profileKey: string,
  manifest?: readonly SolvedRiverManifestEntry[],
): Promise<readonly RiverStrategyPack[]> {
  const entries = manifest ?? await solvedRiverManifestAsync();
  return Promise.all(solvedRiverEntriesForProfile(profileKey, entries).map(loadOne));
}

/** Kolik rodin už dorazilo, pro testy a diagnostiku. */
export function loadedSolvedRiverPackCount(): number {
  return runtimeSolvedRiverPacks.length;
}
