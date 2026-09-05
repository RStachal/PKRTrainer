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
type Owner = "MAJITEL" | "STROJ" | "UZAVŘENO" | "VOLNÉ" | "NEZAŘAZENO";

function ownerOf(row: Row): Owner {
  const status = row.status.toLowerCase();
  if (status === "" || status === "—" || status === "-") return "NEZAŘAZENO";
  if (/vyřešeno|rozhodnuto|hotovo|nedělat|nedodávat|nestavět/.test(status)) return "UZAVŘENO";
  if (/majitel|čtení|čte|rozhodnutí|zdroj|data|čeká na obsah|koupit|licen/.test(status)) return "MAJITEL";
  if (/stroj|ram|halda|paměť|hardware|větší stroj/.test(status)) return "STROJ";
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

console.log("Otevřené položky a na kom visí");
console.log("");
console.log(`deník: ${rows.length} bodů, z toho otevřených ${open.length}`);

if (onlyFree) {
  show("VOLNÉ", "volné pro agenta");
} else {
  show("VOLNÉ", "volné pro agenta - tady se dá pracovat bez majitele");
  show("MAJITEL", "čeká na majitele");
  show("STROJ", "čeká na stroj");
  show("NEZAŘAZENO", "nezařazeno - stav se nedá přečíst, přečti to sám");
  show("UZAVŘENO", "uzavřeno měřením - neotevírat znovu");
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
