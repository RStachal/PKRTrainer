import { existsSync, readFileSync } from "node:fs";

import {
  CHART_SEAT_NAMES,
  combosInClass,
  packWidth,
} from "./lib/rangeChartComparison.mts";
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
  hands: Record<string, { colour: string; action: string }>;
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

console.log("Naše otevírací ranges proti nezávislému vlastněnému zdroji");
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
