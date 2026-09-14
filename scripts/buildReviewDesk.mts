import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

/**
 * Jedna složka na FTP se vším, co čeká na majitelovo potvrzení.
 *
 *   npm run mtt:review-desk
 *
 * ## Proč to musí vzniknout
 *
 * Čtecí stránky vznikaly každá zvlášť a leží každá jinde v `artifacts/`.
 * Majitel 4. 9. 2026 řekl, jak je bude používat: dá si je na FTP a bude je
 * **vyplňovat postupně**. K tomu potřebuje jedno místo, kde je vidět, co ještě
 * čeká a kolik z toho už má - jinak se to čte tak, že se pokaždé znovu hledá,
 * kde skončil.
 *
 * ## Co je tady měřené a co ne
 *
 * Počty se **čtou z vygenerovaných stránek**, ne z toho, co si o nich myslí
 * tenhle skript: `class="verdict"` se dá spočítat a `data-id` vypsat. Kdyby se
 * počty psaly ručně, byl by rozcestník první věc, která se rozejde s obsahem.
 *
 * Průběh na rozcestníku čte **týž klíč v localStorage**, jaký zapisují samotné
 * stránky. Funguje to proto, že na FTP je to jeden původ; z lokálního souboru
 * to prohlížeč nemusí dovolit a rozcestník to pak přizná místo aby ukazoval
 * nulu jako fakt.
 *
 * ## Co to nedělá
 *
 * **Nikam to nenahrává.** Nahrání na FTP je majitelův krok; skript jen připraví
 * složku a řekne, co s ní.
 */

/**
 * Kdy byla stránka stavu postavená, slovy.
 *
 * Staví se zvlášť, protože to měření trvá minuty - a přesně proto může odejít
 * na FTP o den starší než zbytek složky. Čtenář by četl včerejší čísla a nic by
 * mu to neřeklo. Datum tedy stojí rovnou u odkazu, a když je starší než tenhle
 * rozcestník, řekne se to nahlas.
 */
function statePageAge(path: string, builtAt: Date): string {
  if (!existsSync(path)) {
    return "Zatím nepostavená - spusť <code>npm run mtt:state-page</code>.";
  }
  const stamp = statSync(path).mtime;
  const day = (value: Date) => value.toLocaleDateString("cs-CZ");
  const stale = builtAt.getTime() - stamp.getTime() > 6 * 60 * 60 * 1000;
  return stale
    ? `<strong>Postavená ${day(stamp)}, tenhle rozcestník ${day(builtAt)}</strong> -`
      + " čísla na ní jsou starší než zbytek složky; přestav ji přes"
      + " <code>npm run mtt:state-page</code>."
    : `Postavená ${day(stamp)}, tedy spolu s tímhle rozcestníkem.`;
}
const outDir = process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1]
  ?? "artifacts/review-desk";

interface DeskDocument {
  /** Jméno souboru ve složce; krátké, ať se dá napsat do adresního řádku. */
  file: string;
  title: string;
  /** Co se tou odpovědí rozhodne. Bez toho je to jen „něco ke kontrole". */
  decides: string;
  /** Čím se odpovědi zapisují zpátky. */
  command: string;
  /** Klíč, pod kterým stránka drží odpovědi. */
  storageKey: string;
  /** Má token na začátku otisk obsahu? U pilotů ano. */
  hashed: boolean;
  /** Pořadí na rozcestníku: co může dojít k hráči, jde nahoru. */
  priority: string;
  renderer: readonly string[];
}

const documents: readonly DeskDocument[] = [
  {
    file: "piloty.html",
    title: "Flopové piloty",
    decides: "jestli sedm pilotů, které dnes drží MEDIUM jen původem solvu, hraje dobře - třetí čtení, teď nad mixem",
    command: 'npm run mtt:pilot-answers -- --answers="…" --reviewer="Radim" --write',
    storageKey: "drillev-pilot-answers-v1",
    hashed: true,
    priority: "první - flop",
    renderer: ["scripts/renderFlopPilotReview.mts"],
  },
  {
    file: "ranze-chipev.html",
    title: "Ranže z chartů — chipEV půlka",
    decides: "jestli koupené mřížky odpovídají tomu, co má trenažér radit preflop",
    command: 'npm run mtt:rye-answers -- --answers="…"',
    storageKey: "drillev-rye-answers-v2",
    hashed: false,
    priority: "přečteno 10. 9.",
    renderer: ["scripts/renderRyeDraftReview.mts", "--only=CHIP"],
  },
  {
    file: "ranze-vse.html",
    title: "Ranže z chartů — celý draft včetně ICM",
    decides: "totéž, ale i pro ICM půlku, která se do produkce dostat nemůže",
    command: 'npm run mtt:rye-answers -- --answers="…"',
    storageKey: "drillev-rye-answers-v2",
    hashed: false,
    priority: "až zbyde čas",
    renderer: ["scripts/renderRyeDraftReview.mts"],
  },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character] ?? character
  ));
}

mkdirSync(outDir, { recursive: true });

interface RenderedDocument extends DeskDocument {
  /** Identity záznamů na té stránce, přečtené z ní. */
  ids: readonly number[];
  /** Zodpovězeno a od té doby beze změny - číst znovu netřeba. */
  settled: number;
  /** Zodpovězeno, ale obsah nebo kreslení se od té doby změnilo - číst znovu. */
  reread: number;
}

/**
 * Co na stránce ještě čeká, **přečtené ze stránky**, ne z paměti prohlížeče.
 *
 * Průběh v localStorage je na jednom zařízení; zapsané odpovědi
 * (`Agents/range-intake/answers-*.json`, `Agents/turn-review/verdicts.json`)
 * platí všude. Stránky je samy vypisují u záznamu (`meta answered`,
 * `meta stale`, `previous`), takže rozcestník jen počítá tytéž značky -
 * kdyby počítal jinak než stránka, rozešel by se s ní.
 */
function recordedProgress(html: string): { settled: number; reread: number } {
  return {
    settled: (html.match(/class="meta answered"/g) ?? []).length
      + (html.match(/class="previous settled"/g) ?? []).length,
    reread: (html.match(/class="meta stale"/g) ?? []).length + (html.match(/class="previous"/g) ?? []).length,
  };
}

const rendered: RenderedDocument[] = [];
for (const document of documents) {
  const [script, ...args] = document.renderer;
  execFileSync(
    process.execPath,
    ["scripts/run-cli.mjs", script, ...args, `--out=${outDir}/${document.file}`],
    { stdio: "pipe" },
  );
  const html = readFileSync(`${outDir}/${document.file}`, "utf8");
  const ids = [...html.matchAll(/class="verdict" data-id="(\d+)"/g)].map((match) => Number(match[1]));
  if (ids.length === 0) {
    console.error(`${document.file}: žádný odpovídací blok - stránka by se nedala vyplnit.`);
    process.exit(1);
  }
  rendered.push({ ...document, ids, ...recordedProgress(html) });
}

/** Věta o tom, co z té stránky ještě chci - z čísel, která stránka sama nese. */
function remainingLine(document: RenderedDocument): string {
  const open = document.ids.length - document.settled - document.reread;
  const parts: string[] = [];
  if (document.settled > 0) parts.push(`<b>${document.settled}</b> zapsáno a beze změny`);
  if (document.reread > 0) parts.push(`<b>${document.reread}</b> k přečtení znovu`);
  if (open > 0) parts.push(`<b>${open}</b> bez odpovědi`);
  if (document.settled === document.ids.length) return "Hotovo - nic tu nečeká.";
  return `Čeká: ${parts.join(" &middot; ")}.`;
}

const cards = rendered.map((document, index) => `
  <section class="doc" data-index="${index}">
    <h2>${escapeHtml(document.title)}</h2>
    <p class="meta">${escapeHtml(document.priority)} &middot;
       <b>${document.ids.length}</b> ${document.ids.length === 7 ? "pilotů" : "mřížek"} &middot;
       <span class="done" id="done${index}">průběh se načítá…</span></p>
    <p class="remaining">${remainingLine(document)}</p>
    <p class="what">${escapeHtml(document.decides)}</p>
    <p><a class="open" href="${escapeHtml(document.file)}">Otevřít a pokračovat</a></p>
    <p class="meta">odpovědi se pak zapisují: <code>${escapeHtml(document.command)}</code></p>
  </section>`).join("");

const page = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Co čeká na potvrzení</title>
<style>
 body{font:15px/1.6 system-ui,Segoe UI,sans-serif;margin:0;background:#12161f;color:#e8eef7}
 main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
 h1{font-size:21px;margin:0 0 6px}
 h2{font-size:17px;margin:0 0 4px}
 .intro{background:#1a2130;padding:12px 16px;border-radius:8px;margin-bottom:18px}
 .doc{background:#161d2b;border-radius:10px;padding:14px 16px;margin:12px 0}
 .meta{color:#9fb3cd;font-size:13px;margin:2px 0}
 .what{margin:6px 0}
 .done b{color:#7bd3ff}
 .remaining{margin:4px 0;color:#f0c14b}
 .remaining b{color:#fff}
 a.open{display:inline-block;margin:8px 0 2px;padding:10px 14px;border-radius:8px;
        background:#2f4a7a;color:#fff;text-decoration:none;font-size:14px;min-height:40px}
 code{background:#0f141d;padding:1px 5px;border-radius:3px;font-size:12px}
 button{padding:10px 14px;border:0;border-radius:8px;background:#1f2839;color:#cfe0f5;
        font-size:14px;cursor:pointer;min-height:40px}
 #all{width:100%;height:120px;margin-top:8px;background:#0f141d;color:#cfe0f5;
      border:1px solid #2a3446;border-radius:8px;font:12px/1.4 ui-monospace,monospace;padding:8px}
 #storage-warning{color:#ff8f6b;font-size:13px}
</style></head><body>
<main>
<h1>Co čeká na potvrzení</h1>
<div class="intro">
 <p>Tyhle stránky jsou <b>drafty</b>. Nic z nich není v produktu a nic se nikam
    neodesílá - odpovědi drží tenhle prohlížeč, takže se dá odbavovat po kouskách
    a vracet se k tomu.</p>
 <p>Odpověď se váže na <b>identitu záznamu</b>, ne na jeho pořadí, takže když se
    obsah přegeneruje, zůstane u té mřížky, u které jsi ji dal.</p>
 <p class="meta" id="storage-warning" hidden>Tenhle prohlížeč tu stránku neuloží
    (nejspíš se otevírá ze souboru, ne z FTP). Průběh se tu proto neukáže a
    odpovědi si podrží jen adresa - kopíruj je průběžně.</p>
</div>
${cards}
<section class="doc">
 <h2>Tři rozhodnutí, na kterých visí obsah</h2>
 <p class="what">Žádná mřížka - tři otázky s doměřenou cenou. Odpovídá se zprávou, ne tokenem.</p>
 <p><a class="open" href="rozhodnuti.html">Otevřít rozhodnutí</a></p>
</section>
<section class="doc">
 <h2>Kde projekt stojí</h2>
 <p class="what">Čísla, ne dojem: co dostane hráč po odpovědi, stav obsahu, poslední noc
    a na kom co visí. Staví se zvlášť přes <code>npm run mtt:state-page</code>, protože
    to měření trvá minuty — když tam odkaz nevede, stránka ještě nebyla postavená.</p>
 <p class="what">${statePageAge(`${outDir}/stav.html`, new Date())}</p>
 <p><a class="open" href="stav.html">Otevřít stav</a></p>
</section>
<section class="doc">
 <h2>Až budeš chtít předat, co máš</h2>
 <p class="what">Nemusí to být hotové. Tlačítko vypíše tokeny za všechno, co je
    zatím zodpovězené, a ty se dají poslat kdykoli.</p>
 <button id="collect">Vypsat všechny odpovědi</button>
 <textarea id="all" hidden readonly></textarea>
</section>
</main>
<script>
(function () {
  var DOCS = ${JSON.stringify(rendered.map((document) => ({
    key: document.storageKey,
    ids: document.ids,
    hashed: document.hashed,
    prefix: document.storageKey === "drillev-pilot-answers-v1"
      ? "DRILLEV-PILOT-V1"
      : "DRILLEV-REVIEW-V2",
    title: document.title,
  })))};

  function read(key) {
    try { return localStorage.getItem(key) || ""; } catch (error) { return ""; }
  }

  // Otisk u pilotů stojí na začátku tokenu; při počítání se musí přeskočit,
  // jinak by se počítal jako odpověď.
  function parts(text, hashed) {
    var raw = text.split(".").join(" ").split(" ");
    var out = [];
    for (var i = 0; i < raw.length; i += 1) if (raw[i] !== "") out.push(raw[i]);
    if (hashed && out.length > 0) out.shift();
    return out;
  }

  function answeredIds(text, hashed) {
    var found = {};
    var list = parts(text, hashed);
    for (var i = 0; i < list.length; i += 1) {
      var match = /^([0-9]+)([ox?s])/.exec(list[i]);
      if (match !== null) found[match[1]] = true;
    }
    return found;
  }

  function storageWorks() {
    try {
      localStorage.setItem("review-desk-probe", "1");
      localStorage.removeItem("review-desk-probe");
      return true;
    } catch (error) { return false; }
  }

  function refresh() {
    for (var d = 0; d < DOCS.length; d += 1) {
      var found = answeredIds(read(DOCS[d].key), DOCS[d].hashed);
      var done = 0;
      for (var i = 0; i < DOCS[d].ids.length; i += 1) {
        if (found[String(DOCS[d].ids[i])]) done += 1;
      }
      var node = document.getElementById("done" + d);
      if (node) {
        node.innerHTML = done === 0
          ? "zatím nezačaté"
          : "hotovo <b>" + done + "</b> z " + DOCS[d].ids.length;
      }
    }
  }

  document.addEventListener("click", function (event) {
    if (!event.target || event.target.id !== "collect") return;
    var box = document.getElementById("all");
    var lines = [];
    for (var d = 0; d < DOCS.length; d += 1) {
      var text = read(DOCS[d].key);
      if (parts(text, DOCS[d].hashed).length === 0) continue;
      var already = false;
      for (var seen = 0; seen < d; seen += 1) {
        if (DOCS[seen].key === DOCS[d].key) already = true;
      }
      if (already) continue;
      lines.push(DOCS[d].prefix + " " + text);
    }
    // Konec řádku se skládá z kódu znaku schválně: zapsaný jako escape by ho
    // vkládání do šablonového řetězce mohlo cestou sníst, a je to táž past,
    // kvůli které se jednou neuložila žádná odpověď.
    var blank = String.fromCharCode(10) + String.fromCharCode(10);
    box.hidden = false;
    box.value = lines.length === 0 ? "Zatím nic zodpovězeného." : lines.join(blank);
    box.focus();
    box.select();
    try { document.execCommand("copy"); } catch (error) { /* stačí označené */ }
  });

  if (!storageWorks()) {
    var warning = document.getElementById("storage-warning");
    if (warning) warning.hidden = false;
  }
  refresh();
})();
</script>
</body></html>
`;

/**
 * Rozhodnutí, která nejsou mřížka.
 *
 * Tři otázky visí na majiteli od 9. az 10. 9. 2026 a stály v deníku a v plánu
 * dne - tedy tam, kde se na ně čte stroj, ne člověk. Text je opsaný z měření
 * v bodech 225, 234 a z čtení chipEV půlky; čísla se tu nepočítají znovu,
 * a proto u každé stojí, odkud jsou.
 */
function decisionsPage(): string {
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tři rozhodnutí</title>
<style>
 body{font:15px/1.6 system-ui,Segoe UI,sans-serif;margin:0;background:#12161f;color:#e8eef7}
 main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
 h1{font-size:21px;margin:0 0 6px} h2{font-size:17px;margin:18px 0 4px}
 .doc{background:#161d2b;border-radius:10px;padding:14px 16px;margin:12px 0}
 .meta{color:#9fb3cd;font-size:13px} .rec{color:#f0c14b}
 code{background:#0f141d;padding:1px 5px;border-radius:3px;font-size:12px}
 a{color:#7bd3ff}
</style></head><body><main>
<h1>Tři rozhodnutí, na kterých visí obsah</h1>
<p class="meta">Odpovídá se zprávou („1: A, 2: B, 3: squeeze"). Čísla jsou z měření uvedených u každé otázky.</p>

<section class="doc">
<h2>1. Osa otvírače v klíči ranže (deník 234)</h2>
<p>Schválil jsi 61 chipEV mřížek „proti otevření". Produkt se ale u ranže ptá jen na
sedačku hrdiny a hloubku - <b>ne na to, kdo otevřel</b>. Změřeno
(<code>npm run mtt:opener-axis</code>): na dnešní předpoklad sedí <b>6 mřížek a 118 tříd</b>,
<b>51 mřížek a 845 tříd</b> míří proti otvírači, na kterého se produkt nikdy nezeptá.
Absurdní na tom je, že ocenění re-jamu otvírače zná (<code>REJAM_EV_OPENER_BY_HERO</code>) - situace se
tedy ocení proti konkrétnímu otvírači a naučí z range, která otvírače ignoruje.</p>
<p><b>A)</b> dát <code>RangeKey</code> osu otvírače - 2 az 3 dny práce, otázka pro hráče se změní
(„BB proti otevření z UTG" místo „BB proti otevření"), a schválených 845 tříd se dodá.<br>
<b>B)</b> nechat, jak je - dodá se 118 tříd, zbytek zůstane nedosažitelný a přiznaný jako limit.</p>
<p class="rec">Doporučení: A. Bez osy koupí import skoro nic; hodnota schváleného čtení je v ose samotné.</p>
</section>

<section class="doc">
<h2>2. Šest zamítnutých push/fold mřížek na 20 bb („moc těsné")</h2>
<p>Z chipEV půlky jsi 10. 9. zamítl 6 mřížek PUSH_FOLD 20 bb. Trenažér dnes na 20 bb radí
z produkčního packu, který na tyhle spoty odpovídá jinak než koupený chart - a ty jsi řekl,
že koupený je moc těsný.</p>
<p><b>A)</b> nechat produkční pack (nic se nemění; koupený chart se na 20 bb nepoužije).<br>
<b>B)</b> vzít koupený chart i tak a přiznat u něj „těsnější než bys hrál".<br>
<b>C)</b> dodáš jiný zdroj pro 20 bb push/fold (jaký?).</p>
<p class="rec">Doporučení: A, dokud není jiný zdroj - zamítnutý chart nemá co učit.</p>
</section>

<section class="doc">
<h2>3. Dvě stránky, které import vyřadil (deník 225)</h2>
<p>Import shodil dvě stránky, protože měly barvu, kterou slovník kontextu neuměl přeložit:
<code>MUL-20BB-BB-vs-MP_LP</code> a <code>ICM11-bb13bb-sb9bb-r</code>. Ani jedna není čelení all-inu -
první vypadá jako <b>squeeze</b> proti otevření a dorovnání, druhá jako <b>obrana big blindu proti 2,5x</b>.
Slovník se bez tvé odpovědi určit nedá a dnes je kontext <code>VS_ALLIN</code> prázdný.</p>
<p><b>Otázka:</b> čemu ty dvě stránky odpovídají - squeeze, obrana proti otevření, nebo něco jiného?
(Stačí dvě slova ke každé.)</p>
</section>
<p class="meta"><a href="index.html">zpět na rozcestník</a></p>
</main></body></html>
`;
}

writeFileSync(`${outDir}/index.html`, page, "utf8");

console.log(`Složka k nahrání: ${outDir}`);
for (const document of rendered) {
  const open = document.ids.length - document.settled - document.reread;
  console.log(`  ${document.file.padEnd(20)} ${String(document.ids.length).padStart(4)} celkem,`
    + ` ${String(document.settled).padStart(3)} zapsáno, ${String(document.reread).padStart(3)} znovu,`
    + ` ${String(open).padStart(3)} bez odpovědi  (${document.priority})`);
}
writeFileSync(`${outDir}/rozhodnuti.html`, decisionsPage(), "utf8");
console.log("  rozhodnuti.html       tři rozhodnutí s doměřenou cenou");
console.log("  index.html            rozcestník s průběhem");
console.log("");

/**
 * Složka se nevydá, když stránka kreslí míň, než data nesou.
 *
 * Brána tady, ne až v `verify:block`: čtecí stránky se stavějí mimo blok a na
 * FTP je nahrává člověk. Kontrola, kterou lze zapomenout spustit, by přesně tu
 * čtyřikrát opakovanou vadu (body 221, 223, 224, 225) nechytila v okamžiku,
 * kdy vzniká. Běží ve **vlastním procesu** ze stejného důvodu jako u
 * zastaralosti EV: měřit vlastní paměť místo disku znamená hlásit klid přesně
 * v okamžiku ztráty.
 */
try {
  execFileSync(
    process.execPath,
    ["scripts/run-cli.mjs", "scripts/checkReviewDeskFidelity.mts", `--desk=${outDir}`],
    { stdio: "inherit" },
  );
} catch {
  console.error("");
  console.error("Složka NENÍ k nahrání: kontrola věrnosti neprošla (viz výš).");
  process.exit(1);
}

console.log("");
console.log("Nahraj celou složku na FTP a otevírej index.html. Odpovědi drží prohlížeč,");
console.log("takže se dá vyplňovat postupně; nic se nikam neodesílá.");
