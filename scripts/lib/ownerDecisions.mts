/**
 * Otevřená rozhodnutí vlastníka jako stránka k vyplnění.
 *
 * ## Proč to musí vzniknout
 *
 * Vlastník 17. 9. 2026 na otázku „co je potřeba pro dokončení“ odpověděl
 * „vygeneruj mi html pro vyplnění“. Do té doby se rozhodnutí sbírala zprávou
 * („1: A, 2: B“) a rozcestník review desku měl tři otázky ze 14. 9., všechny
 * dávno zodpovězené (bod 249). Rozhodnutí se tedy sbírala jinak než verdikty
 * nad mřížkami, ačkoli je to tatáž práce: číst, volit, poslat zpátky.
 *
 * Stránka se chová jako čtecí stránky (`reviewAnswerMemory`): odpověď se
 * pamatuje podle identity otázky, ne pozice, exportuje se jako token pro
 * `mtt:decision-answers`, a **zapisuje se i do textu stránky** (`<pre>`), aby
 * přežila „Uložit stránku“ - zaškrtnutý radio button prohlížeč do uloženého
 * HTML nepíše, text ano.
 *
 * ## Co tu není
 *
 * Nic, co se dá změřit. Každá otázka nese čísla z měření uvedených u ní a
 * doporučení; rozhoduje vlastník, ne stránka.
 */

export interface DecisionOption {
  code: string;
  label: string;
  /** Co volba znamená - jednou větou, včetně ceny. */
  detail?: string;
}

export interface OwnerDecision {
  id: number;
  title: string;
  /** Kontext a čísla. HTML povolené, bez zpětných lomítek. */
  context: string;
  options: readonly DecisionOption[];
  /** Kód doporučené volby, nebo prázdné, když doporučení nedávám. */
  recommended: string;
  /** Volný text - čeho se má týkat. Prázdné = bez textového pole. */
  freeText?: string;
  /** Odkaz na deník. */
  diary: string;
}

export const DECISIONS_TOKEN_PREFIX = "DRILLEV-DECISIONS-V1";

export const OWNER_DECISIONS_2026_09_17: readonly OwnerDecision[] = [
  {
    id: 1,
    title: "Pravidlo přednosti: RYE proti vlastnímu chartu a Kompendiu",
    context: "16. 9. jsi řekl, že RYE je reference, a 17. 9. jsi nechal RYE nahradit vlastní "
      + "export u push/fold 10 bb. Kompendium (4.2) přitom říká „chart jako baseline“ a "
      + "sada to hlídá (<code>btnOpenRangeWidth</code>). Potřebuju vědět, jestli je to "
      + "obecné pravidlo, nebo výjimka - podle toho se rozhodne bez ptaní u dalších rodin "
      + "korpusu (otázka 6) i u příštích drafů.",
    options: [
      { code: "a", label: "RYE má přednost všude, kde má mřížku", detail: "vlastní export a chart zůstávají tam, kde RYE nic nemá; sada přestane hlídat chart jako baseline u buněk, které RYE pokrývá." },
      { code: "b", label: "Jen tam, kde to výslovně rozhodnu", detail: "každá rodina zvlášť, jako dnes push/fold." },
    ],
    recommended: "a",
    diary: "256",
  },
  {
    id: 2,
    title: "Přenos letních oprav do produkce - potvrdit, nebo vrátit",
    context: "Změřeno 17. 9. 2026: produkční packy (to, co dostáváš ve čtyřech chipEV profilech) "
      + "byly snímek dat z <b>16. 7.</b> Všechno, co se od té doby opravilo podle tvých chartů - "
      + "push/fold na tvůj baseline, re-jam 15-30 bb a range, která ho dorovnává, BB proti limpu, "
      + "shove malých párů na 15 bb, opravy časných sedaček - šlo jen do legacy dat, která měří sada, "
      + "ale hráč je neviděl. Rozdíl: <b>2 971 tříd</b> (ante OFF) a <b>2 884 tříd</b> (ante ON): RFI 65-84 "
      + "buněk z 88, VS_OPEN 31, VS_LIMP 11, PUSH_FOLD 13-16, VS_ALLIN 15-30 bb chybělo celé (20 záznamů). "
      + "Dnes přestagováno a povýšeno (<code>mtt:preflop-drift</code> to od teď hlídá).",
    options: [
      { code: "a", label: "Nechat - produkce má mít to, co sada měří", detail: "hráč od příštího balíčku dostane opravené range; Question_ID se nemění, mění se odpovědi u ~2 900 tříd." },
      { code: "b", label: "Vrátit snímek z 16. 7.", detail: "git revert dnešního povýšení; opravy z léta zůstanou jen v sadě." },
    ],
    recommended: "a",
    diary: "257",
  },
  {
    id: 3,
    title: "ICM: kde má 40 schválených mřížek přistát",
    context: "RYE scénáře jsou <b>šestihráčové</b> (UTG, HJ, CO, BU, SB, BB - přesně šestistolová sada "
      + "produktu) a jeden tříhráčový (ICM9, zamítnutý). Produkt má $EV sloty pro FULL_RING_9 i SIX_MAX, "
      + "všechny prázdné. Do chipEV packu ICM mřížky nejdou (jiný model EV).",
    options: [
      { code: "a", label: "SIX_MAX / $EV profil se scénářem v klíči", detail: "sedačky sedí na zdroj 1:1; stůl se kreslí šestihráčový s napsanými stacky scénáře." },
      { code: "b", label: "FULL_RING_9 / $EV s třemi prázdnými sedačkami", detail: "kreslilo by se něco, co zdroj netvrdí." },
      { code: "c", label: "ICM zatím nedodávat", detail: "40 mřížek zůstane v draftu." },
    ],
    recommended: "a",
    diary: "256",
  },
  {
    id: 4,
    title: "ICM: forma dodání",
    context: "Produkční brána chce úplný pack (každá sedačka × hloubka × kontext). 40 mřížek "
      + "pokrývá zlomek buněk a z RYE se úplný $EV pack nikdy neposkládá (korpus: 49 z 702 buněk "
      + "i s ICM půlkou). Vyřešený postflop dnes funguje jako vrstva, která odpovídá jen tam, kde ví.",
    options: [
      { code: "a", label: "Vrstva / preview: profil rozdává jen buňky, které zná", detail: "7 scénářů, 40 mřížek, nálepka LOW a scénář v názvu profilu; ne produkce." },
      { code: "b", label: "Čekat na úplný $EV pack", detail: "z RYE nevznikne; znamená jiný zdroj nebo solver." },
    ],
    recommended: "a",
    diary: "256",
  },
  {
    id: 5,
    title: "ICM: výplatní struktura a počet hráčů u scénářů",
    context: "RYE stránky uvádějí jen stacky u stolu (např. ICM5 = UTG 75 / HJ 45 / CO 60 / BU 30 / "
      + "SB 18 / BB 22 bb), ne kolik hráčů zbývá ani jak se platí. Bez toho ICM cena (bubble faktor, "
      + "model v produktu je) spočítat nejde a spot by byl bez ceny - u chipEV to pravidla nepouští, "
      + "u ICM by to byla přiznaná výjimka.",
    options: [
      { code: "a", label: "Doplním z kurzu", detail: "napiš do pole níž ke každému scénáři: kolik hráčů zbývá, výplatní struktura (nebo „finálový stůl, 9 placených“ apod.)." },
      { code: "b", label: "Bez ceny - jen range", detail: "ICM spoty se rozdávají a hodnotí, EV se neukazuje; přiznané v profilu." },
      { code: "c", label: "Předpokládat finálový stůl (6 hráčů, standardní payout)", detail: "odhad, ne údaj zdroje; nedoporučuju." },
    ],
    recommended: "a",
    freeText: "Scénáře: ICM (UTG 20 / HJ 45 / CO 60 / BU 35 / SB 18 / BB 75), ICM3 (30/45/60/75/18/20), "
      + "ICM5 (75/45/60/30/18/22), ICM7 (75/45/60/30/18/7), ICM10 a ICM11 (50/25/11/55/9/13), "
      + "ICM14 (20/35/15/8/50/15). Ke každému: hráčů zbývá, payout.",
    diary: "256",
  },
  {
    id: 6,
    title: "RYE pro další kontexty chipEV: co má nahradit vlastní export",
    context: "Korpus má ověřených mřížek, které import dnes nepřekládá (slovník bez kontextu, "
      + "200 stránek): <b>Openraising 40</b> (RFI, produkt má 88 buněk z vlastního exportu), "
      + "<b>Rejamming 33</b> (jam přes otevření 15-30 bb, dnes z tvých chartů), <b>Squeezing 14</b>, "
      + "<b>BB strategy 11</b> (BB proti limpu SB), <b>Multiway 42</b> (kontexty, které produkt nemá). "
      + "Každá rodina je překlad slovníku (odborné rozhodnutí) plus stejná cesta jako push/fold.",
    options: [
      { code: "a", label: "Všechny rodiny, které produkt umí položit jako otázku", detail: "RFI, rejam, squeeze, BB proti limpu; multiway až bude kontext. Pořadí: RFI, rejam, squeeze, BB." },
      { code: "b", label: "Jen RFI (Openraising)", detail: "největší dopad: 88 buněk, které vidí každý." },
      { code: "c", label: "Žádná - RYE jen tam, kde vlastní obsah není", detail: "dnešní stav plus push/fold." },
    ],
    recommended: "a",
    freeText: "Výjimky nebo pořadí, když se liší od doporučení.",
    diary: "257",
  },
  {
    id: 7,
    title: "Ante u RYE chartů",
    context: "RYE neuvádí, jestli charty počítají s BB ante. Dnes jdou stejné RYE mřížky do ante OFF i ON "
      + "(tvé rozhodnutí o reuse ze 17. 9.). Tvůj push/fold chart ante uvádí (10 %), a proto byl ante OFF "
      + "držený užší. Když RYE ante předpokládá, patří jeho mřížky přesně ante ON a u ante OFF by měl "
      + "zůstat užší vlastní export - nebo přiznaná výjimka.",
    options: [
      { code: "a", label: "RYE počítá s ante - platí pro ante ON, u ante OFF nechat vlastní export", detail: "zpřesněné záznamy i push/fold by u ante OFF zmizely (30,4 % → 0 % zpřesněných spotů v ante OFF)." },
      { code: "b", label: "RYE počítá s ante, ale beru ho i pro ante OFF", detail: "dnešní stav, přiznané v assumptions packu." },
      { code: "c", label: "RYE je bez ante / nevím", detail: "dnešní stav beze změny textu." },
    ],
    recommended: "",
    diary: "255",
  },
  {
    id: 8,
    title: "Jam na 40 bb přes otevření (bod 254/1)",
    context: "RYE <code>F3B-40BB-BB-vs-BTN</code> jamuje 22-77, AJo, ATo (schválené), produkt shove na 40 bb "
      + "nenabízí, protože nemá calling range, proti které by ho ocenil (<code>CALLRE-*</code> končí 30 bb). "
      + "Cesty: jiný zdroj calling range na 40 bb, nebo spočítat ji z equity (stejný původ, jaký má dnes cena jamu).",
    options: [
      { code: "a", label: "Spočítat calling range z equity (ALL_IN_EQUITY)", detail: "bez nového zdroje; cena jamu na 40 bb bude modelová, ne z chartu." },
      { code: "b", label: "Dodám jiný zdroj calling range na 40 bb", detail: "napiš jaký (GTO Wizard, HRC, vlastní solve)." },
      { code: "c", label: "Nechat jam na 40 bb mimo", detail: "mřížka zůstane v draftu jako actionNotOffered." },
    ],
    recommended: "a",
    freeText: "U b): jaký zdroj a kde ho najdu.",
    diary: "254",
  },
  {
    id: 9,
    title: "Flopové piloty (bod 248)",
    context: "Třetí čtení: 6 pilotů ✗, 1 ✓ (UTG vs BB přijat). Zamítnutí BTN vs BB ukázalo, že 12 ze 41 rodin "
      + "stojí na jediném stromu. Návrh: 6 zamítnutých přeznačit na LOW (mění bránu) a přesolvit BTN-BB rodiny v noci.",
    options: [
      { code: "a", label: "Přeznačit na LOW a přesolvit BTN-BB", detail: "noc dostane frontu; piloty zmizí z „přečteno“ do LOW." },
      { code: "b", label: "Nechat", detail: "verdikty zůstanou zapsané, brána se nemění." },
    ],
    recommended: "a",
    diary: "248",
  },
  {
    id: 10,
    title: "Přesolvit 25bb rodiny s opravenými preflop ranžemi (4 až 5 nocí)",
    context: "Solver bere preflop ranže z produkčního packu - tedy do dneška ze snímku z 16. 7. "
      + "Všech 29 rodin na 25 bb (348 desek, dosolvených 14.-17. 9.) má proto vstupní ranže, které se "
      + "od dnešní produkce liší: RFI o 1-10 tříd, obrana o 4-15 tříd a <b>BB proti otevření o 94 tříd</b> "
      + "(od 31. 7. na 25 bb re-jamuje, stromy počítají s dorovnáním). Postflop tak modeluje range, kterou "
      + "produkt už neučí. Stejný nesoulad blokuje i další desky (<code>mtt:board-growth</code>: šablona "
      + "nesedí, 58 desek čeká). Přesolvení: 348 × 7,6 min ≈ 44 h, tedy 4 až 5 nocí bez riverových vrstev; "
      + "packy a turnová EV se pak obnoví ranním cyklem jako po každé noci.",
    options: [
      { code: "a", label: "Přesolvit 25bb rodiny, nejdřív ty s BB (4 rodiny, 48 desek, půl noci)", detail: "pak zbylých 25 rodin; po dosolvení znovu růst desek (58)." },
      { code: "b", label: "Nechat stromy, jak jsou, noci dál dávají riverové vrstvy (turnová EV)", detail: "nesoulad zůstane přiznaný v deníku; růst desek zůstane zablokovaný." },
      { code: "c", label: "Přesolvit jen rodiny s BB", detail: "48 desek, půl noci; ostatní nesoulad 4-15 tříd přiznat." },
    ],
    recommended: "a",
    diary: "257",
  },
];

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (character) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] ?? character
));

/** Otisk otázek: změní-li se jejich znění, uložené odpovědi se nepřevezmou. */
export function decisionsHash(decisions: readonly OwnerDecision[]): string {
  const text = decisions.map((row) => `${row.id}:${row.title}:${row.options.map((option) => option.code + option.label).join(",")}`).join("|");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export function renderOwnerDecisionsPage(
  decisions: readonly OwnerDecision[],
  input: { dateLabel: string; intro: string; storageKey: string },
): string {
  const hash = decisionsHash(decisions);
  const sections = decisions.map((row) => {
    const options = row.options.map((option) => (
      `<label class="opt${option.code === row.recommended ? " opt--rec" : ""}">`
      + `<input type="radio" name="v${row.id}" value="${option.code}">`
      + `<span><b>${option.code.toUpperCase()})</b> ${escapeHtml(option.label)}`
      + `${option.detail ? `<small> - ${escapeHtml(option.detail)}</small>` : ""}</span></label>`
    )).join("\n");
    const free = row.freeText === undefined
      ? ""
      : `<p class="q-hint">${escapeHtml(row.freeText)}</p><textarea class="free" name="t${row.id}" rows="4"></textarea>`;
    return `<section id="q${row.id}">
  <h2>${row.id}. ${escapeHtml(row.title)} <small>deník ${escapeHtml(row.diary)}</small></h2>
  <p class="ctx">${row.context}</p>
  <div class="verdict" data-id="${row.id}">
    <p class="q-focus">${row.recommended === "" ? "Bez doporučení - je to tvůj údaj." : `Doporučení: <b>${row.recommended.toUpperCase()}</b>.`}</p>
    <div class="opts">
${options}
    </div>
    ${free}
  </div>
</section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DrillEV - rozhodnutí ${escapeHtml(input.dateLabel)}</title>
<style>
 body{margin:0;background:#0b0f16;color:#e6edf7;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
 main{max-width:860px;margin:0 auto;padding:16px}
 h1{font-size:22px;margin:8px 0 4px}
 h2{font-size:17px;margin:26px 0 6px;color:#dce6f5}
 h2 small{font-weight:400;color:#7f93ad;font-size:12px;margin-left:8px}
 .intro{color:#cfe0f5;background:#121a27;border:1px solid #2a3446;border-radius:10px;padding:12px 14px}
 .intro ol{margin:6px 0 0 18px;padding:0}
 .ctx{color:#b9c8dc;margin:0 0 8px}
 .ctx code{background:#1a2333;padding:1px 5px;border-radius:4px;font-size:13px}
 .bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
      padding:10px 12px;background:#0f141d;border-bottom:1px solid #2a3446}
 .bar b{color:#7bd3ff}
 .bar button{padding:9px 12px;border:0;border-radius:8px;background:#2f4a7a;color:#fff;font-size:13px;cursor:pointer;min-height:40px}
 .bar button.ghost{background:#1f2839;color:#cfe0f5}
 .bar span[id$="-warning"]{color:#ff8f6b;font-size:12px;max-width:460px}
 .verdict{margin-top:8px;padding:10px;background:#161d2b;border-radius:8px}
 .q-focus{margin:0 0 6px;font-size:13px;color:#dce6f5}
 .q-hint{margin:8px 0 6px;font-size:12px;color:#9fb3cd}
 .opts{display:flex;flex-direction:column;gap:6px}
 .opt{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-radius:10px;background:#1f2839;color:#cfe0f5;cursor:pointer;user-select:none}
 .opt input{width:18px;height:18px;margin:3px 0 0}
 .opt small{display:block;color:#9fb3cd;font-size:12px}
 .opt:has(input:checked){background:#2f4a7a;color:#fff}
 .opt:has(input:checked) small{color:#dbe7fa}
 .opt--rec{border:1px solid #3f6f86}
 .free{width:100%;box-sizing:border-box;background:#0f141d;color:#e6edf7;border:1px solid #2a3446;border-radius:8px;padding:8px;font:14px/1.4 inherit}
 #export{width:100%;box-sizing:border-box;height:120px;margin-top:8px;background:#0f141d;color:#cfe0f5;border:1px solid #2a3446;border-radius:8px;font:12px/1.4 ui-monospace,monospace;padding:8px}
 #filled{white-space:pre-wrap;background:#0f141d;border:1px dashed #2a3446;border-radius:8px;padding:10px;color:#9fb3cd;font:12px/1.4 ui-monospace,monospace;margin-top:24px}
 .done{color:#7ee0a3}
</style>
</head>
<body>
<div class="bar">
  <span id="progress">zodpovězeno <b>0</b> z ${decisions.length}</span>
  <button id="next">Další nezodpovězená</button>
  <button id="share" class="ghost">Zkopírovat odpovědi</button>
  <span id="storage-warning" hidden>Pozor: tenhle prohlížeč tu stránku neuloží. Odpovědi drží jen adresa - ulož si ji, nebo je průběžně kopíruj.</span>
  <span id="stale-warning" hidden>Otázky se od uložení odpovědí změnily, takže se nepřebírají.</span>
</div>
<main>
<h1>DrillEV - rozhodnutí ${escapeHtml(input.dateLabel)}</h1>
<div class="intro">${input.intro}</div>
${sections}
<textarea id="export" hidden readonly></textarea>
<pre id="filled">(zatím bez odpovědí - text se sem zapíše sám, ať přežije uložení stránky)</pre>
<p class="q-hint">Hotovou stránku ulož (Ctrl+S, „Webová stránka, kompletní“) a pošli, nebo zkopíruj odpovědi tlačítkem nahoře. Zpracuje je <code>npm run mtt:decision-answers</code>.</p>
</main>
<script>
(function () {
  var KEY = ${JSON.stringify(input.storageKey)};
  var PREFIX = ${JSON.stringify(DECISIONS_TOKEN_PREFIX)};
  var HASH = ${JSON.stringify(hash)};
  var blocks = document.querySelectorAll(".verdict");
  var ids = [];
  for (var b = 0; b < blocks.length; b += 1) ids.push(blocks[b].getAttribute("data-id"));

  function pickedFor(id) {
    var picked = document.querySelector('input[name="v' + id + '"]:checked');
    return picked ? picked.value : "";
  }
  function textFor(id) {
    var area = document.querySelector('textarea[name="t' + id + '"]');
    if (!area) return "";
    // Bez zpětného lomítka v emitovaném skriptu (viz reviewAnswerMemory):
    // konce řádků se nahrazují přes kódy znaků.
    return area.value.split(String.fromCharCode(13)).join(" ").split(String.fromCharCode(10)).join(" ").trim();
  }
  function codes() {
    var parts = [];
    for (var i = 0; i < ids.length; i += 1) {
      var code = pickedFor(ids[i]);
      if (code !== "") parts.push(ids[i] + code);
    }
    return parts;
  }
  function token() {
    var parts = codes();
    return parts.length === 0 ? "" : PREFIX + " " + HASH + " " + parts.join(" ");
  }
  function texts() {
    var lines = [];
    for (var i = 0; i < ids.length; i += 1) {
      var text = textFor(ids[i]);
      if (text !== "") lines.push("T" + ids[i] + ": " + text);
    }
    return lines;
  }
  function exportText() {
    var head = token();
    if (head === "") return "";
    return [head].concat(texts()).join(String.fromCharCode(10));
  }
  function refresh() {
    var done = codes().length;
    var counter = document.getElementById("progress");
    if (counter) counter.innerHTML = "zodpovězeno <b>" + done + "</b> z " + ids.length + (done === ids.length ? ' <span class="done">- hotovo</span>' : "");
    var filled = document.getElementById("filled");
    if (filled) filled.textContent = exportText() || "(zatím bez odpovědí - text se sem zapíše sám, ať přežije uložení stránky)";
  }
  function save() {
    var text = exportText();
    try { localStorage.setItem(KEY, text); } catch (error) { /* bez úložiště */ }
    if (history.replaceState) history.replaceState(null, "", "#v=" + encodeURIComponent(text));
    refresh();
  }
  function apply(text) {
    var lines = text.split(String.fromCharCode(10));
    if (lines.length === 0) return;
    var parts = lines[0].split(" ");
    if (parts.length < 2 || parts[0] !== PREFIX) return;
    if (parts[1] !== HASH) { var warn = document.getElementById("stale-warning"); if (warn) warn.hidden = false; return; }
    for (var i = 2; i < parts.length; i += 1) {
      var match = /^([0-9]+)([a-z])$/.exec(parts[i]);
      if (match === null) continue;
      var radio = document.querySelector('input[name="v' + match[1] + '"][value="' + match[2] + '"]');
      if (radio !== null) radio.checked = true;
    }
    for (var line = 1; line < lines.length; line += 1) {
      var found = /^T([0-9]+): (.*)$/.exec(lines[line]);
      if (found === null) continue;
      var area = document.querySelector('textarea[name="t' + found[1] + '"]');
      if (area !== null) area.value = found[2];
    }
  }
  function storageWorks() {
    try { localStorage.setItem(KEY + "-probe", "1"); localStorage.removeItem(KEY + "-probe"); return true; } catch (error) { return false; }
  }
  function load() {
    var text = "";
    if (location.hash.indexOf("#v=") === 0) {
      try { text = decodeURIComponent(location.hash.slice(3)); } catch (error) { text = ""; }
    }
    if (text === "") { try { text = localStorage.getItem(KEY) || ""; } catch (error) { text = ""; } }
    if (text !== "") apply(text);
    if (!storageWorks()) { var warn = document.getElementById("storage-warning"); if (warn) warn.hidden = false; }
    refresh();
  }
  document.addEventListener("change", function (event) {
    var name = event.target && event.target.name;
    if (name && /^[vt][0-9]+$/.test(name)) save();
  });
  document.addEventListener("input", function (event) {
    var name = event.target && event.target.name;
    if (name && /^t[0-9]+$/.test(name)) save();
  });
  document.addEventListener("click", function (event) {
    var id = event.target && event.target.id;
    if (id === "next") {
      for (var i = 0; i < blocks.length; i += 1) {
        if (!blocks[i].querySelector('input[type="radio"]:checked')) {
          (blocks[i].closest("section") || blocks[i]).scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      alert("Hotovo, všechno má odpověď.");
    }
    if (id === "share") {
      var box = document.getElementById("export");
      box.hidden = false;
      box.value = exportText();
      box.focus();
      box.select();
      try { document.execCommand("copy"); } catch (error) { /* stačí označené */ }
    }
  });
  load();
})();
</script>
</body>
</html>
`;
}
