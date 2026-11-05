/**
 * Vyhodnocení pokusu 12 vs. 16 vláken monolitu (od 20. 10. 2026, deník 322).
 *
 * Noční expanze s `--thread-trial=16` dává polovině desek šestnáct vláken a
 * druhé dvanáct, deterministicky podle rodiny a desky (`trial_threads`
 * v `run_night_expansion.py`), a obojí píše do řádku `solving`.
 *
 * ## Proč párově po rodinách
 *
 * Cena desky se mezi rodinami liší víc než dvakrát (šířka range, `boardCost.mts`)
 * a mezi deskami jedné rodiny zhruba o polovinu. Porovnat prostý medián všech
 * šestnáctek s mediánem všech dvanáctek by do rozdílu slilo, které rodiny noc
 * zrovna solvila. Proto poměr uvnitř rodiny - medián šestnáctek ku mediánu
 * dvanáctek - a teprve ty se průměrují (geometricky, je to poměr).
 *
 * Interval je percentilový bootstrap přes rodiny se zafixovaným semínkem, ať
 * dvě čtení téhož logu řeknou totéž.
 */
import type { BoardSolve } from "./boardCost.mts";

export const TRIAL_CONTROL_THREADS = 12;
/** Rodin s deskami v obou skupinách, pod které se nerozhoduje. */
export const TRIAL_MIN_FAMILIES = 8;

export interface ThreadTrialResult {
  /** Rodiny s aspoň jednou deskou v každé skupině. */
  families: number;
  boardsControl: number;
  boardsTrial: number;
  /** Geometrický průměr poměrů trial / kontrola; pod 1 je trial rychlejší. */
  ratio?: number;
  low?: number;
  high?: number;
  verdict: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Malý deterministický generátor (mulberry32); stačí na převzorkování. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const geometricMean = (values: readonly number[]): number => (
  Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
);

export function threadTrialResult(
  solves: readonly BoardSolve[],
  trial = 16,
  resamples = 2000,
): ThreadTrialResult {
  // Jen čerstvé desky: opakovaný pokus má jiný strop i přesnost.
  const inTrial = solves.filter((solve) => solve.level === 0 && solve.threads !== undefined && solve.minutes > 0);
  const byFamily = new Map<string, { control: number[]; trial: number[] }>();
  for (const solve of inTrial) {
    const groups = byFamily.get(solve.family) ?? { control: [], trial: [] };
    if (solve.threads === trial) groups.trial.push(solve.minutes);
    else if (solve.threads === TRIAL_CONTROL_THREADS) groups.control.push(solve.minutes);
    byFamily.set(solve.family, groups);
  }
  const boardsControl = inTrial.filter((solve) => solve.threads === TRIAL_CONTROL_THREADS).length;
  const boardsTrial = inTrial.filter((solve) => solve.threads === trial).length;
  const ratios = [...byFamily.values()]
    .filter((groups) => groups.control.length > 0 && groups.trial.length > 0)
    .map((groups) => median(groups.trial) / median(groups.control));

  if (ratios.length < TRIAL_MIN_FAMILIES) {
    return {
      families: ratios.length,
      boardsControl,
      boardsTrial,
      ...(ratios.length > 0 ? { ratio: geometricMean(ratios) } : {}),
      verdict: `ještě měřit: rodin v obou skupinách ${ratios.length} z potřebných ${TRIAL_MIN_FAMILIES}`,
    };
  }

  const random = seeded(20261020);
  const means: number[] = [];
  for (let round = 0; round < resamples; round += 1) {
    const sample = Array.from({ length: ratios.length }, () => ratios[Math.floor(random() * ratios.length)]);
    means.push(geometricMean(sample));
  }
  means.sort((left, right) => left - right);
  const low = means[Math.floor(0.025 * resamples)];
  const high = means[Math.ceil(0.975 * resamples) - 1];
  const ratio = geometricMean(ratios);

  let verdict: string;
  if (high < 0.95) verdict = `${trial} vláken je rychlejší: přepnout staging na ${trial} a pokus ukončit`;
  else if (low > 1) verdict = `${trial} vláken je pomalejší: zůstat na ${TRIAL_CONTROL_THREADS} a pokus ukončit`;
  else if (low >= 0.95 && high <= 1.05) verdict = `rozdíl pod 5 %: zůstat na ${TRIAL_CONTROL_THREADS} a pokus ukončit`;
  else verdict = "ještě měřit: interval je pořád široký";
  return { families: ratios.length, boardsControl, boardsTrial, ratio, low, high, verdict };
}

export function formatThreadTrial(result: ThreadTrialResult, trial = 16): string {
  const head = `pokus o vlákna: ${result.boardsTrial} desek na ${trial}, ${result.boardsControl}`
    + ` na ${TRIAL_CONTROL_THREADS}, rodin v obou skupinách ${result.families}`;
  const ratio = result.ratio === undefined
    ? ""
    : `; poměr ${trial}/${TRIAL_CONTROL_THREADS} ${result.ratio.toFixed(2)}`
      + (result.low === undefined || result.high === undefined
        ? ""
        : ` (95 % ${result.low.toFixed(2)}-${result.high.toFixed(2)})`);
  return `${head}${ratio} - ${result.verdict}`;
}
