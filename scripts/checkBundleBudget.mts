import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  isLazyMttProductionAsset,
  isPreflopEquityAsset,
  isSolvedManifestAsset,
  isSolvedStreetAsset,
} from "../src/pwa/precacheManifestBuild";

const DIST_ASSETS_DIR = join(process.cwd(), "dist", "assets");
const MAX_JS_KB = numberFromEnv("BUNDLE_MAX_JS_KB", 325);

/**
 * Strop na jeden nelíný soubor, v gzipu.
 *
 * Zvednuto z 86 na 96 dne 21. 8. 2026, a je to vědomý ústupek se změřenou
 * příčinou, ne úhyb před rozpočtem. Hlavní balík nese manifesty vyřešených
 * rodin - seznam dvojic (jméno rodiny, cesta k chunku) plus volání `import()`,
 * podle kterého bundler chunky vůbec rozdělí. **Ten seznam roste s obsahem:**
 * naměřeno zhruba 23 bajtů gzipu na rodinu, dnes 47 flopových, 19 turnových a
 * 17 riverových. Když jich za jednu noc přibylo 28, hlavní balík povyrostl z
 * 85,45 na 86,16 KiB a o šestnáct setin přeteklo.
 *
 * Zhuštění manifestu se měřilo a nevyplatí se: odvozený `packId`, vytčený
 * `profileKey` a společný loader srazí syrovou velikost z 15 437 na 7 550 B, ale
 * v gzipu jen z 1 132 na 1 029 - opakování si gzip poradí sám. Snížit tohle
 * číslo jde jedině tím, že se manifesty sundají z instalační cesty, což je jiná
 * práce než posunout konstantu.
 *
 * Co instalační cestu doopravdy hlídá, je součet (`MAX_PRECACHE_GZIP_KB`, dnes
 * 128) - a ten má rezervu: 109,89 KiB. Tenhle strop je druhá pojistka na jeden
 * soubor, ne ta hlavní.
 */
const MAX_GZIP_KB = numberFromEnv("BUNDLE_MAX_GZIP_KB", 96);
/**
 * Syrový součet instalační cesty, ve stovkách kB.
 *
 * **Zvednuto ze 400 na 416 dne 25. 8. 2026**, protože doručení akcí a blafů do
 * matice range přidalo kolem 8,4 KiB syrového kódu (kbelíky vyřešeného pravidla,
 * dvojrežim barvení matice, přednačtení tabulky EV). Naměřeno 404,94 KiB.
 *
 * Zvedá se **druhá pojistka, ne ta hlavní**: instalační cestu doopravdy hlídá
 * `MAX_PRECACHE_GZIP_KB` (128) a ten má rezervu - naměřeno 111,97 KiB, tedy
 * 16 KiB volných. Hlavní chunk je 319,19 KiB proti vlastnímu stropu 325.
 *
 * Osm kilobajtů za funkci, kterou majitel nahlásil jako chybějící, je poměr,
 * který obstojí. Kdyby se ten strop zvedal podruhé bez podobného protějšku,
 * patří místo toho sundat matici z instalační cesty - vykresluje se až po
 * odpovědi, takže na startu relace není k ničemu.
 */
const MAX_PRECACHE_JS_KB = numberFromEnv("BUNDLE_MAX_PRECACHE_JS_KB", 416);
const MAX_PRECACHE_GZIP_KB = numberFromEnv("BUNDLE_MAX_PRECACHE_GZIP_KB", 128);
/**
 * Syrový strop na **jeden** líný chunk, v kB.
 *
 * **Zvednuto z 512 na 520 dne 25. 8. 2026.** Na rozdíl od součtu celé knihovny
 * je tohle strop, který doopravdy platí hráč: tenhle chunk se stáhne a rozparsuje,
 * jakmile na něj dojde.
 *
 * Zvedá se proto s naměřenou A/B, ne od oka. `mtt-postflop-pilot-runtime`:
 *
 * | | raw | gzip |
 * |---|---|---|
 * | bez doručení akcí do matice | 510,80 KiB | — |
 * | s ním | **513,70 KiB** | 66,18 KiB |
 *
 * Stojí to tedy **2,9 KiB** a kód se do žádného dalšího chunku nekopíruje
 * (ověřeno: jeden výskyt v celém `dist`). Co za to hráč dostane, je barva akce
 * a blafovací lajna v matici na všech třech ulicích - tedy to, co majitel
 * nahlásil jako chybějící. Gzip toho chunku je přitom 66 ze 128 KiB.
 *
 * Na 520, ne výš: zbývá kolem šesti kilobajtů, takže příští růst zase kousne.
 *
 * **Kouslo to 26. 8. 2026 na 520,26 KiB, tedy o 266 bajtů, a strop jde na 528.**
 * Rostl týž chunk a ze známého důvodu: EV dostalo všech 47 riverových rodin
 * místo sedmnácti, takže `riverEvManifest.generated.ts` povyrostl z 5 147 na
 * 12 695 bajtů. Manifest nese jeden `import()` na rodinu a leží v runtime
 * chunku, protože se z něj vybírá, která tabulka se má načíst.
 *
 * A/B `mtt-postflop-pilot-runtime`:
 *
 * | | raw | gzip |
 * |---|---|---|
 * | 17 rodin s EV | 513,70 KiB | 66,18 KiB |
 * | **47 rodin s EV** | **520,26 KiB** | **65,34 KiB** |
 *
 * Stojí to 6,56 KiB syrově a **po drátě nic: gzip klesl o 0,84 KiB.** Třicet
 * nových položek manifestu je skoro identický text, takže se zkomprimuje pryč -
 * raw roste, přenos ne. Hráč za to dostane EV akcí na 89,7 % rozdaných
 * riverových spotů místo 30,0 % (`npm run mtt:post-answer`).
 *
 * Gzip toho chunku je 65 ze 128 KiB, takže tady místo je. Až raw dojde i na
 * 528, patří sáhnout po manifestu samotném, ne po stropu: 47 řádků boilerplatu
 * se dá vygenerovat kratší, aniž by se cokoli hnulo v obsahu.
 */
const MAX_LAZY_MTT_JS_KB = numberFromEnv("BUNDLE_MAX_LAZY_MTT_JS_KB", 528);
/**
 * Strop na **jeden chunk tabulky turnové EV**, zvlášť od strategických packů.
 *
 * **Přidáno 11. 9. 2026 na rozhodnutí majitele („zvednout obojí").** Do té doby
 * platil pro tabulky týž strop jako pro packy (528 / 128) a generátor na něj
 * ořezával: 21 ze 48 rodin sedělo na stropu a z řádků, které jsou nad prahem
 * a tedy dodatelné, **zahodil ořez čtvrtinu** (bod 236). Rozpočtová křivka
 * (`mtt:turn-ev-pack -- --budget-curve`, 24 rodin) ukázala lineární výnos:
 * 1 024 KiB koupí +28,1 % dodaných řádků za +25,8 % velikosti.
 *
 * Tohle je ten strop, který **platí hráč**: chunk se stáhne, když na rodinu
 * dojde. Při 1 024 raw je gzip kolem 150 az 200 KiB na rodinu. Dvojnásobek by
 * dodal zbylých 7 % za 300 az 400 KiB - to se nechává na příště, s čísly.
 *
 * Generátor ořezává na 1 024 KiB raw a 256 gzip (`TURN_EV_BUDGET_BYTES`);
 * tady je rezerva na obálku chunku, stejně jako u packů (500 proti 528).
 */
const MAX_TURN_EV_JS_KB = numberFromEnv("BUNDLE_MAX_TURN_EV_JS_KB", 1100);
const MAX_TURN_EV_GZIP_KB = numberFromEnv("BUNDLE_MAX_TURN_EV_GZIP_KB", 272);
const MAX_LAZY_MTT_GZIP_KB = numberFromEnv("BUNDLE_MAX_LAZY_MTT_GZIP_KB", 128);
/**
 * Syrový součet **celé** líné knihovny, v kB.
 *
 * **Zvednuto z 32 768 na 45 056 (32 -> 44 MB) dne 25. 8. 2026 a je to
 * prozatímní číslo, které smí majitel kdykoli vrátit.** Zapisuji sem měření,
 * aby se o tom dalo rozhodnout, ne aby to vypadalo rozhodnuté.
 *
 * Noc z 24. na 25. 8. dodala 46 nových rodin a knihovna povyrostla z 28,5 na
 * 41,5 MB, tedy o 9,5 MB nad tehdejší strop. Rozklad:
 *
 * | skupina | kusů | raw | gzip |
 * |---|---|---|---|
 * | river | 64 | 22,6 MB | 2,7 MB |
 * | turn | 48 | 14,8 MB | 1,1 MB |
 * | flop | 48 | 3,5 MB | 0,3 MB |
 *
 * **Proč to jde zvednout:** tenhle strop měří velikost celé knihovny, kterou
 * žádný jednotlivý hráč nestáhne - rodiny se stahují po jedné, až na ni dojde.
 * Co platí hráč, hlídají jiné stropy a ty mají rezervu: na jeden chunk 512 KiB
 * raw a 128 KiB gzip, a gzip celé knihovny je 4,2 z 8 MB.
 *
 * **Proč jen na 44, ne výš:** rezerva je zhruba 2,5 MB, tedy pár nocí. Vyšší
 * číslo by znamenalo, že knihovna zase poroste bez povšimnutí; takhle brána
 * příště kousne a rozhodne se znovu, s novými čísly.
 *
 * Kdyby se to mělo naopak srazit pod 32, nejlevnější cesta je river: je to 54 %
 * syrové velikosti a nejnovější obsah, takže by se ořezával podle změřené
 * poptávky (`mtt:solved-coverage --json`), ne podle abecedy.
 *
 * **Potřetí, z 54 272 na 65 536 (53 -> 64 MB), dne 27. 8. 2026 - a naposled,
 * protože se tím mění role tohohle stropu.** Změřena trajektorie na dvou
 * po sobě jdoucích nocích: raw roste o **1 232 KiB za noc**, gzip o **159 KiB**.
 * Po ranním dodání je raw 53 498,51 z 54 272 (rezerva 773 KiB, tedy **méně než
 * jedna noc**) a gzip 6 491,54 z 8 192 (rezerva na deset nocí).
 *
 * Zvedat raw každé dvě noci není strategie, je to sesouvání. Proto jde rovnou
 * tam, kde jako první kousne **gzip** - a to je správně, protože ze dvou
 * součtových stropů jen gzip měří něco skutečného: kolik se toho po drátě
 * přenese. Raw zůstává jako pojistka proti řádovému skoku (překlep v generátoru,
 * nezmenšený formát), ne jako denní brzda.
 *
 * Až kousne gzip, **další zvednutí není odpověď**: tehdy se má ořezávat podle
 * změřené poptávky (`mtt:solved-coverage --json`), protože v tu chvíli už jde
 * o to, co hráč stahuje.
 *
 * Na co si dát pozor: halda buildu je na 8 GB a při 53 MB knihovny prošla; při
 * 64 MB to nikdo neměřil, takže první pád buildu na paměti je očekávatelný jev,
 * ne záhada.
 *
 * Historie:
 *
 * **Počtvrté, raw 76 800 -> 84 992 a gzip 11 264 -> 12 288, dne 11. 9. 2026.**
 * Den po dodání turnové EV se změřilo, že z řádků nad prahem zahodí ořez na
 * 500 KiB čtvrtinu (bod 236). Majitel rozhodl zvednout strop modulu i součtu -
 * a zároveň řekl, že při dalším narážení přijde na řadu silnější stroj a že
 * se chystá **cash game a SNG**, tedy další násobky celé knihovny. Tohle je
 * tedy vědomě krátkodobé zvednutí konstanty, ne strategie; příští návrh má
 * obsahovat i dělení knihovny po variantách (profil se vybírá při startu
 * relace, hráč nikdy nepotřebuje víc než jednu). Očekáváno po přestavbě:
 * raw kolem 80 000 KiB (rezerva ~4 noci), gzip kolem 10 800 (rezerva ~9).
 *
 * **Zvednuto potřetí, raw 65 536 -> 76 800 a gzip 8 192 -> 11 264, dne
 * 10. 9. 2026.** Majitel zvolil dodat turnovou EV **všem 48 rodinám**, a tohle
 * je poprvé, kdy se zvedá i gzip. Neodporuje to větě výš („až kousne gzip,
 * další zvednutí není odpověď"): ta míří na růst z nocí, tedy na sesouvání.
 * Tohle je jednorázové rozhodnutí o obsahu, změřené předem a se známou cenou.
 *
 * Změřeno **dřív, než ta data vznikla** - sondou, která nasadí kopie skutečných
 * tabulek pod jmény zbylých rodin (`npm run mtt:turn-ev-build-probe`):
 *
 * | | před | s 48 tabulkami |
 * |---|---|---|
 * | lazy raw | 53 674 KiB | **74 012 KiB** |
 * | lazy gzip | 6 570 KiB | **10 410 KiB** |
 * | chunků | 197 | 245 |
 *
 * **Proč gzip na 11 264, a ne na 10 496, jak vycházelo ze sondy:** sonda
 * kopírovala čtyři nejmenší změřené tabulky (průměr 80 KiB gzip), kdežto průměr
 * ze šesti skutečně změřených rodin je **84,7**. Skutečný součet tedy vyjde
 * kolem 10 640 KiB a strop 10 496 by byl **pod ním**. Jedenáct MiB nechává
 * rezervu ~620 KiB, tedy zhruba čtyři noci při naměřených 159 KiB za noc.
 *
 * **A co sonda našla vedle toho** (bod 230): tabulky se do součtu líné knihovny
 * vůbec nedostaly, protože `mttProductionChunkNameForModuleId` neznalo
 * `/ranges/turn-ev/`. Chunky dostaly jméno podle souboru, precache je vzal za
 * nutné a **instalační cesta vyskočila z 386 KiB na 20 732 KiB raw / 3 953 KiB
 * gzip**. Ten soubor přitom u téhož pravidla varuje, že je to potřetí táž past.
 *
 * **Halda buildu:** při 74 MB knihovny `vite build` na 8 GB **spadl**
 * („Ineffective mark-compacts near heap limit"), na 12 GB projde za 2 m 9 s.
 * Varování o tom stálo v tomhle souboru od 26. 8. a teď je změřené.
 *
 * **Zvednuto podruhé, z 45 056 na 54 272 (44 -> 53 MB), dne 26. 8. 2026.**
 * Tentokrát to nepřinesla noc, ale rozhodnutí, které mi majitel předal: EV akcí
 * dostalo všech 47 riverových rodin místo sedmnácti.
 *
 * | | raw | gzip | EV na rozdaných riverech |
 * |---|---|---|---|
 * | 17 rodin s EV | 44 070,71 KiB | 4 411,50 KiB | 30,0 % |
 * | **47 rodin s EV** | **52 266,69 KiB** | **6 332,10 KiB** | **89,7 %** |
 *
 * **Proč to jde utratit takhle:** tenhle strop měří knihovnu jako celek, kterou
 * nikdo nestahuje najednou. Co platí hráč, je jedna tabulka na rodinu, a ta je
 * 260 KiB raw / 74 KiB gzip proti stropům 528 a 128 - tedy s rezervou. Gzip
 * celé knihovny zůstal 6,2 z 8 MB, takže druhý součtový strop ani nezakolísal.
 *
 * **Proč na 53, ne výš:** rezerva je 1,96 MB, zhruba jedna noc. Kdyby se strop
 * dal rovnou na 64, knihovna by rostla bez povšimnutí; takhle se o ní rozhodne
 * znovu, s čerstvými čísly. To je jediný důvod, proč tenhle strop existuje -
 * není to kontrola správnosti, je to místo, kde se růst musí obhájit.
 *
 * Pozor na jednu věc, která se u téhle změny našla: `tsc --noEmit` běžel na
 * výchozích 4 GB a na 47 tabulkách **spadl na haldě**, protože je při
 * `resolveJsonModule` čte všechny. Není to vada obsahu ani typů, je to zděděná
 * mez - proto má `build` i `typecheck` v `package.json` explicitních 8 GB.
 */
const MAX_LAZY_MTT_TOTAL_JS_KB = numberFromEnv("BUNDLE_MAX_LAZY_MTT_TOTAL_JS_KB", 84992);
const MAX_LAZY_MTT_TOTAL_GZIP_KB = numberFromEnv(
  "BUNDLE_MAX_LAZY_MTT_TOTAL_GZIP_KB",
  12288,
);
// The equity table is fetched when a session starts, so it is off the install
// path and does not belong in the precache totals - but it is not an MTT
// production pack either, and folding it into that bucket would hide it behind a
// 32 MB allowance. Its own line, sized just above what the table costs today, so
// growth has to be deliberate.
const MAX_DEFERRED_JS_KB = numberFromEnv("BUNDLE_MAX_DEFERRED_JS_KB", 140);
const MAX_DEFERRED_GZIP_KB = numberFromEnv("BUNDLE_MAX_DEFERRED_GZIP_KB", 52);

let hasFailure = false;

if (!existsSync(DIST_ASSETS_DIR)) {
  console.error("Bundle budget check needs a built dist/assets directory. Run npm run build first.");
  process.exit(1);
}

const jsFiles = readdirSync(DIST_ASSETS_DIR)
  .filter((file) => file.endsWith(".js"))
  .sort();

if (jsFiles.length === 0) {
  console.error("Bundle budget check found no JS assets in dist/assets.");
  process.exit(1);
}

console.log("\n=== Bundle budget ===");
console.log(`max raw JS asset: ${MAX_JS_KB} KiB`);
console.log(`max gzip JS asset: ${MAX_GZIP_KB} KiB`);

let precacheRawKb = 0;
let precacheGzipKb = 0;
let lazyMttRawKb = 0;
let lazyMttGzipKb = 0;
let lazyMttCount = 0;
let deferredRawKb = 0;
let deferredGzipKb = 0;
let deferredCount = 0;

for (const file of jsFiles) {
  const path = join(DIST_ASSETS_DIR, file);
  const rawBytes = statSync(path).size;
  const gzipBytes = gzipSync(readFileSync(path)).length;
  const rawKb = bytesToKiB(rawBytes);
  const gzipKb = bytesToKiB(gzipBytes);

  console.log(`${file}: raw=${rawKb.toFixed(2)} KiB gzip=${gzipKb.toFixed(2)} KiB`);

  // A solved turn family is budgeted with the lazy MTT content it is: fetched
  // per profile, never on the install path, and capped per chunk so one family
  // cannot grow without anyone noticing.
  const lazyMttProduction = isLazyMttProductionAsset(file) || isSolvedStreetAsset(file);
  // Manifest je odložený stejně jako obsah, který popisuje: stahuje se teprve
  // když se o vyřešené rodiny někdo přihlásí. Bez tohohle řádku by ho rozpočet
  // počítal do instalační cesty, ačkoli tam není - tedy měřil něco jiného, než
  // co hráč zaplatí.
  const deferred = isPreflopEquityAsset(file) || isSolvedManifestAsset(file);
  if (lazyMttProduction) {
    lazyMttCount += 1;
    lazyMttRawKb += rawKb;
    lazyMttGzipKb += gzipKb;
  } else if (deferred) {
    deferredCount += 1;
    deferredRawKb += rawKb;
    deferredGzipKb += gzipKb;
  } else {
    precacheRawKb += rawKb;
    precacheGzipKb += gzipKb;
  }

  // Tabulka turnové EV má vlastní strop na chunk. Je to jediný druh obsahu,
  // u kterého majitel 11. 9. 2026 rozhodl vyměnit místo za dodání (viz
  // MAX_TURN_EV_JS_KB níž); strategické packy zůstávají na 528 / 128.
  const turnEv = /^mtt-turn-ev-solved-/.test(file);
  const rawLimit = turnEv
    ? MAX_TURN_EV_JS_KB
    : lazyMttProduction
      ? MAX_LAZY_MTT_JS_KB
      : deferred ? MAX_DEFERRED_JS_KB : MAX_JS_KB;
  const gzipLimit = turnEv
    ? MAX_TURN_EV_GZIP_KB
    : lazyMttProduction
      ? MAX_LAZY_MTT_GZIP_KB
      : deferred ? MAX_DEFERRED_GZIP_KB : MAX_GZIP_KB;
  if (rawKb > rawLimit) {
    hasFailure = true;
    console.error(`${file} exceeds raw JS budget: ${rawKb.toFixed(2)} KiB > ${rawLimit} KiB`);
  }
  if (gzipKb > gzipLimit) {
    hasFailure = true;
    console.error(`${file} exceeds gzip JS budget: ${gzipKb.toFixed(2)} KiB > ${gzipLimit} KiB`);
  }
}

console.log(
  `precache JS total: raw=${precacheRawKb.toFixed(2)} KiB gzip=${precacheGzipKb.toFixed(2)} KiB`,
);
console.log(
  `lazy MTT JS total: count=${lazyMttCount} raw=${lazyMttRawKb.toFixed(2)} KiB ` +
    `gzip=${lazyMttGzipKb.toFixed(2)} KiB`,
);

console.log(
  `deferred JS total: count=${deferredCount} raw=${deferredRawKb.toFixed(2)} KiB ` +
    `gzip=${deferredGzipKb.toFixed(2)} KiB`,
);

checkTotalBudget("precache raw JS", precacheRawKb, MAX_PRECACHE_JS_KB);
checkTotalBudget("precache gzip JS", precacheGzipKb, MAX_PRECACHE_GZIP_KB);
checkTotalBudget("lazy MTT raw JS", lazyMttRawKb, MAX_LAZY_MTT_TOTAL_JS_KB);
checkTotalBudget("lazy MTT gzip JS", lazyMttGzipKb, MAX_LAZY_MTT_TOTAL_GZIP_KB);

if (hasFailure) {
  process.exitCode = 1;
}

function checkTotalBudget(label: string, actualKb: number, limitKb: number): void {
  if (actualKb <= limitKb) return;
  hasFailure = true;
  console.error(`${label} exceeds budget: ${actualKb.toFixed(2)} KiB > ${limitKb} KiB`);
}

function bytesToKiB(bytes: number): number {
  return bytes / 1024;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}
