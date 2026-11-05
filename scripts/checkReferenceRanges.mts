import { existsSync, readFileSync } from "node:fs";

import {
  CHART_SEAT_NAMES,
  combosInClass,
  icmPreflopPack,
  openingWidthOf,
  packWidth,
  shippedPreflopPack,
} from "./lib/rangeChartComparison.mts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
import type { Position, StackBucket } from "../src/core/types";

/**
 * Naše otevírací ranges proti vlastněnému nezávislému zdroji.
 *
 *   python scripts/reference/extractReferenceRanges.py
 *   npm run mtt:reference-check
 *
 * Proč to existuje. Všech 37 dodávaných packů stojí na LOW, protože je nikdo
 * nepřečetl, a LOW neprojde do produkce nikde. Nezávislý zdroj čtení člověkem
 * nenahradí - neříká, že je naše strategie dobrá, jen že se od cizí neliší. Ale
 * to je měřitelný signál navíc, a rodina, která se od nezávislého zdroje liší o
 * dva body, je jiný případ než rodina, která se liší o třicet.
 *
 * Zdroj zůstává mimo repozitář a nic z něj se sem nekopíruje. Přes hranici jde
 * šířka a seznam neshod, ne obsah - stejné pravidlo, jaké má obrázková cesta v
 * `compareChartsToPacks.mts`.
 *
 * Proti obrázkové cestě je tady jeden rozdíl v kvalitě dokladu: ta musí hádat,
 * která barva je fold, podle toho, že je nejsvětlejší. Tenhle zdroj nese legendu
 * barva -> akce přímo v sobě, takže se nehádá nic.
 */

const CORPUS = "artifacts/reference-ranges/reference-ranges.json";
const TOTAL_COMBOS = 1326;

interface ReferencePage {
  id: string;
  group: string;
  pctOfHands: number | null;
  legend: Record<string, string>;
  /**
   * Sedačky a hloubky z názvu stránky, v pořadí hrdina, soupeř.
   *
   * Rozhraní je **nemělo** a skript je přitom četl. Nešlo o pád - data ta pole
   * nesou - ale o díru v kontrole: dokud tu nebyla, TypeScript nemohl žádné
   * použití ověřit. Adresář `scripts/` se navíc nekontroloval vůbec.
   */
  stacks: { seat: string; bb: number }[];
  hands: Record<string, {
    colour: string;
    action: string;
    /**
     * Mixovaná strategie, když ji zdroj u té ruky má.
     *
     * Doplněno 26. 8. 2026: extraktor dřív vážené buňky tiše zahazoval, takže
     * korpus u 11,8 % rukou tvrdil čistou akci tam, kde zdroj hraje dvě.
     * `colour` zůstává převažující akcí kvůli zpětné kompatibilitě.
     */
    mix?: { colour: string; action: string; weight: number }[];
  }>;
}

/** Seat a hloubka z názvu typu `OP-100BB-BU`. */
function spotOf(id: string): { seat: Position; bucket: StackBucket } | null {
  const match = /^OP-(\d+)BB-([A-Za-z0-9+]+)$/.exec(id);
  if (match === null) return null;
  const seat = CHART_SEAT_NAMES[match[2].toLowerCase()];
  if (seat === undefined) return null;
  return { seat, bucket: Number(match[1]) as StackBucket };
}

/**
 * Ruce, které zdroj otevírá zvýšením - tedy to, co naše RFI vůbec popisuje.
 *
 * Bez tohohle filtru vyšla SB o čtyřicet bodů širší než naše a vypadalo to jako
 * největší nález v celém porovnání. Není: SB stránky nesou v legendě limpovací
 * akce (`Limp/Call vs <3.5x`, `limp/reraise to 12bb`), takže "hraných ruk" je u
 * nich raise **i** limp dohromady, kdežto naše RFI je jen raise. Porovnávat to
 * napřímo znamená měřit dvě různé věci a vydávat rozdíl za neshodu.
 *
 * Ostatní pozice tím nejsou dotčené - jejich legendy popisují, co se stane po
 * zvýšení ("Broke vs 3B", "Call 3B"), ne jinou první akci.
 */
function raiseFirstHands(page: ReferencePage): string[] {
  return Object.entries(page.hands)
    .filter(([, cell]) => !/^\s*limp/i.test(cell.action))
    .map(([hand]) => hand);
}

function widthOf(hands: readonly string[]): number {
  return hands.reduce((sum, hand) => sum + combosInClass(hand), 0) / TOTAL_COMBOS * 100;
}

if (!existsSync(CORPUS)) {
  throw new Error(
    `${CORPUS} chybí. Nejdřív spusť: python scripts/reference/extractReferenceRanges.py`,
  );
}
const pages = (JSON.parse(readFileSync(CORPUS, "utf8")) as { pages: ReferencePage[] }).pages;

// Bez tohohle se porovnává kandidátský pack, ne ten, který hráč dostane. Před
// načtením registru totiž produkční verze v katalogu ještě není.
await loadCompleteMttProductionRegistry();

console.log("Naše otevírací ranges proti nezávislému vlastněnému zdroji");
console.log(`měřený pack: ${shippedPreflopPack("OFF")?.id ?? "žádný"}`);
console.log("");
console.log(
  "spot".padEnd(22) + "zdroj".padStart(8) + "my".padStart(8) + "rozdíl".padStart(9)
  + "  jen zdroj / jen my",
);

const rows: { label: string; gap: number; detail: string }[] = [];
const unmatched: string[] = [];
for (const page of pages.filter((item) => item.group === "OP")) {
  const spot = spotOf(page.id);
  if (spot === null) { unmatched.push(page.id); continue; }
  const ours = packWidth("OFF", spot.seat, spot.bucket);
  if (ours === null) { unmatched.push(`${page.id} (nemáme ${spot.seat} @ ${spot.bucket}bb)`); continue; }

  const theirs = raiseFirstHands(page);
  const limped = Object.keys(page.hands).length - theirs.length;
  const theirSet = new Set(theirs);
  const ourSet = new Set(ours.opens);
  const onlyTheirs = theirs.filter((hand) => !ourSet.has(hand));
  const onlyOurs = ours.opens.filter((hand) => !theirSet.has(hand));
  // Neshoda v kombinacích, ne v počtu tříd: AKo je dvanáct kombinací a 72s
  // čtyři, takže počítat třídy by dalo číslo, které neodpovídá ničemu u stolu.
  const gap = (
    onlyTheirs.reduce((sum, hand) => sum + combosInClass(hand), 0)
    + onlyOurs.reduce((sum, hand) => sum + combosInClass(hand), 0)
  ) / TOTAL_COMBOS * 100;

  rows.push({
    label: `${spot.seat} @ ${spot.bucket}bb`,
    gap,
    detail:
      `${spot.seat} @ ${spot.bucket}bb`.padEnd(22)
      + `${widthOf(theirs).toFixed(1)}%`.padStart(8)
      + `${ours.pct.toFixed(1)}%`.padStart(8)
      + `${gap.toFixed(1)}b`.padStart(9)
      + `  ${onlyTheirs.length} / ${onlyOurs.length}`
      + (limped > 0 ? `  (+${limped} limp)` : ""),
  });
}

for (const row of [...rows].sort((left, right) => right.gap - left.gap)) {
  console.log(row.detail);
}

console.log("");
console.log(`porovnáno spotů: ${rows.length}`);
if (rows.length > 0) {
  const worst = [...rows].sort((left, right) => right.gap - left.gap)[0];
  const mean = rows.reduce((sum, row) => sum + row.gap, 0) / rows.length;
  console.log(`průměrná neshoda: ${mean.toFixed(1)} bodu, největší ${worst.gap.toFixed(1)} (${worst.label})`);
}
if (unmatched.length > 0) {
  console.log("");
  console.log(`nespárováno (${unmatched.length}): ${unmatched.slice(0, 8).join(", ")}`);
}


/**
 * ICM otevírání: náš $EV pack proti nezávislému ICM zdroji.
 *
 * Zdroj rozlišuje ICM stránky podle toho, čí je pohled, a pozná se to z legendy,
 * ne z názvu. Stránka s `flatcall` popisuje hráče, který **brání** cizí open;
 * stránka s `Fold vs 3bet` nebo `GTO all in` popisuje hráče, který **sám
 * otevřel** a říká, co udělá, když ho někdo zvedne. Jen ta druhá skupina je RFI
 * a jen ji tady porovnávám - první patří k `VS_OPEN` a je to samostatný uzel.
 *
 * Kdo je hrdina: první sedadlo v názvu. `ICM10-btn55bb-bb13bb` je butonových
 * 55bb proti velkému blindu s třinácti. Druhé sedadlo je protihráč, jehož stack
 * ICM rozhodnutí posouvá - a právě proto je ICM ICM.
 *
 * Stránky, u kterých si pohledem jistý nejsem, se nepočítají. Radši menší
 * tabulka než tabulka, která tiše míchá dva různé uzly - to je stejné pravidlo,
 * podle kterého vyřešený turn odmítá odpovídat na desky, na kterých neběžel.
 */
function icmHeroPerspective(page: ReferencePage): boolean {
  const labels = Object.values(page.legend).join(" | ").toLowerCase();
  if (labels.includes("flatcall") || labels.includes("flat call")) return false;
  if (/vs\s*(all\s*in|allin|jam)/.test(labels)) return false;
  return /fold vs 3bet|all in|jam|call/.test(labels);
}

const icmPack = icmPreflopPack("OFF");
const icmPages = pages.filter((page) => (
  page.group.startsWith("ICM") && page.stacks.length > 0 && icmHeroPerspective(page)
));

console.log("");
console.log("");
console.log("ICM otevírání proti nezávislému ICM zdroji");
console.log(`měřený pack: ${icmPack?.id ?? "žádný"}`);
console.log("");
console.log(
  "spot".padEnd(26) + "zdroj".padStart(8) + "my".padStart(8) + "rozdíl".padStart(9)
  + "  jen zdroj / jen my",
);

const icmRows: { label: string; gap: number; detail: string }[] = [];
const icmDeclined = new Map<string, number>();
const decline = (why: string) => icmDeclined.set(why, (icmDeclined.get(why) ?? 0) + 1);

for (const page of icmPages) {
  const hero = page.stacks[0];
  const seat = CHART_SEAT_NAMES[hero.seat.toLowerCase()];
  if (seat === undefined) { decline(`neznámé sedadlo (${hero.seat})`); continue; }
  if (seat === "SB" || (hero.seat.toUpperCase() === "BB")) { decline("blind neotevírá jako RFI"); continue; }
  const ours = openingWidthOf(icmPack, "OFF", seat, hero.bb as never);
  if (ours === null) { decline(`hloubku ${hero.bb}bb pack nezná`); continue; }

  const theirs = raiseFirstHands(page);
  const theirSet = new Set(theirs);
  const ourSet = new Set(ours.opens);
  const onlyTheirs = theirs.filter((hand) => !ourSet.has(hand));
  const onlyOurs = ours.opens.filter((hand) => !theirSet.has(hand));
  const gap = (
    onlyTheirs.reduce((sum, hand) => sum + combosInClass(hand), 0)
    + onlyOurs.reduce((sum, hand) => sum + combosInClass(hand), 0)
  ) / TOTAL_COMBOS * 100;

  const villain = page.stacks[1];
  icmRows.push({
    label: `${seat} ${hero.bb}bb`,
    gap,
    detail:
      `${seat} ${hero.bb}bb${villain === undefined ? "" : ` vs ${villain.seat}${villain.bb}`}`.padEnd(26)
      + `${widthOf(theirs).toFixed(1)}%`.padStart(8)
      + `${ours.pct.toFixed(1)}%`.padStart(8)
      + `${gap.toFixed(1)}b`.padStart(9)
      + `  ${onlyTheirs.length} / ${onlyOurs.length}`,
  });
}

for (const row of [...icmRows].sort((left, right) => right.gap - left.gap).slice(0, 20)) {
  console.log(row.detail);
}
console.log("");
console.log(`porovnáno ICM spotů: ${icmRows.length} z ${icmPages.length} stránek s pohledem otevírajícího`);
if (icmRows.length > 0) {
  const mean = icmRows.reduce((sum, row) => sum + row.gap, 0) / icmRows.length;
  const worst = [...icmRows].sort((left, right) => right.gap - left.gap)[0];
  console.log(`průměrná neshoda: ${mean.toFixed(1)} bodu, největší ${worst.gap.toFixed(1)} (${worst.label})`);
}
for (const [why, count] of [...icmDeclined].sort((left, right) => right[1] - left[1])) {
  console.log(`  nepočítáno: ${count}x ${why}`);
}

/**
 * O kolik se liší obrana proti různým otevírajícím.
 *
 *   npm run mtt:reference-check -- --defence
 *
 * ## Proč to vzniklo až teď
 *
 * Deník tvrdí v bodě 62, že „tentýž hrdina na téže hloubce se proti různým
 * otevírajícím brání ranges s rozptylem v průměru 11,7 bodu". To číslo je
 * z 18. 8. 2026 a **žádný nástroj ho neuměl zopakovat** - což je porušení
 * pravidla, že do dokumentu jde jen změřené, tedy číslo *a příkaz, který ho
 * vyrobil*. Navíc vzniklo z korpusu, který tehdy zahazoval mixované strategie.
 *
 * Je to zároveň to nejdůležitější číslo pro rozhodnutí o `vsSeat`: říká, kolik
 * stojí, že `VS_OPEN` neví, kdo otevřel.
 */
if (process.argv.includes("--defence")) {
  const DEFENCE = /^F3B-(\d+)BB-([A-Z0-9+]+)-vs-([A-Z0-9+]+)$/i;
  const byHero = new Map<string, { villain: string; width: number }[]>();
  for (const page of pages) {
    const match = DEFENCE.exec(page.id);
    if (match === null || page.pctOfHands === null) continue;
    const key = `${match[2].toUpperCase()} @ ${match[1]}bb`;
    const list = byHero.get(key) ?? [];
    list.push({ villain: match[3].toUpperCase(), width: page.pctOfHands });
    byHero.set(key, list);
  }

  const rows = [...byHero]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const widths = list.map((item) => item.width);
      const min = Math.min(...widths);
      const max = Math.max(...widths);
      const widest = list.find((item) => item.width === max);
      const narrowest = list.find((item) => item.width === min);
      return { key, spread: max - min, count: list.length, widest, narrowest };
    })
    .sort((left, right) => right.spread - left.spread);

  console.log("O kolik se liší obrana podle toho, kdo otevřel");
  console.log("");
  console.log(
    "hrdina".padEnd(16) + "otvír.".padStart(7) + "rozptyl".padStart(9)
    + "  nejširší proti / nejužší proti",
  );
  for (const row of rows) {
    console.log(
      row.key.padEnd(16)
      + String(row.count).padStart(7)
      + `${row.spread.toFixed(1)}b`.padStart(9)
      + `  ${row.widest?.width.toFixed(1)}% vs ${row.widest?.villain}`
      + ` / ${row.narrowest?.width.toFixed(1)}% vs ${row.narrowest?.villain}`,
    );
  }
  const average = rows.reduce((sum, row) => sum + row.spread, 0) / Math.max(rows.length, 1);
  console.log("");
  console.log(
    `hrdinů s víc otevírajícími: ${rows.length}`
    + ` | průměrný rozptyl: ${average.toFixed(1)} bodu`
    + ` | největší: ${rows[0]?.spread.toFixed(1)} (${rows[0]?.key})`,
  );
  console.log("");
  console.log(
    "Tolik stojí, že `VS_OPEN` neví, kdo otevřel: hrdina dostane tutéž odpověď\n"
    + "na situace, které se ve zdroji liší o tolik bodů.",
  );
}
