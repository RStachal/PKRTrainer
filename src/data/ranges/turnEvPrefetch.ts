import { loadTurnEvPack, readyTurnEvPack } from "./turnEvRuntime";
import { runtimeSolvedTurnPacks } from "./turnSolvedRuntimeRegistry";

/**
 * Kolik se čeká, než se rozdá i bez tabulky, v milisekundách.
 *
 * Čeká se **před** rozdáním, ne během odpovědi: v tu chvíli hráč ještě nekouká
 * na karty. Mez je proto, aby pomalé připojení rozdání nezmrazilo - odpověď bez
 * čísel je pořád odpověď, což je táž zásada jako v resolveru.
 */
export const TURN_EV_PREFETCH_MS = 2500;

/**
 * Slib na načtení turnové tabulky, nebo `undefined`, když není na co čekat.
 *
 * Vrací `undefined` schválně místo splněného slibu: volající pak nemusí použít
 * `await` vůbec. Jediný `await` navíc udělá z rozdání asynchronní operaci i
 * tam, kde se nic nenačítá, a spot se přestane vykreslovat ve stejném ticku.
 *
 * ## Proč se pack hledá přes rodinu
 *
 * Turnový spot nese `sourceDirectory` ve tvaru `<rodina>__<deska>`, ale ne
 * `packId` - na rozdíl od riverového. Hledá se proto pack, který tu rodinu
 * dodává. Kdyby se nenašel, nepředčítá se nic; to je správně, protože pak není
 * co ukázat.
 */
export function primeTurnEvForFamily(
  sourceDirectory: string,
  timeoutMs: number = TURN_EV_PREFETCH_MS,
): Promise<unknown> | undefined {
  const family = sourceDirectory.split("__")[0];
  const pack = runtimeSolvedTurnPacks.find((item) => item.familyIds.includes(family));
  if (pack === undefined) return undefined;
  if (readyTurnEvPack(pack.id) !== undefined) return undefined;
  return Promise.race([
    loadTurnEvPack(pack).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
