import { readFileSync } from "node:fs";

import { REJAM_EV_OPENER_BY_HERO } from "../src/core/drillEngine";
import {
  type DraftFile,
  type DraftRecord,
  impactOf,
} from "./lib/ryeDraftImpact.mts";
import { loadAnswerHistory } from "./lib/ryeAnswerHistory.mts";

/**
 * Co by schválené mřížky doopravdy přinesly hráči, kdyby se o ně někdo zeptal.
 *
 *   npm run mtt:opener-axis
 *
 * ## Proč to musí vzniknout
 *
 * Majitel 10. 9. 2026 schválil **61 mřížek** obrany proti otevření a
 * `mtt:rye-answers` k nim hlásí „963 tříd, kde by se odpověď lišila". To číslo
 * je ale **dopad, ne doručení** - a mezi tím stojí věc, kterou nikdo neměřil:
 *
 * `RangeRecord` nese `vsSeat` a `getRangeRecord` ho umí použít, jenže **jediné
 * volání v produktu ho nepředává**. `createRangeStore.lookup` volá `getRecord`
 * se čtyřmi argumenty a `RangeKey` pole pro otvírače vůbec nemá. Zpřesněný
 * záznam by se tedy do knihovny zapsal a **nikdo by si o něj neřekl**.
 *
 * ## Co je na tom absurdní a co z toho plyne
 *
 * Produkt přitom otvírače **už předpokládá**: `REJAM_EV_OPENER_BY_HERO` mapuje
 * sedačku hrdiny na otvírače a používá se k ocenění re-jamu. Táž situace se
 * tedy ocení proti jednomu konkrétnímu otvírači a **naučí se z range, která
 * otvírače ignoruje**. Není to chybějící informace, je to nepoužitá informace.
 *
 * Rozhodnutí v bodech 62, 140 a 182 tím dostává cenu: nejde o nový herní stav,
 * jen o protažení předpokladu, který v produktu už je. Tenhle skript měří, co
 * by to koupilo - a co ne.
 */

const draftPath = process.argv.find((arg) => arg.startsWith("--draft="))?.split("=")[1]
  ?? "artifacts/rye-import/draft.json";

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftFile;
const history = loadAnswerHistory();

const approved: DraftRecord[] = draft.records.filter((record) => (
  history.bySourceFile.get(record.sourceFile)?.verdict === "sedí"
));

interface Row {
  record: DraftRecord;
  assumed: string | undefined;
  matches: boolean;
  changed: number;
  drilled: boolean;
}

/**
 * ICM mřížky se do téhle úvahy nepočítají.
 *
 * Schválených je dohromady 106, ale 45 z nich je ICM z prvního čtení - a ICM
 * range závisí na výplatní struktuře a rozložení stacků u celého stolu, takže
 * se do produkce dostat nemůže (změřeno 3. 9. 2026). Počítat je mezi to, co by
 * osa otvírače koupila, by tu cenu nafouklo o obsah, který stejně nikam nejde:
 * bez tohohle filtru vycházelo 13 mřížek a 199 tříd místo 6 a 118.
 */
const rows: Row[] = approved
  .filter((record) => record.context === "VS_OPEN" && !record.stackSetupId.startsWith("ICM"))
  .map((record) => {
    const impact = impactOf(record);
    const assumed = REJAM_EV_OPENER_BY_HERO[record.position];
    return {
      record,
      assumed,
      matches: assumed !== undefined && assumed === record.vsSeat,
      changed: impact.changed,
      drilled: !impact.notDrilled,
    };
  });

const landing = rows.filter((row) => row.matches && row.drilled);
const missed = rows.filter((row) => !row.matches && row.drilled);
const notDrilled = rows.filter((row) => !row.drilled);

const sum = (list: readonly Row[]): number => list.reduce((total, row) => total + row.changed, 0);

console.log("Co by schválené mřížky přinesly, kdyby se o otvírače někdo ptal");
console.log("");
console.log(`schválených chipEV mřížek obrany proti otevření: ${rows.length}`);
console.log(`(schválených celkem ${approved.length}, ale ICM se do produkce nedostane)`);
console.log("");
console.log("kdyby se `RangeKey` doplnil o předpokládaného otvírače:");
console.log(`  sedí na předpoklad produktu, rozdává se   ${String(landing.length).padStart(3)} mřížek`
  + `, ${String(sum(landing)).padStart(4)} tříd by dostalo jinou odpověď`);
console.log(`  jiný otvírač, než produkt předpokládá     ${String(missed.length).padStart(3)} mřížek`
  + `, ${String(sum(missed)).padStart(4)} tříd zůstane nedosažitelných`);
console.log(`  nerozdává se vůbec                        ${String(notDrilled.length).padStart(3)} mřížek`
  + `, ${String(sum(notDrilled)).padStart(4)} tříd`);
console.log("");

const byHero = new Map<string, { total: number; landing: number }>();
for (const row of rows) {
  const entry = byHero.get(row.record.position) ?? { total: 0, landing: 0 };
  entry.total += 1;
  if (row.matches && row.drilled) entry.landing += 1;
  byHero.set(row.record.position, entry);
}

console.log("po sedačkách hrdiny (předpoklad produktu → kolik mřížek na něj sedí):");
for (const [hero, entry] of [...byHero].sort((left, right) => right[1].total - left[1].total)) {
  const assumed = REJAM_EV_OPENER_BY_HERO[hero] ?? "žádný";
  console.log(`  ${hero.padEnd(6)} předpoklad ${String(assumed).padEnd(6)}`
    + ` ${String(entry.landing).padStart(2)} z ${String(entry.total).padStart(2)} mřížek`);
}

console.log("");
console.log(
  "Číslo vpravo nahoře je to jediné, co by se dnes dalo doručit bez dalšího\n"
  + "rozhodnutí. Zbytek nečeká na import, ale na to, jestli produkt dostane osu\n"
  + "otvírače celou (body 62, 140, 182) - dnes zná jednoho předpokládaného na\n"
  + "sedačku a proti ostatním se neptá.",
);
