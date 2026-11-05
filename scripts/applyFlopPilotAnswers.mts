import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";
import { MTT_POSTFLOP_PILOT_CATALOG } from "../src/data/ranges/mttPostflopPilotCatalog";
import {
  flopPilotContentHash,
  parseTurnReviewVerdicts,
  type TurnReviewVerdictRecord,
} from "../src/data/ranges/turnReviewVerdict";
import { PILOT_REVIEW_FLAGS, pilotReviewOrder, pilotReviewPageHash } from "./lib/flopPilotReview.mts";

/**
 * Co majitel u flopových pilotů odpověděl, zapsané jako verdikt.
 *
 *   npm run mtt:pilot-answers -- --answers="DRILLEV-PILOT-V1 a1b2c3d4 0o 1x"
 *   npm run mtt:pilot-answers -- --answers-file=odpovedi.txt --reviewer="Radim" --write
 *
 * ## Proč zvlášť, a proč fail-closed
 *
 * `MEDIUM` je brána do produkce a sedm flopových pilotů ji dnes drží jen na
 * dohledatelnosti solvu - na dokladu o tom, odkud data jsou, ne že jsou dobrá.
 * Majitel 3. 9. 2026 zvolil, že projdou týmž čtením jako turn. Tohle je ten
 * zápis; bez něj by čtení skončilo u pocitu.
 *
 * **Bez `--write` se nic nezapisuje.** Vypíše se, co by se stalo.
 *
 * ## Proč token nese otisk stránky
 *
 * Verdikt se váže na otisk toho, co bylo čteno. Kdyby se mezi vykreslením
 * stránky a zapsáním odpovědí obsah pilotů změnil, zapsal by se verdikt na
 * obsah, který nikdo neviděl - tedy tvrzení „přečteno" o něčem jiném. Token
 * proto nese otisk celé stránky a zápis se **odmítne**, když nesedí. Je to
 * táž past jako v bodě 153, jen o patro výš: tam se přečíslovaly mřížky, tady
 * by se pod verdiktem vyměnil obsah.
 */

const write = process.argv.includes("--write");
const reviewer = process.argv.find((arg) => arg.startsWith("--reviewer="))?.split("=")[1]
  ?? "neuvedeno";
const answersFile = process.argv.find((arg) => arg.startsWith("--answers-file="))?.split("=")[1];
const answersArg = process.argv.find((arg) => arg.startsWith("--answers="))?.split("=")[1];

const raw = answersFile !== undefined
  ? readFileSync(answersFile, "utf8")
  : answersArg;

if (raw === undefined) {
  console.error('Použití: npm run mtt:pilot-answers -- --answers="DRILLEV-PILOT-V1 <otisk> 0o 1x"');
  process.exit(2);
}

const VERDICTS_PATH = "Agents/turn-review/verdicts.json";

/** Písmeno na verdikt. Stejná abeceda jako u `mtt:rye-answers`. */
const OUTCOME: Record<string, "ACCEPTED" | "NEEDS_WORK" | null> = {
  o: "ACCEPTED",
  x: "NEEDS_WORK",
  "?": null,
  s: null,
};

const tokens = raw.replace(/^DRILLEV-PILOT-V\d+\s*/, "").trim().split(/\s+/).filter(Boolean);
const pageHash = tokens.shift();
const order = pilotReviewOrder(generatedMttPostflopPilotPacks);
const expected = pilotReviewPageHash(order);

console.log(`Odpovědi k flopovým pilotům${write ? "" : " (nic se nezapisuje)"}`);
console.log("");

if (pageHash !== expected) {
  console.error(`Otisk stránky nesedí: token nese ${pageHash ?? "nic"}, obsah má ${expected}.`);
  console.error("Piloty se od vykreslení změnily. Zapsat verdikt teď by tvrdil, že se četlo");
  console.error("něco, co nikdo neviděl. Vygeneruj stránku znovu: npm run mtt:pilot-review");
  process.exit(1);
}

const catalogById = new Map(MTT_POSTFLOP_PILOT_CATALOG.map((entry) => [entry.id, entry]));
const existing = parseTurnReviewVerdicts(readFileSync(VERDICTS_PATH, "utf8"));
const reviewedAt = new Date().toISOString().slice(0, 10);

let next: TurnReviewVerdictRecord[] = [...existing];
const unknown: string[] = [];
let written = 0;
let held = 0;

for (const token of tokens) {
  // Výtky jsou součástí odpovědi, ne ozdoba. Do 9. 9. 2026 je tenhle výraz
  // nepřipouštěl, takže vyplněný draft - kde je u „něco je špatně" zaškrtnutá
  // aspoň jedna - propadl **celý** do nepřečtených tokenů a skript oznámil
  // „verdiktů k zápisu: 0", jako by čtenář neodpověděl nic.
  const match = /^([0-9]+)([oxs?])([1-5]*)$/.exec(token);
  if (match === null) { unknown.push(token); continue; }
  const entry = order[Number(match[1])];
  if (entry === undefined) { unknown.push(token); continue; }
  const outcome = OUTCOME[match[2]];
  const label = catalogById.get(entry.catalogId)?.label ?? entry.catalogId;
  const flags = [...match[3]].map((code) => PILOT_REVIEW_FLAGS.get(code) ?? code);
  if (outcome === null) {
    // „Nejsem si jistý" a „přeskočit" **nejsou verdikt**. Zapsat je jako cokoli
    // by z nerozhodnutí udělalo rozhodnutí, a to je přesně ten druh tichého
    // posunu, kvůli kterému je tenhle žebříček oddělený od mechanické kontroly.
    held += 1;
    console.log(`  ponecháno beze změny  ${label}`);
    continue;
  }
  const contentHash = flopPilotContentHash(entry.pack.rules);
  next = next.filter((row) => (
    row.familyId !== entry.catalogId || (row.street ?? "TURN") !== "FLOP"
  ));
  next.push({
    street: "FLOP",
    familyId: entry.catalogId,
    contentHash,
    outcome,
    reviewedAt,
    reviewer,
    basis: "PLAYER_READ",
    // Bez výtek je „NEEDS_WORK" verdikt bez diagnózy: příště se neví, co se
    // hledalo a jestli se to spravilo. `confidenceForFamily` je vypisuje
    // v důvodu, takže se dostanou i tam, kde se o důvěře rozhoduje.
    ...(flags.length > 0 ? { notes: flags.join(", ") } : {}),
  });
  written += 1;
  console.log(`  ${outcome.padEnd(11)} ${label} (otisk ${contentHash})`
    + (flags.length > 0 ? ` - ${flags.join(", ")}` : ""));
}

console.log("");
if (unknown.length > 0) console.log(`nepřečtené tokeny (${unknown.length}): ${unknown.join(", ")}`);
console.log(`verdiktů k zápisu: ${written}, ponecháno beze změny: ${held}`);

if (write && unknown.length > 0) {
  // Zapsat část odpovědí a zbytek zahodit je horší než nezapsat nic: verdikty
  // by v souboru vypadaly úplně a nikdo by se nedozvěděl, že čtenář odpověděl
  // i na piloty, které v něm chybí.
  console.error("");
  console.error("Zápis odmítnut: části tokenu nerozumím, a zapsat jen zbytek by tvrdilo, že");
  console.error("čtenář odpověděl méně, než odpověděl. Oprav token, nebo vygeneruj stránku znovu.");
  process.exit(1);
}

if (!write) {
  console.log("");
  console.log('Nic se nezapsalo. Zápis: přidej --write a --reviewer="Jméno".');
} else if (reviewer === "neuvedeno") {
  // Verdikt bez čtenáře je tvrzení bez toho, kdo ho vydal.
  console.error('Zápis odmítnut: --reviewer="Jméno" je povinné, verdikt nese, kdo četl.');
  process.exit(1);
} else {
  mkdirSync(dirname(VERDICTS_PATH), { recursive: true });
  writeFileSync(VERDICTS_PATH, `${JSON.stringify({
    schemaVersion: "PKRTRAINER_TURN_REVIEW_V1",
    verdicts: [...next].sort((left, right) => left.familyId.localeCompare(right.familyId)),
  }, null, 2)}\n`, "utf8");
  console.log(`Zapsáno do ${VERDICTS_PATH}.`);
  console.log("Důvěru packů to samo nepřeznačí - to udělá až generátor, který je staví.");
}
