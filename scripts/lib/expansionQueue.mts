/**
 * Fronta noční expanze, čtená tak, jak ji čte runner.
 *
 * ## Proč jeden modul
 *
 * Do 15. 10. 2026 si frontu četlo sedm míst a každé po svém: runner, hlídač
 * noci, ranní cyklus, orchestrátor a tři zapisovače. Počítaly **soubory**, ne
 * desky - a fronta nesla 192 bajtově shodných kopií z 5. 10. Hlídač proto
 * hlásil 101 desek tam, kde jich bylo 99, a „k opakování 2" u rodiny s jednou
 * spadlou deskou; runner by tutéž spadlou desku zkusil v jedné noci dvakrát; a
 * rozšíření sedaček nabízelo „13 rodin k založení" na hloubce, kde všech třináct
 * leželo ve frontě.
 *
 * ## Co platí
 *
 * Tatáž pravidla jako `pending_boards()` v `run_night_expansion.py`:
 *
 * - jen soubory `.txt` přímo ve složce, seřazené podle jména;
 * - rodina a deska ze jména tímtéž vzorem (test ho čte z runneru);
 * - deska je jedna, i když ji nese víc souborů - platí první podle jména;
 * - hotová je deska s neprázdným checkpointem; spadlá (se značkou `.failed`) je
 *   k opakování, dokud jí zbývá stupeň žebříku, a pak vyčerpaná.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { escalationSteps, failureLevel } from "./nightEscalation.mts";
import { CHECKPOINT_BASE, EXPANSION_PARAMS_DIR } from "./srpMonolithParams.mts";

/** Kolik minut má noční okno (21:00-07:00 minus rezerva na konci). */
export const NIGHT_WINDOW_MINUTES = 587;

/**
 * Pod kolik nocí práce fronta nesmí klesnout.
 *
 * Do 5. 10. 2026 se na výhled nikdo nedíval: 2. 10. zbývalo 151 desek, noci
 * 2.-5. 10. udělaly 70, 64 a 17, takže 4. 10. v 01:13 byla fronta na nule a
 * 5. 10. v 19:07 neměla noc na čem jet. Dvě noci proto, že nastagovat další
 * dávku stojí minuty, ale vědět se o tom musí den dopředu, ne v devatenáct
 * hodin. Hlídač podle toho barví a orchestrátor podle toho frontu doplní.
 */
export const RUNWAY_NIGHTS_MIN = 2;

/** Rodina a deska ze jména bez čísla a přípony; týž vzor jako v runneru. */
export const QUEUE_STEM_PATTERN = /^(MTT9_\d+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_([^_]+)$/;

export interface QueueFile {
  name: string;
  /** Číslo před jménem; určuje pořadí ve frontě. */
  index: number;
  familyId: string;
  boardId: string;
}

/** `0035_MTT9_40BB_UTG_BTN_SRP_742r.txt` na rodinu, desku a číslo. */
export function parseQueueFileName(name: string): QueueFile | undefined {
  if (!name.endsWith(".txt")) return undefined;
  const prefix = /^(\d+)_/.exec(name);
  const match = QUEUE_STEM_PATTERN.exec(name.slice(0, -4).replace(/^\d+_/, ""));
  if (match === null) return undefined;
  return {
    name,
    index: prefix === null ? 0 : Number(prefix[1]),
    familyId: match[1],
    boardId: match[2],
  };
}

/**
 * - `SOLVED`: checkpoint existuje a není prázdný.
 * - `FRESH`: nespadla; runner ji nabídne mezi prvními.
 * - `RETRY`: spadla a zbývá jí stupeň žebříku; runner ji nabídne po čerstvých.
 * - `EXHAUSTED`: žebřík vyčerpala; runner ji už nenabídne.
 */
export type QueueBoardState = "SOLVED" | "FRESH" | "RETRY" | "EXHAUSTED";

export interface QueuedBoard extends QueueFile {
  /** Cesta checkpointu, pod kterou ho runner hledá. */
  checkpoint: string;
  state: QueueBoardState;
  /** Stupeň ze značky `.failed`; 0 u desky, která nespadla. */
  level: number;
}

export interface ExpansionQueue {
  /** Desky v pořadí jmen souborů, každá jednou. */
  boards: QueuedBoard[];
  /** Soubory přeskočené, protože jejich desku nese soubor s nižším jménem. */
  duplicateFiles: number;
  /** Nejvyšší číslo souboru ve frontě; nový zápis má pokračovat za ním. */
  highestIndex: number;
}

/** Co se o desce ví z disku; odděleno, aby šlo jádro testovat bez souborů. */
export interface CheckpointProbe {
  solved: (checkpoint: string) => boolean;
  /** Stupeň ze značky `.failed`, nebo 0, když značka není. */
  failedLevel: (checkpoint: string) => number;
}

export function buildExpansionQueue(
  names: readonly string[],
  probe: CheckpointProbe,
  steps: number,
  checkpointBase: string = CHECKPOINT_BASE,
): ExpansionQueue {
  const boards: QueuedBoard[] = [];
  const seen = new Set<string>();
  let duplicateFiles = 0;
  let highestIndex = 0;
  for (const name of [...names].sort()) {
    const file = parseQueueFileName(name);
    if (file === undefined) continue;
    highestIndex = Math.max(highestIndex, file.index);
    const checkpoint = join(
      checkpointBase, file.familyId, "raw", `pkrtrainer_${file.familyId}_${file.boardId}.json`,
    );
    if (seen.has(checkpoint)) {
      duplicateFiles += 1;
      continue;
    }
    seen.add(checkpoint);
    const solved = probe.solved(checkpoint);
    const level = solved ? 0 : probe.failedLevel(checkpoint);
    const state: QueueBoardState = solved
      ? "SOLVED"
      : level === 0 ? "FRESH" : level < steps ? "RETRY" : "EXHAUSTED";
    boards.push({ ...file, checkpoint, state, level });
  }
  return { boards, duplicateFiles, highestIndex };
}

const diskProbe: CheckpointProbe = {
  solved: (checkpoint) => existsSync(checkpoint) && statSync(checkpoint).size > 0,
  failedLevel: (checkpoint) => (
    existsSync(`${checkpoint}.failed`) ? failureLevel(`${checkpoint}.failed`) : 0
  ),
};

/** Fronta z disku. Složka, která neexistuje, je prázdná fronta. */
export function readExpansionQueue(options: {
  dir?: string;
  checkpointBase?: string;
  steps?: number;
} = {}): ExpansionQueue {
  const dir = options.dir ?? EXPANSION_PARAMS_DIR;
  const names = existsSync(dir) ? readdirSync(dir) : [];
  return buildExpansionQueue(
    names, diskProbe, options.steps ?? escalationSteps(), options.checkpointBase ?? CHECKPOINT_BASE,
  );
}

/** Rodiny, které ve frontě mají aspoň jednu desku - hotovou i nehotovou. */
export function queuedFamilies(queue: ExpansionQueue): Set<string> {
  return new Set(queue.boards.map((board) => board.familyId));
}

/**
 * Desky v pořadí, v jakém je runner nabídne: čerstvé podle jména, opakované
 * pokusy až po všech čerstvých (`pending_boards()`; rozhodnutí vlastníka 3a).
 */
export function runnerOrder(queue: ExpansionQueue): QueuedBoard[] {
  return [
    ...queue.boards.filter((board) => board.state === "FRESH"),
    ...queue.boards.filter((board) => board.state === "RETRY"),
  ];
}

/**
 * Kolik práce runner ve frontě ještě má: desky, které nabídne, a jejich minuty.
 *
 * Deska bez ceny (`minutesFor` vrátí `undefined`) přidá desku, ale **nula
 * minut**. Je to schválně na tuhle stranu: výhled vyjde kratší, hlídač zčervená
 * dřív a orchestrátor doplní dřív. Opačná volba by ohlásila zásobu, která není.
 */
export function queueRunway(
  queue: ExpansionQueue,
  minutesFor: (familyId: string) => number | undefined,
): { boards: number; minutes: number } {
  let minutes = 0;
  const offered = runnerOrder(queue);
  for (const board of offered) minutes += minutesFor(board.familyId) ?? 0;
  return { boards: offered.length, minutes };
}

/**
 * Rodiny, které noc dokončí.
 *
 * **Popořadě, jako runner** - nic se nepřeskakuje. Do 15. 10. 2026 je hlídač
 * skládal do noci jako do batohu: rodina, která se nevešla, se přeskočila a
 * zkusila se další. Sliboval tak rodinu, jejíž jediná deska byla opakovaný
 * pokus na konci fronty, a po doplnění fronty rodinu za sedmdesáti deskami.
 *
 * Rodina s vyčerpanou deskou se neslibuje: runner tu desku už nenabídne.
 * Deska bez ceny (`minutesFor` vrátí `undefined`) slib zastaví - runner na ní
 * stráví neznámý čas a všechno za ní je nejisté. `finishedAt` je minuta, kdy
 * doběhne poslední slíbená rodina.
 */
export function familiesFinishingWithin(
  queue: ExpansionQueue,
  minutesFor: (familyId: string) => number | undefined,
  windowMinutes: number,
): { families: string[]; finishedAt: number } {
  const order = runnerOrder(queue);
  const left = new Map<string, number>();
  for (const board of order) left.set(board.familyId, (left.get(board.familyId) ?? 0) + 1);
  const stuck = new Set(queue.boards
    .filter((board) => board.state === "EXHAUSTED")
    .map((board) => board.familyId));
  let elapsed = 0;
  let finishedAt = 0;
  const families: string[] = [];
  for (const board of order) {
    const minutes = minutesFor(board.familyId);
    if (minutes === undefined || elapsed + minutes > windowMinutes) break;
    elapsed += minutes;
    const remaining = (left.get(board.familyId) ?? 0) - 1;
    left.set(board.familyId, remaining);
    if (remaining === 0 && !stuck.has(board.familyId)) {
      families.push(board.familyId);
      finishedAt = elapsed;
    }
  }
  return { families, finishedAt };
}
