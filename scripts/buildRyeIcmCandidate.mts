import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildMttPreflopImportReadinessReport,
  type MttPreflopRangePackImportInput,
} from "../src/data/ranges/mttPreflopRangePackImport";
import { loadAnswerHistory } from "./lib/ryeAnswerHistory.mts";
import type { DraftFile } from "./lib/ryeDraftImpact.mts";
import { selectIcmRecords } from "./lib/ryeIcmCandidate.mts";
import { renderPreviewMttPreflopRangePackModule } from "../src/data/ranges/rangeModuleBuilder";
import { RYE_PROVENANCE, type RefusalReason } from "./lib/ryeRefinedCandidate.mts";

/**
 * Kandidát **$EV packu se scénářem** ze schválených ICM mřížek.
 *
 *   npm run mtt:rye-icm-candidate -- [--draft=artifacts/rye-import/draft.json]
 *     [--out=artifacts/rye-import/icm-candidate/<pack>/normalized.json] [--write]
 *
 * ## Co to je
 *
 * Rozhodnutí vlastníka 22. 9. 2026: **3a** - 40 schválených ICM mřížek patří do
 * profilu SIX_MAX / $EV se scénářem v klíči; **4a** - jako vrstva a preview,
 * profil rozdává jen buňky, které zná; **5b** - bez ceny, protože zdroj neuvádí
 * ani počet hráčů, ani výplatní strukturu, a bez nich se ICM cena spočítat nedá.
 *
 * Pack proto vzniká **prázdný krom toho, co zdroj tvrdí**: žádné obecné záznamy,
 * žádné dopočítané buňky, žádná EV. Drill se pod scénářem ptá jen tam, kde má
 * záznam (`scenarioCandidates`), a nic neoceňuje (`actionEvs === undefined`).
 *
 * ## Co to není
 *
 * Není to produkční pack a nikdy jím nebude: produkční brána chce každou
 * sedačku × hloubku × kontext a z RYE se úplný $EV pack neposkládá (49 ze 702
 * buněk i s ICM půlkou, měřeno 17. 9. 2026). Nálepka zůstává LOW a `assumptions`
 * říkají, pro jaký stůl který záznam platí.
 */

const arg = (name: string): string | undefined => process.argv
  .find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const write = process.argv.includes("--write");
const draftPath = arg("draft") ?? "artifacts/rye-import/draft.json";
const packId = "mtt-six-max-regular-preflop-dolar-ev-ante-on-icm-preview-v1";
/** Povolení vlastníka pro tenhle pack; pack se na něj odkazuje v licenseNote. */
const PERMISSION_PATH = `Agents/range-intake/raw/${packId}/permission.json`;
const outPath = arg("out") ?? `artifacts/rye-import/icm-candidate/${packId}/normalized.json`;
/** Kam vykreslit modul do `src/`; bez toho zůstane kandidát jen v `artifacts/`. */
const modulePath = arg("module");
const exportName = arg("export") ?? "mttIcmPreviewRangePack";

if (!existsSync(draftPath)) {
  console.error(`Chybí ${draftPath}. Nejdřív: npm run mtt:rye-import -- --source=<korpus> --write`);
  process.exit(2);
}

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftFile;
const history = loadAnswerHistory();
const selection = selectIcmRecords(draft.records, history);
const today = new Date().toISOString().slice(0, 10);

const approvalDates = (): string => {
  const dates = new Set<string>();
  for (const record of selection.accepted) {
    const match = /schváleno (\d{4}-\d{2}-\d{2})/.exec(record.provenance ?? "");
    if (match !== null) dates.add(match[1]);
  }
  return [...dates].sort()
    .map((date) => `${Number(date.slice(8, 10))}. ${Number(date.slice(5, 7))}. ${date.slice(0, 4)}`)
    .join(" a ");
};

const scenarioLines = Object.entries(selection.stackSetups)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([id, setup]) => {
    const count = selection.accepted.filter((record) => record.stackSetupId === id).length;
    return `Scénář ${id}: ${setup.label} - ${count} mřížek. Mimo tohle rozložení stacků záznamy neplatí.`;
  });

const candidate: MttPreflopRangePackImportInput = {
  contentLanguage: "cs",
  id: packId,
  version: `rye-icm-preview-${today}`,
  createdAt: today,
  verifiedAt: today,
  dimensions: {
    gameVariant: "MTT",
    tableFormat: "SIX_MAX",
    blindSpeed: "REGULAR",
    street: "PREFLOP",
    evModel: "DOLAR_EV",
    ante: "ON",
    rakeMode: "NONE",
  },
  confidence: "LOW",
  licenseKind: "OWNED_SOLVER_EXPORT",
  licenseNote: `Záznamy pocházejí z ${RYE_PROVENANCE}; přenášejí se seznamy akcí po třídách rukou `
    + "(strict/lenient), ne obrázky ani soubory zdroje. Každý záznam nese provenance. Šíření v balíku "
    + "produktu povolil vlastník 22. 9. 2026 (odpověď 2a): totéž povolení jako u devítistolových profilů "
    + `ze 17. 9. 2026, týž zdroj a týž způsob přenosu; manifest ${PERMISSION_PATH}.`,
  assumptions: [
    "PREVIEW, ne produkce: profil rozdává jen buňky, které zdroj tvrdí, a zbytek nedopočítává "
      + "(rozhodnutí vlastníka 22. 9. 2026, 4a).",
    "Shove proti 3betu se nabízí tam, kde ho mřížka spotu kreslí (rozhodnutí vlastníka 22. 9. 2026, "
      + "odpověď 1a); do té doby devět mřížek leželo, protože jejich doporučení nešlo zvolit.",
    `Záznamy jsou ICM mřížky z ${RYE_PROVENANCE}, schválené vlastníkem ${approvalDates()} `
      + "(Agents/range-intake/answers-*.json).",
    "Scénář (rozložení stacků u stolu) je součástí klíče: dvě mřížky téže buňky a téhož otvírače se "
      + "liší jen jím (rozhodnutí vlastníka 22. 9. 2026, 3a). Stůl scénář kreslí, Question_ID ho nese.",
    "Bez ceny: zdroj neuvádí počet zbývajících hráčů ani výplatní strukturu, takže se ICM cena spočítat "
      + "nedá a spot žádnou EV neukazuje (rozhodnutí vlastníka 22. 9. 2026, 5b).",
    "Sedačky zdroje (UTG, HJ, CO, BU, SB, BB) odpovídají šestistolové sadě produktu 1:1; nic se nepřekládá "
      + "ani neodvozuje z devítistolového packu.",
    "Zdroj počítá s BB ante (údaj vlastníka 22. 9. 2026, 7a), proto ante ON; rychlost blindů zdroj neuvádí "
      + "a pack se drží REGULAR.",
    "Mix ve zdroji (ruka hraná zčásti) se přenáší jako nejčastější akce ve strict a všechny barvené akce "
      + "v lenient; podíl foldu se nepřenáší.",
    ...scenarioLines,
  ],
  searchQueries: [
    "RYE Rangeviewer 2021 ICM ranges six handed final table",
    "ICM preflop ranges stack distribution final table nine payouts",
    "tournament ICM range chart UTG HJ CO BU SB BB stacks",
  ],
  sourceEvidence: [
    {
      title: "RYE Rangeviewer 2021 Updated with ICM Ranges",
      url: "https://www.raiseyouredge.com/",
      provider: "Raise Your Edge",
      verifiedAt: today,
      licenseNote: "Koupený produkt vlastníka; přenášejí se seznamy akcí po třídách rukou, ne obrázky ani soubory zdroje.",
      methodologyNote: "ICM mřížky zdroje pojmenované rozložením stacků u stolu; scénáře čtené z navigace korpusu.",
    },
    // Druhý zdroj není druhý zdroj hodnot - hodnoty jsou z RYE a odjinud
    // nepřicházejí. Dokládá **tvrzení packu**, že ICM range závisí na rozložení
    // stacků, a proto scénář patří do klíče. Táž konstrukce jako u odvozených
    // ICM packů (`mttIcmDerivedRangePacks`): koncept veřejně, hodnoty ne.
    {
      title: "What is the Bubble Factor in poker tournaments?",
      url: "https://blog.gtowizard.com/what-is-the-bubble-factor-in-poker-tournaments/",
      provider: "GTO Wizard",
      verifiedAt: "2026-08-08",
      licenseNote: "Použito jen jako doklad konceptu; žádná range ani frekvence není převzata.",
      methodologyNote: "Veřejný popis bubble faktoru: ICM úprava se řídí rozložením stacků a výplatami, "
        + "takže jedna range neplatí pro druhý stůl - proto je scénář součástí klíče a ne poznámka.",
    },
  ],
  stackSetups: selection.stackSetups,
  records: selection.accepted,
};

const report = buildMttPreflopImportReadinessReport(candidate);

const REASON_LABEL: Record<RefusalReason, string> = {
  unanswered: "bez odpovědi",
  rejected: "nesedí",
  stale: "odpověď zastarala (překreslené)",
  icm: "bez scénáře (patří do chipEV packu)",
  noOpponent: "bez protihráče",
  contextNotRefined: "kontext bez osy otvírače",
  actionNotOffered: "doporučení, které produkt nenabízí",
  notDealt: "sedačka nebo hloubka, na kterou se drill v tom kontextu neptá",
  duplicateCell: "táž buňka, otvírač i scénář podruhé",
  partialPage: "stránka kreslí jen jednu větev strategie",
};

console.log("Kandidát $EV packu se scénářem (ICM preview)");
console.log("");
console.log(`draft: ${draft.records.length} mřížek, odpovědi z ${history.readAt}`);
console.log(`přijato: ${selection.accepted.length} záznamů v ${Object.keys(selection.stackSetups).length} scénářích`);
for (const [reason, count] of Object.entries(selection.counts) as [RefusalReason, number][]) {
  if (count > 0) console.log(`  propadlo: ${REASON_LABEL[reason]} ${count}`);
}
// Mřížka, jejíž doporučení produkt nenabízí, je ta, kde se dá něco opravit -
// ať v nabídce akcí, nebo v překladu slovníku. Ostatní důvody jsou úsudek
// vlastníka nebo tvar zdroje, tam není co ladit.
for (const item of selection.refused.filter((row) => row.reason === "actionNotOffered" || row.reason === "duplicateCell")) {
  console.log(`    ${item.sourceFile}: ${item.detail}`);
}
console.log("");
for (const [id, setup] of Object.entries(selection.stackSetups).sort(([left], [right]) => left.localeCompare(right))) {
  const cells = selection.accepted.filter((record) => record.stackSetupId === id);
  const contexts = [...new Set(cells.map((record) => `${record.context}|${record.position}`))].sort();
  console.log(`${id}  ${setup.label}`);
  console.log(`  ${cells.length} mřížek: ${contexts.join(", ")}`);
}
console.log("");
console.log(`pack: ${report.packId}, záznamů ${report.recordCount}, platný: ${report.valid ? "ano" : "ne"}`);
if (report.errors.length > 0) {
  console.log("chyby:");
  for (const error of report.errors) console.log(`  ${error}`);
}
console.log(`produkčně hotový: ${report.productionReady ? "ano" : "ne"} (preview je záměr, ne nedodělek - rozhodnutí 4a)`);

if (!write) {
  console.log("");
  console.log(`Nic nezapsáno. Zápis: přidej --write (zapíše ${outPath})`);
  process.exit(report.errors.length === 0 ? 0 : 1);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
console.log("");
console.log(`zapsáno: ${outPath}`);

// Modul do `src/`: preview cestou, ne produkční. Produkční `build:range-module`
// chce `productionReady` (každou sedačku × hloubku × kontext) a slot v registru
// - obojí je pro vrstvu, co odpovídá jen tam, kde ví, nedosažitelné z principu.
if (modulePath !== undefined) {
  const rendered = renderPreviewMttPreflopRangePackModule(candidate, exportName, [
    `${candidate.id} - preview vrstva ze schválených ICM mřížek RYE.`,
    "Generováno: npm run mtt:rye-icm-candidate -- --write --module=<cesta>. Needitovat ručně.",
    "Rozhodnutí vlastníka 22. 9. 2026: 3a (scénář v klíči), 4a (vrstva/preview), 5b (bez ceny).",
  ]);
  if (rendered.moduleText === null) {
    console.log("");
    console.log("modul se nevykreslil:");
    for (const error of rendered.errors) console.log(`  ${error}`);
    process.exit(1);
  }
  mkdirSync(dirname(modulePath), { recursive: true });
  writeFileSync(modulePath, rendered.moduleText, "utf8");
  console.log(`zapsán modul: ${modulePath} (export ${exportName})`);
}

console.log("Dál: registrace packu v mttPreflopRangePacks.ts a měření doručení.");
process.exit(report.errors.length === 0 ? 0 : 1);
