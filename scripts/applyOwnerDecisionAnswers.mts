import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  DECISIONS_TOKEN_PREFIX, OWNER_DECISIONS_2026_09_17, decisionsHash,
} from "./lib/ownerDecisions.mts";

/**
 * Odpovědi vlastníka ze stránky rozhodnutí, přeložené na otázky.
 *
 *   npm run mtt:decision-answers -- --answers-file=odpovedi.txt [--out=Agents/decisions/answers-YYYY-MM-DD.json]
 *   npm run mtt:decision-answers -- --answers="DRILLEV-DECISIONS-V1 <otisk> 1a 2a 3a"
 *
 * Soubor je export ze stránky: první řádek token, další řádky `T<id>: text`.
 * Otisk v tokenu musí sedět na dnešní znění otázek - odpověď na jinak znějící
 * otázku se nepřekládá, aby se nezapsalo rozhodnutí, které nikdo neudělal.
 * Nic dalšího skript nedělá: rozhodnutí se zapracovává rukou a zapisuje do
 * deníku, tohle je jen doklad, co bylo zvoleno.
 */

const arg = (name: string): string | undefined => process.argv
  .find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const file = arg("answers-file");
const raw = file !== undefined ? readFileSync(file, "utf8") : arg("answers");
if (raw === undefined) {
  console.error("Usage: npm run mtt:decision-answers -- --answers-file=<soubor> | --answers=\"DRILLEV-DECISIONS-V1 …\"");
  process.exit(2);
}

const decisions = OWNER_DECISIONS_2026_09_17;
const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#"));
const tokenLine = lines.find((line) => line.startsWith(DECISIONS_TOKEN_PREFIX));
if (tokenLine === undefined) {
  console.error(`Nenašel jsem token s předponou ${DECISIONS_TOKEN_PREFIX}.`);
  process.exit(2);
}
const [, hash, ...parts] = tokenLine.split(/\s+/);
const expected = decisionsHash(decisions);
if (hash !== expected) {
  console.error(`Otisk otázek nesedí: token ${hash}, dnešní otázky ${expected}. Odpovědi patří k jiné verzi stránky.`);
  process.exit(2);
}

const texts = new Map<number, string>();
for (const line of lines) {
  const match = /^T(\d+): (.*)$/.exec(line);
  if (match !== null) texts.set(Number(match[1]), match[2]);
}

const answers: { id: number; title: string; code: string; label: string; recommended: boolean; text?: string }[] = [];
const unknown: string[] = [];
for (const part of parts) {
  const match = /^(\d+)([a-z])$/.exec(part);
  const decision = match === null ? undefined : decisions.find((row) => row.id === Number(match[1]));
  const option = match === null ? undefined : decision?.options.find((row) => row.code === match[2]);
  if (match === null || decision === undefined || option === undefined) { unknown.push(part); continue; }
  answers.push({
    id: decision.id,
    title: decision.title,
    code: option.code,
    label: option.label,
    recommended: option.code === decision.recommended,
    ...(texts.has(decision.id) ? { text: texts.get(decision.id) } : {}),
  });
}

console.log("Rozhodnutí vlastníka");
console.log("");
for (const answer of answers.sort((left, right) => left.id - right.id)) {
  console.log(`${String(answer.id).padStart(2)}. ${answer.title}`);
  console.log(`    ${answer.code.toUpperCase()}) ${answer.label}${answer.recommended ? "" : "  (jinak než doporučení)"}`);
  if (answer.text !== undefined) console.log(`    text: ${answer.text}`);
}
const missing = decisions.filter((row) => !answers.some((answer) => answer.id === row.id));
if (missing.length > 0) {
  console.log("");
  console.log(`bez odpovědi (${missing.length}): ${missing.map((row) => row.id).join(", ")}`);
}
if (unknown.length > 0) {
  console.log("");
  console.log(`nepřečtené tokeny (${unknown.length}): ${unknown.join(", ")}`);
}

const outPath = arg("out");
if (outPath !== undefined) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({
    schemaVersion: "PKRTRAINER_OWNER_DECISIONS_V1",
    questionsHash: hash,
    answers,
  }, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`Zapsáno: ${outPath}`);
}
