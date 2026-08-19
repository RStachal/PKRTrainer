/**
 * Range jako mřížka 13×13, protože tak ji pokerista čte.
 *
 * Review je jediná věc, která solverový obsah drží na LOW, a je to práce, kterou
 * nikdo jiný než hráč neudělá. Dosud se mu range předkládala jako čárkami
 * oddělený seznam padesáti tříd - z toho nikdo nepozná tvar. Že se sází celý
 * horní trojúhelník ale s vynechanými nízkými suited spojkami, je z mřížky vidět
 * na první pohled a ze seznamu nikdy.
 *
 * Rozvržení je to, na které je hráč zvyklý: řádky a sloupce od esa k dvojce,
 * nad úhlopříčkou barevné ruce, pod ní nebarevné, na úhlopříčce páry.
 *
 * ## Proč znaky a ne barvy
 *
 * Výstup jde do terminálu, přes ssh, do logu a do schránky. Barvy z poloviny
 * těch míst zmizí a zůstane nečitelná změť; znak přežije všude a dá se
 * vyhledávat. Legenda je pod mřížkou, takže se nemusí pamatovat.
 */

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

/** Znaky pro akce, v pořadí, v jakém se přidělují. */
const SYMBOLS = ["#", "+", "o", ":", ".", "~", "*", "%"] as const;

export interface HandGridLegendEntry {
  symbol: string;
  action: string;
  combos: number;
}

export interface HandGrid {
  lines: readonly string[];
  legend: readonly HandGridLegendEntry[];
}

/**
 * Třída, na kterou padne pozice v mřížce.
 *
 * Nad úhlopříčkou barevná, pod ní nebarevná - to je konvence, ne volba, a její
 * obrácení by udělalo z mřížky nesmysl, který vypadá správně.
 */
function handAt(rowIndex: number, columnIndex: number): string {
  const high = RANKS[Math.min(rowIndex, columnIndex)];
  const low = RANKS[Math.max(rowIndex, columnIndex)];
  if (rowIndex === columnIndex) return `${high}${low}`;
  return `${high}${low}${rowIndex < columnIndex ? "s" : "o"}`;
}

/**
 * Mřížka z rozdělení tříd do akcí.
 *
 * Akce dostávají znaky podle velikosti, ne podle abecedy: nejširší akce dostane
 * první znak, takže mřížka nejčastěji ukazuje jeden opakovaný symbol s
 * výjimkami, a výjimky jsou to, co čtenář hledá.
 *
 * Třída, která v žádném kbelíku není, zůstane prázdná. Prázdno v mřížce je
 * informace: znamená, že tu ruku range nedrží vůbec - a to je něco jiného než
 * ruka, která se skládá.
 */
export function renderHandGrid(
  buckets: readonly { action: string; handClasses: readonly string[]; combos: number }[],
  options: { preserveOrder?: boolean } = {},
): HandGrid {
  // Nejširší akce dostane první znak - kromě případů, kdy pořadí něco znamená.
  // Pásma „sází na většině desek" až „nikdy nesází" mají vlastní smysluplné
  // pořadí a přerovnat je podle počtu ruk by z legendy udělalo hádanku.
  const ordered = options.preserveOrder === true
    ? [...buckets]
    : [...buckets].sort((left, right) => right.combos - left.combos);
  const symbolOf = new Map<string, string>();
  const legend: HandGridLegendEntry[] = [];
  for (const [index, bucket] of ordered.entries()) {
    const symbol = SYMBOLS[index] ?? "?";
    symbolOf.set(bucket.action, symbol);
    legend.push({ symbol, action: bucket.action, combos: bucket.combos });
  }

  const actionOf = new Map<string, string>();
  for (const bucket of ordered) {
    for (const handClass of bucket.handClasses) actionOf.set(handClass, bucket.action);
  }

  const lines: string[] = [`    ${RANKS.map((rank) => rank.padEnd(2)).join("")}`];
  for (const [rowIndex, rank] of RANKS.entries()) {
    const cells = RANKS.map((_, columnIndex) => {
      const action = actionOf.get(handAt(rowIndex, columnIndex));
      return `${action === undefined ? "·" : symbolOf.get(action) ?? "?"} `;
    });
    lines.push(`  ${rank} ${cells.join("")}`);
  }
  return { lines, legend };
}

/** Mřížka i s legendou jako jeden blok textu, připravený k vypsání. */
export function renderHandGridBlock(
  buckets: readonly { action: string; handClasses: readonly string[]; combos: number }[],
  indent = "    ",
  options: { preserveOrder?: boolean } = {},
): string {
  const grid = renderHandGrid(buckets, options);
  const total = grid.legend.reduce((sum, entry) => sum + entry.combos, 0) || 1;
  // Šířka podle nejdelšího popisku, ne pevných dvacet znaků. Popisky se
  // prodloužily převodem na blindy (`BET 3.4 BB (34 % potu)`) a sloupec s
  // kombinacemi se rozjel - u tabulky, kterou má někdo hodiny číst, je to
  // rozdíl mezi přehledem a hádankou.
  const labelWidth = grid.legend.reduce((width, entry) => Math.max(width, entry.action.length), 0);
  const legendLines = grid.legend.map((entry) => (
    `${entry.symbol}  ${entry.action.padEnd(labelWidth)}  ${entry.combos} komb. (${((entry.combos / total) * 100).toFixed(0)} %)`
  ));
  return [
    ...grid.lines,
    "",
    ...legendLines,
    "·  ruka, kterou range vůbec nedrží",
  ].map((line) => `${indent}${line}`).join("\n");
}
