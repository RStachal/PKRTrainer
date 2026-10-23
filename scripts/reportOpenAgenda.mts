import { readFileSync } from "node:fs";

/**
 * Co je otevřené a **na kom to visí**.
 *
 *   npm run mtt:agenda
 *   npm run mtt:agenda -- --volne     # jen to, co může agent dělat sám
 *
 * ## Proč to musí vzniknout
 *
 * `mtt:blockers` odpovídá, které produkční sloty čekají na majitelova data -
 * dnes všech 60. To je inventura majitelových blokerů, ne odpověď na otázku
 * „co tedy dělat". Ta odpověď se dosud pokaždé odvozovala znovu: projít plán
 * dokončení, deník, `mtt:next-action`, a teprve z toho poskládat, co je volné.
 * Změřeno 5. 9. 2026, že to zabere půlku relace - a je to táž vada jako v bodě
 * 176, jen o patro výš: nešlo se zeptat, tak se odvozovalo.
 *
 * Zdrojem je **deník**, ne nový seznam. Nový seznam by zestárl jako každý jiný;
 * deník se píše tak jako tak a jeho poslední sloupec už dnes nese, na kom
 * položka visí.
 *
 * ## Proč to zároveň hlídá tabulku
 *
 * Klasifikace stojí na tom, že řádek deníku má **čtyři buňky**. Svislítko uvnitř
 * backticků (`VS_OPEN|UTG+1|25`) z jednoho řádku udělá osm buněk, poslední
 * sloupec se posune a stav se čte z útržku jména range. Změřeno při psaní
 * tohohle skriptu: takhle rozbité byly **čtyři řádky** (69, 140, 141, 172) a
 * nikdo si toho půl roku nevšiml, protože se tabulka čte očima a oko si to
 * domyslí. Skript proto skončí nenulovým kódem, dokud se to nespraví - nástroj,
 * kterým se měří, potřebuje bránu stejně jako produkt.
 */

const DIARY = "Agents/MTT_AUTONOMY.md";
const onlyFree = process.argv.includes("--volne");
/** Strojové čtení pro stránku se stavem; parsovat vlastní text by bylo křehké. */
const asJson = process.argv.includes("--json");

interface Row {
  number: number;
  title: string;
  status: string;
  cells: number;
}

const rows: Row[] = [];
for (const line of readFileSync(DIARY, "utf8").split("\n")) {
  if (!/^\| \d+ \|/.test(line)) continue;
  // Escapované svislítko je text, ne oddělovač - musí zmizet dřív, než se dělí.
  const cells = line.replace(/\\\|/g, "").split("|");
  rows.push({
    number: Number(cells[1].trim()),
    title: cells[2]?.trim() ?? "",
    status: cells[4]?.trim() ?? "",
    cells: cells.length - 2,
  });
}

const malformed = rows.filter((row) => row.cells !== 4);

/**
 * Kdo je na tahu.
 *
 * Klasifikuje se podle slov, která deník doopravdy používá - vypsáno měřením,
 * ne vymyšleno. Co se nezařadí, **se nehádá**: skončí v „nezařazeno" a přečte
 * to člověk. Tichá klasifikace do špatné přihrádky je horší než přiznané
 * neznámo, protože by se podle ní plánovalo.
 */
type Owner =
  | "MAJITEL"
  | "STROJ"
  | "UZAVŘENO"
  | "VOLNÉ"
  | "ZÁZNAM"
  | "HLÍDÁNO"
  | "NEZAŘAZENO";

function ownerOf(row: Row): Owner {
  const status = row.status.toLowerCase();
  if (status === "" || status === "—" || status === "-") return "NEZAŘAZENO";
  // Zápis o hotové práci nebo o měření, ne úloha. Nešlo ho škrtnout jako
  // splněný úkol, protože úkol to nikdy nebyl - přečteno po jednom 5. 9. 2026,
  // dvacet takových bodů z 18. az 24. 8.
  if (/^záznam$/.test(status)) return "ZÁZNAM";
  // Mez, kterou drží brána, není práce ani čekání: ozve se sama, až dojde.
  // Vypisovat ji mezi volnou prací by lákalo hlídat rukou něco, co je hlídané.
  if (/hlídá|brána|bránou/.test(status)) return "HLÍDÁNO";
  // „Ponechat" a „otevřít až …" jsou taky rozhodnutí, jen opačným směrem:
  // vědomě se nic nedělá, dokud nenastane pojmenovaná podmínka. Kdyby padly do
  // nezařazených, četly by se jako práce, která na někoho čeká.
  if (/vyřešeno|rozhodnuto|hotovo|nedělat|nedodávat|nestavět|ponechat|otevřít až/.test(status)) {
    return "UZAVŘENO";
  }
  if (/stroj|ram|halda|paměť|hardware|noc/.test(status)) return "STROJ";
  if (/majitel|čtení|čte|rozhodnutí|zdroj|data|čeká na obsah|koupit|licen/.test(status)) return "MAJITEL";
  if (/^otevřené$|^otevřené[,:]/.test(status)) return "VOLNÉ";
  return "NEZAŘAZENO";
}

const open = rows.filter((row) => !/^~~/.test(row.title));
const byOwner = new Map<Owner, Row[]>();
for (const row of open) {
  const owner = ownerOf(row);
  byOwner.set(owner, [...(byOwner.get(owner) ?? []), row]);
}

function show(owner: Owner, headline: string): void {
  const list = (byOwner.get(owner) ?? []).sort((left, right) => right.number - left.number);
  if (list.length === 0) return;
  console.log("");
  console.log(`${headline} (${list.length})`);
  for (const row of list) {
    console.log(`  ${String(row.number).padStart(3)}  ${row.title.slice(0, 68)}`);
    if (row.status !== "") console.log(`       ${row.status.slice(0, 96)}`);
  }
}

if (asJson) {
  const bucket = (owner: Owner): unknown[] => (byOwner.get(owner) ?? [])
    .sort((left, right) => right.number - left.number)
    .map((row) => ({ number: row.number, title: row.title, status: row.status }));
  console.log(JSON.stringify({
    total: rows.length,
    unstruck: open.length,
    records: (byOwner.get("ZÁZNAM") ?? []).length,
    malformed: malformed.map((row) => row.number),
    volne: bucket("VOLNÉ"),
    majitel: bucket("MAJITEL"),
    stroj: bucket("STROJ"),
    hlidano: bucket("HLÍDÁNO"),
    uzavreno: bucket("UZAVŘENO"),
    nezarazeno: bucket("NEZAŘAZENO"),
  }, null, 2));
  process.exit(malformed.length > 0 ? 1 : 0);
}

console.log("Otevřené položky a na kom visí");
console.log("");
// Záznam není otevřená práce, jen se nedal škrtnout jako splněný úkol - úkol
// to nikdy nebyl. Počítá se proto zvlášť, jinak by agenda tvrdila, že je co
// dělat, a byla by to dvacetina nepravdy hned v prvním řádku.
const recordCount = (byOwner.get("ZÁZNAM") ?? []).length;
console.log(
  `deník: ${rows.length} bodů, neškrtnutých ${open.length}`
  + ` - z toho ${open.length - recordCount} otevřené práce a ${recordCount} záznamů`,
);

if (onlyFree) {
  show("VOLNÉ", "volné pro agenta");
} else {
  show("VOLNÉ", "volné pro agenta - tady se dá pracovat bez majitele");
  show("MAJITEL", "čeká na majitele");
  show("STROJ", "čeká na stroj");
  show("HLÍDÁNO", "hlídá brána - ozve se sama, není to práce");
  show("NEZAŘAZENO", "nezařazeno - stav se nedá přečíst, přečti to sám");
  show("UZAVŘENO", "uzavřeno měřením - neotevírat znovu");
  show("ZÁZNAM", "záznamy hotové práce - nejsou to úlohy, jen se nedaly škrtnout");
}

if (malformed.length > 0) {
  console.log("");
  console.error(
    `Tabulka deníku je rozbitá u ${malformed.length} řádků: `
    + malformed.map((row) => `${row.number} (${row.cells} buněk místo 4)`).join(", "),
  );
  console.error("Příčinou bývá svislítko uvnitř backticků; escapuj ho jako \\| nebo piš lomítkem.");
  console.error("Dokud to platí, čte se u těch řádků jako stav útržek textu z prostředka.");
  process.exit(1);
}
