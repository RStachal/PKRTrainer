/**
 * Zápis EV tabulky do řetězce, aby se vešla do rozpočtu chunku.
 *
 * ## Proč vůbec
 *
 * EV musí být po kombinacích, ne po třídách ruk - změřeno: uvnitř jedné třídy se
 * EV rozchází až o čtrnáct blindů, takže průměr přes třídu neodpovídá žádné
 * konkrétní ruce a hráči by lhal. Po kombinacích je to ale kolem 134 tisíc
 * hodnot na rodinu, což jako obyčejná JSON čísla dá 650 až 780 KB proti rozpočtu
 * 512 KiB na jeden líný chunk.
 *
 * Šestnáctibitová celá čísla v base64 z toho udělají ~175 KB. Rozdíl není v
 * chytrosti, ale v tom, že se přestane platit za desetinné tečky, znaménka a
 * čárky, které nesou nula informace.
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

const MISSING = -32768;
const SCALE = 10;

/** Největší a nejmenší EV, které se do zápisu vejde, v blindech. */
export const EV_CODEC_RANGE_BB = { min: -3276.7, max: 3276.7 } as const;

function toBytes(values: readonly (number | null)[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  for (const [index, value] of values.entries()) {
    const scaled = value === null || Number.isNaN(value)
      ? MISSING
      : Math.max(-32767, Math.min(32767, Math.round(value * SCALE)));
    view.setInt16(index * 2, scaled, true);
  }
  return out;
}

/** EV v blindech na base64 řetězec šestnáctibitových desetin. */
export function encodeEvTable(values: readonly (number | null)[]): string {
  const bytes = toBytes(values);
  let binary = "";
  // Po částech, protože `String.fromCharCode(...bytes)` na stovkách tisíc
  // hodnot přeteče zásobník argumentů.
  const step = 8192;
  for (let start = 0; start < bytes.length; start += step) {
    binary += String.fromCharCode(...bytes.subarray(start, start + step));
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

/**
 * Kolik hodnot zápis doopravdy nese.
 *
 * `decodeEvTable` chybějící doplní `null`, aby nedopočítávala nuly - jenže tím
 * délka výsledku vždycky sedí na to, co si volající vyžádal, a posunutý zápis se
 * nepozná. Kdo potřebuje ověřit, že tabulka odpovídá očekávanému tvaru, musí se
 * zeptat na skutečnou délku, ne na délku výsledku.
 */
export function evTableLength(encoded: string): number {
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const bytes = Math.floor(encoded.length / 4) * 3 - padding;
  return Math.floor(bytes / 2);
}

/** Zpět na EV v blindech; `null` znamená akci, která pro tu kombinaci není. */
export function decodeEvTable(encoded: string, count: number): (number | null)[] {
  const binary = typeof atob === "function"
    ? atob(encoded)
    : Buffer.from(encoded, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  const out: (number | null)[] = [];
  for (let index = 0; index < count; index += 1) {
    if ((index + 1) * 2 > bytes.length) {
      // Kratší zápis, než kolik se čeká: radši `null` než dopočítaná nula.
      out.push(null);
      continue;
    }
    const raw = view.getInt16(index * 2, true);
    out.push(raw === MISSING ? null : raw / SCALE);
  }
  return out;
}
