/**
 * Kolik pruhů pustit a jakou haldu dát které ulici - čistá funkce za
 * `laneBudget()` v `runAfterNight.mts`, ať se dá otestovat bez spuštění cyklu.
 *
 * Proč podlahy a strop takové, jaké jsou, je rozepsané u konstant v cyklu.
 * Tady je jen mechanika: pruhů tolik, kolik se jich podlahami vejde do volné
 * paměti po rezervě pro systém (aspoň jeden), a co po podlahách zbude, rozdělit
 * rovným dílem na pruh a přičíst k podlaze, nejvýš do stropu.
 *
 * ## Jen ulice, které se opravdu generují (od 21. 10. 2026)
 *
 * Pruhy si berou **ulice** z jedné fronty, takže souběžně neběží víc pruhů,
 * než kolik ulic se generuje. Rozpočet se ale počítal přes všechny tři ulice.
 * Ranní cyklus generuje jen flop (`--streets-if-new=flop`), a tak 21. 10. 2026
 * při 19,5 GB volných rezervoval 12 GB riverovému pruhu, který nikdy
 * nepoběžel, a flopu zbylo 4 865 MB. `MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR` pak
 * vyráběla flopový pack **112 minut** místo pěti - týž hlad po haldě, jaký
 * bod 299 změřil 8. 10. (5,3 min při 6,6 GB, 112 min při 4,1 GB). Přičítal se
 * volné paměti; tentokrát volná byla, jen ji rozpočet dal ulici, která nejela.
 */
export interface LanePlanOptions {
  freeGb: number;
  reserveGb: number;
  /** Podlahy hald po ulicích, v MB. */
  floorsMb: Readonly<Record<string, number>>;
  ceilingMb: number;
  /** Ulice, které se opravdu generují. */
  wanted: readonly string[];
  /** Ruční přepis počtu pruhů (`--lanes=N`); 0 znamená podle paměti. */
  lanesOverride?: number;
}

export interface LanePlan {
  lanes: number;
  /** Halda pro každou ulici z `floorsMb`, i tu, která se negeneruje. */
  heapMb: Map<string, number>;
}

export function planLanes(options: LanePlanOptions): LanePlan {
  const { floorsMb, ceilingMb, lanesOverride = 0 } = options;
  const usableMb = Math.max(0, options.freeGb - options.reserveGb) * 1024;
  // Od nejdražší ulice: kdyby paměť došla, ať čeká ta levná, ne ta drahá.
  const byNeed = options.wanted
    .filter((street) => floorsMb[street] !== undefined)
    .sort((left, right) => floorsMb[right] - floorsMb[left]);
  let remainingMb = usableMb;
  let lanes = 0;
  for (const street of byNeed) {
    if (lanesOverride > 0) {
      if (lanes >= lanesOverride) break;
    } else if (floorsMb[street] > remainingMb && lanes > 0) break;
    remainingMb -= floorsMb[street];
    lanes += 1;
  }
  const shareMb = lanes === 0 ? 0 : Math.max(0, remainingMb) / lanes;
  const heapMb = new Map<string, number>(
    Object.keys(floorsMb).map((street) => [
      street,
      Math.min(ceilingMb, Math.floor(floorsMb[street] + shareMb)),
    ]),
  );
  return { lanes: Math.max(1, lanes), heapMb };
}
