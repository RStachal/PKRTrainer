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
 * Kdo u toho pravidla hraje, a v jaké roli.
 *
 * ## Proč to nejde přečíst ze jména
 *
 * `positionPattern` je `<agresor>_VS_<dorovnávající>`, ne `<hrdina>_vs_<soupeř>`
 * (viz `srpPositionPattern` a `threeBetPositionPattern` v generátoru). U uzlu
 * `FLOP_FACING_BET` je proto hrdinou ten **druhý** v tom jménu. Druhé čtení
 * 9. 9. 2026 na tom uvízlo: `3BP_BTN_VS_CO` proti sázce vypadalo jako range
 * buttonu, přitom drží cutoffa, který 3bet dorovnal - a nález „pilot drží range
 * druhého hráče" byl označený za blokující. Data byla správně, jméno zavádělo.
 *
 * Je to táž vada jako v bodě 39, jen o patro výš: tam digest neřekl, čí
 * strategii čtenář vidí, tady to neřekla čtecí stránka.
 *
 * ## Odkud se bere pozice
 *
 * U 3bet potu je agresor vždy v pozici (`oopCallerVsIpThreeBettorContext`).
 * U SRP záleží na sedačkách: proti big blindu je agresor v pozici, ze small
 * blindu a v souboji dvou nebliderských sedaček mimo ni.
 */
export function pilotHeroSeat(
  positionPattern: string,
  actionNode: string,
): { seat: string; role: string } {
  const match = /^(SRP|3BP)_([A-Z0-9_]+)_VS_([A-Z0-9_]+)$/.exec(positionPattern);
  if (match === null) return { seat: positionPattern, role: "vzor bez sedaček" };

  const seatName = (token: string): string => token.replace("UTG_", "UTG+");
  const aggressor = seatName(match[2]);
  const caller = seatName(match[3]);
  const threeBet = match[1] === "3BP";
  const aggressorInPosition = threeBet || (match[3] === "BB" && match[2] !== "SB");

  if (actionNode === "FLOP_FACING_BET") {
    return {
      seat: caller,
      role: threeBet
        ? `dorovnal 3bet od ${aggressor} a čelí jeho c-betu`
          + ` (${aggressorInPosition ? "mimo pozici" : "v pozici"})`
        : `dorovnal otevření od ${aggressor} a čelí c-betu`
          + ` (${aggressorInPosition ? "mimo pozici" : "v pozici"})`,
    };
  }
  return {
    seat: aggressor,
    role: threeBet
      ? `3bettoval ${caller} a c-betuje (${aggressorInPosition ? "v pozici" : "mimo pozici"})`
      : `otevřel, ${caller} dorovnal, a c-betuje`
        + ` (${aggressorInPosition ? "v pozici" : "mimo pozici"})`,
  };
}

/**
 * Výtky, které se dají připnout k „něco je špatně".
 *
 * Bydlí tady ze stejného důvodu jako pořadí: stránka je nabízí, zapisovač je
 * ukládá do verdiktu, a kdyby si je každá strana psala po svém, rozešla by se
 * čísla od významů. To by nebylo vidět - verdikt by nesl větu, kterou čtenář
 * nezaškrtl.
 */
export const PILOT_REVIEW_FLAGS: ReadonlyMap<string, string> = new Map([
  ["1", "poměr akcí nesedí"],
  ["2", "konkrétní ruka v cizí akci"],
  ["3", "chybí velikost sázky"],
  ["4", "přes hloubky si to odporuje"],
  ["5", "málo desek v agregátu"],
]);

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
