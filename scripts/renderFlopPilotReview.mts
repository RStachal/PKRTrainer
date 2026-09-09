import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { handLabel } from "../src/core/poker";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";
import { MTT_POSTFLOP_PILOT_CATALOG } from "../src/data/ranges/mttPostflopPilotCatalog";
import { positionPatternLabel } from "../src/core/postflopGenerator";
import type { FlopProductionStrategyRule } from "../src/data/ranges/flopProductionStrategyPack";
import { pilotReviewOrder, pilotReviewPageHash } from "./lib/flopPilotReview.mts";
import {
  REVIEW_ANSWER_STYLES,
  reviewAnswerBar,
  reviewAnswerFlag,
  reviewAnswerOption,
  reviewAnswerScript,
} from "./lib/reviewAnswerMemory.mts";

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
 * ## Proč si pamatuje, kde jsi skončil
 *
 * Majitel 4. 9. 2026 řekl, že si stránky dá na FTP a bude je **vyplňovat
 * postupně**. Do té doby si tahle nepamatovala nic - zavřená karta znamenala
 * začít znovu. Paměť je společná s draftem ranží (`lib/reviewAnswerMemory.mts`),
 * včetně toho, že se odpovědi váží na identitu pilota, ne na jeho pozici.
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

interface MixSlice { action: string; frequencyPct: number }

/**
 * Ruka → **celý mix**, ne jen ta nejčastější akce.
 *
 * Tohle je jádro celé stránky a dřív tu nebylo. Mřížka kreslila `bucket.action`,
 * tedy jednu akci na třídu, a mix pod ní zahazovala - jenže **žádná třída rukou
 * v žádném pilotu nehraje čistě**. Změřeno 9. 9. 2026 na všech sedmi pilotech:
 * 972 kbelíků, z toho 0 čistých, medián nejsilnější akce **57,3 %** a u 214
 * z nich (22 %) se zobrazená akce hraje **méně než v polovině** případů.
 *
 * Stránka tedy malovala plnou barvou akci, kterou solver hraje menšinu času, a
 * ptala se „dala by se ta strategie hrát?". Na to se z takového obrázku
 * odpovědět nedá: vyvážený mix 45/35/20 a „sázej vždycky" vypadaly stejně.
 * Majitel to 9. 9. přečetl a zamítl všech sedm pilotů - správně.
 */
function handMix(rule: FlopProductionStrategyRule): Map<string, MixSlice[]> {
  const byHand = new Map<string, MixSlice[]>();
  for (const bucket of rule.rangeBuckets) {
    // Bez mixu zbývá jen dominantní akce; pak se kreslí jako sto procent, což
    // je pravda o tom, co pack nese, ne domněnka.
    const mix: MixSlice[] = [...(bucket.actionMix ?? [{ action: bucket.action, frequencyPct: 100 }])]
      .filter((slice) => slice.frequencyPct > 0)
      .sort((left, right) => right.frequencyPct - left.frequencyPct);
    for (const hand of bucket.handClasses) {
      if (!byHand.has(hand)) byHand.set(hand, mix);
    }
  }
  return byHand;
}

/** Mix jako proužek: každá akce zabírá tolik místa, kolik se hraje. */
function mixBackground(mix: readonly MixSlice[]): string {
  const total = mix.reduce((sum, slice) => sum + slice.frequencyPct, 0);
  if (total <= 0) return COLORS[""];
  const stops: string[] = [];
  let at = 0;
  for (const slice of mix) {
    const width = (slice.frequencyPct / total) * 100;
    stops.push(`${colorOf(slice.action)} ${at.toFixed(1)}%`);
    at += width;
    stops.push(`${colorOf(slice.action)} ${at.toFixed(1)}%`);
  }
  return `linear-gradient(90deg,${stops.join(",")})`;
}

const mixTitle = (hand: string, mix: readonly MixSlice[]): string => (
  `${hand} — ${mix.map((slice) => `${slice.action} ${slice.frequencyPct.toFixed(0)} %`).join(", ")}`
);

function grid(rule: FlopProductionStrategyRule): string {
  const byHand = handMix(rule);
  const rows: string[] = [];
  for (let i = 0; i < 13; i += 1) {
    const cells: string[] = [];
    for (let j = 0; j < 13; j += 1) {
      const hand = handLabel(i, j);
      const mix = byHand.get(hand);
      const background = mix === undefined ? COLORS[""] : mixBackground(mix);
      const dim = mix === undefined ? ' class="off"' : "";
      const title = mix === undefined ? `${hand} — mimo range` : mixTitle(hand, mix);
      cells.push(
        `<td style="background:${background}"${dim} title="${escape(title)}">${escape(hand)}</td>`,
      );
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table class="grid">${rows.join("")}</table>`;
}

/**
 * Kolik se která akce **doopravdy hraje**, průměrem přes třídy v range.
 *
 * Dřív se tu počítaly třídy, u kterých je akce nejčastější, a vycházelo z toho
 * „BET_SMALL 50 tříd (100 %)" i tam, kde se ta sázka hraje v 57 % případů.
 * Součet přes třídy dá skutečný poměr akcí a nezakrývá, že se všechno mixuje.
 */
function actionSummary(rule: FlopProductionStrategyRule): string {
  const byHand = handMix(rule);
  const sums = new Map<string, number>();
  for (const [, mix] of byHand) {
    for (const slice of mix) {
      sums.set(slice.action, (sums.get(slice.action) ?? 0) + slice.frequencyPct);
    }
  }
  const hands = Math.max(1, byHand.size);
  return [...sums]
    .sort((left, right) => right[1] - left[1])
    .map(([action, sum]) => (
      `<span class="tag" style="border-color:${colorOf(action)}">${escape(action)} `
      + `${(sum / hands).toFixed(0)} % range</span>`
    ))
    .join(" ");
}

/**
 * Jak moc se v tomhle pravidle mixuje, a z kolika desek stojí.
 *
 * Obojí čtenář potřebuje, aby věděl, co drží v ruce: mřížka plná proužků je
 * jiné tvrzení než mřížka plných barev, a agregát ze šesti desek je jiné
 * tvrzení než agregát ze třiceti. Počet desek se čte z vysvětlení, protože
 * jinde v pravidle není - viz `explanation`.
 */
function mixNote(rule: FlopProductionStrategyRule): string {
  const tops = [...handMix(rule).values()]
    .map((mix) => Math.max(...mix.map((slice) => slice.frequencyPct)))
    .sort((left, right) => left - right);
  const boards = /aggregated across ([A-Za-z0-9_]+):/.exec(rule.explanation)?.[1].split("_").length;
  if (tops.length === 0) return "";
  const median = tops[Math.floor(tops.length / 2)];
  const minority = tops.filter((value) => value < 50).length;
  return `<p class="note">Nejsilnější akce drží medián <b>${median.toFixed(0)} %</b>`
    + `; u ${minority} z ${tops.length} tříd se nejsilnější akce hraje méně než v polovině případů`
    + `${boards === undefined ? "" : `. Agregát z <b>${boards}</b> desek`}.</p>`;
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
      ${mixNote(rule)}
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
    <div class="verdict" data-id="${index}">
      <p class="q-focus">Verdikt: <b>dala by se ta strategie hrát?</b></p>
      <div class="opts">
        ${reviewAnswerOption(index, "o", "✓ Hraje dobře, pustit do produkce")}
        ${reviewAnswerOption(index, "x", "✗ Něco je špatně")}
        ${reviewAnswerOption(index, "?", "? Nejsem si jistý")}
        ${reviewAnswerOption(index, "s", "– Přeskočit")}
      </div>
      <div class="opts opts--flags" hidden>
        ${reviewAnswerFlag(index, "1", "poměr akcí nesedí")}
        ${reviewAnswerFlag(index, "2", "konkrétní ruka v cizí akci")}
        ${reviewAnswerFlag(index, "3", "chybí velikost sázky")}
        ${reviewAnswerFlag(index, "4", "přes hloubky si to odporuje")}
        ${reviewAnswerFlag(index, "5", "málo desek v agregátu")}
      </div>
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
 table.grid td{width:36px;height:22px;text-align:center;font-size:10px;color:#10131a;border:1px solid #14161a;
                text-shadow:0 0 3px rgba(255,255,255,.9)}
 table.grid td.off{color:#767c86}
 .explain{color:#c3c8d0;margin:6px 0 0;font-size:13px}
 details{margin:6px 0;color:#c3c8d0} summary{cursor:pointer}
 .note{color:#9aa3af;font-size:13px}
${REVIEW_ANSWER_STYLES}
 .verdict{margin:16px 0;max-width:none}
</style></head><body>
${reviewAnswerBar()}
<header>
 <h1>Flopové piloty ke čtení — ${pilots.length} pilotů</h1>
 <p class="note">
  Tyhle piloty dnes tvrdí <b>MEDIUM</b>, což je brána do produkce, a stojí jen na
  dohledatelnosti solvu — na dokladu o tom, <i>odkud</i> data jsou, ne o tom, že
  jsou dobrá. Čtení je jediná cesta, jak z toho udělat tvrzení o kvalitě.
 </p>
 <p class="note">
  Posuzuje se <b>hra, ne tvar dat</b>. Rozbité tvary chytá mechanická kontrola;
  tady jde o to, jestli by se ta strategie dala hrát. Každá buňka mřížky je
  <b>proužek celého mixu</b>: každá akce v ní zabírá tolik místa, kolik se hraje.
  Šedá je mimo range, přesná procenta ukáže najetí myší.
 </p>
 <p class="note">
  <b>Do 9. 9. 2026 tahle stránka kreslila jen nejčastější akci</b> a mix pod ní
  zahazovala. Vypadalo to, že se každá ruka hraje čistě - přitom ze 972 tříd
  napříč piloty nehraje čistě <b>ani jedna</b> a nejsilnější akce drží medián
  57 %. Vyvážený mix 45/35/20 tak vypadal stejně jako „sázej vždycky" a otázka
  „dala by se ta strategie hrát" se z toho zodpovědět nedala. Odpovědi z minulé
  verze se proto nepřebírají.
 </p>
 <p class="note">Stránka je statická a funguje offline. Odpovědi se nikam neodesílají:
  drží je tenhle prohlížeč, takže se dá číst po kouskách a vracet se k tomu.
  Až budeš hotový (nebo budeš chtít předat rozdělanou práci), zmáčkni nahoře
  <b>Zkopírovat odpovědi</b> - vypadne token pro
  <code>npm run mtt:pilot-answers</code>.</p>
</header>
${cards}
${reviewAnswerScript({
    // Index je pořadí pilota v tomhle výpisu a je stabilní: řadí se podle počtu
    // pravidel a jména, ne podle čehokoli, co se mění s obsahem. Otisk obsahu
    // navíc hlídá, že se piloty od uložení odpovědí nezměnily - zaškrtnout je
    // nad jiným obsahem by tvrdilo „přečteno" o něčem, co nikdo neviděl.
    storageKey: "drillev-pilot-answers-v1",
    tokenPrefix: "DRILLEV-PILOT-V1",
    pageHash,
  })}
</body></html>`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, page, "utf8");
const ruleCount = pilots.reduce((sum, entry) => sum + entry.pack.rules.length, 0);
console.log(`Vykresleno ${pilots.length} pilotů (${ruleCount} pravidel) do ${outPath}`);
console.log("Otevři to v prohlížeči; stránka je statická a funguje offline.");
