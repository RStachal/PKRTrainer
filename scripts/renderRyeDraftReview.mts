import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type DraftFile,
  type DraftImpact,
  type DraftRecord,
  cellOf,
  draftLanding,
  impactOf,
  loadProductionStoreForImpact,
  seatCollisions,
} from "./lib/ryeDraftImpact.mts";
import {
  REVIEW_ANSWER_STYLES,
  reviewAnswerBar,
  reviewAnswerFlag,
  reviewAnswerOption,
  reviewAnswerScript,
} from "./lib/reviewAnswerMemory.mts";
import { gridQuestion, isStale, loadAnswerHistory, partialWeightCells } from "./lib/ryeAnswerHistory.mts";

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

/**
 * Půlka draftu ke čtení, `--only=CHIP` nebo `--only=ICM`. Stejné jméno i význam
 * jako u `mtt:rye-corpus`, ať se dvě místa nechovají jinak.
 *
 * Čtení je u tohohle obsahu jediné úzké hrdlo a draft má 114 mřížek. Číst je
 * všechny ve stejném pořadí znamená strávit 40 % času na ICM - a **ICM se do
 * produkce dostat nemůže**: změřeno 3. 9. 2026, že rozpory v něm neodstraní
 * žádný klíč odvoditelný ze jmen souborů, protože ICM range závisí na výplatní
 * struktuře a rozložení stacků u celého stolu. ChipEV půlka je proti tomu po
 * zpřesnění o sedačku soupeře **bez jediného rozporu** (67 buněk z 68 záznamů).
 *
 * Přednost tedy má ta půlka, která může dojít k hráči.
 */
const only = process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1]?.toUpperCase();

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

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as DraftFile;
// Dopad se měří proti produkčnímu packu, ne legacy indexu (bod 256).
await loadProductionStoreForImpact();

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
      // Poměr, ne jen výčet: „3BET 75 / CALL 25" je jiná strategie než totéž
      // půl na půl, a do 28. 8. 2026 se to na stránce nedalo rozeznat.
      const ratio = record.mix?.[hand];
      // Mix se pozná okrajem, ne jinou barvou: barva má dál znamenat akci.
      //
      // Rozhoduje o něm `mix`, ne počet akcí. Ruka hraná ze čtvrtiny má jedinou
      // akci, takže se do 9. 9. 2026 malovala plnou barvou jako každá jiná -
      // a čtenář neměl jak poznat, že se tři čtvrtiny času foldne.
      const mixed = lenient.length > 1 || ratio !== undefined;
      const mixText = ratio === undefined
        ? lenient.join(" / ")
        : Object.entries(ratio).map(([action, share]) => `${action} ${share} %`).join(" / ");
      // U čelení 3betu je váha buňky ve zdroji frekvence **otevření**, ne
      // odpovědi; odpověď je podmíněná tím, že se ruka otevřela. Čtenář to
      // musí vidět, jinak by „FOLD" u ruky otevírané ze třetiny četl jako
      // „skládá ze třetiny" - přesně to draft do 15. 9. 2026 tvrdil.
      const opened = record.openedShare?.[hand];
      const openedText = opened === undefined ? "" : `; zdroj ji otevírá jen z ${opened} %`;
      const title = lenient.length === 0
        ? `${hand}: mimo range (fold)`
        : `${hand}: ${strict.join(" / ")}${mixed ? ` (mix: ${mixText})` : ""}${openedText}`;
      cells.push(
        `<div class="c${mixed ? " mix" : ""}${ratio !== undefined
          && new Set(Object.values(ratio)).size > 1 ? " uneven" : ""}${opened === undefined ? "" : " part"}"`
        + ` style="background:${COLORS[action] ?? "#e2e5ea"}"`
        + ` title="${escapeHtml(title)}">${hand}</div>`,
      );
    }
  }
  return `<div class="grid">${cells.join("")}</div>`;
}

const impacts = new Map<DraftRecord, DraftImpact>(
  draft.records.map((record) => [record, impactOf(record)]),
);

/**
 * Srážky se počítají nad **celým draftem**, ne nad vykreslenou půlkou.
 *
 * Buňka se sráží podle toho, co v draftu je, ne podle toho, co je zrovna na
 * obrazovce. Kdyby se počítaly jen z půlky, vypadala by mřížka na chipEV
 * stránce jako nesporná jen proto, že její protějšek je v ICM půlce.
 */
const collisions = seatCollisions(draft.records);

/** Nejdřív to, co nejvíc změní **a zároveň přistane**. */
function weight(record: DraftRecord): number {
  const impact = impacts.get(record)!;
  // Rozsvícená kombinace jde úplně nahoru: „odpověď bude" váží víc než
  // „odpověď bude přesnější".
  if (impact.unlocksEmpty) return 1000;
  // Dolů, ne nahoru: přečíst ji dnes nic nezmění.
  if (impact.notDrilled) return -1;
  const base = impact.newCell ? 169 : impact.changed;
  // Dopad není doručení. Mřížka, která se sráží o rozložení stacků (ICM
  // scénář v buňce, kterou má i chipEV mřížka), může změnit šedesát tříd a
  // nedojít nikam - klíč packu scénář nemá. Čte se odshora, tak ať je nahoře
  // to, co po schválení doopravdy dojde k hráči; sražené se nezahazují, jen
  // jdou za to.
  return draftLanding(record, collisions) === "PŘISTANE" ? base : base / 100;
}

/**
 * Původní pořadí záznamu v draftu.
 *
 * Stránka řadí podle dopadu, a ten se **mění s obsahem** - noc přidá rodinu
 * a pořadí se přeskládá. Kdyby odpovědi visely na pozici na stránce, sedly by
 * po přegenerování na jiné mřížky. Identifikátor je proto index v draftu,
 * který se nemění - a je to **rovnou jméno pole** ve formuláři, takže mezi
 * pozicí a identitou není žádný převod. Do 4. 9. 2026 to platilo jen pro
 * export; úložiště zůstávalo poziční a přepnutí na půlku `--only` by odpovědi
 * přiřadilo cizím mřížkám.
 */
const originalIndex = new Map(draft.records.map((record, index) => [record, index]));

/**
 * Které mřížky se vykreslí. **Filtruje se výběr, ne číslování.**
 *
 * `originalIndex` výš zůstává nad celým draftem schválně: identifikátor
 * odpovědi je index v draftu a kdyby se přečísloval podle filtru, sedly by
 * odpovědi po přepnutí `--only` na jiné mřížky. To je táž vada jako v bodě 153,
 * jen by ji tentokrát způsobil filtr místo přeskládání podle dopadu.
 */
const visible = draft.records.filter((record) => {
  if (only === undefined) return true;
  const isIcm = /^ICM/i.test(record.stackSetupId);
  return only === "ICM" ? isIcm : !isIcm;
});

const sorted = [...visible].sort((left, right) => (
  weight(right) - weight(left)
  ||
  left.context.localeCompare(right.context)
  || left.position.localeCompare(right.position)
  || left.bucket - right.bucket
));

/** Kotva pro odkaz z rozcestníku; musí být stabilní, ať se dá poslat odkaz. */
function anchorOf(record: DraftRecord, index: number): string {
  return `r${index}-${record.context}-${record.position}-${record.bucket}`
    .toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * Rozcestník a přehled.
 *
 * 94 mřížek na jedné stránce bez navigace se kontroluje mizerně: čtenář neví,
 * kolik toho zbývá, ani kde je co. Souhrn navíc dovolí rozhodnout, **kam se
 * podívat nejdřív** - třeba na kontext s nejvíc mixy, protože tam se překlad
 * splete nejsnáz.
 */
function overview(records: readonly DraftRecord[]): string {
  const byContext = new Map<string, {
    count: number; mixed: number; setups: Set<string>; changed: number; newCells: number;
  }>();
  for (const record of records) {
    const row = byContext.get(record.context)
      ?? { count: 0, mixed: 0, setups: new Set<string>(), changed: 0, newCells: 0 };
    row.count += 1;
    row.mixed += Object.values(record.lenient).filter((actions) => actions.length > 1).length;
    row.setups.add(record.stackSetupId);
    const impact = impacts.get(record)!;
    row.changed += impact.changed;
    if (impact.newCell) row.newCells += 1;
    byContext.set(record.context, row);
  }
  const rows = [...byContext].sort((left, right) => right[1].changed - left[1].changed)
    .map(([context, row]) => `<tr><td>${escapeHtml(context)}</td><td>${row.count}</td>`
      + `<td><b>${row.changed}</b></td><td>${row.newCells}</td>`
      + `<td>${row.mixed}</td><td>${[...row.setups].sort().join(", ")}</td></tr>`)
    .join("");

  const links = records.map((record, index) => {
    const versus = record.vsSeat === "" ? "" : ` vs ${record.vsSeat}`;
    return `<a href="#${anchorOf(record, index)}">${escapeHtml(record.context)}
      ${escapeHtml(record.position)} ${record.bucket}${escapeHtml(versus)}</a>`;
  }).join("");

  return `<h2 class="plain">Přehled</h2>
<table><thead><tr><th>kontext</th><th>mřížek</th><th>změní odpověď</th><th>nových buněk</th><th>rukou s mixem</th><th>rozložení stacků</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2 class="plain">Rozcestník</h2>
<nav>${links}</nav>`;
}

/**
 * Otázka a připravené odpovědi k jedné mřížce.
 *
 * ## Proč to má tvar formuláře, ne prosby
 *
 * „Prosím zkontroluj to" nad 94 mřížkami je fikce kontroly. Aby se to dalo
 * odbavovat po kouskách - v MHD, mezi turnaji - musí být u každé mřížky
 * **konkrétní otázka**, na kterou se dá odpovědět jedním klepnutím, a průběh
 * se musí sám pamatovat.
 *
 * Otázky jsou tři a jsou to přesně ty, které stroj rozhodnout nesmí:
 *
 * 1. **Je ta range správná pro tenhle spot?** Mechanická kontrola ověřila, že
 *    se čtení mřížky nespletlo - ne že je ta strategie správná.
 * 2. **Sedí mixy?** Ruce, které zdroj hraje víc způsoby, jsou místo, kde se
 *    překlad plete nejsnáz.
 * 3. **Vadí sloučení akcí?** Zdroj rozlišuje víc, než produkt umí; jestli je ta
 *    ztráta přijatelná, je rozhodnutí o produktu, ne o datech.
 *
 * `id` je **index v draftu**, ne pozice na stránce: pod tím jménem se odpověď
 * ukládá i exportuje, takže se po přeskládání ani po přepnutí půlky nemůže
 * zaškrtnout u cizí mřížky.
 */
function verdictBlock(record: DraftRecord, id: number, impact: DraftImpact): string {
  const mixed = Object.keys(record.mix ?? {}).length;
  const uneven = Object.values(record.mix ?? {})
    .filter((ratio) => new Set(Object.values(ratio)).size > 1).length;
  const lost = record.notes.length;
  const focus = impact.notDrilled
    ? "Tuhle situaci trenažér nerozdává, takže odpověď nic nezmění - klidně dej ‚přeskočit'."
    : impact.newCell
      ? "Knihovna na tuhle buňku dnes neodpovídá vůbec. Ptej se: <b>je tahle range ta, kterou bys hrál?</b>"
      : `Knihovna už odpovídá, ale jinak: <b>u ${impact.changed} tříd z ${impact.compared}</b>`
        + " by se doporučení lišilo. Ptej se, která z těch dvou odpovědí je správná.";
  const mixNote = mixed === 0
    ? ""
    : `<p class="q-hint">Mixů: <b>${mixed}</b>${uneven > 0
      ? `, z toho <b>${uneven} s nerovným poměrem</b> (oranžový okraj) - ty projdi jako první`
      : " (všechny půl na půl)"}.</p>`;
  const lostNote = lost === 0
    ? ""
    : `<p class="q-hint">Překladem se ztratilo <b>${lost}</b> rozlišení (oranžové poznámky výš).</p>`;

  return `<div class="verdict" data-id="${id}">
  <p class="q-focus">${focus}</p>
  ${mixNote}${lostNote}
  <div class="opts">
    ${reviewAnswerOption(id, "o", "✓ Sedí, dát do produktu")}
    ${reviewAnswerOption(id, "x", "✗ Nesedí")}
    ${reviewAnswerOption(id, "?", "? Nevím, ověřit později")}
    ${reviewAnswerOption(id, "s", "– Přeskočit")}
  </div>
  <div class="opts opts--flags" hidden>
    <span class="q-hint">Co je špatně:</span>
    ${reviewAnswerFlag(id, "1", "moc široké")}
    ${reviewAnswerFlag(id, "2", "moc těsné")}
    ${reviewAnswerFlag(id, "3", "špatné ruce")}
    ${reviewAnswerFlag(id, "4", "špatný mix")}
    ${reviewAnswerFlag(id, "5", "sloučení akcí vadí")}
  </div>
</div>`;
}

const history = loadAnswerHistory();

/**
 * Co se o téhle mřížce dá říct z dřívějšího čtení.
 *
 * Tři stavy, a rozdíl mezi nimi je celý smysl téhle vrstvy: mřížka bez
 * částečné váhy se od odpovědi nezměnila a číst se znovu nemusí; mřížka
 * s částečnou váhou se kreslí jinak právě v tom, co se posuzovalo; mřížka bez
 * odpovědi čeká na první čtení.
 */
function answerNote(record: DraftRecord): { html: string; stale: boolean; kept: boolean } {
  const answer = history.bySourceFile.get(record.sourceFile);
  if (answer === undefined) return { html: "", stale: false, kept: false };
  const changed = isStale(record, answer) ? Math.max(1, partialWeightCells(record)) : 0;
  const flags = answer.flags.length === 0 ? "" : ` (${escapeHtml(answer.flags.join(", "))})`;
  const hidden = answer.readWithoutActions ?? [];
  if (hidden.length > 0) {
    // Stránka tehdy tu barvu vůbec nekreslila; ruce s ní spadly do foldu.
    return {
      html: `<p class="meta stale"><b>Odpověď z ${escapeHtml(answer.readAt)}:`
        + ` ${escapeHtml(answer.verdict)}</b>${flags}, jenže stránka tehdy nekreslila barvu`
        + ` „${escapeHtml(hidden.join(", "))}“ - ruce s ní spadly do foldu.`
        + " Teď je mřížka celá a chce přečíst znovu.</p>",
      stale: true,
      kept: false,
    };
  }
  if (changed === 0) {
    return {
      html: `<p class="meta answered"><b>Odpověď z ${escapeHtml(answer.readAt)}:`
        + ` ${escapeHtml(answer.verdict)}</b>${flags}. Na téhle mřížce se od té doby`
        + " nezměnilo nic - číst znovu netřeba.</p>",
      stale: false,
      kept: true,
    };
  }
  // Stejné barvy, jiná otázka: kontext nebo otvírač se od odpovědi změnil.
  // 15. 9. 2026 to bylo devět mřížek čtených jako push/fold, které jsou jamy
  // proti otevření; verdikt „sloučení akcí vadí" mířil na ten starý kontext.
  if (answer.question !== undefined && answer.question !== gridQuestion(record)) {
    const [context, position, bucket, vsSeat] = answer.question.split("|");
    const was = `${context} · ${position} ${bucket} BB${vsSeat ? ` · proti ${vsSeat}` : ""}`;
    return {
      html: `<p class="meta stale"><b>Odpověď z ${escapeHtml(answer.readAt)}:`
        + ` ${escapeHtml(answer.verdict)}</b>${flags}, jenže tehdy mřížka odpovídala na`
        + ` jinou otázku (<b>${escapeHtml(was)}</b>). Teď je zařazená jinak a chce`
        + " přečíst znovu.</p>",
      stale: true,
      kept: false,
    };
  }
  return {
    html: `<p class="meta stale"><b>Odpověď z ${escapeHtml(answer.readAt)}:`
      + ` ${escapeHtml(answer.verdict)}</b>${flags}, jenže mřížka se od té doby kreslí`
      + " jinak - změnilo se právě to, co se posuzovalo (které ruce co hrají a jak"
      + " často). Tahle mřížka chce přečíst znovu.</p>",
    stale: true,
    kept: false,
  };
}

const blocks = sorted.map((record, index) => {
  const mixed = Object.values(record.lenient).filter((actions) => actions.length > 1).length;
  const uneven = Object.values(record.mix ?? {})
    .filter((ratio) => new Set(Object.values(ratio)).size > 1).length;
  const inRange = Object.keys(record.lenient).length;
  const versus = record.vsSeat === "" ? "proti všem za sebou" : `proti ${record.vsSeat}`;
  const notes = record.notes.length === 0
    ? ""
    : `<ul class="notes">${record.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
  const impact = impacts.get(record)!;
  const unlockText = impact.unlocksEmpty
    ? '<p class="meta"><b class="unlock">Tahle kombinace dnes rozdá nula spotů.</b>'
      + " Mřížka by ji rozsvítila.</p>"
    : impact.notDrilled
      ? '<p class="meta"><b class="skip">Tuhle situaci trenažér nerozdává</b>'
        + " (sedačka nebo hloubka mimo to, na co se v tomhle kontextu ptá),"
        + " takže by se dnes nic nezměnilo. Klidně přeskoč.</p>"
      : "";
  const impactText = impact.newCell
    ? '<b class="new">buňku, kterou knihovna nemá</b> - přidal by novou odpověď'
    : `<b class="${impact.changed > 0 ? "hot" : ""}">${impact.changed}</b> tříd`
      + ` z ${impact.compared} porovnaných, kde by se odpověď lišila od dnešní`;
  // Dopad není doručení, a čtenář to musí vědět dřív, než tu mřížku přečte.
  // Otvírač je od 16. 9. 2026 v klíči, takže se buňka sráží už jen o rozložení
  // stacků (hloubka protihráče, scénář ICM) - a tu osu klíč packu nemá.
  const collision = collisions.find((row) => row.cell === cellOf(record));
  const landingText = collision === undefined || impact.notDrilled
    ? ""
    : draftLanding(record, collisions) === "PŘISTANE"
      ? '<p class="meta"><b class="new">Do téhle buňky míří víc mřížek</b>'
        + ` (rozložení ${escapeHtml(collision.setups.join(", "))}), ale tahle je jediná chipEV,`
        + " takže po schválení přistane; ICM čekají na $EV pack se scénářem v klíči.</p>"
      : '<p class="meta"><b class="unlock">Tahle buňka se sráží o rozložení stacků.</b>'
        + ` Míří do ní mřížky pro ${escapeHtml(collision.setups.join(", "))}`
        + ` a neshodnou se u ${collision.disagreeing} tříd. Klíč packu scénář nemá,`
        + " takže tahle sama nepřistane - schválení je platné, ale doručení čeká na"
        + " $EV pack se scénářem v klíči. Proto je níž v pořadí.</p>";
  return `<section id="${anchorOf(record, index)}">
  <h2>${escapeHtml(record.context)} &middot; ${escapeHtml(record.position)} ${record.bucket} BB &middot; ${escapeHtml(versus)}</h2>
  ${answerNote(record).html}
  <p class="meta">dopad: ${impactText}</p>
  ${unlockText}${landingText}
  <p class="meta">rozložení stacků: <b>${escapeHtml(record.stackSetupId)}</b> &middot;
     hloubka ve zdroji: ${record.sourceStackBB} BB &middot;
     tříd v range: ${inRange} ze 169 &middot; z toho mix: ${mixed}
     (nerovný poměr: ${uneven}) &middot;
     zdroj: <code>${escapeHtml(record.sourceFile)}</code></p>
  ${notes}
  ${grid(record)}
  ${verdictBlock(record, originalIndex.get(record) ?? index, impact)}
</section>`;
}).join("\n");

// Čísla v úvodu se počítají z draftu, ne z paměti. Napsané natvrdo zestárnou
// s prvním přeimportováním a nikdo si toho nevšimne.
let mixedHands = 0;
let unevenHands = 0;
let partialHands = 0;
let keptAnswers = 0;
let staleAnswers = 0;
let unanswered = 0;
for (const record of visible) {
  const note = answerNote(record);
  if (note.kept) keptAnswers += 1;
  else if (note.stale) staleAnswers += 1;
  else unanswered += 1;
}
for (const record of visible) {
  for (const ratio of Object.values(record.mix ?? {})) {
    mixedHands += 1;
    if (new Set(Object.values(ratio)).size > 1) unevenHands += 1;
    if (Object.keys(ratio).includes("FOLD")) partialHands += 1;
  }
}

const legend = Object.entries(COLORS)
  .filter(([action]) => action !== "")
  .map(([action, color]) => `<span class="key"><i style="background:${color}"></i>${action}</span>`)
  .join("")
  // Pořadí tříd je schválně obrácené: kontrola věrnosti počítá buňky
  // `class="c mix` a klíč legendy není buňka.
  + '<span class="key"><i class="mix c" style="background:#556"></i>mix (žlutý okraj; oranžový = nerovný poměr)</span>'
  + '<span class="key"><i class="part c" style="background:#556"></i>šrafování: u čelení 3betu ruka,'
  + ' kterou zdroj otevírá jen zčásti - odpověď platí, když se otevřela</span>';

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
 /* Nerovný poměr má jinou barvu okraje: „hraj obojí stejně" a „hraj to takhle
    často" jsou dvě různá tvrzení a na mřížce musí jít rozeznat. */
 .c.uneven{outline:2px solid #ff8f6b;outline-offset:-2px}
 .c.part{background-image:repeating-linear-gradient(135deg,transparent 0 6px,rgba(0,0,0,.28) 6px 8px)}
 .key{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:12px}
 .key i{width:14px;height:14px;border-radius:2px;display:inline-block}
 .intro{background:#1a2130;padding:12px 16px;border-radius:8px;max-width:820px}
 .recall{border-left:3px solid #7bd3ff;padding-left:10px}
 .answered{border-left:3px solid #5fbf7f;padding-left:10px;color:#9fd6ae}
 .stale{border-left:3px solid #e0a13c;padding-left:10px;color:#f0c477}
 code{background:#1a2130;padding:1px 4px;border-radius:3px}
 h2.plain{font-size:16px;margin:28px 0 8px}
 .hot{color:#ffb04a}
 .new{color:#7fd18a}
 .unlock{color:#ff8f6b}
 .skip{color:#8a93a6}
${REVIEW_ANSWER_STYLES}
 /* Lišta drží šířku i přes okraj stránky, ať je nad mřížkou celá. */
 .bar{margin:0 -12px 12px}
 @media(max-width:520px){
   .grid{max-width:100%}
   .c{font-size:8px}
   section{scroll-margin-top:64px}
 }

 table{border-collapse:collapse;font-size:13px;margin-bottom:8px}
 th,td{border:1px solid #2a3446;padding:4px 10px;text-align:left}
 th{background:#1a2130;color:#9fb3cd}
 nav{display:flex;flex-wrap:wrap;gap:6px;max-width:980px}
 nav a{background:#1a2130;color:#9fb3cd;text-decoration:none;padding:3px 8px;
       border-radius:4px;font-size:12px;white-space:nowrap}
 nav a:hover{background:#24304a;color:#e8eef7}
 section{scroll-margin-top:12px}
 /* Tisk: mřížky musí zůstat čitelné i na papíře, proto světlé pozadí a
    zákaz dělení mřížky přes stránku. */
 @media print{
   body{background:#fff;color:#000;margin:12mm}
   .intro,nav{background:#f4f6fa;color:#000}
   nav{display:none}
   section{break-inside:avoid}
   .meta{color:#444}
 }
</style></head><body>
${reviewAnswerBar()}
<h1>Draft ranží ke kontrole</h1>
<div class="intro">
<p><b>${draft.recordCount} záznamů</b>, vytvořeno ${escapeHtml(draft.createdAt)}, důvěra
   <b>${escapeHtml(draft.confidence)}</b>. Nic z toho zatím není v produktu.</p>
${history.origin === "" ? "" : `<p class="recall"><b>Co už jsi přečetl (naposled ${escapeHtml(history.readAt)}):</b>
   z ${keptAnswers + staleAnswers + unanswered} mřížek na téhle stránce má
   <b>${keptAnswers}</b> odpověď, která platí dál - ty se číst znovu nemusí.
   <b>${staleAnswers}</b> se od tvého čtení kreslí jinak, protože ruka hraná jen
   zčásti měla plnou barvu a teď má mix s foldem; ty chtějí přečíst znovu.
   <b>${unanswered}</b> čeká na první čtení. U každé mřížky je to napsané nahoře.</p>`}
<p>Co je potřeba posoudit: <b>jestli ty mřížky odpovídají tomu, co jsi koupil</b>.
   Mechanická kontrola ověřila, že se každá mřížka shoduje s počty kombinací,
   které uvádí její vlastní legenda - to ale říká jen, že se čtení nespletlo,
   ne že je ta strategie správná pro danou situaci.</p>
<p><b>Mřížky jsou seřazené podle dopadu</b>, ne podle abecedy: nahoře je ta,
   která by změnila nejvíc odpovědí proti tomu, co hráč dostane dnes. Kdo nemá
   čas na všech ${draft.recordCount}, má odshora ty, na kterých záleží.
   Dopad se počítá proti <b>obecnému</b> záznamu, tedy proti dnešní odpovědi,
   která nehledí na to, kdo otevřel - to je přesně ta mezera, kvůli které draft
   vznikl.</p>
<p>Žlutý okraj znamená ruku, kterou zdroj hraje <b>víc způsoby</b> stejně často.
   <b style="color:#ff8f6b">Oranžový okraj</b> znamená mix s <b>nerovným
   poměrem</b> - třeba 3BET 75 % / CALL 25 %. Přesný poměr ukáže najetí myší.
   Změřeno: ${mixedHands} rukou v draftu má mix a ${unevenHands} z nich nerovný
   poměr, takže „hraj obojí" a „hraj to takhle často" se dají rozeznat.
   <b>Mixem je i ruka, kterou zdroj hraje jen zčásti</b> - pak je jednou
   z položek <code>FOLD</code>. Do 9. 9. 2026 se taková ruka kreslila plnou
   barvou, jako by se ta akce hrála vždycky; ve zdroji je takových tříd
   ${partialHands}.</p>
<p>Oranžové poznámky u mřížky říkají, <b>co se překladem ztratilo</b> - třeba že
   zdroj rozlišuje 3bet s dorovnáním 4betu od 3betu se složením, kdežto produkt
   má obojí jako <code>3BET</code>.</p>
<p><b>Přiznané předpoklady:</b></p>
<ul>${draft.assumptions.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
<p>${legend}</p>
</div>
${overview(sorted)}
${blocks}

${reviewAnswerScript({
  storageKey: "drillev-rye-answers-v2",
  tokenPrefix: "DRILLEV-REVIEW-V2",
  legacyStorageKey: "drillev-review-v1",
})}
</body></html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, "utf8");
// Kolik se **vykreslilo**, ne kolik má draft. S `--only` se ta dvě čísla liší a
// hláška, která to nerozlišuje, tvrdí o vlastní práci nepravdu.
console.log(
  `Vykresleno ${sorted.length} mřížek do ${outPath}`
  + (only === undefined ? "" : ` (${only} z ${draft.recordCount} v draftu)`),
);
console.log("Otevři to v prohlížeči; stránka je statická a funguje offline.");
