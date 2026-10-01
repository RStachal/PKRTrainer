/**
 * Čím se pozná stránka, která kreslí jen jednu větev strategie?
 *
 *   npm run mtt:rye-partial-shape -- --source=<cesta ke korpusu>
 *
 * ## Proč to je potřeba
 *
 * `fillFolds` dělá ze všech nepojmenovaných tříd `FOLD`. U stránky, která kreslí
 * celou strategii, je to správně - neobarvená ruka se opravdu skládá. U stránky,
 * která kreslí **jen jednu větev** (squeeze chart obarví 4-6 % kombinací), je to
 * tvrzení za zdroj: hráč by se učil skládat 143 az 159 tříd ze 169, o kterých
 * stránka nic neříká (bod 272).
 *
 * Detektor z 24. 9. se opíral o to, že u takové stránky **legenda sečte sto
 * procent**, protože procenta počítá ze zvolené podmnožiny, ne z 1326 kombinací.
 * To platilo pro 49 stránek ze 421. **Ale 30. 9. se našly čtyři, kde legenda
 * sečte 5 az 8 %** - RYE píše procenta ve dvou různých významech a detektor zná
 * jen jeden. Tenhle skript měří oba naráz, aby se pravidlo dalo postavit na
 * číslech a ne na dohadu.
 *
 * Zdroj je mimo repozitář (koupený materiál) a nic se odtud nekopíruje; skript
 * jen čte a počítá.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { readRyeGrid } from "./lib/ryeRangeCorpus.mts";

const SOURCE = process.argv.find((arg) => arg.startsWith("--source="))?.split("=")[1] ?? "";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.toLowerCase().endsWith(".html")) out.push(path);
  }
  return out;
}

/** Sekce podle předpony názvu: SQU, MUL, F3B, ICM, CALLRE, HU, BBSTR, OP, PU. */
function sectionOf(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? "";
  return /^([A-Z0-9]+?)[-_]/.exec(base)?.[1] ?? "?";
}

/**
 * Akce, které znamenají „hrdina pokračuje pasivně".
 *
 * Když je legenda **nemá**, stránka o neobarvených rukách nic netvrdí - jedině
 * u jam-or-fold spotu, kde je fold jediná alternativa. Proto se jam poznává
 * zvlášť: `PU` stránky mají jen `All in` a neobarvené u nich fold **je**.
 */
/*
 * Bez hranic slova schválně. Legenda píše `flatcall` jedním slovem, takže
 * `\bcall\b` ani `\bflat\b` na ni nesedí - první měření 30. 9. proto zařadilo
 * tři stránky ICM3 mezi propadající, přestože `flatcall` mají. `Defend` je
 * tamtéž: u obrany blindu je neobarvené legitimně fold.
 */
const PASSIVE = /(call|flat|limp|check|defend)/i;
/** `Squeeze/call` je odpověď na 4bet, ne první akce; za pasivní se počítat nesmí. */
const COMPOUND = /(squeeze|3b|4b|sq|iso)\s*\/\s*(call|fold|f|c|broke)/i;
const JAMLIKE = /\b(jam|all\s*in|allin|shove|push)\b/i;

/**
 * Akce, která znamená „a tady se skládá".
 *
 * Když ji legenda jmenuje, stránka o neobarvených rukách **něco tvrdí** - a pak
 * je `fillFolds` v souladu se zdrojem, ne tvrzení za něj.
 */
const FOLD_ACTION = /(fold|broke)/i;

type Row = {
  file: string;
  section: string;
  legendSum: number;
  coloured: number;
  /** Součet kombinací, které legenda rozdává mezi akce. */
  legendCombos: number;
  /** Hloubka hrdiny z názvu souboru, nebo 0. */
  depth: number;
  hasFold: boolean;
  passive: boolean;
  jam: boolean;
  actions: string;
  partialToday: boolean;
};

function run(source: string): void {
  const rows: Row[] = [];
  let unreadable = 0;
  let mismatched = 0;

  for (const file of walk(source)) {
    const grid = readRyeGrid(file);
    if (grid === undefined) { unreadable += 1; continue; }
    if (grid.mismatches.length > 0) { mismatched += 1; continue; }
    const actions = grid.legend.map((entry) => entry.action);
    const base = file.split(/[\\/]/).pop() ?? file;
    rows.push({
      file: base,
      section: sectionOf(file),
      legendSum: grid.legendPercentSum,
      coloured: grid.colouredShare,
      legendCombos: grid.legend.reduce((sum, entry) => sum + (Number.isFinite(entry.combos) ? entry.combos : 0), 0),
      depth: Number(/(\d+)\s*bb/i.exec(base)?.[1] ?? 0),
      hasFold: actions.some((a) => FOLD_ACTION.test(a)),
      passive: actions.some((a) => PASSIVE.test(a) && !COMPOUND.test(a)),
      jam: actions.some((a) => JAMLIKE.test(a)),
      actions: actions.join(" | "),
      partialToday: grid.partial,
    });
  }

  console.log(`stránek ověřeno ${rows.length}, nečitelných ${unreadable}, s neshodou ${mismatched}`);
  console.log("");

  const near100 = (sum: number): boolean => Math.abs(sum - 100) <= 2;
  const small = (share: number): boolean => share < 0.5;

  const groupA = rows.filter((row) => row.partialToday);
  const groupB = rows.filter((row) => !row.partialToday && !near100(row.legendSum) && small(row.coloured) && !row.passive && !row.jam);
  const groupC = rows.filter((row) => !row.partialToday && small(row.coloured) && !row.passive && row.jam);
  const groupD = rows.filter((row) => !row.partialToday && row.passive);

  console.log(`A) dnes chytané (legenda ~100 %, obarveno < 90 %):             ${groupA.length}`);
  console.log(`B) propadá: legenda i obarvení malé, bez pasivní akce, bez jamu: ${groupB.length}`);
  console.log(`C) jam-or-fold (bez pasivní, ale s jamem) - chytit NESMÍ:      ${groupC.length}`);
  console.log(`D) má pasivní akci, neobarvené = fold je v pořádku:            ${groupD.length}`);
  console.log("");

  const bySection = (list: readonly Row[]): string => {
    const counts = new Map<string, number>();
    for (const row of list) counts.set(row.section, (counts.get(row.section) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}:${n}`).join(" ");
  };
  console.log(`A po sekcích: ${bySection(groupA)}`);
  console.log(`B po sekcích: ${bySection(groupB)}`);
  console.log(`C po sekcích: ${bySection(groupC)}`);
  console.log(`D po sekcích: ${bySection(groupD)}`);
  console.log("");

  const show = (label: string, list: readonly Row[], limit: number): void => {
    console.log(`${label} (${list.length}):`);
    for (const row of [...list].sort((a, b) => a.file.localeCompare(b.file)).slice(0, limit)) {
      console.log(
        `  ${row.file.padEnd(44)} legenda ${row.legendSum.toFixed(1).padStart(6)} %`
        + `  obarveno ${(row.coloured * 100).toFixed(2).padStart(6)} %  [${row.actions}]`,
      );
    }
    if (list.length > limit) console.log(`  … a dalších ${list.length - limit}`);
  };
  // Nejdůležitější kontrola: chytila brána i stránku, která jam jmenuje?
  // Tam je fold legitimní alternativa, takže každá taková je podezřelá.
  show("A se jamem v legendě - ověřit, jestli je chycení správné", groupA.filter((row) => row.jam), 20);
  console.log("");
  /*
   * Dvě otázky, které jsem 1. 10. 2026 chtěl dát vlastníkovi - a obě se dají
   * změřit, takže se dávat nemají.
   *
   * (1) Účtuje legenda **všech 1326 kombinací**? Když ano, stránka o zbytku
   *     mřížky něco tvrdí (typicky `limp/fold`) a `fillFolds` je s ní v souladu.
   *     Odmítat takovou stránku je chyba opačným směrem.
   * (2) V jaké hloubce zdroj přestává nabízet pasivní akci? Když chybí jen na
   *     krátkých stackách, je to vlastnost pokeru, ne mezera ve stránce.
   */
  console.log("=== (1) účtuje legenda celou mřížku? (1326 kombinací) ===");
  const accounted = (row: Row): boolean => Math.abs(row.legendCombos - 1326) <= 13;
  const aFull = groupA.filter(accounted);
  const aPartial = groupA.filter((row) => !accounted(row));
  console.log(`  z ${groupA.length} dnes odmítaných účtuje celou mřížku ${aFull.length}, jen část ${aPartial.length}`);
  console.log(`  celou mřížku po sekcích: ${bySection(aFull)}`);
  console.log(`  jen část po sekcích:     ${bySection(aPartial)}`);
  console.log("");
  for (const row of [...aFull].sort((a, b) => a.file.localeCompare(b.file)).slice(0, 10)) {
    console.log(
      `  ${row.file.padEnd(44)} legenda ${Math.round(row.legendCombos).toString().padStart(5)} komb.`
      + `  obarveno ${Math.round(row.coloured * 1326).toString().padStart(5)}  fold v legendě: ${row.hasFold ? "ano" : "NE"}`,
    );
  }
  if (aFull.length > 10) console.log(`  … a dalších ${aFull.length - 10}`);
  console.log("");

  console.log("=== (2) kde zdroj přestává nabízet pasivní akci? ===");
  const buckets = new Map<string, { bez: number; s: number }>();
  for (const row of rows) {
    if (row.depth === 0) continue;
    const key = row.depth <= 20 ? "do 20 bb" : row.depth <= 30 ? "21-30 bb" : row.depth <= 50 ? "31-50 bb" : "nad 50 bb";
    const cell = buckets.get(key) ?? { bez: 0, s: 0 };
    if (row.passive) cell.s += 1; else cell.bez += 1;
    buckets.set(key, cell);
  }
  for (const key of ["do 20 bb", "21-30 bb", "31-50 bb", "nad 50 bb"]) {
    const cell = buckets.get(key);
    if (cell === undefined) continue;
    const total = cell.bez + cell.s;
    console.log(`  ${key.padEnd(10)} bez pasivní akce ${String(cell.bez).padStart(3)} z ${String(total).padStart(3)}`
      + `  (${Math.round((cell.bez / total) * 100)} %)`);
  }
  console.log("");

  show("B - propadají dnešní bránou", groupB, 20);
  console.log("");
  show("C - jam-or-fold, tyhle se chytit nesmí", groupC, 8);
}

// Volání až na konci: konstanty výš jsou `const`, takže dřív jsou v TDZ.
if (SOURCE === "" || !existsSync(SOURCE)) {
  console.error("Usage: npm run mtt:rye-partial-shape -- --source=<cesta ke korpusu RYE>");
  process.exitCode = 1;
} else {
  run(SOURCE);
}
