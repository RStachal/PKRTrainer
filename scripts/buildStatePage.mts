import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

/**
 * Kde projekt stojí, na jedné stránce a z měřených zdrojů.
 *
 *   npm run mtt:state-page
 *
 * ## Proč to musí vzniknout
 *
 * Majitel se na stav ptá pravidelně a dosud dostával esej: čísla se skládala
 * ručně z `mtt:post-answer`, `mtt:agenda`, denního vyhodnocení a nočního logu.
 * Trvá to a hlavně to **stárne v okamžiku odeslání** - příště se musí odvodit
 * znovu. Přitom projekt konzumuje z telefonu přes FTP, kde už má složku
 * s dokumenty ke čtení; tahle stránka patří vedle nich.
 *
 * ## Proč se čísla nepíšou, ale spouštějí
 *
 * Každé číslo tady pochází z příkazu, který ho vyrobil, a stránka u něj ten
 * příkaz jmenuje. Ručně opsané číslo by zestárlo jako každý jiný ruční seznam -
 * a přesně tuhle vadu jsem 4. a 5. 9. 2026 opravoval na třech místech plánu
 * a čtyřech místech deníku.
 *
 * Cena za to je čas: `mtt:post-answer` běží minuty. Je to stránka na vyžádání,
 * ne brána, takže se to vejde.
 *
 * ## Co to není
 *
 * Není to náhrada `mtt:daily`. Ten rozhoduje, co má dělat noc, a zapisuje se do
 * `Agents/daily/`. Tohle je čtení pro člověka a nic nerozhoduje.
 */

const outPath = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/review-desk/stav.html";

function run(script: string, args: readonly string[]): string {
  return execFileSync(
    process.execPath,
    ["scripts/run-cli.mjs", script, ...args],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

interface PostflopRow {
  street: string;
  dealt: number;
  actionEvShare: number;
  pricedShare: number;
  mixShare: number;
  priceGaps: Record<string, number>;
}

interface AgendaItem {
  number: number;
  title: string;
  status: string;
}

interface Agenda {
  total: number;
  unstruck: number;
  records: number;
  volne: AgendaItem[];
  majitel: AgendaItem[];
  stroj: AgendaItem[];
  hlidano: AgendaItem[];
  uzavreno: AgendaItem[];
}

console.log("Měřím, co dojde k hráči (běží minuty)…");
const postflopRaw = run("scripts/measurePostAnswerFeedback.mts", ["--json"]);
const postflop = JSON.parse(
  postflopRaw.slice(postflopRaw.indexOf("["), postflopRaw.lastIndexOf("]") + 1),
) as PostflopRow[];

console.log("Čtu agendu…");
const agendaRaw = run("scripts/reportOpenAgenda.mts", ["--json"]);
const agenda = JSON.parse(
  agendaRaw.slice(agendaRaw.indexOf("{"), agendaRaw.lastIndexOf("}") + 1),
) as Agenda;

/** Nejnovější denní vyhodnocení; z něj se bere stav obsahu a poslední noc. */
function latestDaily(): { date: string; text: string } | undefined {
  const dir = "Agents/daily";
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort();
  const newest = files[files.length - 1];
  if (newest === undefined) return undefined;
  return { date: newest.slice(0, -3), text: readFileSync(`${dir}/${newest}`, "utf8") };
}

const daily = latestDaily();

function section(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const out: string[] = [];
  for (let index = start + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[a-zěščřžýáíéúůň].*$/i.test(line.trim()) && lines[index + 1]?.startsWith("---")) break;
    if (line.trim() === "") {
      if (out.length > 0) break;
      continue;
    }
    out.push(line.trim());
  }
  return out;
}

const contentLines = daily === undefined ? [] : section(daily.text, "stav dodávaného obsahu");
const nightLines = daily === undefined ? [] : section(daily.text, "poslední noc");

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] ?? character
  ));
}

const pct = (share: number): string => `${(share * 100).toFixed(1)} %`;

const postflopRows = postflop.map((row) => {
  const gaps = row.priceGaps ?? {};
  const legit = gaps["NEČELÍ_SÁZCE"] ?? 0;
  const broken = (gaps["CHYBÍ_SÁZKA"] ?? 0) + (gaps["CHYBÍ_POT"] ?? 0);
  return `<tr>
    <td>${escapeHtml(row.street)}</td>
    <td>${row.dealt}</td>
    <td>${pct(row.actionEvShare)}</td>
    <td>${pct(row.pricedShare)}</td>
    <td>${pct(row.mixShare)}</td>
    <td class="${broken > 0 ? "bad" : "ok"}">${broken}</td>
    <td class="muted">${legit}</td>
  </tr>`;
}).join("");

function itemList(items: AgendaItem[]): string {
  if (items.length === 0) return '<p class="muted">nic</p>';
  return `<ul class="items">${items.map((item) => (
    `<li><b>${item.number}</b> ${escapeHtml(item.title)}<br><span class="muted">${escapeHtml(item.status)}</span></li>`
  )).join("")}</ul>`;
}

const page = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PKRTrainer — kde to stojí</title>
<style>
 body{font:15px/1.6 system-ui,Segoe UI,sans-serif;margin:0;background:#12161f;color:#e8eef7}
 main{max-width:840px;margin:0 auto;padding:20px 16px 56px}
 h1{font-size:21px;margin:0 0 4px}
 h2{font-size:17px;margin:26px 0 8px}
 .stamp{color:#9fb3cd;font-size:13px;margin:0 0 16px}
 .card{background:#161d2b;border-radius:10px;padding:14px 16px;margin:12px 0}
 table{border-collapse:collapse;font-size:14px;width:100%}
 th,td{border:1px solid #2a3446;padding:5px 9px;text-align:left}
 th{background:#1a2130;color:#9fb3cd;font-weight:600}
 .ok{color:#7fd18a;font-weight:700}
 .bad{color:#ff8f6b;font-weight:700}
 .muted{color:#9fb3cd}
 .big{font-size:26px;font-weight:700;color:#7bd3ff}
 .grid{display:flex;flex-wrap:wrap;gap:10px}
 .tile{background:#1a2130;border-radius:8px;padding:10px 14px;min-width:120px}
 .tile span{display:block;font-size:12px;color:#9fb3cd}
 ul.items{margin:6px 0;padding-left:20px}
 ul.items li{margin-bottom:6px}
 pre{background:#0f141d;padding:10px;border-radius:8px;overflow-x:auto;font-size:12px;margin:0}
 code{background:#0f141d;padding:1px 5px;border-radius:3px;font-size:12px}
 a{color:#7bd3ff}
</style></head><body>
<main>
<h1>PKRTrainer — kde to stojí</h1>
<p class="stamp">Změřeno ${escapeHtml(new Date().toISOString().slice(0, 16).replace("T", " "))}.
   Každé číslo níž vyrobil příkaz, který je u něj napsaný — nic tu není opsané rukou.</p>

<h2>Co dostane hráč, když odpoví</h2>
<div class="card">
<table>
<thead><tr><th>ulice</th><th>rozdáno</th><th>EV akcí</th><th>cena</th><th>frekvence</th><th>vad</th><th>bez ceny právem</th></tr></thead>
<tbody>${postflopRows}</tbody>
</table>
<p class="muted">Sloupec <b>vad</b> je přísná nula: spot, který je vyřešený a staví hrdinu
   před sázku, má cenu spočitatelnou vždycky. Poslední sloupec jsou spoty, kde hrdina jedná
   první — tam se cena nepočítá schválně, protože velikost vlastní sázky je model, ne
   solverovo číslo. Hráč tam dostane frekvenci.</p>
<p class="muted">měří <code>npm run mtt:post-answer</code></p>
</div>

<h2>Stav obsahu a poslední noc</h2>
<div class="card">
${contentLines.length === 0 ? '<p class="muted">denní vyhodnocení chybí</p>' : `<pre>${escapeHtml(contentLines.join("\n"))}</pre>`}
${nightLines.length === 0 ? "" : `<h3 style="font-size:14px;margin:14px 0 6px">poslední noc</h3><pre>${escapeHtml(nightLines.join("\n"))}</pre>`}
<p class="muted">měří <code>npm run mtt:daily</code>${daily === undefined ? "" : ` — report z ${escapeHtml(daily.date)}`}</p>
</div>

<h2>Na kom co visí</h2>
<div class="card">
<div class="grid">
  <div class="tile"><span>čeká na tebe</span><b class="big">${agenda.majitel.length}</b></div>
  <div class="tile"><span>volné pro agenta</span><b class="big">${agenda.volne.length}</b></div>
  <div class="tile"><span>čeká na stroj</span><b class="big">${agenda.stroj.length}</b></div>
  <div class="tile"><span>hlídá brána</span><b class="big">${agenda.hlidano.length}</b></div>
  <div class="tile"><span>uzavřeno měřením</span><b class="big">${agenda.uzavreno.length}</b></div>
</div>
<p class="muted">z ${agenda.total} bodů deníku je neškrtnutých ${agenda.unstruck}, z toho ${agenda.records} záznamů hotové práce</p>
<p class="muted">měří <code>npm run mtt:agenda</code></p>
</div>

<h2>Co čeká na tebe</h2>
<div class="card">${itemList(agenda.majitel)}</div>

<h2>Co může dělat agent</h2>
<div class="card">${itemList(agenda.volne)}</div>

<h2>Uzavřeno měřením — neotevírat znovu</h2>
<div class="card">${itemList(agenda.uzavreno)}</div>

<p class="muted">Stránka je statická a funguje offline. Vedle ní ve složce leží dokumenty
   ke čtení: <a href="index.html">rozcestník</a>.</p>
</main>
</body></html>
`;

mkdirSync(outPath.slice(0, outPath.lastIndexOf("/")), { recursive: true });
writeFileSync(outPath, page, "utf8");
console.log(`Stav zapsán do ${outPath}`);
console.log(`  čeká na majitele ${agenda.majitel.length}, volné ${agenda.volne.length}, uzavřené ${agenda.uzavreno.length}`);
