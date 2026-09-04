import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
    file: "ranze-chipev.html",
    title: "Ranže z chartů — chipEV půlka",
    decides: "jestli koupené mřížky odpovídají tomu, co má trenažér radit preflop",
    command: 'npm run mtt:rye-answers -- --answers="…"',
    storageKey: "drillev-rye-answers-v2",
    hashed: false,
    priority: "první",
    renderer: ["scripts/renderRyeDraftReview.mts", "--only=CHIP"],
  },
  {
    file: "piloty.html",
    title: "Flopové piloty",
    decides: "jestli sedm pilotů, které dnes drží MEDIUM jen původem solvu, hraje dobře",
    command: 'npm run mtt:pilot-answers -- --answers="…" --reviewer="Radim" --write',
    storageKey: "drillev-pilot-answers-v1",
    hashed: true,
    priority: "druhé",
    renderer: ["scripts/renderFlopPilotReview.mts"],
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
  rendered.push({ ...document, ids });
}

const cards = rendered.map((document, index) => `
  <section class="doc" data-index="${index}">
    <h2>${escapeHtml(document.title)}</h2>
    <p class="meta">${escapeHtml(document.priority)} &middot;
       <b>${document.ids.length}</b> ${document.ids.length === 7 ? "pilotů" : "mřížek"} &middot;
       <span class="done" id="done${index}">průběh se načítá…</span></p>
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

writeFileSync(`${outDir}/index.html`, page, "utf8");

console.log(`Složka k nahrání: ${outDir}`);
for (const document of rendered) {
  console.log(`  ${document.file.padEnd(20)} ${String(document.ids.length).padStart(4)} k odpovědi  (${document.priority})`);
}
console.log("  index.html            rozcestník s průběhem");
console.log("");
console.log("Nahraj celou složku na FTP a otevírej index.html. Odpovědi drží prohlížeč,");
console.log("takže se dá vyplňovat postupně; nic se nikam neodesílá.");
