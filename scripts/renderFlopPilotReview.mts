import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { handLabel } from "../src/core/poker";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";
import { MTT_POSTFLOP_PILOT_CATALOG } from "../src/data/ranges/mttPostflopPilotCatalog";
import { positionPatternLabel } from "../src/core/postflopGenerator";
import type { FlopProductionStrategyRule } from "../src/data/ranges/flopProductionStrategyPack";
import { pilotReviewOrder, pilotReviewPageHash } from "./lib/flopPilotReview.mts";

/**
 * Flopové piloty k přečtení člověkem, jako mřížky - ne jako JSON.
 *
 *   npm run mtt:pilot-review
 *   npm run mtt:pilot-review -- --out=artifacts/pilot-review/review.html
 *
 * ## Proč to musí vzniknout
 *
 * Majitel 3. 9. 2026 zvolil variantu 1 z bodu 19: flopové piloty projdou týmž
 * čtením jako turn, místo aby se přiznalo, že `MEDIUM` u flopu znamená něco
 * slabšího.
 *
 * Sedm pilotů dnes tvrdí `MEDIUM` - tedy bránu do produkce - a `mtt:confidence-backing`
 * je hlásí jako `SOLVE_PROVENANCE`: doklad o tom, **odkud** data jsou, ne o tom,
 * že jsou dobrá. Celkem stojí jen na dohledatelnosti solvu deset packů, z toho
 * sedm nad LOW a tři pod ním - týž druh dokladu na obou stranách brány.
 *
 * Číst se to ale nedá z generovaných modulů: jsou to megabajty TypeScriptu a
 * range je v nich seznam tříd rukou. Seznam padesáti tříd oddělených čárkami
 * neřekne o tvaru nic - to je poučení z bodu 18, kvůli kterému turnový digest
 * kreslí mřížku 13×13. Tady platí totéž.
 *
 * ## Co stránka ukazuje, aby čtení mělo smysl
 *
 * U každého pravidla to, podle čeho se pozná dobrá hra od špatné: kterou akci
 * doporučuje, na jakých texturách a v jakém pásmu SPR platí, jak jsou třídy
 * rukou rozdělené mezi akce (mřížka), a co pilot sám o sobě přiznává za meze.
 *
 * ## Co to nedělá
 *
 * **Nic nepřeznačuje.** Stránka je vstup pro člověka a výstupem je token, který
 * se dá vzít do `mtt:pilot-answers`. Přeznačit důvěru bez zapsaného verdiktu by
 * bylo přesně to, proti čemu tenhle celý žebříček je.
 */

const outPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/pilot-review/review.html";

/** Barvy podle akce, stejné jako v matici produktu a na rye stránce. */
const COLORS: Record<string, string> = {
  BET: "#c14a3e",
  BET_SMALL: "#d1603f",
  BET_LARGE: "#a63a32",
  RAISE: "#a63a32",
  CHECK: "#4e7050",
  CALL: "#4e7050",
  FOLD: "#f0f0f0",
  "": "#e2e5ea",
};

const escape = (value: string): string => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Akce na barvu; neznámou akci raději šedě než falešně zeleně. */
function colorOf(action: string): string {
  if (COLORS[action] !== undefined) return COLORS[action];
  if (action.startsWith("BET") || action.startsWith("RAISE")) return COLORS.BET;
  if (action.startsWith("CHECK") || action.startsWith("CALL")) return COLORS.CHECK;
  if (action.startsWith("FOLD")) return COLORS.FOLD;
  return COLORS[""];
}

/**
 * Ruka → akce, kterou pro ni pravidlo drží.
 *
 * Kbelíky se čtou v pořadí, v jakém je pack nese, a **první zápis vyhrává**:
 * kdyby se přepisovalo, poslední kbelík by přebil dřívější a mřížka by ukázala
 * jinou strategii, než jakou resolver vydá. Ten totiž bere první sedící kbelík.
 */
function handActions(rule: FlopProductionStrategyRule): Map<string, string> {
  const byHand = new Map<string, string>();
  for (const bucket of rule.rangeBuckets) {
    for (const hand of bucket.handClasses) {
      if (!byHand.has(hand)) byHand.set(hand, bucket.action);
    }
  }
  return byHand;
}

function grid(rule: FlopProductionStrategyRule): string {
  const byHand = handActions(rule);
  const rows: string[] = [];
  for (let i = 0; i < 13; i += 1) {
    const cells: string[] = [];
    for (let j = 0; j < 13; j += 1) {
      const hand = handLabel(i, j);
      const action = byHand.get(hand);
      const background = action === undefined ? COLORS[""] : colorOf(action);
      const dim = action === undefined ? ' class="off"' : "";
      cells.push(
        `<td style="background:${background}"${dim} title="${escape(hand)}${action ? ` — ${escape(action)}` : " — mimo range"}">${escape(hand)}</td>`,
      );
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table class="grid">${rows.join("")}</table>`;
}

/** Kolik tříd která akce drží - číslo, které z mřížky nejde spočítat okem. */
function actionSummary(rule: FlopProductionStrategyRule): string {
  const counts = new Map<string, number>();
  for (const [, action] of handActions(rule)) counts.set(action, (counts.get(action) ?? 0) + 1);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [...counts]
    .sort((left, right) => right[1] - left[1])
    .map(([action, count]) => (
      `<span class="tag" style="border-color:${colorOf(action)}">${escape(action)} `
      + `${count} tříd (${Math.round((count / Math.max(total, 1)) * 100)} %)</span>`
    ))
    .join(" ");
}

const catalogById = new Map(MTT_POSTFLOP_PILOT_CATALOG.map((entry) => [entry.id, entry]));

// Pořadí i otisk stránky se počítají ve sdílené knihovně, ne tady: zapisovač
// odpovědí je potřebuje taky a dvě kopie by se rozešly tiše.
const pilots = pilotReviewOrder(generatedMttPostflopPilotPacks);
const pageHash = pilotReviewPageHash(pilots);

const cards = pilots.map((entry, index) => {
  const catalog = catalogById.get(entry.catalogId);
  const rules = entry.pack.rules.map((rule) => `
    <div class="rule">
      <h4>${escape(rule.id)}</h4>
      <p class="meta">
        doporučuje <b>${escape(rule.recommendedAction)}</b>
        · SPR ${rule.sprMin}–${rule.sprMax}
        · textury: ${escape(rule.boardTextures.join(", ") || "—")}
        · nabízené akce: ${escape(rule.actions.join(", "))}
      </p>
      <div class="tags">${actionSummary(rule)}</div>
      ${grid(rule)}
      <p class="explain">${escape(rule.explanation)}</p>
    </div>`).join("");

  const limits = (catalog?.limitations ?? []).map((line) => `<li>${escape(line)}</li>`).join("");
  const assumptions = entry.pack.assumptions.map((line) => `<li>${escape(line)}</li>`).join("");

  return `
  <section class="pilot" id="p${index}">
    <h2>${index}. ${escape(catalog?.label ?? entry.catalogId)}</h2>
    <p class="meta">
      ${escape(positionPatternLabel(catalog?.positionPattern ?? "BTN_VS_BB"))}
      · ${escape(catalog?.actionNode ?? "?")}
      · SPR pásma ${escape((catalog?.sprBands ?? []).join(", "))}
      · dnes tvrdí <b>${escape(entry.pack.confidence)}</b>, doklad: původ solvu (${entry.pack.sourceEvidence.length})
    </p>
    ${limits === "" ? "" : `<details><summary>Co pilot sám přiznává (${catalog?.limitations.length})</summary><ul>${limits}</ul></details>`}
    ${assumptions === "" ? "" : `<details><summary>Předpoklady packu (${entry.pack.assumptions.length})</summary><ul>${assumptions}</ul></details>`}
    ${rules}
    <div class="verdict" data-index="${index}">
      <b>Verdikt:</b>
      <label><input type="radio" name="v${index}" value="o"> hraje dobře, pustit do produkce</label>
      <label><input type="radio" name="v${index}" value="x"> něco je špatně</label>
      <label><input type="radio" name="v${index}" value="?"> nejsem si jistý</label>
      <label><input type="radio" name="v${index}" value="s"> přeskočit</label>
    </div>
  </section>`;
}).join("");

const page = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<title>Flopové piloty ke čtení</title>
<style>
 body{font:14px/1.5 system-ui,Segoe UI,sans-serif;margin:0;background:#14161a;color:#e8eaed}
 header,section{max-width:1100px;margin:0 auto;padding:16px 24px}
 header{border-bottom:1px solid #2a2e35}
 h1{font-size:20px;margin:0 0 8px} h2{font-size:17px;margin:24px 0 4px}
 h4{font-size:13px;margin:16px 0 4px;color:#9aa3af;font-weight:600}
 .pilot{border-bottom:1px solid #2a2e35}
 .meta{color:#9aa3af;margin:4px 0}
 .tags{margin:6px 0}
 .tag{display:inline-block;border:1px solid;border-radius:3px;padding:1px 6px;margin:2px 4px 2px 0;font-size:12px}
 table.grid{border-collapse:collapse;margin:8px 0}
 table.grid td{width:36px;height:22px;text-align:center;font-size:10px;color:#10131a;border:1px solid #14161a}
 table.grid td.off{color:#767c86}
 .explain{color:#c3c8d0;margin:6px 0 0;font-size:13px}
 details{margin:6px 0;color:#c3c8d0} summary{cursor:pointer}
 .verdict{background:#1b1f26;border:1px solid #2a2e35;border-radius:6px;padding:10px;margin:16px 0}
 .verdict label{margin-right:16px;white-space:nowrap}
 #outbox{width:100%;height:70px;font-family:ui-monospace,Consolas,monospace;font-size:13px;
   background:#0f1116;color:#e8eaed;border:1px solid #2a2e35;border-radius:6px;padding:8px}
 .note{color:#9aa3af;font-size:13px}
</style></head><body>
<header>
 <h1>Flopové piloty ke čtení — ${pilots.length} pilotů</h1>
 <p class="note">
  Tyhle piloty dnes tvrdí <b>MEDIUM</b>, což je brána do produkce, a stojí jen na
  dohledatelnosti solvu — na dokladu o tom, <i>odkud</i> data jsou, ne o tom, že
  jsou dobrá. Čtení je jediná cesta, jak z toho udělat tvrzení o kvalitě.
 </p>
 <p class="note">
  Posuzuje se <b>hra, ne tvar dat</b>. Rozbité tvary chytá mechanická kontrola;
  tady jde o to, jestli by se ta strategie dala hrát. Mřížka ukazuje, kterou akci
  pravidlo drží pro kterou třídu rukou; šedá je mimo range.
 </p>
 <p class="note">Stránka je statická a funguje offline. Odpovědi se nikam neodesílají.</p>
</header>
${cards}
<section>
 <h2>Odpovědi</h2>
 <p class="note">Zkopíruj a předej: <code>npm run mtt:pilot-answers -- --answers="…"</code></p>
 <textarea id="outbox" readonly></textarea>
</section>
<script>
 // Index je pořadí pilota v tomhle výpisu a je stabilní: řadí se podle počtu
 // pravidel a jména, ne podle čehokoli, co se mění s obsahem.
 // Otisk obsahu, ze kterého stránka vznikla. Zapisovač odpovědí ho porovná a
 // odmítne zápis, když se piloty mezitím změnily.
 var PAGE_HASH = "${pageHash}";
 var box = document.getElementById("outbox");
 function refresh() {
   var out = [];
   document.querySelectorAll(".verdict").forEach(function (node) {
     var picked = node.querySelector("input:checked");
     if (picked) out.push(node.dataset.index + picked.value);
   });
   box.value = out.length === 0 ? "" : "DRILLEV-PILOT-V1 " + PAGE_HASH + " " + out.join(" ");
 }
 document.addEventListener("change", refresh);
 refresh();
</script>
</body></html>`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, page, "utf8");
const ruleCount = pilots.reduce((sum, entry) => sum + entry.pack.rules.length, 0);
console.log(`Vykresleno ${pilots.length} pilotů (${ruleCount} pravidel) do ${outPath}`);
console.log("Otevři to v prohlížeči; stránka je statická a funguje offline.");
