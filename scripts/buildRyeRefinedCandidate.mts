import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildMttPreflopImportReadinessReport,
  type MttPreflopRangePackImportInput,
} from "../src/data/ranges/mttPreflopRangePackImport";
import { loadAnswerHistory } from "./lib/ryeAnswerHistory.mts";
import type { DraftFile } from "./lib/ryeDraftImpact.mts";
import { RYE_PROVENANCE, selectRefinedRecords, type RefusalReason } from "./lib/ryeRefinedCandidate.mts";

/**
 * Kandidát produkčního packu se **zpřesněnými záznamy** ze schválených mřížek.
 *
 *   npm run mtt:rye-candidate -- [--draft=artifacts/rye-import/draft.json]
 *     [--base=Agents/range-intake/raw/<pack>/normalized.json]
 *     [--out=artifacts/rye-import/candidate/<pack>/normalized.json] [--write]
 *
 * ## Co to je a co to není
 *
 * Je to **kandidát do `artifacts/`**, ne produkce. Od 10. 9. 2026 stály
 * schválené mřížky před zavřenými dveřmi: produkt otvírače neznal (bod 234).
 * Od 15. 9. spot protihráče jmenuje a losuje jen mezi sedačkami, o kterých
 * knihovna něco tvrdí - zpřesněný záznam v packu je přesně to tvrzení. Tenhle
 * skript ho vyrobí: vezme produkční `normalized.json`, přidá schválené mřížky
 * jako záznamy s `vsSeat` a `provenance`, a spočítá totéž, co počítá
 * `validate:range-import`.
 *
 * Do `raw/` ani do `src/` nic nezapisuje. Mezi kandidátem a produkcí stojí
 * **povolení vlastníka**: `permission.json` produkčního packu říká „žádné
 * hodnoty z chartů třetí strany“ a tohle je poprvé, kdy to přestane platit.
 * Pack proto dostane novou verzi a manifest se musí přečíst znovu - to je
 * krok člověka, ne skriptu.
 *
 * ## Co se přiznává
 *
 * Zdroj neuvádí ante ani rychlost blindů; přebírá se předpoklad draftu
 * (REGULAR, OFF) a pack to říká v `assumptions`. Mix ve zdroji (ruka hraná
 * zčásti) jde do packu jako nejčastější akce ve strict a všechny barvené
 * akce v lenient; podíl foldu pack nemá kam dát. Každý záznam nese, odkud je.
 */

const arg = (name: string): string | undefined => process.argv
  .find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const write = process.argv.includes("--write");
const draftPath = arg("draft") ?? "artifacts/rye-import/draft.json";
const basePath = arg("base")
  ?? "Agents/range-intake/raw/mtt-full-ring-9-regular-preflop-chip-ev-ante-off-production-v1/normalized.json";

if (!existsSync(draftPath) || !existsSync(basePath)) {
  console.error(`Chybí ${existsSync(draftPath) ? basePath : draftPath}.`);
  process.exit(2);
}

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftFile;
const base = JSON.parse(readFileSync(basePath, "utf8")) as MttPreflopRangePackImportInput;
const outPath = arg("out") ?? `artifacts/rye-import/candidate/${base.id}/normalized.json`;
const history = loadAnswerHistory();

// Draft předpokládá REGULAR / OFF; pack s jiným rozměrem by dostal obsah,
// který o něm nikdo netvrdil.
const dims = base.dimensions;
if (dims.tableFormat !== "FULL_RING_9" || dims.evModel !== "CHIP_EV"
  || dims.blindSpeed !== "REGULAR" || dims.ante !== "OFF") {
  console.error(`Základ ${base.id} má rozměry ${JSON.stringify(dims)}; draft předpokládá FULL_RING_9 / REGULAR / CHIP_EV / OFF.`);
  process.exit(2);
}

const selection = selectRefinedRecords(draft.records, history);
const today = new Date().toISOString().slice(0, 10);

// Obecný záznam téže buňky musí v základu být: zpřesnění je nadstavba a bez
// obecného by spot bez zpřesněného protihráče neměl na co spadnout.
const generalCells = new Set(base.records
  .filter((record) => record.vsSeat === undefined)
  .map((record) => `${record.context}|${record.position}|${record.bucket}`));
const withoutGeneral = selection.accepted
  .filter((record) => !generalCells.has(`${record.context}|${record.position}|${record.bucket}`));

const candidate: MttPreflopRangePackImportInput = {
  ...base,
  version: `${base.version}+rye-refined-${today}`,
  verifiedAt: today,
  licenseNote: `${base.licenseNote} Zpřesněné záznamy (vsSeat) pocházejí z ${RYE_PROVENANCE}; `
    + "jejich šíření v balíku produktu vyžaduje vlastní přezkum povolení (permission.json).",
  assumptions: [
    ...base.assumptions,
    `Zpřesněné záznamy (vsSeat): ${selection.accepted.length} mřížek z ${RYE_PROVENANCE}, `
      + "schválených vlastníkem 10. a 15. 9. 2026 (Agents/range-intake/answers-*.json); každý záznam nese provenance.",
    "Zdroj zpřesněných záznamů neuvádí ante ani rychlost blindů; přebírá se předpoklad draftu (REGULAR, OFF).",
    "Mix ve zdroji (ruka hraná zčásti) se přenáší jako nejčastější akce ve strict a všechny barvené akce v lenient; podíl foldu se nepřenáší.",
  ],
  sourceEvidence: [
    ...base.sourceEvidence,
    {
      title: "RYE Rangeviewer 2021 Updated with ICM Ranges",
      url: "https://www.raiseyouredge.com/",
      provider: "Raise Your Edge",
      verifiedAt: today,
      licenseNote: "Koupený produkt vlastníka; přenášejí se seznamy akcí po třídách rukou, ne obrázky ani soubory zdroje.",
    },
  ],
  records: [...base.records, ...selection.accepted],
};

const report = buildMttPreflopImportReadinessReport(candidate);

const REASON_LABEL: Record<RefusalReason, string> = {
  unanswered: "bez odpovědi",
  rejected: "nesedí",
  stale: "odpověď zastarala (překreslené)",
  icm: "ICM - produkční pack pro $EV není",
  noOpponent: "bez protihráče (push/fold)",
  contextNotRefined: "kontext bez osy otvírače",
  pendingBvb: "BB proti SB - v produktu BVB, rozhodne vlastník",
  actionNotOffered: "doporučení, které produkt nenabízí",
  duplicateCell: "táž buňka a otvírač podruhé",
};

console.log("Kandidát produkčního packu se zpřesněnými záznamy");
console.log("");
console.log(`základ: ${base.id} (${base.version}, ${base.records.length} záznamů)`);
console.log(`draft: ${draft.records.length} mřížek, odpovědi z ${history.readAt}`);
console.log("");
console.log(`přijato jako zpřesněný záznam: ${selection.accepted.length}`);
const byContext = new Map<string, number>();
for (const record of selection.accepted) {
  const key = `${record.context}|${record.position}`;
  byContext.set(key, (byContext.get(key) ?? 0) + 1);
}
for (const [key, count] of [...byContext].sort()) console.log(`  ${key.padEnd(18)} ${count}`);
console.log("");
console.log("propadlo:");
for (const [reason, count] of Object.entries(selection.counts) as [RefusalReason, number][]) {
  if (count > 0) console.log(`  ${REASON_LABEL[reason].padEnd(48)} ${count}`);
}
for (const item of selection.refused.filter((row) => row.reason === "actionNotOffered" || row.reason === "duplicateCell")) {
  console.log(`    ${item.sourceFile}: ${item.detail}`);
}
if (withoutGeneral.length > 0) {
  console.log("");
  console.log(`bez obecného záznamu v základu (spot na ně nespadne): ${withoutGeneral.length}`);
  for (const record of withoutGeneral) console.log(`  ${record.context}|${record.position}|${record.bucket} vs ${record.vsSeat}`);
}
console.log("");
console.log(`kontrola importu: valid ${report.valid}, productionReady ${report.productionReady}, `
  + `záznamů ${report.recordCount}, duplicit ${report.duplicateRecordKeys.length}`);
for (const line of report.errors) console.log(`  chyba: ${line}`);
for (const line of report.warnings.slice(0, 12)) console.log(`  varování: ${line}`);
if (report.warnings.length > 12) console.log(`  … a dalších ${report.warnings.length - 12} varování`);

console.log("");
if (write) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(candidate, null, 2), "utf8");
  console.log(`zapsáno: ${outPath}`);
} else {
  console.log(`nic se nezapsalo; s --write vznikne ${outPath}`);
}
console.log("");
console.log("Do produkce to nejde samo. Pack mění původ dat (koupené charty vedle");
console.log("vlastního exportu), takže permission.json produkčního packu musí vlastník");
console.log("přečíst znovu pro novou verzi; teprve pak validate:range-import a");
console.log("build:range-module. BB proti SB čeká na rozhodnutí, kam patří (BVB).");
