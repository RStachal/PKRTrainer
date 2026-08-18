import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { shippedPreflopPack } from "./rangeChartComparison.mts";
import type { AnteMode, Position, StackBucket } from "../../src/core/types";

/**
 * Kolik různých odpovědí dává preflop na různé hloubky stacku.
 *
 * Produkt nabízí deset stackových kbelíků a tváří se tím, že hloubka odpověď
 * mění. U některých pozic ji nemění vůbec: SB otevírá stejných 42,1 % kombinací
 * na patnácti i na sto blindech. Hráč, který trénuje SB na 100bb, tak dostává
 * odpověď postavenou pro 15bb a nikde se to nedozví.
 *
 * Nenašlo se to čtením kódu - packy vypadají v pořádku, protože záznam pro každý
 * kbelík opravdu existuje. Našlo se to až porovnáním s nezávislým vlastněným
 * zdrojem, kde SB na 100bb zvyšuje 4,7 % a zbytek limpuje.
 *
 * Tenhle modul nic neopravuje a nic nedomýšlí. Jen spočítá, kolik různých
 * otevíracích ranges na dané pozici doopravdy existuje, aby to brána mohla
 * přiznat místo aby to zamlčela. Doplnit chybějící vrstvy znamená mít pro ně
 * změřená data, ne je odvodit.
 */

export interface SeatDepthStrata {
  seat: Position;
  /** Kolik hloubek produkt na téhle pozici nabízí. */
  buckets: number;
  /** Kolik z nich vrací navzájem různou otevírací range. */
  distinctRanges: number;
}

function openingSignature(
  actions: Readonly<Record<string, readonly string[]>>,
): string {
  return Object.entries(actions)
    .filter(([, list]) => list.some((action) => action !== "FOLD"))
    .map(([hand, list]) => `${hand}:${[...list].sort().join("/")}`)
    .sort()
    .join(",");
}

export function preflopDepthStrata(ante: AnteMode): SeatDepthStrata[] {
  const pack = shippedPreflopPack(ante);
  if (pack === undefined) return [];
  const store = createRangeStoreFromRangePack(pack);

  // Pozice i hloubky se berou ze samotných záznamů, ne z natvrdo psaného
  // seznamu. Kdyby se knihovna rozšířila, report se rozšíří s ní.
  const rfi = pack.records.filter((record) => record.context === "RFI");
  const seats = [...new Set(rfi.map((record) => record.position))] as Position[];

  return seats.map((seat) => {
    const buckets = [...new Set(
      rfi.filter((record) => record.position === seat).map((record) => record.bucket),
    )] as StackBucket[];
    const signatures = new Set(
      buckets
        .map((bucket) => store.lookup({ ante, position: seat, bucket, context: "RFI" }))
        .filter((entry) => entry !== undefined)
        .map((entry) => openingSignature(entry.actions)),
    );
    return { seat, buckets: buckets.length, distinctRanges: signatures.size };
  });
}

/** Věta pro bránu, nebo `undefined`, když je každá hloubka vlastní. */
export function depthStrataLimit(ante: AnteMode): string | undefined {
  const strata = preflopDepthStrata(ante).filter((row) => row.buckets > 1);
  if (strata.length === 0) return undefined;
  const thin = strata.filter((row) => row.distinctRanges < row.buckets);
  if (thin.length === 0) return undefined;

  const buckets = Math.max(...strata.map((row) => row.buckets));
  const most = Math.max(...thin.map((row) => row.distinctRanges));
  const flat = thin.filter((row) => row.distinctRanges === 1).map((row) => row.seat);
  return (
    `Preflop RFI is offered at ${buckets} stack depths but distinguishes at most ${most} of them `
    + `on any seat (${thin.length}/${strata.length} seats affected`
    + (flat.length > 0 ? `; ${flat.join(", ")} answer every depth with one range` : "")
    + "). The buckets are real product choices, so the drill must not imply depth-specific study "
    + "where the range is identical - a player drilling 100bb is being served a range built for a "
    + "much shorter stack."
  );
}
