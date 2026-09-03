import { flopPilotContentHash } from "../../src/data/ranges/turnReviewVerdict";
import type { GeneratedMttPostflopPilotPackEntry } from "../../src/data/ranges/mttPostflopPilotPacks.generated";

/**
 * Co má společného vykreslení pilotů a zápis odpovědí na ně.
 *
 * Obojí musí souhlasit na **pořadí** (index v tokenu je pozice v tomhle pořadí)
 * a na **otisku stránky** (podle něj se pozná, že se mezitím obsah nezměnil).
 * Kdyby si to každá strana počítala po svém, rozešlo by se to tiše a odpovědi
 * by sedly na jiné piloty - táž vada jako v bodě 153, jen mezi dvěma skripty.
 *
 * Proto to bydlí tady a ne dvakrát.
 */

/**
 * Piloty v pořadí, ve kterém se čtou a číslují.
 *
 * Nejdřív ty, které nesou nejvíc pravidel, pak podle jména. Zkratka podle
 * dopadu neexistuje - bod 26 změřil, že rozdělení je ploché - takže to není
 * priorita, jen stabilní pořadí. Stabilita je tu to podstatné: index se nesmí
 * hnout mezi vykreslením a odpovědí.
 */
export function pilotReviewOrder(
  entries: readonly GeneratedMttPostflopPilotPackEntry[],
): readonly GeneratedMttPostflopPilotPackEntry[] {
  return [...entries].sort((left, right) => (
    right.pack.rules.length - left.pack.rules.length
    || left.catalogId.localeCompare(right.catalogId)
  ));
}

/**
 * Otisk celé čtené stránky.
 *
 * Skládá se z otisků jednotlivých pilotů v pořadí čtení, takže se změní jak
 * při změně obsahu, tak při změně pořadí nebo počtu pilotů. Zkracuje se na
 * osm znaků: token opisuje člověk a delší řetězec by se opisoval hůř, aniž by
 * na téhle množině něco rozlišil navíc.
 */
export function pilotReviewPageHash(
  order: readonly GeneratedMttPostflopPilotPackEntry[],
): string {
  const text = order
    .map((entry) => `${entry.catalogId}:${flopPilotContentHash(entry.pack.rules)}`)
    .join("|");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
