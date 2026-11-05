import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { combosOfHandClass, readRyeGrid } from "./lib/ryeRangeCorpus.mts";

/**
 * Kolik se cestou ze zdroje na stránku ztratí z **částečné váhy**.
 *
 *   npm run mtt:rye-weight-loss -- --source="<cesta ke složce db>"
 *
 * ## Proč to musí vzniknout
 *
 * Druhé čtení draftu 9. 9. 2026 vytklo, že se jediný proužek `data-weight="25"`
 * vykreslí naplno. Čtenář to napsal jako systémový nález a měl pravdu; mechanismus
 * je ale horší, než jak to vypadá z mřížky, a jsou v něm **dvě** místa:
 *
 * 1. `importRyeRangeCorpus` zapisuje `mix` jen u ruky, která má **víc než jednu
 *    nefoldovou akci**. Ruka, kterou zdroj hraje z jedné čtvrtiny a jinak
 *    foldne, tedy do draftu vejde jako čistá akce - a stránka ji obarví naplno,
 *    bez okraje a bez poznámky v popisku.
 * 2. Když nefoldových akcí je víc, váhy se **normalizují na sto**. Ruka, která
 *    hraje 3BET 25 %, CALL 25 % a jinak foldne, se na stránce ukáže jako
 *    „3BET 50 % / CALL 50 %". Fold se nezmenší, on zmizí.
 *
 * Obojí je táž třída vady jako u flopových pilotů (bod 221): stránka maluje
 * plnou barvou něco, co se z části nehraje, a ptá se „sedí to?". Rozdíl je, že
 * u pilotů to byla jen stránka, kdežto tady chybí ta informace už v draftu.
 *
 * Tenhle skript ji spočítá ze zdroje, ať se ví, o kolik jde.
 */

const source = process.argv.find((arg) => arg.startsWith("--source="))?.split("=").slice(1).join("=");
if (source === undefined) {
  console.error('Použití: npm run mtt:rye-weight-loss -- --source="<cesta ke složce db>"');
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

/** Nad kolik se váha bere jako plná. Zdroj uvádí celá procenta. */
const FULL = 0.999;

let grids = 0;
let gridsWithLoss = 0;
let hands = 0;
/** Ruka s jedinou nefoldovou akcí a váhou pod sto: v draftu z ní bude čistá akce. */
let silent = 0;
/** Ruka s víc akcemi, jejichž součet je pod sto: podíly se normalizací nafouknou. */
let inflated = 0;
let combosLost = 0;
const buckets = new Map<number, number>();

for (const path of htmlFiles(source)) {
  const grid = readRyeGrid(path);
  if (grid === undefined) continue;
  grids += 1;

  const byHand = new Map<string, number[]>();
  for (const entry of grid.hands) {
    byHand.set(entry.hand, [...(byHand.get(entry.hand) ?? []), entry.weight]);
  }

  let lossHere = 0;
  for (const [hand, weights] of byHand) {
    hands += 1;
    const played = weights.reduce((sum, weight) => sum + weight, 0);
    if (played >= FULL) continue;
    lossHere += 1;
    combosLost += combosOfHandClass(hand) * (1 - played);
    if (weights.length === 1) silent += 1; else inflated += 1;
    const rounded = Math.round(played * 100);
    buckets.set(rounded, (buckets.get(rounded) ?? 0) + 1);
  }
  if (lossHere > 0) gridsWithLoss += 1;
}

console.log("Částečná váha ve zdroji ranží");
console.log("");
console.log(`mřížek přečtených:            ${grids}`);
console.log(`mřížek s částečnou váhou:     ${gridsWithLoss}`);
console.log(`tříd rukou celkem:            ${hands}`);
console.log(`z toho hraných z části:       ${silent + inflated}`);
console.log(`  jediná akce → v draftu čistá ${String(silent).padStart(5)}`);
console.log(`  víc akcí → normalizací sto   ${String(inflated).padStart(5)}`);
console.log(`kombinací, které se tím ztratí: ${combosLost.toFixed(0)}`);
console.log("");
console.log("jak často se ta část hraje:");
for (const [share, count] of [...buckets].sort((left, right) => left[0] - right[0])) {
  console.log(`  ${String(share).padStart(3)} %  ${String(count).padStart(5)}`);
}
