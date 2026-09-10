import { existsSync, readFileSync } from "node:fs";

import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";
import { pilotReviewOrder } from "./lib/flopPilotReview.mts";
import type { DraftFile } from "./lib/ryeDraftImpact.mts";

/**
 * Kreslí čtecí stránka to, co v datech opravdu je?
 *
 *   npm run mtt:review-fidelity
 *   npm run mtt:review-fidelity -- --desk=artifacts/review-desk
 *
 * ## Proč to musí vzniknout
 *
 * Ve dnech 9. a 10. 9. 2026 se našly **čtyři** vady a všechny ležely na jednom
 * místě: mezi daty a čtenářem, ne v datech.
 *
 * - piloti: buňka kreslila `bucket.action` a `actionMix` zahazovala, takže se
 *   menšinová akce malovala plnou barvou (bod 221);
 * - piloti: stránka neřekla, čí strategii čtenář vidí, což stálo blokující
 *   nález (bod 223);
 * - ranže: ruka hraná ze čtvrtiny se kreslila jako jistota (bod 224);
 * - ranže: barva, kterou kontext neuměl přeložit, tiše spadla do foldu (225).
 *
 * Čtení je jediná cesta, jak se obsah dostane z LOW do produkce. Čtecí stránka
 * je tedy brána - a byla to **jediná brána v projektu, kterou nic neměřilo**.
 * Každá z těch čtyř vad se přitom pozná strojově: stačí porovnat, kolik věcí
 * data nesou, s tím, kolik jich stránka nakreslila.
 *
 * ## Co se měří
 *
 * Ne vzhled. Měří se **zachování informace**: každý mix v datech musí být na
 * stránce jako mix, každý pilot musí mít napsanou sedačku, a žádná buňka
 * s částečnou váhou nesmí vypadat jako jistota. Když se počty rozejdou, je to
 * ztráta - a je jedno, jestli hezky vypadá.
 */

const deskDir = process.argv.find((arg) => arg.startsWith("--desk="))?.split("=")[1]
  ?? "artifacts/review-desk";
const draftPath = process.argv.find((arg) => arg.startsWith("--draft="))?.split("=")[1]
  ?? "artifacts/rye-import/draft.json";

interface Finding {
  page: string;
  what: string;
  expected: number;
  found: number;
}

const findings: Finding[] = [];
const checked: string[] = [];

function countOf(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function require(page: string, what: string, expected: number, found: number): void {
  checked.push(`${page.padEnd(18)} ${what.padEnd(44)} ${String(found).padStart(6)}`);
  if (expected !== found) findings.push({ page, what, expected, found });
}

/**
 * Piloti: proužek na každou třídu a věta o tom, kdo hraje.
 *
 * Počet buněk s přechodem se musí rovnat počtu tříd v datech. Kdyby se
 * `actionMix` zase někde zahodila, spadne to sem: buňka bez přechodu je buňka
 * malovaná jednou akcí.
 */
function checkPilots(path: string): void {
  const html = readFileSync(path, "utf8");
  const order = pilotReviewOrder(generatedMttPostflopPilotPacks);

  let classes = 0;
  for (const entry of order) {
    for (const rule of entry.pack.rules) {
      const seen = new Set<string>();
      for (const bucket of rule.rangeBuckets) for (const hand of bucket.handClasses) seen.add(hand);
      classes += seen.size;
    }
  }

  require("piloty", "buněk s přechodem = tříd v datech", classes,
    countOf(html, /linear-gradient/g));
  // Nula tady musí být **doložená nula**, ne nula z neshody výrazu. První verze
  // hledala `class="cell"`, jenže buňky mřížky žádnou třídu nemají - kontrola
  // proto vždycky vracela nulu a prošla by i nad stránkou, kde je plnou barvou
  // malované všechno. Odhaleno falzifikací: úmyslně rozbitá stránka prošla.
  //
  // Plnou barvu smí mít jen třída **mimo range** (`class="off"`); ta žádnou
  // akci nehraje, takže nemá co mixovat.
  require("piloty", "hraných buněk malovaných jednou barvou", 0,
    countOf(html, /<td style="background:#[0-9a-fA-F]{3,6}"(?! class="off")/g));
  require("piloty", "vět „čí strategii vidíš“ = pilotů", order.length,
    countOf(html, /class="seat"/g));
  require("piloty", "verdiktů = pilotů", order.length, countOf(html, /class="verdict"/g));
  // Bez výtek nemá zamítnutí diagnózu; bod 222 stál na tom, že chyběly.
  require("piloty", "výtek = pět na pilota", order.length * 5,
    countOf(html, /class="opt opt--flag"/g));
}

/**
 * Ranže: každý mix v datech je na stránce mix.
 *
 * `class="c mix"` je jediná značka, podle které čtenář pozná, že ta barva není
 * celá pravda. Počet takových buněk se musí rovnat počtu rukou, které v draftu
 * nesou `mix` - včetně těch, kde je druhou položkou `FOLD`.
 */
function checkRanges(path: string, page: string, only?: "CHIP" | "ICM"): void {
  const html = readFileSync(path, "utf8");
  const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftFile;
  const records = draft.records.filter((record) => (
    only === undefined
    || (only === "ICM") === record.stackSetupId.startsWith("ICM")
  ));

  let mixes = 0;
  let partial = 0;
  for (const record of records) {
    for (const ratio of Object.values(record.mix ?? {})) {
      mixes += 1;
      if (Object.keys(ratio).includes("FOLD")) partial += 1;
    }
  }

  require(page, "buněk označených jako mix = mixů v datech", mixes,
    countOf(html, /class="c mix/g));
  require(page, "popisků s podílem foldu = rukou hraných zčásti", partial,
    countOf(html, /\(mix: [^"]*FOLD [0-9]+ %/g));
  require(page, "mřížek = záznamů", records.length, countOf(html, /class="grid"/g));
}

console.log("Kreslí čtecí stránka to, co v datech je?");
console.log("");

const pilots = `${deskDir}/piloty.html`;
if (existsSync(pilots)) checkPilots(pilots);
else console.log(`  ${pilots} není, přeskočeno`);

if (existsSync(draftPath)) {
  const all = `${deskDir}/ranze-vse.html`;
  const chip = `${deskDir}/ranze-chipev.html`;
  if (existsSync(all)) checkRanges(all, "ranze-vse");
  if (existsSync(chip)) checkRanges(chip, "ranze-chipev", "CHIP");
} else {
  console.log(`  ${draftPath} není, ranže přeskočeny`);
}

for (const line of checked) console.log(`  ${line}`);

if (findings.length === 0) {
  console.log("");
  console.log(`Beze ztráty: ${checked.length} kontrol.`);
  process.exit(0);
}

console.log("");
console.log("Stránka kreslí míň, než data nesou:");
for (const finding of findings) {
  console.log(`  ${finding.page}: ${finding.what} - čekáno ${finding.expected}, nalezeno ${finding.found}`);
}
console.log("");
console.log(
  "Čtenář by posuzoval něco jiného, než co v obsahu je, a jeho verdikt by se\n"
  + "zapsal, jako by to viděl. Tohle je fail-closed schválně: stránka, která\n"
  + "ztrácí informaci, se nemá dostat na FTP.",
);
process.exit(1);
