import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readRyeGrid, type RyeGrid } from "./lib/ryeRangeCorpus.mts";

/**
 * Kolik mřížek ranží z vlastníkova korpusu se dá přečíst **prokazatelně**.
 *
 *   npm run mtt:rye-corpus -- --source="<cesta k db>" [--json]
 *
 * ## Proč se to měří, než se z toho něco dodá
 *
 * Korpus je velký (stovky souborů) a mohl by se dodat jako obsah, který
 * knihovna dnes nemá - zejména ICM, kvůli kterému stojí 32 řádků. Jenže dodat
 * ranže, které jsem přečetl špatně, je horší než je nedodat: hráč by dostal
 * doporučení, které nikdo netvrdil, s cedulkou, že je z měřeného zdroje.
 *
 * Proto se nejdřív měří, kolik souborů projde **vlastní kontrolou stránky**:
 * mřížka se spočítá s vahami a musí sednout na počty kombinací, které legenda
 * sama uvádí. Co nesedne, se nevydá a je vidět, kolik toho je.
 *
 * Tenhle skript nic nezapisuje. Je to podklad k rozhodnutí, ne import.
 */

const asJson = process.argv.includes("--json");
const source = process.argv.find((arg) => arg.startsWith("--source="))?.split("=").slice(1).join("=");

if (source === undefined) {
  console.error('Usage: npm run mtt:rye-corpus -- --source="<cesta ke složce db>"');
  process.exit(2);
}

function htmlFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (entry.toLowerCase().endsWith(".html")) found.push(path);
  }
  return found;
}

const files = htmlFiles(source).sort();
const grids: RyeGrid[] = [];
let notAGrid = 0;
for (const file of files) {
  const grid = readRyeGrid(file);
  if (grid === undefined) notAGrid += 1;
  else grids.push(grid);
}

const verified = grids.filter((grid) => grid.mismatches.length === 0);
const failed = grids.filter((grid) => grid.mismatches.length > 0);

/** Skupina podle předpony jména, tedy typu situace: ICM, OP, F3B, ... */
function groupOf(grid: RyeGrid): string {
  const name = grid.file.split(/[\\/]/).pop() ?? "";
  return (/^[A-Za-z0-9]+/.exec(name)?.[0] ?? "?").toUpperCase();
}

const byGroup = new Map<string, { total: number; ok: number; combos: number }>();
for (const grid of grids) {
  const key = groupOf(grid);
  const row = byGroup.get(key) ?? { total: 0, ok: 0, combos: 0 };
  row.total += 1;
  if (grid.mismatches.length === 0) {
    row.ok += 1;
    for (const value of grid.combosByColor.values()) row.combos += value;
  }
  byGroup.set(key, row);
}

const actions = new Map<string, number>();
for (const grid of verified) {
  for (const entry of grid.legend) {
    actions.set(entry.action, (actions.get(entry.action) ?? 0) + 1);
  }
}

if (asJson) {
  console.log(JSON.stringify({
    files: files.length,
    grids: grids.length,
    verified: verified.length,
    failed: failed.map((grid) => ({
      file: grid.file.split(/[\\/]/).pop(),
      mismatches: grid.mismatches,
    })),
    actions: [...actions].sort((left, right) => right[1] - left[1]),
  }, null, 2));
} else {
  console.log("Mřížky ranží z vlastníkova korpusu: co se dá přečíst prokazatelně");
  console.log("");
  console.log(`souborů celkem:        ${files.length}`);
  console.log(`z toho mřížek 169 buněk: ${grids.length}  (zbytek jsou rozcestníky: ${notAGrid})`);
  console.log(`ověřeno proti legendě:  ${verified.length}`);
  console.log(`neshoda, nevydá se:     ${failed.length}`);
  console.log("");
  console.log("skupina".padEnd(14) + "mřížek".padStart(8) + "ověřeno".padStart(9) + "kombinací".padStart(12));
  for (const [key, row] of [...byGroup].sort((left, right) => right[1].ok - left[1].ok)) {
    console.log(
      key.padEnd(14)
      + String(row.total).padStart(8)
      + String(row.ok).padStart(9)
      + Math.round(row.combos).toLocaleString("cs").padStart(12),
    );
  }
  console.log("");
  console.log("slovník akcí, jak je pojmenovává zdroj (počet stránek):");
  for (const [action, count] of [...actions].sort((left, right) => right[1] - left[1]).slice(0, 20)) {
    console.log(`  ${action.padEnd(24)} ${count}`);
  }
  if (failed.length > 0) {
    console.log("");
    console.log("neshody (prvních 8):");
    for (const grid of failed.slice(0, 8)) {
      console.log(`  ${grid.file.split(/[\\/]/).pop()}`);
      for (const line of grid.mismatches.slice(0, 3)) console.log(`      ${line}`);
    }
  }
  console.log("");
  console.log(
    "Ověřeno znamená: mřížka spočítaná s vahami sedí na počty kombinací, které\n"
    + "legenda té stránky sama uvádí. Neověřený soubor se nesmí dodat - špatně\n"
    + "přečtená range je horší než chybějící, protože vypadá stejně jako správná.",
  );
}
