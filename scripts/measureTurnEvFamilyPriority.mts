/**
 * Které turnové rodiny dodat EV, když se nevejdou všechny.
 *
 *   npm run mtt:turn-ev-priority
 *
 * ## Proč to je potřeba
 *
 * Turnová EV je spočitatelná (body 203-211), ale všech 48 rodin je 21,5 MB raw
 * proti 11,6 MB volným v součtu líné knihovny. Otázka pro majitele proto zněla
 * "zvednout strop, nebo vybrat rodiny" - jenže druhá možnost byla prázdná,
 * dokud nikdo neřekl **které**. Tenhle skript to spočítá.
 *
 * ## Jak se měří, co se rozdává
 *
 * Ne podle toho, kolik má rodina pravidel, ale kolik spotů z ní trenažér
 * **rozdá**. Katalog `solvedTurnSpots` je přesně to, z čeho se losuje, a losuje
 * se z něj rovnoměrně - takže podíl rodiny na katalogu je podíl na rozdaných
 * spotech. Řadit podle pravidel by upřednostnilo rodiny s hodně deskami, i
 * kdyby se hráči skoro nerozdávaly.
 *
 * ## Odkud je cena
 *
 * Měřeno na čtyřech rodinách (bod 211): 330 az 492 KiB raw na rodinu, průměr
 * 448, a 62 az 99 KiB gzip, průměr 79. Dvě ze čtyř narazily na strop chunku a
 * byly ořezané, takže skutečná poptávka je u nich vyšší - průměr je tedy spíš
 * spodní odhad a počet rodin, které se vejdou, spíš horní.
 *
 * ## Proč se počítá proti dvěma stropům
 *
 * Do 10. 9. 2026 tenhle skript porovnával jen **raw** a vyšlo z toho "26 rodin,
 * 63,5 % rozdaných spotů". Jenže součtové stropy jsou dva a rozhoduje ten
 * přísnější - a to je gzip. Volno je 11,6 MB raw, ale jen **1,6 MB gzip**, takže
 * gzip kousne o šest rodin dřív. `checkBundleBudget` to má napsané v hlavičce:
 * "ze dvou součtových stropů jen gzip měří něco skutečného: kolik se toho po
 * drátě přenese; raw zůstává jako pojistka proti řádovému skoku". Měřit proti
 * volnějšímu z nich znamená slíbit místo, které tam není.
 */
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { solvedTurnSpots } from "../src/data/ranges/solvedTurnSpotCatalogue";

// Packy se načítají líně; bez tohohle je katalog prázdný.
await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");

/** Volno v součtu líné knihovny, v KiB. Změřeno 10. 9. 2026 `npm run bundle:budget`:
 *  raw 53 674 z 65 536, gzip 6 570 z 8 192. */
const FREE_RAW_KIB = 65_536 - 53_674;
const FREE_GZIP_KIB = 8_192 - 6_570;
/**
 * Průměrná tabulka na rodinu, v KiB.
 *
 * Šest změřených rodin: 20/25/35/40 bb (bod 211) a dvě padesátiblindové
 * (10. 9. 2026). Gzip: 88, 62, 66, 99, 86, 102 - průměr 84.
 *
 * **Je to spodní odhad ceny, tedy horní odhad počtu rodin.** Obě hluboké rodiny
 * vyšly nad průměrem (86 a 102) a v první dvacítce podle rozdávanosti hluboké
 * rodiny jsou, takže skutečný počet, který se vejde, bude spíš nižší. Přesně to
 * se odhadem nezjistí - musí se stavět v pořadí podle dosahu a přestat, až je
 * součtový rozpočet plný.
 */
const TABLE_KIB = 448;
const TABLE_GZIP_KIB = 84;

const spots = solvedTurnSpots();
const byFamily = new Map<string, number>();
for (const spot of spots) {
  // Adresář je `<rodina>__<deska>`; EV se dodává po rodinách, ne po deskách.
  const family = spot.sourceDirectory.split("__")[0];
  // **Vážené dosahem, ne počtem.** Trenažér losuje přes `pickSolvedSpotByReach`,
  // takže spot s dvojnásobným dosahem se rozdá dvakrát častěji. Počítat kusy by
  // měřilo, co je v katalogu, ne co hráč dostane - a protože každý pack dodá
  // ~260 pravidel podle stropu, vyšlo by ploché 2,1 % na rodinu.
  byFamily.set(family, (byFamily.get(family) ?? 0) + spot.reach);
}

const ranked = [...byFamily].sort((left, right) => right[1] - left[1]);
const total = [...byFamily.values()].reduce((sum, value) => sum + value, 0);

console.log(`katalog turnových spotů: ${spots.length} spotů v ${ranked.length} rodinách`);
const fitsRaw = Math.floor(FREE_RAW_KIB / TABLE_KIB);
const fitsGzip = Math.floor(FREE_GZIP_KIB / TABLE_GZIP_KIB);
const fits = Math.min(fitsRaw, fitsGzip);
console.log(`volno v součtu líné knihovny: ${(FREE_RAW_KIB / 1024).toFixed(1)} MB raw`
  + ` / ${(FREE_GZIP_KIB / 1024).toFixed(1)} MB gzip`);
console.log(`tabulka na rodinu ~${TABLE_KIB} KiB raw / ~${TABLE_GZIP_KIB} KiB gzip`);
console.log(`vejde se: ${fitsRaw} rodin podle raw, ${fitsGzip} podle gzip`);
console.log(`rozhoduje ten přísnější, tedy **${fits}** rodin ze ${ranked.length}`
  + `${fitsGzip < fitsRaw ? " - kousne gzip, ne raw" : ""}`);
console.log("");

console.log("kolik rozdaných spotů pokryje prvních N rodin podle rozdávanosti:");
let running = 0;
for (const [index, [, count]] of ranked.entries()) {
  running += count;
  const position = index + 1;
  if (position % 5 === 0 || position === fits || position === ranked.length) {
    const mark = position === fits ? "  <- sem sahá volné místo" : "";
    console.log(`  ${position.toString().padStart(2)} rodin: ${(100 * running / total).toFixed(1)} %`
      + ` rozdaných spotů, ${((position * TABLE_KIB) / 1024).toFixed(1)} MB raw`
      + ` / ${((position * TABLE_GZIP_KIB) / 1024).toFixed(2)} MB gzip${mark}`);
  }
}

console.log("");
console.log("nejrozdávanější rodiny:");
for (const [family, count] of ranked.slice(0, 12)) {
  console.log(`  ${(100 * count / total).toFixed(1).padStart(5)} %  ${count.toFixed(1).padStart(6)}`
    + `  ${family}`);
}
console.log("");
console.log("nejméně rozdávané:");
for (const [family, count] of ranked.slice(-5)) {
  console.log(`  ${(100 * count / total).toFixed(1).padStart(5)} %  ${count.toFixed(1).padStart(6)}`
    + `  ${family}`);
}
