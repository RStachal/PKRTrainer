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

import { readFileSync } from "node:fs";

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
const DONE = /^\[\d{2}:\d{2}:\d{2}\]\s+hotovo za ([\d.]+) min/;
const DEPTH = /_(\d+)BB_/;

export interface BoardSolve {
  family: string;
  board: string;
  depthBB: number;
  minutes: number;
  /** Stupeň žebříku, na kterém deska doběhla; 0 je první pokus. */
  level: number;
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
  let open: { family: string; board: string; level: number } | undefined;
  for (const line of lines) {
    const start = SOLVING.exec(line);
    if (start !== null) {
      open = {
        family: start[1].trim(),
        board: start[2].trim(),
        level: Number(SOLVING_LEVEL.exec(line)?.[1] ?? 0),
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
