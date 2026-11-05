import { ALL_HAND_CLASSES } from "../../src/core/poker";
import { readRyePng, type RyeImage } from "./ryeRangeImage.mts";

/**
 * Mřížka 13x13 vyčtená z obrázkové ranže RYE (rejam a open-shove).
 *
 * ## Kde mřížka v obrázku je
 *
 * Nehádá se, měří se. Obrázky korpusu mají dvě šířky (600 a 1200 px) a osm
 * různých výšek od 498 do 526 - naměřeno 23. 9. 2026 na všech 625 kusech -
 * takže pevný rastr by byl špatně u většiny z nich. Mřížka vždycky vyplňuje
 * celou šířku a sahá ke spodnímu okraji; nad ní je hlavička s textem. Řádek
 * hlavičky má pár barevných pixelů (písmo), řádek mřížky přes půl šířky, a tím
 * se ty dvě části poznají.
 *
 * ## Jak se pozná akce
 *
 * Buňka, kterou zdroj jamuje, má **zelený rámeček**; ostatní jsou v odstínech
 * červené (záporná EV) nebo skoro bílé (kolem nuly).
 *
 * Počítají se **zelené pixely celé buňky**, ne vzorek. Tři pokusy s vzorkováním
 * předtím selhaly na geometrii: bod na okraji chytal rámeček sousední buňky,
 * bod posunutý dovnitř minul rámeček vlastní, a pravidlo „zelená na třech
 * stranách" viselo na tom, kudy přesně hrana vede. Naměřeno 23. 9. 2026 na
 * `20bb_reshove_BBvsBTN`, že to není potřeba: zelená buňka má 300 az 1300
 * zelených pixelů ze 1700, ostatní **nula az dva**. Rozdělení je dvouvrcholové
 * s propastí mezi vrcholy, takže práh je z dat, ne z hlavy - desetina plochy
 * leží uprostřed té propasti.
 *
 * ## Proč se čte i znaménko EV
 *
 * Protože jinak by dekódování nikdo neověřil. Vlastník to rozhodl 23. 9. 2026
 * (otázka 1): čísla EV brát **jako kontrolu dekódování**, ne jako cenu - cenu
 * počítá produkt z `ALL_IN_EQUITY` a dvě různě vzniklé EV v jednom profilu by
 * si protiřečily. Kontrola zní: v jamovací mřížce má mít každá ruka uvnitř
 * EV >= 0 a každá venku < 0. Znaménko je jediná věc, kterou k tomu potřebujeme,
 * a je to nejsnáze čitelný glyf: plus je kříž (pět řádků), minus čárka (jeden
 * až dva). Buňka, kde se barva a znaménko rozejdou, je **přečtená špatně** -
 * a takový obrázek nesmí do packu.
 */

export type EvSign = "+" | "-" | "?";

export interface RyeImageCell {
  hand: string;
  /** Zdroj tu ruku jamuje: buňka má zelený rámeček. */
  jam: boolean;
  /** Podíl zelených pixelů v buňce. */
  greenShare: number;
  /** Znaménko EV v buňce; `?` znamená, že glyf nebyl čitelný. */
  sign: EvSign;
}

export interface RyeImageGrid {
  file: string;
  width: number;
  height: number;
  band: { top: number; bottom: number };
  cells: RyeImageCell[];
  jamHands: string[];
  /** Podíl kombinací, které zdroj jamuje. */
  jamShare: number;
  /**
   * Buňky, kde si barva a znaménko odporují: jam se záporným EV nebo fold
   * s kladným. Neprázdné znamená špatně přečtený obrázek.
   */
  signConflicts: string[];
  /** Buňky, kde znaménko nešlo přečíst. */
  unreadableSigns: string[];
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

function combos(hand: string): number {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}

function handAt(row: number, col: number): string {
  if (row === col) return `${RANKS[row]}${RANKS[row]}`;
  return row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`;
}

function colourfulRows(image: RyeImage): number[] {
  const out: number[] = [];
  for (let y = 0; y < image.height; y += 1) {
    let count = 0;
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b] = image.rgbAt(x, y);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) count += 1;
    }
    out.push(count);
  }
  return out;
}

function isGreen([r, g, b]: [number, number, number]): boolean {
  return g - Math.max(r, b) > 20 && g > 150;
}

/** Podíl zelených pixelů v buňce; zelená buňka ho má přes desetinu. */
function greenShare(
  image: RyeImage, x0: number, y0: number, cellW: number, cellH: number,
): number {
  const w = Math.round(cellW);
  const h = Math.round(cellH);
  let green = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const px = Math.max(0, Math.min(image.width - 1, Math.round(x0) + x));
      const py = Math.max(0, Math.min(image.height - 1, Math.round(y0) + y));
      if (isGreen(image.rgbAt(px, py))) green += 1;
    }
  }
  return green / Math.max(1, w * h);
}

/**
 * Znaménko EV v buňce.
 *
 * Text je ve dvou řádcích: nahoře jméno ruky, dole EV. Hledá se **spodní**
 * shluk inkoustových řádků a v něm nejlevější glyf. Práh inkoustu se počítá
 * z buňky, ne globálně: vybledlá buňka má text světle šedý na bílé, takže
 * pevný práh by ji přečetl jako prázdnou (naměřeno na `A2s` v
 * `20bb_reshove_BBvsBTN`: pozadí 245, text kolem 220).
 */
function readSign(
  image: RyeImage, x0: number, y0: number, cellW: number, cellH: number,
): EvSign {
  const w = Math.round(cellW);
  const h = Math.round(cellH);
  const lum = (x: number, y: number): number => {
    const [r, g, b] = image.rgbAt(x, y);
    return (r + g + b) / 3;
  };
  const values: number[] = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) values.push(lum(x0 + x, y0 + y));
  values.sort((left, right) => left - right);
  const background = values[Math.round(values.length * 0.8)];
  const darkest = values[Math.round(values.length * 0.02)];
  if (background - darkest < 25) return "?";
  const threshold = background - 25;
  const ink = (x: number, y: number): boolean => lum(x0 + x, y0 + y) < threshold;

  // Kde v buňce je řádek s EV.
  //
  // Nehledá se shluky inkoustu, bere se **poměrem**. Buňka má dva řádky textu
  // v pevném rastru: jméno ruky kolem třetiny výšky, EV kolem čtyř pětin.
  // Hledání shluků selhalo dvakrát - poslední shluk bývá spodní rámeček, a
  // když se rámečky filtrovaly (podle šířky, pak podle výšky), zmizely i husté
  // číslice: nečitelných 45 %, pak 64 %, pak 67 %. Poměr je na obrázcích RYE
  // stabilní, protože všechny vznikly týmž generátorem.
  // Kde v buňce je řádek s EV.
  //
  // Dvě věci musí platit naráz, a každá z nich sama selhala:
  //
  // 1. **Odsadit od rámečku.** Zelená buňka má tmavě zelený rámeček, který
  //    projde prahem inkoustu; jeho spodní linka vypadá jako vodorovná čárka,
  //    tedy jako minus. Bez odsazení hlásilo všech 39 zelených buněk v
  //    `20bb_reshove_BBvsBTN` „jam se znaménkem -".
  // 2. **Hledat shluky, ne pevný poměr.** Rodiny obrázků mají text jinde:
  //    v rejamu je EV na 54-81 % výšky buňky, v open-shove na 68-95 %. Pevné
  //    okno proto jednu z nich rozřízne v půlce slova a znaménko se pak čte
  //    z jeho spodní poloviny - naměřeno 23. 9. 2026, že pak sedí zhruba
  //    každé druhé.
  // Rámeček se **najde kdekoli v buňce**, ne jen u jejího kraje.
  //
  // Tohle byl sedmý pokus a šest předchozích padlo na témže: odsazení se
  // počítalo od okraje buňky a končilo na prvním sloupci bez inkoustu, takže
  // stačilo, aby rámeček ležel o pár pixelů dovnitř, a pravidlo ho minulo.
  // Leží tam skoro vždycky - mřížka se dělí na třináctiny s desetinnou zbytkem
  // a okraj buňky proto na rámeček nesedne. Vykreslený `10bb_reshove_BBvsBTN`
  // má levý rámeček na x=6 ze 46: nejlevější inkoust řádku s EV byl pak on,
  // jeho svislý rozsah je celá výška řádku, a čtení skončilo na „nečitelné".
  //
  // Rámeček se pozná tím, čím se od textu liší vždy: **táhne se skoro přes
  // celou buňku**. Sloupec rámečku má inkoust přes 70 % výšky, řádek rámečku
  // přes 70 % šířky; žádná číslice ani písmeno takhle dlouhé nejsou. Oboje se
  // z měření vyřadí, a tím zmizí i spodní linka zelené buňky, kterou dřívější
  // pravidla četla jako minus.
  const borderCol: boolean[] = [];
  for (let x = 0; x < w; x += 1) {
    let count = 0;
    for (let y = 0; y < h; y += 1) if (ink(x, y)) count += 1;
    borderCol.push(count >= h * 0.7);
  }
  const textCols: number[] = [];
  for (let x = 0; x < w; x += 1) if (!borderCol[x]) textCols.push(x);

  const inkRows: boolean[] = [];
  for (let y = 0; y < h; y += 1) {
    let count = 0;
    for (const x of textCols) if (ink(x, y)) count += 1;
    // Řádek rámečku: inkoust přes celou šířku. Text takhle široký nikdy není.
    inkRows.push(count >= 2 && count < Math.max(3, textCols.length * 0.7));
  }
  const groups: { from: number; to: number }[] = [];
  for (let y = 0; y < h; y += 1) {
    if (!inkRows[y]) continue;
    const last = groups[groups.length - 1];
    if (last !== undefined && y - last.to <= 1) last.to = y;
    else groups.push({ from: y, to: y });
  }
  const evLine = groups[groups.length - 1];
  // Buňka má dva řádky textu; jeden shluk znamená, že se slily nebo že EV chybí.
  if (evLine === undefined || groups.length < 2) return "?";
  const from = evLine.from;
  const to = evLine.to;

  const lineHeight = to - from + 1;
  const extentAt = (x: number): number => {
    let lowest = -1;
    let highest = -1;
    for (let y = from; y <= to; y += 1) {
      if (!ink(x, y)) continue;
      if (lowest < 0) lowest = y;
      highest = y;
    }
    return lowest < 0 ? 0 : highest - lowest + 1;
  };

  // Nejlevější inkoust ještě není glyf.
  //
  // Rámeček buňky je dva až tři pixely široký a na některých řádcích přetéká
  // o jeden dál; ten přetok pak leží v textové části jako samotná tečka. Na
  // `Openshove_10bb/BTN` to u A8s dalo sloupec s dvěma pixely hned vedle
  // rámečku, čtení ho vzalo za znaménko (rozsah 2 = minus) a na dalším prázdném
  // sloupci skončilo - takže jamovaná ruka s křížkem v obrázku hlásila „-".
  // Glyf se od přetoku pozná množstvím inkoustu: i ten nejmenší, dvoupixelový
  // minus, zabírá aspoň dva sloupce a čtyři pixely.
  const runs: { start: number; end: number; ink: number }[] = [];
  let previous = -2;
  for (const x of textCols) {
    let inked = 0;
    for (let y = from; y <= to; y += 1) if (ink(x, y)) inked += 1;
    if (inked === 0) { previous = -2; continue; }
    const last = runs[runs.length - 1];
    if (last !== undefined && x - previous === 1) { last.ink += inked; last.end = x; }
    else runs.push({ start: x, end: x, ink: inked });
    previous = x;
  }
  const signRun = runs.find((run) => run.ink >= 3);
  if (signRun === undefined) return "?";

  const startIndex = textCols.indexOf(signRun.start);
  let signExtent = 0;
  for (let index = startIndex; index < textCols.length; index += 1) {
    const extent = extentAt(textCols[index]);
    if (extent === 0) break;
    // Sloupec vysoký jako číslice: znaménko skončilo.
    if (extent >= lineHeight * 0.8) break;
    signExtent = Math.max(signExtent, extent);
  }

  // Znaménko se pozná svislým rozsahem sloupců, dokud nepřijde číslice.
  //
  // Zůstává to takhle po měření čtyř pravidel vedle sebe (24. 9. 2026, 38
  // mřížek, 6 422 buněk), protože ostatní tři byly horší:
  //
  // | pravidlo | jam se znaménkem - | fold se znaménkem + |
  // |---|---|---|
  // | tohle (rozsah sloupce) | **24** | **1 506** |
  // | rostoucí sjednocení | 24 | 1 722 |
  // | výška celého běhu, prahy z rozložení | 306 | 1 987 |
  // | první tři sloupce | 937 | 155 |
  //
  // `jam se znaménkem -` je ta chyba, která se pozná bezpečně: jamovaná ruka
  // se zápornou EV by znamenala, že si obrázek odporuje sám. Dvacet čtyři
  // z 1 664 je 1,4 %, tedy čtení není náhodné. Zbylé `fold se znaménkem +`
  // je druhá strana téhož: **splynutí čárky s číslicí za ní**. `Q2s` na
  // `Openshove_10bb/BTN` má čárku na x=10..12 a nulu od x=13 a v řádku čárky
  // jsou spojené, takže se z levého oblouku nuly stane rameno kříže.
  //
  // Rozložení výšky glyfu ukazuje, proč na to pravidlo nestačí: vrcholy jsou
  // na 0,2 (čárka) a 0,45 (kříž) výšky řádku, ale splynulé buňky mají 1,0 a
  // odříznout je znamená ztratit i část skutečných křížů. **Tohle potřebuje
  // vzory glyfů, ne osmé pravidlo** - a do té doby se nic nepropaguje.
  if (signExtent === 0) return "?";
  if (signExtent <= Math.max(2, lineHeight * 0.3)) return "-";
  if (signExtent < lineHeight * 0.8) return "+";
  return "?";
}

/**
 * Svislé pruhy obrázku, kde je mřížka - obrázek jich nese jeden nebo dva.
 *
 * Open-shove obrázky jsou **dva panely vedle sebe** (1200 px = dvakrát 600),
 * každý s vlastní hlavičkou a vlastní šířkou range: „EP1 raises 9875: 19.5 %"
 * vlevo, 17,5 % vpravo. Dekodér je zpočátku četl jako jednu mřížku o třinácti
 * sloupcích, takže každá „buňka" ležela přes dvě skutečné a čísla i barvy
 * vycházely nesmyslně (naměřeno 23. 9. 2026: 61 % nečitelných znamének a 360
 * sporů na dvanácti obrázcích). Panely se proto hledají podle svislé mezery:
 * sloupec bez barvy v celém pruhu mřížky je předěl, ne buňka.
 */
function panelRanges(image: RyeImage, top: number, bottom: number): { from: number; to: number }[] {
  const colourful: boolean[] = [];
  for (let x = 0; x < image.width; x += 1) {
    let count = 0;
    for (let y = top; y <= bottom; y += 1) {
      const [r, g, b] = image.rgbAt(x, y);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) count += 1;
    }
    colourful.push(count > (bottom - top) * 0.2);
  }
  const panels: { from: number; to: number }[] = [];
  for (let x = 0; x < image.width; x += 1) {
    if (!colourful[x]) continue;
    const last = panels[panels.length - 1];
    if (last !== undefined && x - last.to <= 4) last.to = x;
    else panels.push({ from: x, to: x });
  }
  // Panel užší než třináct buněk po dvaceti pixelech není mřížka.
  return panels.filter((panel) => panel.to - panel.from + 1 >= 13 * 20);
}

export function readRyeRangeImageGrids(path: string): RyeImageGrid[] {
  const image = readRyePng(path);
  if (image === undefined) return [];
  const rows = colourfulRows(image);
  const top = rows.findIndex((count) => count > image.width * 0.25);
  const bottom = rows.length - 1 - [...rows].reverse().findIndex((count) => count > image.width * 0.25);
  if (top < 0 || bottom <= top || bottom - top + 1 < 13 * 8) return [];
  const panels = panelRanges(image, top, bottom);
  const out: RyeImageGrid[] = [];
  for (const [index, panel] of panels.entries()) {
    const grid = readPanel(image, path, index, panels.length, panel, top, bottom);
    if (grid !== undefined) out.push(grid);
  }
  return out;
}

function readPanel(
  image: RyeImage,
  path: string,
  index: number,
  panelCount: number,
  panel: { from: number; to: number },
  top: number,
  bottom: number,
): RyeImageGrid | undefined {
  const { height } = image;
  const width = panel.to - panel.from + 1;
  const cellW = width / 13;
  const cellH = (bottom - top + 1) / 13;
  const cells: RyeImageCell[] = [];
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const x0 = panel.from + col * cellW;
      const y0 = top + row * cellH;
      const green = greenShare(image, x0, y0, cellW, cellH);
      const sign = readSign(image, Math.round(x0), Math.round(y0), cellW, cellH);
      cells.push({ hand: handAt(row, col), jam: green > 0.1, greenShare: green, sign });
    }
  }

  const jamHands = ALL_HAND_CLASSES.filter((hand) => cells.find((cell) => cell.hand === hand)?.jam === true);
  const jamCombos = jamHands.reduce((sum, hand) => sum + combos(hand), 0);
  const signConflicts = cells
    .filter((cell) => (cell.jam && cell.sign === "-") || (!cell.jam && cell.sign === "+"))
    .map((cell) => `${cell.hand}: ${cell.jam ? "jam" : "fold"} se znaménkem ${cell.sign}`);
  return {
    file: panelCount > 1 ? `${path}#${index + 1}` : path,
    width,
    height,
    band: { top, bottom },
    cells,
    jamHands: [...jamHands],
    jamShare: jamCombos / 1326,
    signConflicts,
    unreadableSigns: cells.filter((cell) => cell.sign === "?").map((cell) => cell.hand),
  };
}

/** Jediná mřížka; u dvoupanelového obrázku vrátí tu první. */
export function readRyeRangeImageGrid(path: string): RyeImageGrid | undefined {
  return readRyeRangeImageGrids(path)[0];
}
