import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bucketsForContext, bucketsWithSpots, positionsForContext } from "../src/core/drillEngine";
import { getRangeRecord } from "../src/data/ranges/index";
import type { ActionContext, Position, StackBucket } from "../src/core/types";
import {
  REVIEW_ANSWER_STYLES,
  reviewAnswerBar,
  reviewAnswerFlag,
  reviewAnswerOption,
  reviewAnswerScript,
} from "./lib/reviewAnswerMemory.mts";

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

interface DraftRecord {
  position: string;
  bucket: number;
  context: string;
  vsSeat: string;
  stackSetupId: string;
  sourceStackBB: number;
  strict: Record<string, string[]>;
  lenient: Record<string, string[]>;
  /** ruka → akce a jak často ji zdroj hraje (jen u mixů). */
  mix?: Record<string, Record<string, number>>;
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
      // Poměr, ne jen výčet: „3BET 75 / CALL 25" je jiná strategie než totéž
      // půl na půl, a do 28. 8. 2026 se to na stránce nedalo rozeznat.
      const ratio = record.mix?.[hand];
      const mixText = ratio === undefined
        ? lenient.join(" / ")
        : Object.entries(ratio).map(([action, share]) => `${action} ${share} %`).join(" / ");
      const title = lenient.length === 0
        ? `${hand}: mimo range (fold)`
        : `${hand}: ${strict.join(" / ")}${mixed ? ` (mix: ${mixText})` : ""}`;
      cells.push(
        `<div class="c${mixed ? " mix" : ""}${ratio !== undefined
          && new Set(Object.values(ratio)).size > 1 ? " uneven" : ""}"`
        + ` style="background:${COLORS[action] ?? "#e2e5ea"}"`
        + ` title="${escapeHtml(title)}">${hand}</div>`,
      );
    }
  }
  return `<div class="grid">${cells.join("")}</div>`;
}

/**
 * O kolik by se změnila odpověď, kterou hráč dostane dnes.
 *
 * ## Proč to na té stránce musí být
 *
 * 94 mřížek je pořád moc na jedno sezení a **nejsou stejně důležité**. Některá
 * jen potvrdí, co knihovna odpovídá; jiná přepíše odpověď u šedesáti tříd ze
 * 169. Bez toho čísla se čte odshora dolů, tedy v pořadí, které nic neznamená.
 *
 * Měří se proti **obecnému** záznamu, tedy tomu, co hráč dostane teď - ne proti
 * zpřesněnému. To je celý smysl `vsSeat`: dnešní odpověď na „kdo otevřel"
 * nehledí, a tohle číslo říká, kolik ho to stojí u téhle konkrétní mřížky.
 */
interface DraftImpact {
  /** Tříd, kde by se doporučená akce lišila od dnešní odpovědi. */
  changed: number;
  /** Tříd, které dnešní odpověď zná. Bez nich není s čím srovnávat. */
  compared: number;
  /** Buňka, kterou knihovna dnes nemá vůbec - draft by ji přidal. */
  newCell: boolean;
  /**
   * Mřížka, která by rozsvítila kombinaci filtrů rozdávající dnes **nula** spotů.
   *
   * Změřeno 27. 8. 2026: nabídka trenažéru je širší než obsah, takže relace
   * „push/fold, 20 BB" nerozdá nic - a v draftu je pro ni šest mřížek. To je ze
   * všech dopadů ten nejhmatatelnější: nejde o přesnější odpověď, ale o to, že
   * odpověď vůbec bude.
   */
  unlocksEmpty: boolean;
  /** Hloubka, kterou trenažér u tohohle kontextu vůbec nerozdává. */
  notDrilled: boolean;
}

function impactOf(record: DraftRecord): DraftImpact {
  const current = getRangeRecord(
    "OFF",
    record.position as Position,
    record.bucket as StackBucket,
    record.context as ActionContext,
  );
  // Dvě různé nuly, které vypadají stejně.
  //
  // „Nabízí se, ale nemáme obsah" se dá spravit tímhle draftem. „U tohohle
  // kontextu se ta hloubka vůbec nerozdává" se spravit nedá a číst tu mřížku
  // je dnes ztráta času. Prvních dvanáct označených obsahovalo čtyři z toho
  // druhého druhu, než se to rozlišilo.
  const context = record.context as ActionContext;
  const bucket = record.bucket as StackBucket;
  // Nabídnutá buňka musí sedět v **obou** rozměrech. Sedačka se sem doplnila
  // 28. 8. 2026, když se ukázalo, že stránka tvrdila „přidal by novou odpověď"
  // u `VS_OPEN|UTG+1` - jenže obranu proti otevření trenažér rozdává až od
  // lojacku, takže by ta mřížka po schválení nezměnila nic.
  const offered = bucketsForContext(context).includes(bucket)
    && positionsForContext(context).includes(record.position as Position);
  const live = bucketsWithSpots([context], "OFF").includes(bucket);
  const unlocksEmpty = offered && !live;
  const notDrilled = !offered;
  if (current === undefined) {
    return { changed: 0, compared: 0, newCell: true, unlocksEmpty, notDrilled };
  }
  let changed = 0;
  let compared = 0;
  for (const [hand, actions] of Object.entries(record.strict)) {
    const mine = current.strict[hand];
    // Ruka, kterou dnešní odpověď nezná, není neshoda - je to prázdno. Počítat
    // ji jako změnu by nafouklo každou mřížku na stovku.
    if (mine === undefined) continue;
    compared += 1;
    const same = mine.length === actions.length
      && [...mine].sort().join("|") === [...actions].sort().join("|");
    if (!same) changed += 1;
  }
  return { changed, compared, newCell: false, unlocksEmpty, notDrilled };
}

const impacts = new Map<DraftRecord, DraftImpact>(
  draft.records.map((record) => [record, impactOf(record)]),
);

/** Nejdřív to, co nejvíc změní; nová buňka je taky změna, jen jiného druhu. */
function weight(record: DraftRecord): number {
  const impact = impacts.get(record)!;
  // Rozsvícená kombinace jde úplně nahoru: „odpověď bude" váží víc než
  // „odpověď bude přesnější".
  if (impact.unlocksEmpty) return 1000;
  // Dolů, ne nahoru: přečíst ji dnes nic nezmění.
  if (impact.notDrilled) return -1;
  return impact.newCell ? 169 : impact.changed;
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
  return `<section id="${anchorOf(record, index)}">
  <h2>${escapeHtml(record.context)} &middot; ${escapeHtml(record.position)} ${record.bucket} BB &middot; ${escapeHtml(versus)}</h2>
  <p class="meta">dopad: ${impactText}</p>
  ${unlockText}
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
 /* Nerovný poměr má jinou barvu okraje: „hraj obojí stejně" a „hraj to takhle
    často" jsou dvě různá tvrzení a na mřížce musí jít rozeznat. */
 .c.uneven{outline:2px solid #ff8f6b;outline-offset:-2px}
 .key{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:12px}
 .key i{width:14px;height:14px;border-radius:2px;display:inline-block}
 .intro{background:#1a2130;padding:12px 16px;border-radius:8px;max-width:820px}
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
   Změřeno: 578 rukou v draftu má mix a 92 z nich nerovný poměr, takže „hraj
   obojí" a „hraj to takhle často" se konečně dají rozeznat.</p>
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
