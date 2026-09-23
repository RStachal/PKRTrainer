import { readdirSync } from "node:fs";
import { join } from "node:path";

import { readRyeRangeImageGrids, type RyeImageGrid } from "./lib/ryeRangeImageGrid.mts";

/**
 * Čtení obrázkových ranží RYE - a hlavně měření, jestli se čtou správně.
 *
 *   npm run mtt:rye-images -- --root="<cesta k db>" [--limit=20] [--file=<png>]
 *
 * Nic nezapisuje. Vypisuje, kolik obrázků se přečetlo, jak široké ranže v nich
 * jsou a **kolik buněk si v nich odporuje**: jam se záporným EV nebo fold
 * s kladným. Dokud ten počet není nula, dekódování se nesmí nikam propsat
 * (rozhodnutí vlastníka z 23. 9. 2026 u otázky 1: EV je kontrola dekódování).
 */

const root = process.argv.find((a) => a.startsWith("--root="))?.slice("--root=".length);
const single = process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length);
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? "0");

if (root === undefined && single === undefined) {
  console.error('Usage: npm run mtt:rye-images -- --root="<cesta k db>" [--limit=20] [--file=<png>]');
  process.exit(2);
}

function listImages(base: string): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(base).filter((name) => /^(Reshove|Openshove)_\d+bb$/i.test(name))) {
    for (const file of readdirSync(join(base, dir)).filter((name) => name.toLowerCase().endsWith(".png"))) {
      out.push(join(base, dir, file));
    }
  }
  return out.sort();
}

const files = single !== undefined ? [single] : listImages(root as string);
const chosen = limit > 0 ? files.slice(0, limit) : files;

const grids: RyeImageGrid[] = [];
const unreadable: string[] = [];
for (const file of chosen) {
  const found = readRyeRangeImageGrids(file);
  if (found.length === 0) unreadable.push(file);
  else grids.push(...found);
}

const withConflicts = grids.filter((grid) => grid.signConflicts.length > 0);
const conflictCells = withConflicts.reduce((sum, grid) => sum + grid.signConflicts.length, 0);
const unreadableCells = grids.reduce((sum, grid) => sum + grid.unreadableSigns.length, 0);

console.log("Obrázkové ranže RYE");
console.log("");
console.log(`obrázků: ${chosen.length}, přečteno: ${grids.length}, nečitelných: ${unreadable.length}`);
console.log(`buněk celkem: ${grids.length * 169}`);
console.log(`  znaménko nečitelné: ${unreadableCells} (${(unreadableCells / Math.max(1, grids.length * 169) * 100).toFixed(1)} %)`);
console.log(`  barva proti znaménku: ${conflictCells} v ${withConflicts.length} obrázcích`);
console.log("");

const shares = grids.map((grid) => grid.jamShare).sort((left, right) => left - right);
if (shares.length > 0) {
  const at = (q: number): string => `${(shares[Math.min(shares.length - 1, Math.round(shares.length * q))] * 100).toFixed(1)} %`;
  console.log(`šířka jamovací range: nejužší ${at(0)}, medián ${at(0.5)}, nejširší ${at(0.999)}`);
}

for (const grid of withConflicts.slice(0, 8)) {
  console.log("");
  console.log(`${grid.file.split(/[\\/]/).slice(-2).join("/")}: ${grid.signConflicts.length} sporů`);
  for (const conflict of grid.signConflicts.slice(0, 6)) console.log(`  ${conflict}`);
}
for (const file of unreadable.slice(0, 5)) console.log(`nečitelný: ${file}`);

console.log("");
console.log("Nic se nezapsalo, a zatím ani nemůže.");
console.log("");
console.log("Barvy se čtou spolehlivě: naměřeno 23. 9. 2026 na 20bb_reshove_BBvsBTN,");
console.log("že dekodér najde přesně těch 33 zelených buněk, které v obrázku jsou.");
console.log("Znaménko EV ale ne. Přečte se 89 % buněk a z nich skoro čtvrtina");
console.log("odporuje barvě - nejvíc u vybledlých buněk s EV kolem nuly, kde je text");
console.log("světle šedý a tenký. Šest pokusů s heuristikami (shluky řádků, pevné okno,");
console.log("svislý rozsah, hledání rámečku) skončilo tady; dál to chce porovnávání");
console.log("se vzorem obou glyfů, ne další pravidlo. Dokud ta kontrola nefunguje,");
console.log("nemá z obrázků vzniknout pack: vlastník ji určil jako podmínku (otázka 1).");
