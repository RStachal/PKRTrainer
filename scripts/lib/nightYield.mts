/**
 * Práh, od kterého noc ustoupí expanzi - čtený z runneru.
 *
 * ## Proč to má vlastní soubor
 *
 * Práh drží **tři** místa: runner rozkladu (rozhoduje), denní orchestrátor
 * (zapisuje do `tonight.json`, co noc udělá) a hlídač noci (hlásí to předem).
 * Komentář u orchestrátoru si od 29. 9. 2026 stěžuje, že musí sedět na runneru,
 * a tatáž dvojice si už jednou odporovala: zpráva počítala rodiny bez
 * checkpointu, runner desky, a `night.log:12646` hlásí ustoupení při „0 rodin".
 *
 * Projekt tohle řeší u žebříku (`nightEscalation`) tak, že literál vlastní
 * runner a ostatní ho **čtou**. Tady je to stejně.
 *
 * ## Proč je práh v minutách, ne v deskách
 *
 * Osm desek je podle hloubky 51 minut, nebo 5,3 hodiny: deska na 25 bb stojí
 * 6,4 min, na 50 bb kolem 40 (změřeno, `board-cost.generated.json`). Práh
 * v deskách tedy znamenal dvě různé věci podle toho, co bylo zrovna ve frontě -
 * a dva komentáře v jednom souboru si na týchž osmi deskách protiřečily, jednou
 * „půl hodiny", jednou „dvě hodiny".
 *
 * Třicet minut je ta hranice, kterou původní komentář mínil, jen vyjádřená
 * přímo. Nízká zůstává proto, že expanze od 14. 9. 2026 **zbytek okna vrací**
 * rozkladu, jakmile jí dojde fronta - ustoupit kvůli půlhodině práce už tedy
 * neznamená prostát deset hodin.
 */
import { readFileSync } from "node:fs";

const RUNNER = "Agents/solver-input/decomposition/run_night_decomposition.py";

/** Záloha, když se literál nepřečte. Shodná s runnerem ze stejného důvodu jako práh sám. */
const FALLBACK_MINUTES = 30;
const FALLBACK_BOARDS = 8;

function literal(source: string, name: string, fallback: number): number {
  const found = new RegExp(`^${name} = (\\d+)\\s*$`, "m").exec(source);
  return found === null ? fallback : Number(found[1]);
}

export interface NightYieldThresholds {
  minutes: number;
  boards: number;
  /** Přečetly se oba literály z runneru, nebo se vzaly zálohy? */
  fromRunner: boolean;
}

export function yieldThresholds(path = RUNNER): NightYieldThresholds {
  try {
    const source = readFileSync(path, "utf8");
    const minutes = literal(source, "YIELD_MIN_MINUTES", Number.NaN);
    const boards = literal(source, "YIELD_MIN_BOARDS", Number.NaN);
    if (Number.isNaN(minutes) || Number.isNaN(boards)) {
      return { minutes: FALLBACK_MINUTES, boards: FALLBACK_BOARDS, fromRunner: false };
    }
    return { minutes, boards, fromRunner: true };
  } catch {
    return { minutes: FALLBACK_MINUTES, boards: FALLBACK_BOARDS, fromRunner: false };
  }
}

/**
 * Ustoupí noc expanzi?
 *
 * `minutes` je `undefined`, když některá hloubka ve frontě změřenou cenu nemá;
 * tehdy se rozhoduje po deskách jako do 7. 10. 2026. Je to tatáž záloha, jakou
 * má runner, a schválně **ne** nula minut: tiše přičíst nulu by znamenalo
 * tvrdit, že ta deska je zdarma, a práh by mlčel přesně tam, kde má mluvit.
 */
export function shouldYield(work: {
  minutes?: number;
  boards: number;
  priority: string;
  thresholds?: NightYieldThresholds;
}): boolean {
  if (work.priority !== "NEW_FAMILIES") return false;
  const limits = work.thresholds ?? yieldThresholds();
  return work.minutes === undefined
    ? work.boards >= limits.boards
    : work.minutes >= limits.minutes;
}
