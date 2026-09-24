import { readFileSync } from "node:fs";

/**
 * Čtení mřížek ranží z vlastníkova Rangevieweru.
 *
 * ## Proč se tomu dá věřit
 *
 * Každá stránka nese **dvě nezávislá vyjádření téhož**: obarvenou mřížku 169
 * buněk a legendu, která u každé barvy uvádí název akce a **počet kombinací**.
 * Extrakce se proto nemusí ověřovat ručně - spočítá se mřížka a porovná se
 * s legendou. Když se ta dvě čísla rozejdou, soubor se **nevydá**.
 *
 * Změřeno 26. 8. 2026 na `ICM-btn35bb-co60bb.html`: mřížka dala flatcall 98,
 * 3b/f 44, 3bet/call 28, jam 12, celkem 182 - a legenda tvrdí přesně totéž.
 *
 * ## Co se v mřížce dá přehlédnout
 *
 * Buňka může nést **částečnou váhu**:
 *
 *     <td id="cid_A4s" class="cell s">
 *       <div class="mdl-color--blue weighted" data-weight="50" ...></div>A4s</td>
 *
 * To je mixovaná strategie: polovina kombinací `A4s` hraje modrou akci, zbytek
 * to, co říká barva samotného `<td>` (tady žádnou, tedy fold). Bez těch vah
 * chybělo 32 ze 182 kombinací a nesedělo by nic.
 */

export interface RyeLegendEntry {
  /** Barva tak, jak ji stránka pojmenovává, např. `green`. */
  color: string;
  /** Název akce slovy stránky, např. `flatcall`, `3b/f`, `Jam`. */
  action: string;
  /** Kolik kombinací té akci legenda přisuzuje. */
  combos: number;
  /** Procento, které legenda u té akce uvádí. */
  percent: number;
}

export interface RyeHandWeight {
  /** Třída ruky, např. `A4s`. */
  hand: string;
  color: string;
  /** Podíl kombinací té třídy, 0 až 1. */
  weight: number;
}

export interface RyeGrid {
  file: string;
  /** Nadpis stránky, jak ho uvádí, nebo prázdno. */
  title: string;
  legend: readonly RyeLegendEntry[];
  hands: readonly RyeHandWeight[];
  /** Součet kombinací na barvu, spočítaný z mřížky. */
  combosByColor: ReadonlyMap<string, number>;
  /**
   * Rozdíly proti legendě, po barvách. Prázdné znamená, že se mřížka a legenda
   * shodly do jedné kombinace - a jen takový soubor se smí použít.
   */
  mismatches: readonly string[];
  /**
   * Stránka kreslí jen **jednu větev** strategie, ne celou.
   *
   * Pozná se z legendy samotné: procenta sečtou sto, ale obarvená je zlomek
   * mřížky - tedy nejsou počítaná z 1326 kombinací, ale ze zvolené podmnožiny.
   * `SQU-40BBMais-BB-vs-CO-BU-SB` má „Squeeze/call 56,58 % | squeeze/fold
   * 43,42 %“, dohromady sto procent, a obarvených 4 % mřížky: o zbylých 96 %
   * rukou ta stránka **neříká nic**. Neobarvená buňka tam neznamená fold,
   * znamená „tahle stránka to neřeší“.
   *
   * Naměřeno 24. 9. 2026: takových je **49 ze 421 ověřených** stránek
   * (CALLRE 16, HU 16, SQU 10, BBSTR 2, F3B 2, OP 2, PU 1).
   */
  partial: boolean;
  /** Součet procent v legendě; kolem sta u dílčí stránky. */
  legendPercentSum: number;
  /** Podíl kombinací, které mřížka vůbec obarví (0 až 1). */
  colouredShare: number;
}

/** Kolik kombinací drží třída ruky: pár 6, suited 4, offsuit 12. */
export function combosOfHandClass(hand: string): number {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}

/** O kolik kombinací smí legenda minout mřížku, než se soubor zahodí. */
const TOLERANCE_COMBOS = 1;

const CELL = /<td id="cid_([^"]+)"([^>]*)>(.*?)<\/td>/gs;
const WEIGHTED = /class="mdl-color--([a-z-]+) weighted"[^>]*data-weight="(\d+)"/g;
const LEGEND_ITEM = /<li class="[^"]*mdl-color--([a-z-]+)"([^>]*)>(.*?)<\/li>/gs;

const RANKS = "AKQJT98765432".split("");

/**
 * Třídy ruk v pořadí, v jakém je mřížka 13×13 vypisuje: řádek po řádku, nad
 * úhlopříčkou suited, pod ní offsuit.
 */
const HAND_BY_POSITION: readonly string[] = RANKS.flatMap((row, rowIndex) =>
  RANKS.map((column, columnIndex) => {
    if (rowIndex === columnIndex) return row + column;
    return rowIndex < columnIndex ? `${row}${column}s` : `${column}${row}o`;
  }));

/**
 * Kterou ruku buňka drží, se čte z **polohy**, ne z `id`.
 *
 * Naměřeno 24. 9. 2026 na celém korpusu (536 mřížek): popisek buňky sedí na
 * polohu v tabulce u **všech 536**, kdežto `id="cid_..."` se rozchází u šesti.
 * `ICM2-hj45bb-sb18bb` má `cid_A4s` dvakrát a `cid_KTs` vůbec ne; na dvou
 * stránkách ICM2 nese `cid_A4s` rovnou pět buněk (A7s, A5s, A4s, A3s, A2s).
 * Čtení podle `id` tam tiše zapsalo jednu třídu pětkrát a čtyři jiné nikdy -
 * tedy ranži, kterou zdroj netvrdí, a bez jediné stopy v čísle kombinací,
 * protože všech pět tříd má shodně čtyři kombinace.
 *
 * Poloha je struktura tabulky a popisek je text, který zdroj vypsal; když se
 * ty dva rozejdou, stránka se **nevydá**. Dva nezávislí svědci se shodují u
 * celého dnešního korpusu, takže tenhle práh dnes nic nestojí - je to pojistka
 * pro soubory, které přijdou.
 */
const CELL_LABEL = /^([AKQJT2-9]{2}[so]?)$/;

export function readRyeGrid(path: string): RyeGrid | undefined {
  const text = readFileSync(path, "utf8");
  const hands: RyeHandWeight[] = [];
  const combosByColor = new Map<string, number>();

  const add = (color: string, combos: number): void => {
    combosByColor.set(color, (combosByColor.get(color) ?? 0) + combos);
  };

  let cells = 0;
  const misplaced: string[] = [];
  for (const match of text.matchAll(CELL)) {
    const [, id, attributes, inner] = match;
    // Poloha rozhoduje, `id` je jen třetí hlas. Viz HAND_BY_POSITION.
    const hand = HAND_BY_POSITION[cells] ?? id;
    const label = inner.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (CELL_LABEL.test(label) && label !== hand) {
      misplaced.push(`buňka ${cells + 1}: poloha říká ${hand}, popisek ${label} (id ${id})`);
    }
    const combos = combosOfHandClass(hand);
    cells += 1;
    let weighted = 0;
    for (const part of inner.matchAll(WEIGHTED)) {
      const weight = Number(part[2]) / 100;
      if (!Number.isFinite(weight) || weight <= 0) continue;
      weighted += weight;
      hands.push({ hand, color: part[1], weight });
      add(part[1], combos * weight);
    }
    const base = /mdl-color--([a-z-]+)/.exec(attributes);
    // Zbytek váhy patří barvě samotné buňky. Když žádnou nemá, je to fold a do
    // rozpisu nepatří - stránka ho taky neuvádí.
    if (base !== null && weighted < 1) {
      hands.push({ hand, color: base[1], weight: 1 - weighted });
      add(base[1], combos * (1 - weighted));
    }
  }
  // Mřížka má 169 tříd. Cokoli jiného není mřížka ranže a nemá se číst.
  if (cells !== 169) return undefined;

  const legend: RyeLegendEntry[] = [];
  for (const match of text.matchAll(LEGEND_ITEM)) {
    const [, color, attributes, inner] = match;
    // `display: none` znamená barvu, kterou tahle stránka nepoužívá.
    if (/display:\s*none/.test(attributes)) continue;
    const title = /<span class="title">([^<]*)<\/span>/.exec(inner)?.[1]?.trim();
    // Kombinace umí být psané i s desetinnou tečkou: `flatcall 42.11% (48.00
    // combos)`. Vzor jen z číslic a mezer z toho přečetl „00", tedy **nulu** -
    // a protože se mřížka proti legendě ověřuje, celá stránka pak neprošla.
    // Naměřeno 24. 9. 2026: tahle jediná tečka shodila 117 neshod na 141
    // odmítnutých stránkách, nejvíc v ICM (65) a HU (24).
    const combos = /([\d\s]+(?:[.,]\d+)?)\s*combos?/.exec(inner)?.[1]
      ?.replace(/\s/g, "")
      .replace(",", ".");
    if (title === undefined || title === "" || combos === undefined) continue;
    const percent = /([\d]+(?:[.,][\d]+)?)\s*%/.exec(inner.replace(/<[^>]*>/g, " "))?.[1]
      ?.replace(",", ".");
    legend.push({
      color,
      action: title,
      combos: Number(combos),
      percent: percent === undefined ? Number.NaN : Number(percent),
    });
  }

  const mismatches: string[] = [];
  // Poloha a popisek se musí shodovat, jinak se neví, která ruka to je.
  for (const line of misplaced.slice(0, 5)) mismatches.push(line);
  if (misplaced.length > 5) {
    mismatches.push(`... a dalších ${misplaced.length - 5} buněk, kde se poloha a popisek rozcházejí`);
  }
  // Mřížka bez legendy není ověřená, je **neověřitelná**.
  //
  // Naměřeno 26. 8. 2026: 35 stránek korpusu má 169 buněk a žádnou legendu
  // (jsou to rozcestníky s náhledem). Ty procházely kontrolou tím, že nebylo
  // co porovnat - tedy nejhorší možný způsob, jak projít. Počítat je mezi
  // ověřené by znamenalo tvrdit důvěru, kterou nic nepodkládá.
  if (legend.length === 0) {
    mismatches.push("stránka nemá legendu, takže se mřížka nemá proti čemu ověřit");
  }
  for (const entry of legend) {
    const measured = Math.round((combosByColor.get(entry.color) ?? 0) * 10) / 10;
    // Tolerance jedné kombinace, ne nula.
    //
    // Legenda uvádí **celá čísla**, kdežto vážené buňky dávají zlomky - třetina
    // dvanácti kombinací jsou čtyři, ale třetina šesti nikoli. Změřeno na celém
    // korpusu: nejčastější neshody jsou 0,6 až 0,9 kombinace, což je přesně
    // zaokrouhlení zdroje. Nad jednu kombinaci už jde o skutečný nesouhlas a
    // takový soubor se nevydá; větších neshod je 106 a jsou o desítky kombinací.
    if (Math.abs(measured - entry.combos) > TOLERANCE_COMBOS) {
      mismatches.push(`${entry.color} (${entry.action}): mřížka ${measured}, legenda ${entry.combos}`);
    }
  }
  // Barva v mřížce, kterou legenda nejmenuje, je stejně vážná: znamenala by
  // akci bez názvu, tedy odpověď, kterou nelze pojmenovat hráči.
  for (const [color, combos] of combosByColor) {
    if (legend.some((entry) => entry.color === color)) continue;
    mismatches.push(`${color}: v mřížce ${Math.round(combos)} kombinací, legenda ji nezná`);
  }

  const title = /<title>([^<]*)<\/title>/.exec(text)?.[1]?.trim()
    ?? /<h[1-5][^>]*>([^<]{3,80})<\/h[1-5]>/.exec(text)?.[1]?.trim()
    ?? "";

  // Kreslí stránka celou strategii, nebo jen jednu větev? Viz `partial`.
  const legendPercentSum = legend.reduce(
    (sum, entry) => sum + (Number.isFinite(entry.percent) ? entry.percent : 0),
    0,
  );
  const coloured = [...combosByColor.values()].reduce((sum, value) => sum + value, 0);
  const colouredShare = coloured / 1326;
  const partial = Math.abs(legendPercentSum - 100) <= 2 && colouredShare < 0.9;

  return {
    file: path, title, legend, hands, combosByColor, mismatches,
    partial, legendPercentSum, colouredShare,
  };
}
