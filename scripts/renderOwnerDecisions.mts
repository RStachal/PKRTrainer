import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { OWNER_DECISIONS_2026_09_17, renderOwnerDecisionsPage } from "./lib/ownerDecisions.mts";

/**
 * Stránka s otevřenými rozhodnutími vlastníka, k vyplnění.
 *
 *   npm run mtt:decisions [-- --out=artifacts/review-desk/rozhodnuti.html]
 *
 * Otázky bydlí v `lib/ownerDecisions.mts` (s čísly z měření a doporučením),
 * odpovědi se čtou zpátky přes `npm run mtt:decision-answers`. Stránka je
 * statická, bez odkazů ven, pamatuje si odpovědi podle identity otázky a píše
 * je i do textu, aby přežily „Uložit stránku".
 */

const outPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/review-desk/rozhodnuti.html";

const intro = `<p><b>Co je potřeba pro úspěšné dokončení</b> - stav k 17. 9. 2026, po třetím čtení draftu
(110 ze 118 sedí) a dnešním nálezu, že produkční packy byly dva měsíce snímek starých dat.</p>
<ol>
<li><b>ChipEV preflop je doručený a hlídaný:</b> 61 zpřesněných záznamů RYE + push/fold 10 bb z RYE ve všech
čtyřech profilech, letní opravy z tvých chartů poprvé v produkci, <code>mtt:preflop-drift</code> hlídá, že se
produkce od měřených dat znovu nerozejde. Zbývá tvoje slovo k 1, 2 a 7.</li>
<li><b>ICM ($EV) potřebuje tři rozhodnutí</b> (3, 4, 5) a pak asi tři bloky práce: katalog scénářů (stacky
sedaček z názvů stránek RYE), scénář v klíči otázky a v Question_ID, losování scénáře a stůl s napsanými stacky,
profil se scénářem v názvu, měření doručení. Bez 5 to bude bez ceny.</li>
<li><b>Zbytek korpusu RYE</b> (6): 200 ověřených mřížek, které import nepřekládá - RFI 40, rejam 33,
squeeze 14, BB proti limpu 11, multiway 42. Každá rodina = překlad slovníku + stejná cesta jako push/fold.
Bez tvého slova se nedělá nic.</li>
<li><b>Jam na 40 bb</b> (8) a <b>flopové piloty</b> (9) čekají jen na volbu.</li>
<li><b>Noci do pondělí</b> (10): bez tvé volby jedou riverové vrstvy pro turnovou EV (6 201 podher ve frontě,
~350 za noc, to stačí). S volbou 10a se od pátku přesolví 25bb rodiny s opravenými ranžemi.</li>
</ol>
<p>U každé otázky je doporučení a číslo, ze kterého plyne. Vyplň, ulož stránku (Ctrl+S) nebo zkopíruj
odpovědi tlačítkem, a pošli.</p>`;

const html = renderOwnerDecisionsPage(OWNER_DECISIONS_2026_09_17, {
  dateLabel: "17. 9. 2026",
  intro,
  storageKey: "drillev-decisions-2026-09-17",
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, "utf8");
console.log(`Vykresleno ${OWNER_DECISIONS_2026_09_17.length} rozhodnutí do ${outPath}`);
console.log("Otevři to v prohlížeči; stránka je statická a funguje offline.");
