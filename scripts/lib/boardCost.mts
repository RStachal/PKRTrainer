/**
 * Cena jedné desky: jedno místo, jedno měření, tři odvozená čísla.
 *
 * ## Proč to má vlastní soubor
 *
 * Do 6. 10. 2026 bylo „kolik stojí deska" zapsané na **pěti místech a každé
 * jinak**: `BOARD_MINUTES = 12` v nočním runneru, 715 s v `run_night_decomposition.py`,
 * znovu 715 s v `mtt:processes`, `[[25, 9], [40, 19.3], [50, 40]]` v hlídači
 * nocí a `rodin × 10` v odhadu fáze EV. Pět čísel o téže věci, každé se
 * posouvalo samo, a oba moje omyly z 5. a 6. 10. jsou jeho následek: dávku na
 * 40 bb jsem naplánoval podle jedné sondy a běh fáze EV odhadl na 10 minut,
 * když trval 211.
 *
 * ## Proč z toho nejde udělat jedna konstanta
 *
 * To je ta past, do které bych jinak spadl: sjednotit pět čísel na jedno.
 * Nejde to, protože **každý konzument potřebuje jinou statistiku téhož
 * rozdělení** a mýlit se smí každý na jinou stranu:
 *
 * - **Zásoba** („vydrží fronta do neděle?") - bezpečné je cenu **podstřelit**.
 *   Vyšší cena znamená víc minut, tedy víc nahlášených nocí; kdyby byla deska
 *   ve skutečnosti levnější, fronta se vyprázdní dřív, než plán čekal, a noc
 *   běží naprázdno. Proto medián.
 * - **Strop jedné desky** - bezpečné je cenu **přestřelit**. Volný strop je jen
 *   víko a nestojí nic; těsný stojí celý strop a navíc stupeň žebříku. Je to
 *   změřené: `742r` na 40 bb narazila na třicetiminutový strop dvakrát za jednu
 *   noc, a dvě sesterské rodiny tutéž texturu dokončily za 28,1 a 30,0.
 * - **Rezerva na konci okna** („už nezačínej") - devadesátý percentil, protože
 *   přesně to ta věta znamená: nezačínej, co s pravděpodobností 0,9 nedoběhne.
 * - **Slib** („dokončí dnešní noc tuhle rodinu?") - **průměr**. Doplněno
 *   14. 10. 2026; tenhle konzument tu chyběl a půjčil si medián od zásoby,
 *   tedy statistiku, která se mýlí na opačnou stranu. Počítá se součet N desek
 *   a nezkreslený odhad součtu je `N krát průměr`; u zprava zešikmeného
 *   rozdělení je průměr nad mediánem, takže medián slib nadhodnocuje. Změřeno
 *   na 50 bb: 60 desek dalo průměr 25,18 proti mediánu 24,15, zkreslení 4,3 %.
 *
 * Takže jeden **změřený** řádek na hloubku a tři odvozená čísla s rozepsaným
 * směrem, kterým se smí mýlit. Ne pět konstant.
 *
 * ## Proč jen z nočního logu
 *
 * Měří se **výhradně** `artifacts/decomposition/expansion.log`, tedy běhy
 * nočního runneru. Ruční sondy přes den do tabulky nesmí, a je to změřené:
 * `A72r` na 40 bb mi ručně doběhla za 9,3 min, kdežto noc tutéž texturu ve
 * třech sesterských rodinách solvila 26,5, 28,6 a 29,1 min. Rodinou to není -
 * `UTG_2_HJ`, kde sonda běžela, má ostatní desky (22,1, 19,3, 9,9, 18,5)
 * v řadě s ostatními rodinami. Je to podmínkami běhu, a ty se mezi dnem a nocí
 * liší. Ruční sonda tedy neříká cenu noci; říká ji jen **poměr dvou ručních
 * sond**, protože ty podmínky sdílejí. Tak je 50 bb v tabulce taky zapsané -
 * jako extrapolace, ne jako měření.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const BOARD_COST_PATH = "Agents/solver-input/decomposition/board-cost.generated.json";
export const EXPANSION_LOG_PATH = "artifacts/decomposition/expansion.log";

/**
 * Strop, nad který runner desku nikdy nepustí (`CAP_CEILING_MINUTES`
 * v `run_night_expansion.py`), plus dvě minuty na úklid.
 *
 * Nad touto hranicí **není co měřit**: runner by solve zabil, takže delší čas
 * na hodinách neznamená dražší desku, ale že se mezitím pohnuly hodiny bez
 * procesu. Změřený případ: deska `955tt` v `MTT9_25BB_UTG_HJ_SRP` začala
 * 1. 10. ve 23:09:18 a „dokončila" v 07:36:51, tedy 507,5 min - stroj mezitím
 * spal 8 h 21 min na baterii. Bez tohoto filtru by jedna prospaná noc zvedla
 * průměr hloubky 25 bb o celou minutu.
 *
 * Záměrně se tu nepočítá se stropem podle hloubky: ten z téhle tabulky vzniká,
 * takže by to byl kruh. Strop stropů je konstanta runneru a stačí.
 */
const CLOCK_MOVED_MINUTES = 92;

/**
 * Řádek začátku desky, ve **všech třech** tvarech, které runner píše:
 *
 *   [00:31:27] solving MTT9_40BB_UTG_2_HJ_SRP 883r
 *   [21:04:11] solving MTT9_25BB_CO_BTN_SRP J73r (stupeň 1: strop 60 min, přesnost 0.5 %)
 *   [22:10:02] solving MTT9_50BB_BTN_BB_SRP A72r (přesnost 1.0 %, strop 90 min)
 *
 * Jméno rodiny musí začínat `MTT9_`, a to je ten rozlišovač: riverová fáze píše
 * `solving river MTT9_... / CHECK_BET25_CALL__Qh: 39 z 39`, kde je `river`
 * první token, takže se sem nedostane.
 *
 * ## Proč je závorka nespecifická
 *
 * Dřív to tu bylo ukotvené na konec řádku (`\s*$`) a **tiše to zahazovalo
 * opakované pokusy** - tedy přesně ty nejdražší desky, které má strop pokrývat:
 * z hloubky 25 bb zmizely desky za 45,7 a 46,7 min a maximum vyšlo 23,2.
 *
 * Pak tu stálo `(?: \(stupeň (\d+):.*)?` a byl to tentýž omyl o patro výš:
 * **vyjmenovávat tvary závorky**. Rozhodnutí 2c přidalo třetí tvar (čerstvá
 * deska na 50 bb hlásí přesnost, ne stupeň) a ten by propadl, takže by se celá
 * hloubka 50 bb do ceny nezapočítala - a plán by na ni dál používal
 * extrapolaci. Proto se teď bere **jakákoli** závorka za jménem desky a stupeň
 * se z ní vytahuje zvlášť, když tam je.
 */
const SOLVING = /^\[\d{2}:\d{2}:\d{2}\] solving (MTT9_\S+) (\S+?)(?: \(.*)?\s*$/;
const SOLVING_LEVEL = /\(stupeň (\d+):/;
/** Počet vláken; runner ho píše jen v pokusu o vlákna (od 20. 10. 2026). */
const SOLVING_THREADS = /vlákna (\d+)/;
const DONE = /^\[\d{2}:\d{2}:\d{2}\]\s+hotovo za ([\d.]+) min/;
const DEPTH = /_(\d+)BB_/;

export interface BoardSolve {
  family: string;
  board: string;
  depthBB: number;
  minutes: number;
  /** Stupeň žebříku, na kterém deska doběhla; 0 je první pokus. */
  level: number;
  /** Vlákna solveru, když je runner zapsal - jen v pokusu o vlákna. */
  threads?: number;
}

/**
 * Páry `solving <rodina> <deska>` a následné `hotovo za N min`.
 *
 * Runner solví desky **po jedné** (`--workers` jsou vlákna solveru, ne desky),
 * takže dvojice jde za sebou a nic se nepřekrývá. Řádek `SELHALO` otevřený pár
 * zahazuje: deska, která narazila na strop, cenu neříká - říká jen, že je dražší
 * než strop, a to už strop sám.
 *
 * Tím se cena spotřebovaná **neúspěšnými** pokusy do tabulky nedostane, i když
 * okno sežrala. Je to vědomé a na bezpečnou stranu: plán tím cenu podstřeluje,
 * a podstřelená cena znamená víc nastagovaných desek, ne prázdnou noc.
 */
export function parseBoardSolves(lines: readonly string[]): BoardSolve[] {
  const solves: BoardSolve[] = [];
  let open: { family: string; board: string; level: number; threads?: number } | undefined;
  for (const line of lines) {
    const start = SOLVING.exec(line);
    if (start !== null) {
      const threads = SOLVING_THREADS.exec(line)?.[1];
      open = {
        family: start[1].trim(),
        board: start[2].trim(),
        level: Number(SOLVING_LEVEL.exec(line)?.[1] ?? 0),
        ...(threads === undefined ? {} : { threads: Number(threads) }),
      };
      continue;
    }
    const done = DONE.exec(line);
    if (done === null) continue;
    // Řádek bez otevřeného páru je uříznutý log, ne deska; a cena bez rodiny
    // nemá hloubku, takže by zkreslila tu, do které by spadla.
    const started = open;
    open = undefined;
    if (started === undefined) continue;
    const depth = DEPTH.exec(started.family);
    if (depth === null) continue;
    const minutes = Number(done[1]);
    if (minutes > CLOCK_MOVED_MINUTES) continue;
    solves.push({ ...started, depthBB: Number(depth[1]), minutes });
  }
  return solves;
}

export interface DepthCost {
  depthBB: number;
  /** Kolik desek té hloubky noc změřila. Nula znamená extrapolaci, ne cenu. */
  boards: number;
  median: number;
  p90: number;
  max: number;
  /** Zásoba: kolik minut si na desku počítat při odhadu, na kolik nocí práce je. */
  planMinutes: number;
  /**
   * Slib („dokončí dnešní noc tuhle rodinu?"): **průměr**, ne medián.
   *
   * Čtvrtý konzument, který na seznamu výš chyběl - a mýlí se na **opačnou
   * stranu** než zásoba. U zásoby je bezpečné cenu podstřelit, protože fronta
   * pak zčervená dřív. U slibu je podstřelení to nebezpečné: slíbí rodinu,
   * která nedojde, a ráno se nedodá nic.
   *
   * Statistika musí být průměr, protože se počítá **součet** N desek, a
   * nezkreslený odhad součtu je `N krát průměr`. U zprava zešikmeného
   * rozdělení je průměr nad mediánem, takže medián slib systematicky
   * nadhodnocuje. Změřeno 14. 10. 2026 na 50 bb: 60 desek dřívějších nocí dalo
   * průměr 25,18 a medián 24,15, tedy zkreslení **4,3 %**.
   */
  promiseMinutes: number;
  /** Strop jednoho solve. */
  capMinutes: number;
  /** Rezerva na konci okna: pod tolik minut už desku nezačínat. */
  reserveMinutes: number;
  basis: "měřeno" | "extrapolace";
  /** U extrapolace odkud; u měření prázdné. */
  note?: string;
}

export interface BoardCostTable {
  measuredAt: string;
  source: string;
  solves: number;
  depths: DepthCost[];
  /** Změřené rodiny; od 20. 10. 2026, starší tabulka je nemá. */
  families?: FamilyCost[];
  /** Cena podle šířky range na hloubku; od 20. 10. 2026. */
  widthModels?: WidthModel[];
}

/**
 * Změřená cena jedné rodiny. Plán z mediánu a slib z průměru, ze stejného
 * důvodu jako u hloubky (viz `promiseMinutes`).
 */
export interface FamilyCost {
  family: string;
  depthBB: number;
  boards: number;
  median: number;
  mean: number;
}

/**
 * `log(minuty) = intercept + slope * log(šířka)` pro jednu hloubku.
 *
 * Šířka je počet kombinací OOP plus IP z parametrů solveru (`rangeWidthOf`).
 * `smear` převádí předpověď mediánu na průměr (Duanův odhad: průměr
 * `exp(reziduí)`), protože slib potřebuje průměr a regrese v logaritmech dává
 * medián.
 */
export interface WidthModel {
  depthBB: number;
  boards: number;
  intercept: number;
  slope: number;
  smear: number;
  r2: number;
  /** Rozsah změřených šířek; předpověď mimo něj je extrapolace a hlásí se tak. */
  minWidth: number;
  maxWidth: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Strop z devadesátého percentilu: dvojnásobek, zaokrouhlený na desítky, 30 az 90. */
export function capFromP90(p90: number): number {
  return Math.min(90, Math.max(30, Math.ceil(p90 * 2 / 10) * 10));
}

export function depthCostsFrom(solves: readonly BoardSolve[]): DepthCost[] {
  const byDepth = new Map<number, number[]>();
  for (const solve of solves) {
    const bucket = byDepth.get(solve.depthBB);
    if (bucket === undefined) byDepth.set(solve.depthBB, [solve.minutes]);
    else bucket.push(solve.minutes);
  }
  return [...byDepth.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([depthBB, minutes]) => {
      const sorted = [...minutes].sort((left, right) => left - right);
      const p90 = quantile(sorted, 0.9);
      return {
        depthBB,
        boards: sorted.length,
        median: round1(quantile(sorted, 0.5)),
        p90: round1(p90),
        max: round1(sorted[sorted.length - 1]),
        planMinutes: round1(quantile(sorted, 0.5)),
        promiseMinutes: round1(
          sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        ),
        capMinutes: capFromP90(p90),
        reserveMinutes: Math.ceil(p90),
        basis: "měřeno" as const,
      };
    });
}

export function readBoardCostTable(path = BOARD_COST_PATH): BoardCostTable {
  return JSON.parse(readFileSync(path, "utf8")) as BoardCostTable;
}

export function depthOfFamily(family: string): number {
  return Number(DEPTH.exec(family)?.[1] ?? 0);
}

/**
 * Řádek pro hloubku, nebo `undefined`.
 *
 * Schválně **nemá** výchozí hodnotu. Výchozí hodnota je přesně to, čím se tahle
 * vrstva stala potřebná: hlídač měl `MINUTES_PER_BOARD_DEEP = 40` a na hloubku,
 * kterou nikdo nezměřil, tiše odpověděl číslem. Kdo se ptá na neznámou hloubku,
 * má se to dozvědět.
 */
export function costForDepth(table: BoardCostTable, depthBB: number): DepthCost | undefined {
  return table.depths.find((row) => row.depthBB === depthBB);
}

/**
 * # Cena podle rodiny a šířky range (od 20. 10. 2026)
 *
 * Bod 311 to změřil 15. 10.: cena desky závisí na **šířce range**, ne jen na
 * hloubce. Řádek hloubky je průměr přes rodiny, které noc zrovna solvila, a na
 * 40 bb to byly rodiny s raným otvíračem. Nové dvojice - pozdní otvírač, obrana
 * blindů - stojí dvakrát tolik, takže výhled fronty i slib „noc dokončí rodinu"
 * byly o polovinu optimistické (slib čtyř rodin dopadl na jednu, fronta 186
 * desek se hlásila jako 6,8 noci).
 *
 * Změřeno na 918 deskách nočního logu, regrese `log(minuty)` na
 * `log(kombinací OOP + IP)` po hloubkách: sklon 0,63 na 40 bb a 0,65 na 50 bb,
 * na 25 bb nula - krátký stack má malý strom a šířka v něm nehraje roli.
 * Chyba odhadu průměru rodiny, kterou model neviděl (vynechaná celá rodina):
 * 40 bb 39 % podle hloubky proti 15 % podle šířky, 50 bb 17 % proti 13 %,
 * 25 bb 12 % proti 13 %. A extrapolace drží směr: model naučený na 40 bb jen
 * z úzkých rodin předpověděl široké na 30-44 min proti skutečným 40-54
 * (hloubka 25,3) - podstřeluje, ale polovinu chyby zavře.
 *
 * Pořadí: vlastní měření rodiny (aspoň `FAMILY_MIN_BOARDS` desek), pak šířka
 * range, pak hloubka. Strop a rezerva zůstávají po hloubkách: tam je bezpečné
 * cenu přestřelit, a p90 jedné rodiny z pěti desek by strop zúžil.
 */
export const FAMILY_MIN_BOARDS = 3;

export type CostBasis = "rodina" | "šířka range" | "šířka range, mimo změřené" | "hloubka";

export interface FamilyEstimate {
  planMinutes: number;
  promiseMinutes: number;
  basis: CostBasis;
}

export function costForFamily(
  table: BoardCostTable,
  family: string,
  width?: number,
): FamilyEstimate | undefined {
  const own = table.families?.find((row) => row.family === family);
  if (own !== undefined && own.boards >= FAMILY_MIN_BOARDS) {
    return { planMinutes: own.median, promiseMinutes: own.mean, basis: "rodina" };
  }
  const depthBB = depthOfFamily(family);
  const model = table.widthModels?.find((row) => row.depthBB === depthBB);
  if (model !== undefined && width !== undefined && width > 0) {
    const median = Math.exp(model.intercept + model.slope * Math.log(width));
    const inside = width >= model.minWidth && width <= model.maxWidth;
    return {
      planMinutes: round1(median),
      promiseMinutes: round1(median * model.smear),
      basis: inside ? "šířka range" : "šířka range, mimo změřené",
    };
  }
  const row = costForDepth(table, depthBB);
  if (row === undefined) return undefined;
  return { planMinutes: row.planMinutes, promiseMinutes: row.promiseMinutes, basis: "hloubka" };
}

export function familyCostsFrom(solves: readonly BoardSolve[]): FamilyCost[] {
  const byFamily = new Map<string, number[]>();
  for (const solve of solves) {
    const bucket = byFamily.get(solve.family);
    if (bucket === undefined) byFamily.set(solve.family, [solve.minutes]);
    else bucket.push(solve.minutes);
  }
  return [...byFamily.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([family, minutes]) => {
      const sorted = [...minutes].sort((left, right) => left - right);
      return {
        family,
        depthBB: depthOfFamily(family),
        boards: sorted.length,
        median: round1(quantile(sorted, 0.5)),
        mean: round1(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
      };
    });
}

/** Desek na hloubku, pod které se model šířky nestaví: sklon by byl šum. */
const WIDTH_MODEL_MIN_BOARDS = 30;

/**
 * Nejmenší poměr nejširší a nejužší změřené range, ze kterého se sklon smí
 * odhadovat. Test na nulový rozptyl nestačí: čtyřicet desek téže šířky dá
 * v plovoucí čárce rozptyl kolem 1e-30 a z něj libovolný sklon. Dnešní
 * hloubky mají poměr 1,75 (50 bb) až 6,8 (40 bb).
 */
const WIDTH_MODEL_MIN_SPREAD = 1.5;

/**
 * Regrese `log(minuty)` na `log(šířka)` pro každou hloubku zvlášť.
 *
 * Zvlášť proto, že sklon na hloubce závisí (25 bb nula, 40 a 50 bb kolem 0,6)
 * a společný sklon by 25 bb zředilo k nule. Hloubka, kde všechny změřené desky
 * mají tutéž šířku, model nedostane - sklon by se z ní poznat nedal.
 */
export function fitWidthModels(
  solves: readonly (BoardSolve & { width: number })[],
): WidthModel[] {
  const byDepth = new Map<number, (BoardSolve & { width: number })[]>();
  for (const solve of solves) {
    if (!(solve.width > 0) || !(solve.minutes > 0)) continue;
    const bucket = byDepth.get(solve.depthBB);
    if (bucket === undefined) byDepth.set(solve.depthBB, [solve]);
    else bucket.push(solve);
  }
  const models: WidthModel[] = [];
  for (const [depthBB, rows] of [...byDepth.entries()].sort((left, right) => left[0] - right[0])) {
    if (rows.length < WIDTH_MODEL_MIN_BOARDS) continue;
    const widths = rows.map((row) => row.width);
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    if (maxWidth / minWidth < WIDTH_MODEL_MIN_SPREAD) continue;
    const xs = rows.map((row) => Math.log(row.width));
    const ys = rows.map((row) => Math.log(row.minutes));
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let at = 0; at < xs.length; at += 1) {
      sxy += (xs[at] - meanX) * (ys[at] - meanY);
      sxx += (xs[at] - meanX) ** 2;
      syy += (ys[at] - meanY) ** 2;
    }
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    const smear = xs.reduce((sum, x, at) => sum + Math.exp(ys[at] - (intercept + slope * x)), 0) / xs.length;
    models.push({
      depthBB,
      boards: rows.length,
      intercept: Math.round(intercept * 10000) / 10000,
      slope: Math.round(slope * 10000) / 10000,
      smear: Math.round(smear * 10000) / 10000,
      r2: syy === 0 ? 0 : Math.round(((sxy * sxy) / (sxx * syy)) * 100) / 100,
      minWidth,
      maxWidth,
    });
  }
  return models;
}

/** Kde leží parametry solveru všech dávek; rodina má range ve všech stejné. */
export const PARAMETERS_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";

/** Kombinací v range zápisu solveru: `AA:1,AKs:1,AKo:0.5` je 6 + 4 + 6. */
export function comboCount(range: string): number {
  let total = 0;
  for (const item of range.split(",")) {
    const [hand, weightText] = item.trim().split(":");
    if (hand === undefined || hand.length < 2) continue;
    const weight = weightText === undefined ? 1 : Number(weightText);
    if (!Number.isFinite(weight)) continue;
    const size = hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
    total += size * weight;
  }
  return total;
}

/** Šířka range z parametrů solveru: kombinací OOP plus IP, nebo `undefined`. */
export function rangeWidthOf(paramsText: string): number | undefined {
  const oop = /^set_range_oop (.+)$/m.exec(paramsText)?.[1];
  const ip = /^set_range_ip (.+)$/m.exec(paramsText)?.[1];
  if (oop === undefined || ip === undefined) return undefined;
  return Math.round(comboCount(oop.trim()) + comboCount(ip.trim()));
}

const PARAMS_FILE = /(MTT9_[A-Z0-9_]+?)_([2-9TJQKA]{3}[a-z]*)\.txt$/;

/**
 * Šířka range podle rodiny i podle desky, ze všech parametrů pod `root`.
 *
 * Přesolvená rodina má parametry dvakrát - staré range a nové - a platí
 * novější soubor: podle něj se solví teď.
 */
export function readRangeWidths(root = PARAMETERS_ROOT): {
  byFamily: Map<string, number>;
  byBoard: Map<string, number>;
} {
  const newest = new Map<string, { mtime: number; width: number }>();
  const newestFamily = new Map<string, { mtime: number; width: number }>();
  const stack = existsSync(root) ? [root] : [];
  while (stack.length > 0) {
    const directory = stack.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      const match = PARAMS_FILE.exec(entry.name);
      if (match === null) continue;
      const width = rangeWidthOf(readFileSync(path, "utf8"));
      if (width === undefined) continue;
      const mtime = statSync(path).mtimeMs;
      const key = `${match[1]}|${match[2]}`;
      if ((newest.get(key)?.mtime ?? -1) < mtime) newest.set(key, { mtime, width });
      if ((newestFamily.get(match[1])?.mtime ?? -1) < mtime) newestFamily.set(match[1], { mtime, width });
    }
  }
  return {
    byFamily: new Map([...newestFamily].map(([family, row]) => [family, row.width])),
    byBoard: new Map([...newest].map(([key, row]) => [key, row.width])),
  };
}
