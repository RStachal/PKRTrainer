import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read the owner's Tournament Masterclass ICM pages.
 *
 *   npx vite-node scripts/extractIcmRangePages.mts -- --dir=<folder> [--out=<json>]
 *
 * These are a different kind of source from everything else here, and a much
 * better one. The RYE material is images, so it had to be sampled pixel by pixel
 * and its colours guessed against a legend. These pages carry the same
 * information as markup: each of the 169 cells names its hand class in an id, its
 * action as a CSS colour class, and any mixed frequency as `data-weight`. Nothing
 * is inferred.
 *
 * They also carry their own check. Each page prints, per action, the combo count
 * it expects, plus a total, and this recomputes both from the cells. Where they
 * differ the grid is kept and the difference is reported rather than the page
 * being thrown away - see the note at the comparison for why that is the right way
 * round.
 */

const COMBOS = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);

interface ActionSlice { action: string; weight: number }
interface CellRow { hand: string; slices: ActionSlice[] }

export interface IcmRangePage {
  file: string;
  /** The scenario id in the file name, e.g. "ICM10". */
  scenario: string;
  /** The seats and stacks the file name states, e.g. "btn55bb vs bb13bb". */
  spot: string;
  /** Colour class -> the action the page's own legend names it. */
  legend: Record<string, string>;
  /** Hand class -> action -> frequency in percent. */
  cells: Record<string, Record<string, number>>;
  totalPct: number;
  totalCombos: number;
  /** Where the page's own caption disagrees with its grid. Empty is normal. */
  disagreements: string[];
}

function stripEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&nbsp;?/g, " ").replace(/\s+/g, " ").trim();
}

export function parseIcmPage(file: string, raw: string): IcmRangePage {
  // Legend: each list item carries the colour in an id and the action as a title.
  const legend: Record<string, string> = {};
  const legendCombos: Record<string, number> = {};
  const legendRe = /id="mdl-color--([a-z-]+)"><span class="title">([^<]*)<\/span><div class="sectionCombos">([\d.]+)% \((\d+) combos\)/g;
  for (let m = legendRe.exec(raw); m !== null; m = legendRe.exec(raw)) {
    const [, colour, title, , combos] = m;
    if (title.trim() === "") continue;
    legend[colour] = stripEntities(title);
    legendCombos[colour] = Number(combos);
  }

  const cells: Record<string, Record<string, number>> = {};
  const rows: CellRow[] = [];
  const cellRe = /<td id="cid_([^"]+)"[^>]*class="cell ([^"]*)"[^>]*>([\s\S]*?)<\/td>/g;
  for (let m = cellRe.exec(raw); m !== null; m = cellRe.exec(raw)) {
    const [, hand, cls, inner] = m;
    const slices: ActionSlice[] = [];

    // A cell is either one solid colour, or split into weighted parts.
    const weighted = [...inner.matchAll(/mdl-color--([a-z-]+) weighted" data-weight="(\d+)"/g)];
    if (weighted.length > 0) {
      for (const w of weighted) slices.push({ action: w[1], weight: Number(w[2]) });
    } else {
      const solid = /mdl-color--([a-z-]+)/.exec(cls);
      if (solid !== null) slices.push({ action: solid[1], weight: 100 });
    }
    rows.push({ hand, slices });
    if (slices.length > 0) {
      cells[hand] = Object.fromEntries(
        slices.filter((s) => legend[s.action] !== undefined).map((s) => [legend[s.action], s.weight]),
      );
    }
  }

  if (rows.length !== 169) throw new Error(`${file}: ${rows.length} cells, expected 169`);

  // The page's own numbers are the check. A misparse changes them.
  const computed: Record<string, number> = {};
  for (const row of rows) {
    for (const slice of row.slices) {
      computed[slice.action] = (computed[slice.action] ?? 0) + COMBOS(row.hand) * slice.weight / 100;
    }
  }
  // Where the grid and the page's own summary disagree, the grid wins and the
  // disagreement is reported. Checked before deciding that: on the pages that
  // differ, every one of the 169 cells and every weighted div is captured, and two
  // different counting conventions both give the same answer. So the mismatch is
  // in the source - a summary generated from a slightly different grid than the one
  // shipped - not in the parse. Throwing would discard good ranges over a stale
  // caption.
  const disagreements: string[] = [];
  for (const [colour, stated] of Object.entries(legendCombos)) {
    const got = Math.round(computed[colour] ?? 0);
    if (Math.abs(got - stated) > 1) {
      disagreements.push(`${legend[colour]}: grid ${got}, caption ${stated}`);
    }
  }

  const totalMatch = /<span class="selectedItems">([\d.]+)% of hands<\/span>\s*<span class="totalCombos">\((\d+)\) combos/.exec(raw);
  const totalPct = totalMatch === null ? 0 : Number(totalMatch[1]);
  const totalCombos = totalMatch === null ? 0 : Number(totalMatch[2]);
  const summed = Math.round(Object.values(computed).reduce((a, b) => a + b, 0));
  if (totalCombos > 0 && Math.abs(summed - totalCombos) > 1) {
    disagreements.push(`total: grid ${summed}, caption ${totalCombos}`);
  }

  const name = file.replace(/\.html$/i, "");
  const [scenario, ...rest] = name.split("-");
  return { file, scenario, spot: rest.join(" vs "), legend, cells, totalPct, totalCombos, disagreements };
}

const dirFlag = process.argv.find((a) => a.startsWith("--dir="));
const dir = dirFlag === undefined ? "" : dirFlag.slice("--dir=".length);
if (dir === "") throw new Error("--dir=<folder of ICM*.html> is required");
const outFlag = process.argv.find((a) => a.startsWith("--out="));

const pages: IcmRangePage[] = [];
const skipped: string[] = [];
for (const file of readdirSync(dir).filter((f) => /\.html$/i.test(f)).sort()) {
  const raw = readFileSync(join(dir, file), "utf8");
  try {
    const page = parseIcmPage(file, raw);
    // Index pages carry the navigation but no grid worth keeping.
    if (Object.keys(page.legend).length === 0) { skipped.push(`${file} (no legend - index page)`); continue; }
    pages.push(page);
  } catch (error) {
    skipped.push(`${file} - ${(error as Error).message}`);
  }
}

const flagged = pages.filter((p) => p.disagreements.length > 0);
console.log(`parsed ${pages.length} range pages, skipped ${skipped.length}`);
console.log(`pages whose caption disagrees with their own grid: ${flagged.length}`);
console.log("");
const actions = new Map<string, number>();
for (const page of pages) for (const name of Object.values(page.legend)) actions.set(name, (actions.get(name) ?? 0) + 1);
console.log("actions the pages' own legends name:");
for (const [name, n] of [...actions].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name}`);
console.log("");
const scenarios = new Map<string, number>();
for (const page of pages) scenarios.set(page.scenario, (scenarios.get(page.scenario) ?? 0) + 1);
console.log(`scenarios: ${scenarios.size}`);
console.log([...scenarios].map(([s, n]) => `${s}(${n})`).join(" "));

if (outFlag !== undefined) {
  writeFileSync(outFlag.slice("--out=".length), JSON.stringify(pages, null, 1), "utf8");
  console.log(`\nwritten: ${outFlag.slice("--out=".length)}`);
}
if (skipped.length > 0) {
  console.log("\nskipped:");
  for (const s of skipped.slice(0, 12)) console.log(`  ${s}`);
}
