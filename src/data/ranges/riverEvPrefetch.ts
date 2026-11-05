import { loadRiverEvPack, readyRiverEvPack } from "./riverEvRuntime";
import { runtimeSolvedRiverPacks } from "./riverSolvedRuntimeRegistry";

/**
 * Načíst tabulku EV té rodiny, ze které se bude rozdávat, dřív než se rozdá.
 *
 * ## Proč to musí existovat
 *
 * `actionEvsFor` se ptá `readyRiverEvPack` **uprostřed rozdání a synchronně**.
 * Když tabulka ještě nedorazila, vrátí nic a jen nastartuje stahování - takže
 * první spot z každé rodiny EV neukáže, i když je celá spočítaná.
 *
 * **Změřeno 25. 8. 2026:** studeně 0,0 % riverových spotů s EV, s načtenou
 * tabulkou 32,7 %. Celá dodaná EV byla pro hráče neviditelná kvůli načasování,
 * ne kvůli chybějícím datům.
 *
 * ## Proč to bydlí tady, a ne v `postflopView`
 *
 * Protože po ní musí sáhnout **dvě různé cesty**: trenažér, aby hráč čísla
 * viděl, a `mtt:post-answer`, aby brána měřila tutéž cestu, kterou jde produkt.
 * Když to bylo jen v UI, měřilo se něco vedle - a to je přesně ta vada, kvůli
 * které vrstva doručení vznikla.
 */

/**
 * Kolik se čeká, než se rozdá i bez tabulky, v milisekundách.
 *
 * Čeká se **před** rozdáním, ne během odpovědi: v tu chvíli hráč ještě nekouká
 * na karty. Mez je proto, aby pomalé připojení rozdání nezmrazilo - odpověď bez
 * čísel je pořád odpověď, což je táž zásada jako v `actionEvsFor`.
 */
export const RIVER_EV_PREFETCH_MS = 2500;

/**
 * Slib na načtení tabulky, nebo `undefined`, když není na co čekat.
 *
 * Vrací `undefined` schválně místo splněného slibu: volající pak nemusí použít
 * `await` vůbec. Jediný `await` navíc udělá z rozdání asynchronní operaci i
 * tam, kde se nic nenačítá, a spot se přestane vykreslovat ve stejném ticku -
 * naměřeno na osmi testech, které žádnou tabulku nenačítají.
 */
export function primeRiverEvForPack(
  packId: string,
  timeoutMs: number = RIVER_EV_PREFETCH_MS,
): Promise<unknown> | undefined {
  const pack = runtimeSolvedRiverPacks.find((item) => item.id === packId);
  if (pack === undefined) return undefined;
  if (readyRiverEvPack(pack.id) !== undefined) return undefined;
  return Promise.race([
    loadRiverEvPack(pack).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
