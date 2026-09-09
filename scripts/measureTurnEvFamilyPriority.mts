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
 * 448. Dvě ze čtyř narazily na strop chunku a byly ořezané, takže skutečná
 * poptávka je u nich vyšší - průměr je tedy spíš spodní odhad a počet rodin,
 * které se vejdou, spíš horní.
 */
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { solvedTurnSpots } from "../src/data/ranges/solvedTurnSpotCatalogue";

// Packy se načítají líně; bez tohohle je katalog prázdný.
await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");

/** Volno v součtu líné knihovny, v KiB (bod 208). */
const FREE_RAW_KIB = 11_865;
/** Průměrná tabulka na rodinu, v KiB (bod 211). */
const TABLE_KIB = 448;

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
console.log(`volno v součtu líné knihovny: ${(FREE_RAW_KIB / 1024).toFixed(1)} MB`
  + `, tabulka na rodinu ~${TABLE_KIB} KiB`);
const fits = Math.floor(FREE_RAW_KIB / TABLE_KIB);
console.log(`vejde se tedy zhruba ${fits} rodin ze ${ranked.length}`);
console.log("");

console.log("kolik rozdaných spotů pokryje prvních N rodin podle rozdávanosti:");
let running = 0;
for (const [index, [, count]] of ranked.entries()) {
  running += count;
  const position = index + 1;
  if (position % 5 === 0 || position === fits || position === ranked.length) {
    const mark = position === fits ? "  <- sem sahá volné místo" : "";
    console.log(`  ${position.toString().padStart(2)} rodin: ${(100 * running / total).toFixed(1)} %`
      + ` rozdaných spotů, ${((position * TABLE_KIB) / 1024).toFixed(1)} MB${mark}`);
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
