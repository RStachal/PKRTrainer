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
  /**
   * Kolik z nich se liší **výběrem rukou**, ne jen velikostí otevření.
   *
   * Tohle je ta ostřejší otázka a odpověď je horší. `distinctRanges` počítá
   * otisk včetně akce, takže se dvě hloubky rozliší i tehdy, když se otevírají
   * tytéž ruce, jen jinou velikostí - a přesně to dodávaný pack dělá. Měřeno
   * 26. 8. 2026: `distinctRanges` 2 z 11, ale `distinctSelections` **1 z 11 na
   * každé sedačce**. UTG otevírá týchž 35 tříd na patnácti i na sto padesáti
   * blindech; jediné, co hloubka mění, je velikost.
   *
   * Rozdíl je podstatný pro to, co se hráči slibuje: „trénuj podle hloubky"
   * znamená jinou range, ne jiný bet sizing u téže range.
   */
  distinctSelections: number;
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

/**
 * Otisk, který si všímá jen toho, **které ruce** se hrají.
 *
 * Záměrně zahazuje jméno akce: dvě hloubky se stejným výběrem rukou a jinou
 * velikostí otevření nejsou dvě různé odpovědi na otázku „co hrát", jsou to
 * tytéž ruce za jinou cenu.
 */
function selectionSignature(
  actions: Readonly<Record<string, readonly string[]>>,
): string {
  return Object.entries(actions)
    .filter(([, list]) => list.some((action) => action !== "FOLD"))
    .map(([hand]) => hand)
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
    const entries = buckets
      .map((bucket) => store.lookup({ ante, position: seat, bucket, context: "RFI" }))
      .filter((entry) => entry !== undefined);
    const signatures = new Set(entries.map((entry) => openingSignature(entry.actions)));
    const selections = new Set(entries.map((entry) => selectionSignature(entry.actions)));
    return {
      seat,
      buckets: buckets.length,
      distinctRanges: signatures.size,
      distinctSelections: selections.size,
    };
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
  // Druhé, ostřejší číslo: kolik hloubek se liší **výběrem rukou**. Říká se jen
  // tehdy, když je horší než to první - jinak by to byl jen šum.
  const mostSelections = Math.max(...thin.map((row) => row.distinctSelections));
  const leanest = mostSelections < most ? mostSelections : undefined;
  const flat = thin.filter((row) => row.distinctRanges === 1).map((row) => row.seat);
  return (
    `Preflop RFI is offered at ${buckets} stack depths but distinguishes at most ${most} of them `
    + `on any seat (${thin.length}/${strata.length} seats affected`
    + (flat.length > 0 ? `; ${flat.join(", ")} answer every depth with one range` : "")
    + "). The buckets are real product choices, so the drill must not imply depth-specific study "
    + "where the range is identical - a player drilling 100bb is being served a range built for a "
    + "much shorter stack."
    + (leanest === undefined ? "" : " By hand selection alone it is worse: at most "
      + `${leanest} of those depths differs in which hands are opened, so on the affected seats `
      + "depth changes the open size, not the range.")
  );
}


/**
 * Uzly, které nerozlišují, kdo hrál před hrdinou.
 *
 * `VS_OPEN` je klíčovaný jen podle pozice hrdiny a hloubky stacku. Kdo otevřel,
 * v záznamu není - schéma pro to nemá místo. Obrana velkého blindu proti UTG a
 * proti buttonu tak dostane tutéž odpověď, přestože jsou to dvě různé hry.
 *
 * Že to není detail, ukázal nezávislý zdroj: tentýž hrdina na téže hloubce se
 * proti různým otevírajícím brání ranges, které se liší v průměru o **9,4 bodu**
 * a u BB o 16,3 až 37,7 (na 100bb brání 75,6 % proti SB a 37,9 % proti UTG).
 * Přeměřeno 26. 8. 2026 příkazem `npm run mtt:reference-check -- --defence`;
 * do té doby tu stálo 11,7 a 26,9 z jednorázového měření, které nešlo zopakovat. Tohle
 * číslo sem ale nepatří natvrdo - korpus je lokální a brána nesmí věřit ničemu
 * mimo repozitář. Ověřitelné odsud je to podstatné: dimenze chybí.
 */
export function missingOpenerDimensionLimit(ante: AnteMode): string | undefined {
  const pack = shippedPreflopPack(ante);
  if (pack === undefined) return undefined;
  const facing = pack.records.filter((record) => record.context === "VS_OPEN");
  if (facing.length === 0) return undefined;

  const seats = new Set(facing.map((record) => record.position));
  const buckets = new Set(facing.map((record) => record.bucket));
  // Když by dimenze existovala, bylo by záznamů víc než průsečík pozic a
  // hloubek - na každého možného otvírače jeden. Rovnost je ten důkaz.
  if (facing.length > seats.size * buckets.size) return undefined;

  return (
    `Facing an open is keyed by hero seat and stack depth only: ${facing.length} VS_OPEN records `
    + `for ${seats.size} seats x ${buckets.size} depths, with no dimension for which seat opened. `
    + "Defending the big blind against an early-position raise and against a button steal therefore "
    + "return the same range, though they are different games."
  );
}
