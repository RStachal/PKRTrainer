import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * Co už o tomhle tématu víme, než se začne měřit.
 *
 *   npm run mtt:known -- "VS_OPEN UTG+1"
 *   npm run mtt:known -- "halda pruh" --limit=8
 *
 * ## Proč to existuje
 *
 * Projekt má velkou a dobře psanou paměť, kterou **před prací nikdo nečte,
 * protože se v ní číst nedá**. Změřeno 3. 9. 2026: `MTT_AUTONOMY.md` má
 * 162 158 bajtů, 178 řádků tabulky a nejdelší řádek 2 378 znaků. Nástroj na
 * dotaz do ní do dneška neexistoval.
 *
 * Důsledek není teoretický, stál tenhle projekt opakovaně čas:
 *
 * - **3. 9. 2026** jsem prohledal celý internet kvůli tomu, že preflop pack
 *   nemá `VS_OPEN` pro UTG+1 a UTG+2. Ten fakt byl v repozitáři zapsaný od
 *   **27. 8.** (commit `d000711`, komentář u `srpSolverInputGap`) - a ten
 *   komentář ještě dodává, že jeho zjištění stálo hodinu. Zaplatilo se za něj
 *   tedy dvakrát.
 * - **Týž den** jsem pustil `mtt:rye-corpus` bez přepínače `--only` a dostal
 *   číslo, ze kterého plyne „korpus to nespraví". Komentář u toho přepínače
 *   přitom říká, že slévat ICM a chipEV zakryje, která polovina co umí. Po
 *   rozdělení vyšel opak.
 *
 * Obojí chytí jeden dotaz do paměti. Proto je to nástroj, ne předsevzetí.
 *
 * ## Kde se hledá a proč zrovna tam
 *
 * Znalost tohohle projektu nebydlí v dokumentaci, ale ve **čtyřech** místech, a
 * hledat jen v jednom je horší než nehledat - vrátí to prázdno, které vypadá
 * jako odpověď:
 *
 * 1. řádky deníku v `MTT_AUTONOMY.md`,
 * 2. ostatní dokumenty v `Agents/` (sourcing audity, plány),
 * 3. **komentáře v kódu** - tam leží nejvíc a je to ta nejhůř dohledatelná část,
 * 4. **zprávy commitů** - v tomhle repozitáři jsou to eseje, ne jednořádky.
 *
 * ## Co to nedělá
 *
 * Nerozhoduje a nic nezapisuje. Vrátí, co už bylo řečeno, i s datem a místem;
 * jestli to pořád platí, je úsudek. Starý zápis může být přeměřený - proto se
 * vypisuje datum, ne jen text.
 */

const terms = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .flatMap((arg) => arg.split(/\s+/))
  .filter((term) => term.length > 0);

const limit = Number(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 5,
);

if (terms.length === 0) {
  console.error('Použití: npm run mtt:known -- "<téma>" [--limit=N]');
  process.exit(2);
}

/**
 * Porovnávat se musí bez diakritiky, a není to pohodlí.
 *
 * Dokumenty jsou česky s diakritikou, ale dotaz se píše z terminálu a často bez
 * ní. Kdyby `halda` nenašlo `haldě`, vrátí nástroj prázdno - a prázdno se čte
 * jako „nic o tom nevíme", tedy přesně ten závěr, kvůli kterému se pak měří
 * znovu. Nenalezení je tu dražší chyba než nález navíc.
 */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const needles = terms.map(fold);

/** Kolik hledaných slov text obsahuje. Nula znamená, že se nevypíše. */
function score(text: string): number {
  const hay = fold(text);
  return needles.filter((needle) => hay.includes(needle)).length;
}

/**
 * Jak hustě je text o hledané věci, ne jak dlouhý je.
 *
 * Bez tohohle vyhrávaly dlouhé eseje, které téma zmíní mimochodem, nad krátkým
 * komentářem, který je přesně o něm. Změřeno při první zkoušce nástroje: dotaz
 * „VS_OPEN UTG+1" vrátil nahoře tři dnešní zápisy a **původní nález z 27. 8.
 * vůbec nevypsal** - tedy přesně ten, kvůli jehož přehlédnutí nástroj vzniká.
 */
function density(text: string): number {
  const hay = fold(text);
  let occurrences = 0;
  for (const needle of needles) {
    let at = hay.indexOf(needle);
    while (at >= 0) { occurrences += 1; at = hay.indexOf(needle, at + needle.length); }
  }
  return (occurrences * 1000) / Math.max(hay.length, 1);
}

/** Datum, které si text říká sám. Ne čas souboru - ten měří poslední dotek. */
function statedDate(text: string): string {
  const iso = /\b(20[0-9]{2}-[01][0-9]-[0-3][0-9])\b/.exec(text);
  if (iso !== null) return iso[1];
  const czech = /\b([0-3]?[0-9])\.\s?([01]?[0-9])\.\s?(20[0-9]{2})\b/.exec(text);
  if (czech === null) return "";
  const [, day, month, year] = czech;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Výřez kolem prvního nalezeného slova. Řádky deníku mají až 2 378 znaků. */
function excerpt(text: string, width = 240): string {
  const hay = fold(text);
  let at = -1;
  for (const needle of needles) {
    const found = hay.indexOf(needle);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  const flat = text.replace(/\s+/g, " ").trim();
  if (at < 0) return flat.slice(0, width);
  const start = Math.max(0, at - width / 3);
  const cut = flat.slice(start, start + width);
  return (start > 0 ? "…" : "") + cut + (start + width < flat.length ? "…" : "");
}

interface Hit { score: number; where: string; date: string; text: string }

/**
 * Řadí se od **nejstaršího**, ne od nejnovějšího, a je to ta podstatná volba.
 *
 * Otázka zní „co už o tom víme", takže vyhrát má ten, kdo to zjistil první -
 * novější zápisy bývají jeho převyprávění. Při řazení od nejnovějšího vrátil
 * nástroj v první zkoušce mé vlastní dnešní commity a původní nález schoval,
 * což je tentýž cyklus o patro výš.
 */
function report(title: string, hits: Hit[]): number {
  const ranked = hits
    .filter((hit) => hit.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || density(right.text) - density(left.text)
      || (left.date === "" ? "9999" : left.date).localeCompare(right.date === "" ? "9999" : right.date)
    ));
  if (ranked.length === 0) return 0;
  console.log("");
  console.log(`${title} (${ranked.length})`);
  console.log("-".repeat(title.length + 6));
  for (const hit of ranked.slice(0, limit)) {
    console.log(`  ${hit.date === "" ? "          " : hit.date} ${hit.where}`);
    console.log(`    ${excerpt(hit.text)}`);
  }
  if (ranked.length > limit) {
    console.log(`  … a dalších ${ranked.length - limit}; celé přes --limit=${ranked.length}`);
  }
  return ranked.length;
}

// --- 1. deník -------------------------------------------------------------

const journalHits: Hit[] = [];
const AUTONOMY = "Agents/MTT_AUTONOMY.md";
for (const line of readFileSync(AUTONOMY, "utf8").split("\n")) {
  if (!line.startsWith("| ")) continue;
  const cells = line.split(" | ");
  if (cells.length < 3) continue;
  const id = cells[0].replace(/^\|\s*/, "").trim();
  if (!/^[0-9]+[a-z]?$/.test(id)) continue;
  const title = cells[1].replace(/~~/g, "").trim();
  const body = cells.slice(2).join(" | ");
  const done = cells[1].includes("~~") || /vyřešeno/.test(cells[cells.length - 1]);
  journalHits.push({
    score: score(`${title} ${body}`),
    where: `deník ${id} — ${title.slice(0, 90)}${done ? "" : "  [OTEVŘENÉ]"}`,
    date: statedDate(body),
    text: body,
  });
}

// --- 2. ostatní dokumenty -------------------------------------------------

const docHits: Hit[] = [];
for (const name of readdirSync("Agents")) {
  if (!name.endsWith(".md") || name === "MTT_AUTONOMY.md") continue;
  const text = readFileSync(join("Agents", name), "utf8");
  // Po odstavcích: nadpis sám o tématu neřekne dost a celý soubor je moc.
  for (const block of text.split(/\n\s*\n/)) {
    const found = score(block);
    if (found > 0) {
      docHits.push({ score: found, where: `Agents/${name}`, date: statedDate(block), text: block });
    }
  }
}

// --- 3. komentáře v kódu --------------------------------------------------

/**
 * Komentáře se sbírají **po blocích**, ne po řádcích.
 *
 * Klíčová věta bývá uprostřed doc-komentáře a rozdělená přes tři řádky - přesně
 * tak je psaná ta o `VS_OPEN` pro UTG+1. Hledání po jednotlivých řádcích by ji
 * našlo jen tehdy, kdyby se obě hledaná slova trefila do téhož řádku.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "artifacts", "Legacy", "legacy", ".cache"]);
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) { found.push(...sourceFiles(path)); continue; }
    if (entry.includes(".generated.")) continue;
    // Vlastní soubor ne: jeho doc-komentář nese příklady dotazů, takže by se
    // trefil skoro do všeho a vytlačil skutečné nálezy.
    if (entry === "searchProjectMemory.mts") continue;
    if (![".ts", ".mts", ".mjs"].includes(extname(entry))) continue;
    found.push(path);
  }
  return found;
}

const codeHits: Hit[] = [];
for (const path of [...sourceFiles("scripts"), ...sourceFiles("src")]) {
  const lines = readFileSync(path, "utf8").split("\n");
  let block: string[] = [];
  let startedAt = 0;
  const flush = () => {
    if (block.length === 0) return;
    const text = block.join(" ");
    const found = score(text);
    if (found > 0) {
      codeHits.push({
        score: found,
        where: `${path.split("\\").join("/")}:${startedAt}`,
        date: statedDate(text),
        text,
      });
    }
    block = [];
  };
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    const isComment = line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");
    if (isComment) {
      if (block.length === 0) startedAt = index + 1;
      block.push(line.replace(/^\/\*+|^\*+\/?|^\/\//, "").trim());
    } else flush();
  }
  flush();
}

// --- 4. zprávy commitů ----------------------------------------------------

const commitHits: Hit[] = [];
try {
  const log = execFileSync("git", ["log", "--format=%h%x1f%ad%x1f%B%x1e", "--date=short"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  for (const entry of log.split("\x1e")) {
    const [hash, date, message] = entry.split("\x1f");
    if (message === undefined) continue;
    const found = score(message);
    if (found > 0) {
      commitHits.push({
        score: found,
        where: `commit ${hash.trim()}`,
        date: date.trim(),
        text: message,
      });
    }
  }
} catch {
  // Bez gitu se hledá ve zbytku. Říct to je lepší než tiše vrátit míň.
  console.error("  (zprávy commitů se nepodařilo přečíst, hledám ve zbytku)");
}

// --- výpis ----------------------------------------------------------------

console.log(`Co už víme o: ${terms.join(" ")}`);

const total = report("Deník", journalHits)
  + report("Dokumenty", docHits)
  + report("Komentáře v kódu", codeHits)
  + report("Zprávy commitů", commitHits);

console.log("");
if (total === 0) {
  console.log("Nic nenalezeno. Tohle téma paměť nezná - měření je na místě.");
} else {
  console.log(`Celkem ${total} nálezů. Datum je to, které si zápis říká sám;`);
  console.log("starý zápis mohl být mezitím přeměřený, takže platnost je úsudek.");
}
