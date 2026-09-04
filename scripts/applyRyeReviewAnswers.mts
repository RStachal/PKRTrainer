import { readFileSync } from "node:fs";

import {
  type DraftFile,
  type DraftRecord,
  impactOf,
  seatCollisions,
} from "./lib/ryeDraftImpact.mts";

/**
 * Co majitel u draftu odpověděl, přeložené do rozhodnutí.
 *
 *   npm run mtt:rye-answers -- --answers="DRILLEV-REVIEW-V2 36o 38x24 0?"
 *   npm run mtt:rye-answers -- --answers-file=odpovedi.txt
 *
 * ## Proč identifikátory, a ne pozice
 *
 * Stránka řadí mřížky podle dopadu a ten se mění s obsahem - noc přidá rodinu
 * a pořadí se přeskládá. Poziční export by po přegenerování sedl na jiné
 * mřížky, tedy tiše přiřadil verdikt cizí range. Token proto nese **index
 * v draftu**, který se nemění.
 *
 * ## Co skript dělá a co ne
 *
 * Shrne odpovědi a vypíše, co z nich plyne. **Nic nezapisuje do `src/`.**
 * Schválená mřížka je vstup do importu, ne import sám; mezi tím stojí ještě
 * rozhodnutí, jestli se ta buňka vůbec rozdává (bod 140) a jak se přeloží
 * ztracená rozlišení.
 */

const FLAG_LABEL: Record<string, string> = {
  "1": "moc široké",
  "2": "moc těsné",
  "3": "špatné ruce",
  "4": "špatný mix",
  "5": "sloučení akcí vadí",
};

const VERDICT_LABEL: Record<string, string> = {
  o: "sedí",
  x: "nesedí",
  "?": "nevím",
  s: "přeskočeno",
};

const draftPath = process.argv.find((arg) => arg.startsWith("--draft="))?.split("=")[1]
  ?? "artifacts/rye-import/draft.json";
const answersArg = process.argv.find((arg) => arg.startsWith("--answers="))?.split("=").slice(1).join("=");
const answersFile = process.argv.find((arg) => arg.startsWith("--answers-file="))?.split("=")[1];

const raw = answersFile !== undefined ? readFileSync(answersFile, "utf8") : answersArg;
if (raw === undefined) {
  console.error('Usage: npm run mtt:rye-answers -- --answers="DRILLEV-REVIEW-V2 36o 38x24" | --answers-file=<soubor>');
  process.exit(2);
}

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftFile;

const body = raw.replace(/^DRILLEV-REVIEW-V\d+\s*/, "").trim();
if (body.length === 0) {
  console.log("Odpovědi jsou prázdné - nic k vyhodnocení.");
  process.exit(0);
}

const byVerdict = new Map<string, DraftRecord[]>();
const flagCounts = new Map<string, number>();
const unknown: string[] = [];

for (const token of body.split(/\s+/)) {
  const match = /^(\d+)([ox?s])([1-5]*)$/.exec(token);
  if (match === null) { unknown.push(token); continue; }
  const record = draft.records[Number(match[1])];
  if (record === undefined) { unknown.push(token); continue; }
  byVerdict.set(match[2], [...(byVerdict.get(match[2]) ?? []), record]);
  for (const flag of match[3]) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
}

const answered = [...byVerdict.values()].reduce((sum, list) => sum + list.length, 0);
console.log("Odpovědi k draftu");
console.log("");
console.log(`zodpovězeno: ${answered} z ${draft.records.length}`);
for (const [verdict, label] of Object.entries(VERDICT_LABEL)) {
  const list = byVerdict.get(verdict) ?? [];
  console.log(`  ${label.padEnd(12)} ${String(list.length).padStart(4)}`);
}
if (flagCounts.size > 0) {
  console.log("");
  console.log("co bylo u „nesedí“ vytčeno:");
  for (const [flag, count] of [...flagCounts].sort((left, right) => right[1] - left[1])) {
    console.log(`  ${(FLAG_LABEL[flag] ?? flag).padEnd(20)} ${count}x`);
  }
}
if (unknown.length > 0) {
  console.log("");
  console.log(`nepřečtené tokeny (${unknown.length}): ${unknown.slice(0, 8).join(", ")}`);
}

/**
 * Co ze schváleného může dnes dojít k hráči.
 *
 * ## Proč to tady přibylo
 *
 * Do 4. 9. 2026 skript vypsal, kolik mřížek je schválených - a to je číslo o
 * vyrobené práci, ne o doručení. Pravidlo 4 říká opak: měří se, co dojde
 * k hráči. Rozdíl je tu velký a měřitelný, protože schválení samo o sobě
 * nestačí ani jednou ze tří stran:
 *
 * 1. **Buňka se nemusí rozdávat.** Obranu proti otevření trenažér rozdává až
 *    od lojacku, takže mřížka pro UTG+1 po schválení nezmění nic.
 * 2. **Kombinace může být dnes prázdná** - schválení je pak to nejcennější, co
 *    se může stát: odpověď nebude přesnější, ona vůbec bude.
 * 3. **Dvě mřížky můžou mířit do jedné buňky**, protože se liší jen otvíračem
 *    a produkt tu osu nemá (`TableState` nese `facing`, ne sedačku otvírače;
 *    bod 140). Tohle je jediná část, která se importem vyřešit nedá.
 */
function reportDelivery(approved: readonly DraftRecord[]): void {
  let landing = 0;
  let unlocking = 0;
  let notDrilled = 0;
  let changedClasses = 0;
  let newCells = 0;
  for (const record of approved) {
    const impact = impactOf(record);
    if (impact.notDrilled) { notDrilled += 1; continue; }
    if (impact.unlocksEmpty) unlocking += 1;
    if (impact.newCell) newCells += 1;
    changedClasses += impact.changed;
    landing += 1;
  }

  console.log("");
  console.log("co z toho může dnes dojít k hráči:");
  console.log(`  rozdává se to                     ${String(landing).padStart(4)}`);
  console.log(`    z toho rozsvítí prázdnou relaci ${String(unlocking).padStart(4)}`);
  console.log(`    z toho buňka, kterou nemáme     ${String(newCells).padStart(4)}`);
  console.log(`  tříd, kde by se odpověď změnila   ${String(changedClasses).padStart(4)}`);
  console.log(`  nerozdává se, takže nezmění nic   ${String(notDrilled).padStart(4)}`);

  const collisions = seatCollisions(approved);
  if (collisions.length === 0) return;

  const disagreeing = collisions.reduce((sum, row) => sum + row.disagreeing, 0);
  console.log("");
  console.log(`sráží se o otvírače: ${collisions.length} buněk, ${disagreeing} tříd v rozporu`);
  for (const row of collisions.slice(0, 8)) {
    console.log(`  ${row.cell.padEnd(22)} ${row.seats.join(", ").padEnd(18)} ${row.disagreeing} tříd`);
  }
  if (collisions.length > 8) console.log(`  … a dalších ${collisions.length - 8}`);
  console.log("");
  console.log(
    "Tyhle mřížky se liší jen tím, kdo otevřel, a produkt tu osu nemá:\n"
    + "`getRangeRecord` se ptá na sedačku, hloubku a kontext, `TableState` nese\n"
    + "`facing` bez otvírače. Uložit se dá jen jedna z nich, a která to bude,\n"
    + "je rozhodnutí o rozsahu produktu (bod 140), ne úloha importu.",
  );
}

const approved = byVerdict.get("o") ?? [];
if (approved.length > 0) {
  console.log("");
  console.log("schváleno k dalšímu kroku:");
  const byContext = new Map<string, number>();
  for (const record of approved) {
    byContext.set(record.context, (byContext.get(record.context) ?? 0) + 1);
  }
  for (const [context, count] of [...byContext].sort((left, right) => right[1] - left[1])) {
    console.log(`  ${context.padEnd(12)} ${count}`);
  }
  const mixes = approved.reduce((sum, record) => sum + Object.keys(record.mix ?? {}).length, 0);
  console.log(`  rukou s mixem v tom, co je schválené: ${mixes}`);
  reportDelivery(approved);
}

console.log("");
console.log(
  "Nic se nezapsalo. Schválená mřížka je vstup do importu, ne import sám -\n"
  + "mezi tím stojí rozhodnutí, jestli se ta buňka vůbec rozdává, a jak se\n"
  + "přeloží rozlišení, která produkt nemá.",
);
