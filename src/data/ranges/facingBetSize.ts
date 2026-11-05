/**
 * Kolik stojí dorovnat sázku, které hrdina na postflopu čelí.
 *
 * ## Proč je tohle číslo jiné třídy než preflopová cena
 *
 * Preflopové velikosti tří-betu a čtyři-betu jsou **přiznaný předpoklad** -
 * produkt je neučí, tak si je zvolil. Postflopová sázka žádná volba není:
 * vyřešené pravidlo nese linii tak, jak ji solver doopravdy hrál, včetně
 * velikostí v žetonech. Cena dorovnání se z ní **spočítá**, nedomýšlí.
 *
 * Změřeno 28. 8. 2026 na dodávaném obsahu: z 29 043 pravidel jich **16 410
 * (56,5 %) staví hrdinu před sázku**, a linie končí čtyřmi vzory - po checku,
 * po dorovnání z minulé ulice, jako první akce, nebo raisem přes vlastní sázku.
 * Všechny čtyři jdou spočítat, takže se nevynechává nic.
 *
 * ## Na co si dát pozor
 *
 * `potChips` sázku **už obsahuje** (ověřeno: 100 + 75 = 175), takže se nesmí
 * přičítat podruhé. A převod na blindy se bere z poměru `potChips / potBB`,
 * ne z konstanty - rodiny mají různé hloubky a různé velikosti blindu.
 */

interface SolvedRuleSpot {
  hero?: { facingBet?: boolean };
  priorLine?: readonly string[];
  potChips?: number;
  potBB?: number;
}

/** Žetony z položky linie typu `BET 75.000000`; jinak nic. */
function chipsOf(entry: string | undefined): number | undefined {
  if (entry === undefined) return undefined;
  const match = /^(BET|RAISE|ALLIN)\s+([\d.]+)$/.exec(entry.trim());
  if (match === null) return undefined;
  const chips = Number(match[2]);
  return Number.isFinite(chips) && chips > 0 ? chips : undefined;
}

/**
 * Cena dorovnání v blindech, nebo nic, když spot sázku nestaví.
 *
 * Vrací `undefined` i tam, kde by šlo číslo vyrobit odhadem. Chybějící údaj se
 * pozná; odhad vydávaný za výpočet ne.
 */
export function facingBetBB(spot: SolvedRuleSpot | undefined): number | undefined {
  if (spot?.hero?.facingBet !== true) return undefined;
  const { priorLine, potChips, potBB } = spot;
  if (priorLine === undefined || potChips === undefined || potBB === undefined) return undefined;
  if (!(potChips > 0) || !(potBB > 0)) return undefined;

  const last = chipsOf(priorLine[priorLine.length - 1]);
  if (last === undefined) return undefined;

  // Raise přes vlastní sázku: dorovnává se rozdíl, ne celý raise. Bez tohohle
  // by u 2 782 pravidel vyšla cena vyšší, než kolik hrdina doopravdy doplácí.
  const isRaise = /^RAISE/.test(priorLine[priorLine.length - 1]?.trim() ?? "");
  const own = isRaise ? chipsOf(priorLine[priorLine.length - 2]) ?? 0 : 0;
  const toCallChips = last - own;
  if (!(toCallChips > 0)) return undefined;

  const chipsPerBB = potChips / potBB;
  if (!(chipsPerBB > 0)) return undefined;
  return Math.round((toCallChips / chipsPerBB) * 100) / 100;
}
