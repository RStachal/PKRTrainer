import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readRyeGrid, type RyeGrid } from "./lib/ryeRangeCorpus.mts";
import {
  REFUSED_VOCABULARIES, bucketForStack, contextForVocabulary, opponentFromFileName,
  situationFromFileName,
} from "./lib/ryeActionMapping.mts";

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

// Filtr na půlku korpusu. ICM jde do `DOLAR_EV` slotů, zbytek do `CHIP_EV` -
// jsou to jiné řádky knihovny a slévat jejich čísla by zakrylo, která polovina
// co umí.
const only = process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1];
function inScope(name: string): boolean {
  if (only === undefined) return true;
  const isIcm = /^ICM/i.test(name);
  return only.toUpperCase() === "ICM" ? isIcm : !isIcm;
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
  const name = basename(grid.file);
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

/**
 * Slovníky akcí, tedy kolik různých **typů situace** korpus drží.
 *
 * Kontext se pozná z legendy, ne ze jména souboru: `flatcall / 3bet/call /
 * 3b/f / Jam` je hráč, který čelí otevření, kdežto `Fold to 3bet` je ten, kdo
 * otevřel a čelí zvýšení. Bez tohohle rozlišení by se obojí filovalo pod jeden
 * kontext a produkt by hráči nabídl odpověď na jinou otázku, než položil.
 */
/**
 * Kolik řádků intake scaffoldu by korpus vyplnil, a co z něj vypadne.
 *
 * Tohle je to číslo, podle kterého se rozhoduje, jestli má import smysl.
 * Scaffold má 118 638 řádků na pack (6 sedaček × 13 kbelíků × 9 kontextů ×
 * 169 tříd); korpus pokryje jen část a je pošetilé stavět import dřív, než je
 * vidět kolik.
 */
if (process.argv.includes("--coverage")) {
  interface Row { pages: number; rows: number; combos: number }
  const mapped = new Map<string, Row>();
  const unmapped = new Map<string, Row>();
  const cells = new Set<string>();
  let refused = 0;

  for (const grid of verified) {
    const name = basename(grid.file);
    if (!inScope(name)) continue;
    const vocabulary = grid.legend.map((entry) => entry.action).sort().join(" | ");
    if (REFUSED_VOCABULARIES.has(vocabulary)) { refused += 1; continue; }
    const context = contextForVocabulary(grid.legend.map((entry) => entry.action), name);
    const situation = situationFromFileName(name);
    const target = context === undefined ? unmapped : mapped;
    const key = context ?? vocabulary;
    const row = target.get(key) ?? { pages: 0, rows: 0, combos: 0 };
    row.pages += 1;
    for (const entry of grid.legend) row.combos += entry.combos;
    if (context !== undefined && situation !== undefined) {
      const bucket = bucketForStack(situation.stackBB);
      cells.add(`${situation.seat}|${bucket}|${context}`);
      // Jeden řádek na třídu ruky, kterou stránka barví.
      row.rows += new Set(grid.hands.map((hand) => hand.hand)).size;
    }
    target.set(key, row);
  }

  console.log(`Co by z korpusu vyplnilo intake scaffold${only ? ` (jen ${only})` : ""}`);
  console.log("");
  console.log("kontext".padEnd(12) + "stran".padStart(7) + "řádků".padStart(9) + "kombinací".padStart(11));
  for (const [key, row] of [...mapped].sort((left, right) => right[1].rows - left[1].rows)) {
    console.log(key.padEnd(12) + String(row.pages).padStart(7) + String(row.rows).padStart(9) + String(Math.round(row.combos)).padStart(11));
  }
  const rows = [...mapped.values()].reduce((sum, row) => sum + row.rows, 0);
  console.log("");
  console.log(`buněk (sedačka × kbelík × kontext), které korpus zasáhne: ${cells.size} z 702`);
  // Kolik stránek padá do jedné buňky a jestli si odporují.
  //
  // Taxonomie knihovny nemá kam zapsat, **proti které sedačce** a v jaké ICM
  // situaci range platí. Dvě různé odpovědi na stejnou buňku tedy nejsou chyba
  // zdroje, ale nesoulad modelů - a slévat je by znamenalo vydat průměr,
  // který nikdo nespočítal.
  const perCell = new Map<string, { pages: string[]; answers: Map<string, Set<string>> }>();
  for (const grid of verified) {
    const name = basename(grid.file);
    if (!inScope(name)) continue;
    const vocabulary = grid.legend.map((entry) => entry.action).sort().join(" | ");
    if (REFUSED_VOCABULARIES.has(vocabulary)) continue;
    const context = contextForVocabulary(grid.legend.map((entry) => entry.action), name);
    const situation = situationFromFileName(name);
    if (context === undefined || situation === undefined) continue;
    const key = `${situation.seat}|${bucketForStack(situation.stackBB)}|${context}`;
    const cell = perCell.get(key)
      ?? { pages: [] as string[], answers: new Map<string, Set<string>>() };
    cell.pages.push(name);
    for (const hand of grid.hands) {
      const set = cell.answers.get(hand.hand) ?? new Set<string>();
      set.add(`${hand.color}:${Math.round(hand.weight * 100)}`);
      cell.answers.set(hand.hand, set);
    }
    perCell.set(key, cell);
  }
  let shared = 0;
  let conflicting = 0;
  const examples: string[] = [];
  for (const [key, cell] of perCell) {
    if (cell.pages.length < 2) continue;
    shared += 1;
    const disagreements = [...cell.answers.values()].filter((set) => set.size > 1).length;
    if (disagreements > 0) {
      conflicting += 1;
      if (examples.length < 4) {
        examples.push(`${key}: ${cell.pages.length} stran, neshoda u ${disagreements} tříd ze 169`);
      }
    }
  }
  console.log(`buněk, do kterých padá víc stran: ${shared} | z toho s rozpornou odpovědí: ${conflicting}`);
  for (const line of examples) console.log(`    ${line}`);

  // Který klíč ty rozpory odstraní.
  //
  // Tohle je to měření, které rozhoduje o rozšíření modelu. Zkoušejí se tři
  // klíče vedle sebe, aby se nevybíralo podle dojmu: dnešní, dnešní plus
  // sedačka soupeře, a ten plus jeho hloubka. Rozpor znamená, že dvě stránky
  // dají téže třídě rukou jinou odpověď - tedy že klíč nerozlišuje něco, co
  // zdroj rozlišuje.
  console.log("");
  console.log("Který klíč rozpory odstraní");
  console.log("klíč".padEnd(34) + "buněk".padStart(8) + "sdílených".padStart(11) + "rozporných".padStart(12));
  for (const variant of [
    "dnešní",
    "+ sedačka soupeře",
    "+ sedačka i hloubka soupeře",
    "+ sedačka soupeře a sada",
  ] as const) {
    const map = new Map<string, {
      pages: number; answers: Map<string, Set<string>>; files: string[];
    }>();
    for (const grid of verified) {
      const name = basename(grid.file);
      if (!inScope(name)) continue;
      const vocabulary = grid.legend.map((entry) => entry.action).sort().join(" | ");
      if (REFUSED_VOCABULARIES.has(vocabulary)) continue;
      const context = contextForVocabulary(grid.legend.map((entry) => entry.action), name);
      const situation = situationFromFileName(name);
      if (context === undefined || situation === undefined) continue;
      const opponent = opponentFromFileName(name, situation);
      if (variant !== "dnešní" && opponent === undefined) continue;
      let key = `${situation.seat}|${bucketForStack(situation.stackBB)}|${context}`;
      if (variant !== "dnešní") key += `|vs${opponent!.seat}`;
      if (variant === "+ sedačka i hloubka soupeře") key += `@${bucketForStack(opponent!.stackBB)}`;
      // „Sada" je předpona jména, tedy ICM, ICM2 ... ICM14 nebo F3B, OP a další.
      // U ICM jde o **rozložení stacků u celého stolu**, které mění, co je
      // správně, a v modelu produktu pro to není místo.
      if (variant === "+ sedačka soupeře a sada") {
        key += `#${/^[A-Za-z0-9]+/.exec(name)?.[0]?.toUpperCase() ?? "?"}`;
      }
      const cell = map.get(key) ?? { pages: 0, answers: new Map(), files: [] as string[] };
      cell.pages += 1;
      cell.files.push(name);
      for (const hand of grid.hands) {
        const set = cell.answers.get(hand.hand) ?? new Set<string>();
        set.add(`${hand.color}:${Math.round(hand.weight * 100)}`);
        cell.answers.set(hand.hand, set);
      }
      map.set(key, cell);
    }
    let sharedCells = 0;
    let conflictCells = 0;
    for (const cell of map.values()) {
      if (cell.pages < 2) continue;
      sharedCells += 1;
      if ([...cell.answers.values()].some((set) => set.size > 1)) conflictCells += 1;
    }
    console.log(
      variant.padEnd(34)
      + String(map.size).padStart(8)
      + String(sharedCells).padStart(11)
      + String(conflictCells).padStart(12),
    );
    if (variant === "+ sedačka soupeře" && process.argv.includes("--why")) {
      console.log("      zbylé rozpory a stránky, které je působí:");
      for (const [key, cell] of map) {
        if (cell.pages < 2) continue;
        const bad = [...cell.answers.values()].filter((set) => set.size > 1).length;
        if (bad === 0) continue;
        console.log(`        ${key}  (${cell.pages} stran, ${bad} tříd se neshodne)`);
        for (const file of cell.files ?? []) console.log(`            ${file}`);
      }
    }
  }
  console.log(`řádků scaffoldu k vyplnění: ${rows} ze 118 638 na pack`);
  console.log(`stránek odmítnutých překladem: ${refused}`);
  console.log("");
  console.log("slovníky bez překladu (nevydají se):");
  for (const [key, row] of [...unmapped].sort((left, right) => right[1].pages - left[1].pages).slice(0, 10)) {
    console.log(`  ${String(row.pages).padStart(3)} stran  ${key.slice(0, 96)}`);
  }
} else if (process.argv.includes("--vocab")) {
  const vocab = new Map<string, { pages: number; combos: number; example: string }>();
  for (const grid of verified) {
    const key = grid.legend.map((entry) => entry.action).sort().join(" | ");
    const row = vocab.get(key) ?? { pages: 0, combos: 0, example: "" };
    row.pages += 1;
    row.combos += grid.legend.reduce((sum, entry) => sum + entry.combos, 0);
    if (row.example === "") row.example = basename(grid.file);
    vocab.set(key, row);
  }
  console.log("Typy situací podle slovníku legendy (jen ověřené mřížky)");
  console.log("");
  console.log("stran".padStart(6) + "  kombinací".padStart(11) + "  slovník / příklad");
  for (const [key, row] of [...vocab].sort((left, right) => right[1].pages - left[1].pages)) {
    console.log(
      String(row.pages).padStart(6)
      + String(Math.round(row.combos)).padStart(11)
      + `  ${key}`,
    );
    console.log(" ".repeat(17) + `  ${row.example}`);
  }
  console.log("");
  console.log(`typů situace celkem: ${vocab.size}`);
} else if (asJson) {
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
    // Jedno číslo „neshoda 115" neříká, kde leží práce a kde zdroj.
    //
    // Naměřeno 24. 9. 2026: třetina těch souborů vůbec není stránka s ranží,
    // ale rozcestník se 169 buňkami a bez legendy. Zbytek se dělí na dvě
    // různé věci a míchat je znamená nevědět, co je ještě k dodělání.
    const reasonOf = (line: string): string => {
      if (line.includes("nemá legendu")) return "rozcestník: 169 buněk, žádná legenda";
      if (line.includes("poloha říká") || line.includes("poloha a popisek")) return "poloha buňky a popisek se rozcházejí";
      if (/legenda ji nezná/.test(line)) return "barva v mřížce, kterou legenda nejmenuje";
      const numbers = /mřížka ([\d.]+), legenda ([\d.]+)$/.exec(line);
      if (numbers === null) return "jiné";
      return Number(numbers[1]) < Number(numbers[2])
        ? "mřížka má míň než legenda"
        : "mřížka má víc než legenda";
    };
    const byReason = new Map<string, number>();
    for (const grid of failed) {
      for (const reason of new Set(grid.mismatches.map(reasonOf))) {
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
    }
    console.log("");
    console.log("proč se nevydaly (souborů; jeden může mít víc důvodů):");
    for (const [reason, count] of [...byReason].sort((left, right) => right[1] - left[1])) {
      console.log(`  ${String(count).padStart(4)}  ${reason}`);
    }
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
