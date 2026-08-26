import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Draft ranží k přečtení člověkem, jako mřížky - ne jako JSON.
 *
 *   npm run mtt:rye-review -- [--draft=artifacts/rye-import/draft.json]
 *
 * ## Proč to musí vzniknout
 *
 * Draft má 94 záznamů po ~137 třídách rukou. To je 592 kB JSONu a **nikdo to
 * nepřečte**; „prosím zkontroluj to" nad takovým souborem je fikce kontroly.
 * Majitel čte ranže jako obarvené mřížky 13×13 - tak vypadají jeho vlastní
 * charty - takže se draft vykreslí stejně a dá se porovnat pohledem.
 *
 * ## Co stránka musí ukázat, aby kontrola měla smysl
 *
 * - **Akci barvou**, ne názvem: chyba v range se pozná tvarem, ne čtením 169
 *   řádků.
 * - **Mix zvlášť.** Ruka, kterou zdroj hraje dvěma způsoby, je nejčastější
 *   místo, kde se překlad může splést, takže musí být vidět na první pohled.
 * - **Co se překladem ztratilo.** `3B / Call 4B` a `3B / Fold` jsou v produktu
 *   obojí `3BET`; ten rozdíl je u mřížky napsaný, aby si ho čtenář mohl ověřit.
 * - **Odkud to je**: jméno zdrojového souboru, ať se dá otevřít originál.
 *
 * Stránka je statická a bez odkazů ven, takže se dá otevřít i offline.
 */

const draftPath = process.argv.find((arg) => arg.startsWith("--draft="))?.split("=")[1]
  ?? "artifacts/rye-import/draft.json";
const outPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/rye-import/review.html";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** Barvy podle akce, stejné jako v matici produktu. */
const COLORS: Record<string, string> = {
  JAM: "#a63a32",
  "3BET": "#c14a3e",
  SQUEEZE: "#d1603f",
  CALL: "#4e7050",
  CALL_JAM: "#3f6f86",
  FOLD: "#f0f0f0",
  "": "#e2e5ea",
};

interface DraftRecord {
  position: string;
  bucket: number;
  context: string;
  vsSeat: string;
  stackSetupId: string;
  sourceStackBB: number;
  strict: Record<string, string[]>;
  lenient: Record<string, string[]>;
  notes: string[];
  sourceFile: string;
}

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as {
  createdAt: string;
  confidence: string;
  assumptions: string[];
  recordCount: number;
  records: DraftRecord[];
};

function handAt(row: number, column: number): string {
  if (row === column) return `${RANKS[row]}${RANKS[column]}`;
  return row < column
    ? `${RANKS[row]}${RANKS[column]}s`
    : `${RANKS[column]}${RANKS[row]}o`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] ?? character
  ));
}

function grid(record: DraftRecord): string {
  const cells: string[] = [];
  for (let row = 0; row < 13; row += 1) {
    for (let column = 0; column < 13; column += 1) {
      const hand = handAt(row, column);
      const strict = record.strict[hand] ?? [];
      const lenient = record.lenient[hand] ?? [];
      const action = strict[0] ?? "";
      // Mix se pozná okrajem, ne jinou barvou: barva má dál znamenat akci.
      const mixed = lenient.length > 1;
      const title = lenient.length === 0
        ? `${hand}: mimo range (fold)`
        : `${hand}: ${strict.join(" / ")}${mixed ? ` (mix: ${lenient.join(" / ")})` : ""}`;
      cells.push(
        `<div class="c${mixed ? " mix" : ""}" style="background:${COLORS[action] ?? "#e2e5ea"}"`
        + ` title="${escapeHtml(title)}">${hand}</div>`,
      );
    }
  }
  return `<div class="grid">${cells.join("")}</div>`;
}

const sorted = [...draft.records].sort((left, right) => (
  left.context.localeCompare(right.context)
  || left.position.localeCompare(right.position)
  || left.bucket - right.bucket
));

const blocks = sorted.map((record) => {
  const mixed = Object.values(record.lenient).filter((actions) => actions.length > 1).length;
  const inRange = Object.keys(record.lenient).length;
  const versus = record.vsSeat === "" ? "proti všem za sebou" : `proti ${record.vsSeat}`;
  const notes = record.notes.length === 0
    ? ""
    : `<ul class="notes">${record.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
  return `<section>
  <h2>${escapeHtml(record.context)} &middot; ${escapeHtml(record.position)} ${record.bucket} BB &middot; ${escapeHtml(versus)}</h2>
  <p class="meta">rozložení stacků: <b>${escapeHtml(record.stackSetupId)}</b> &middot;
     hloubka ve zdroji: ${record.sourceStackBB} BB &middot;
     tříd v range: ${inRange} ze 169 &middot; z toho mix: ${mixed} &middot;
     zdroj: <code>${escapeHtml(record.sourceFile)}</code></p>
  ${notes}
  ${grid(record)}
</section>`;
}).join("\n");

const legend = Object.entries(COLORS)
  .filter(([action]) => action !== "")
  .map(([action, color]) => `<span class="key"><i style="background:${color}"></i>${action}</span>`)
  .join("");

const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<title>DrillEV – draft ranží ke kontrole</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:24px;background:#12161f;color:#e8eef7}
 h1{font-size:20px;margin:0 0 4px}
 h2{font-size:15px;margin:24px 0 4px}
 .meta{color:#9fb3cd;font-size:12px;margin:0 0 8px}
 .notes{margin:4px 0 8px;padding-left:18px;color:#e0a13c;font-size:12px}
 .grid{display:grid;grid-template-columns:repeat(13,minmax(0,1fr));gap:2px;max-width:640px}
 .c{aspect-ratio:1;display:flex;align-items:center;justify-content:center;
    font-size:10px;font-weight:700;color:#12161f;border-radius:2px}
 .c.mix{outline:2px solid #ffd166;outline-offset:-2px}
 .key{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:12px}
 .key i{width:14px;height:14px;border-radius:2px;display:inline-block}
 .intro{background:#1a2130;padding:12px 16px;border-radius:8px;max-width:820px}
 code{background:#1a2130;padding:1px 4px;border-radius:3px}
</style></head><body>
<h1>Draft ranží ke kontrole</h1>
<div class="intro">
<p><b>${draft.recordCount} záznamů</b>, vytvořeno ${escapeHtml(draft.createdAt)}, důvěra
   <b>${escapeHtml(draft.confidence)}</b>. Nic z toho zatím není v produktu.</p>
<p>Co je potřeba posoudit: <b>jestli ty mřížky odpovídají tomu, co jsi koupil</b>.
   Mechanická kontrola ověřila, že se každá mřížka shoduje s počty kombinací,
   které uvádí její vlastní legenda - to ale říká jen, že se čtení nespletlo,
   ne že je ta strategie správná pro danou situaci.</p>
<p>Žlutý okraj znamená ruku, kterou zdroj hraje <b>víc způsoby</b>. Tam se
   překlad může splést nejsnáz, takže stojí za pohled jako první.</p>
<p>Oranžové poznámky u mřížky říkají, <b>co se překladem ztratilo</b> - třeba že
   zdroj rozlišuje 3bet s dorovnáním 4betu od 3betu se složením, kdežto produkt
   má obojí jako <code>3BET</code>.</p>
<p><b>Přiznané předpoklady:</b></p>
<ul>${draft.assumptions.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
<p>${legend}</p>
</div>
${blocks}
</body></html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, "utf8");
console.log(`Vykresleno ${draft.recordCount} mřížek do ${outPath}`);
console.log("Otevři to v prohlížeči; stránka je statická a funguje offline.");
