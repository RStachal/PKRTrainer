/**
 * Zápis EV tabulky, aby se vešla do rozpočtu chunku.
 *
 * ## Proč vůbec
 *
 * EV musí být po kombinacích, ne po třídách ruk - změřeno: uvnitř jedné třídy se
 * EV rozchází až o čtrnáct blindů, takže průměr přes třídu neodpovídá žádné
 * konkrétní ruce a hráči by lhal. Po kombinacích je to ale kolem 134 tisíc
 * hodnot na rodinu, což jako obyčejná JSON čísla dá 650 až 780 KB proti rozpočtu
 * 512 KiB na jeden líný chunk.
 *
 * První pokus byl base64 nad šestnáctibitovými celými čísly. Raw se to vešlo
 * (496,7 KiB proti 512), ale **spadlo to na gzipu: 170 KiB proti stropu 128**,
 * protože base64 nese šest bitů na znak a komprimovat na něm není co. Změřeno:
 * pole celých čísel dá 582,7 / 134,7 KiB, rozdíly podél kombinací **463,8 /
 * 118,4 KiB** - jediná ze tří variant, která projde oběma rozpočty se všemi
 * pravidly.
 *
 * ## Jednotka a přesnost
 *
 * Desetiny blindu. Trenažér ukazuje EV na jedno desetinné místo, takže jemnější
 * uložení by platilo za přesnost, kterou nikdo neuvidí. Rozsah int16 je +-3276,7
 * BB; nejhlubší spot v knihovně je 150 BB, takže se o strop nejde ani omylem
 * opřít.
 *
 * ## Chybějící hodnota
 *
 * `-32768` znamená „tahle akce pro tuhle kombinaci neexistuje", ne nulu. Nula je
 * platné EV - u složení dokonce to nejčastější - takže kdyby chybějící hodnota
 * byla nula, nešlo by je od sebe rozeznat a hráč by u nedostupné akce viděl
 * číslo.
 */

const SCALE = 10;

/** Největší a nejmenší EV, které se do zápisu vejde, v blindech. */
export const EV_CODEC_RANGE_BB = { min: -3276.7, max: 3276.7 } as const;

/**
 * EV v blindech na rozdíly v desetinách blindu, po akcích.
 *
 * Rozdíl se počítá proti **předchozí kombinaci ve stejné akci**, ne proti
 * sousední hodnotě v poli: vedle sebe leží různé akce, které spolu nesouvisejí,
 * kdežto táž akce u sousední kombinace ano - kombinace jdou vzestupně podle
 * indexu, takže sousedé bývají tatáž třída ruky. Z velkých čísel se tím stanou
 * malé rozdíly a často nuly.
 *
 * Chybějící hodnota je `null`, ne nula. Nula je platné EV a u složení dokonce to
 * nejčastější, takže by se nedaly rozeznat a hráč by u nedostupné akce viděl
 * číslo. Chybějící hodnota základ pro další rozdíl **neposouvá** - jinak by se
 * jedna mezera propsala do všech hodnot za ní.
 */
export function encodeEvDeltas(
  values: readonly (number | null)[],
  actionCount: number,
): (number | null)[] {
  if (actionCount <= 0) return [];
  const out: (number | null)[] = [];
  const previous = new Array<number | null>(actionCount).fill(null);
  for (const [index, value] of values.entries()) {
    const slot = index % actionCount;
    if (value === null || Number.isNaN(value)) {
      out.push(null);
      continue;
    }
    const scaled = Math.max(-32767, Math.min(32767, Math.round(value * SCALE)));
    const base = previous[slot];
    out.push(base === null ? scaled : scaled - base);
    previous[slot] = scaled;
  }
  return out;
}

/** Zpět na EV v blindech; `null` znamená akci, která pro tu kombinaci není. */
export function decodeEvDeltas(
  deltas: readonly (number | null)[],
  actionCount: number,
): (number | null)[] {
  if (actionCount <= 0) return [];
  const out: (number | null)[] = [];
  const previous = new Array<number | null>(actionCount).fill(null);
  for (const [index, delta] of deltas.entries()) {
    const slot = index % actionCount;
    if (delta === null || delta === undefined) {
      out.push(null);
      continue;
    }
    const base = previous[slot];
    const scaled = base === null ? delta : base + delta;
    previous[slot] = scaled;
    out.push(scaled / SCALE);
  }
  return out;
}

/**
 * Množina kombinací jako bitmapa, ne jako seznam indexů.
 *
 * Každé pravidlo pokrývá podmnožinu kombinací, které rodina zná - typicky 195
 * z 315. Jako pole čísel v JSON to zabralo 205 kB na rodinu, tedy třetinu
 * souboru, a **v prvním odhadu velikosti jsem na to úplně zapomněl**: počítal
 * jsem jen hodnoty a vyšlo mi 175 kB proti skutečným 685.
 *
 * Bitmapa je 40 bajtů na pravidlo místo sedmi set: 16 kB na rodinu místo 205.
 * Deduplikace seznamů by ušetřila jen 22 kB, protože se skoro neopakují -
 * měřeno 255 různých z 298.
 */
export function encodeComboMask(indices: readonly number[], total: number): string {
  const bytes = new Uint8Array(Math.ceil(total / 8));
  for (const index of indices) {
    if (index < 0 || index >= total) continue;
    bytes[index >> 3] |= 1 << (index & 7);
  }
  let binary = "";
  const step = 8192;
  for (let start = 0; start < bytes.length; start += step) {
    binary += String.fromCharCode(...bytes.subarray(start, start + step));
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

/** Zpět na indexy, vzestupně - v tom pořadí jdou i hodnoty. */
export function decodeComboMask(encoded: string, total: number): number[] {
  const binary = typeof atob === "function"
    ? atob(encoded)
    : Buffer.from(encoded, "base64").toString("binary");
  const out: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const byte = binary.charCodeAt(index >> 3);
    if (Number.isNaN(byte)) break;
    if ((byte >> (index & 7)) & 1) out.push(index);
  }
  return out;
}
