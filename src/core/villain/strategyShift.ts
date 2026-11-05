/**
 * Uspořádaný přesun: soupeř podle typu hráče jako nejmenší změna GTO strategie
 * (Agents/plan-gto-real-2026-11.md, 4.3).
 *
 * V uzlu soupeře má každá třída ruky GTO frekvenci, se kterou pokračuje (call
 * nebo raise), a typ hráče říká, jak často má soupeř pokračovat celkem. Přesun
 * mění jen tolik, kolik ten souhrn vyžaduje, a v pořadí síly: kdo folduje víc,
 * přestane pokračovat s nejslabšími rukama; kdo callne víc, začne pokračovat
 * s nejsilnějšími z těch, které foldoval.
 *
 * Zobecňuje `strongestSlice` z `preflopEquity.ts`: výřez nejsilnějšího podílu
 * range je přesun z „pokračuje vše“ na cílový podíl.
 */

export interface ContinueRow {
  /** Třída ruky (nebo kombinace) - jen klíč, výpočet ho nečte. */
  hand: string;
  /** Váha třídy, obvykle počet kombinací. */
  weight: number;
  /** Jak často třída pokračuje, 0 až 1. */
  continueFrequency: number;
}

/**
 * Posune pokračování tak, aby souhrn vážený vahami dal `targetShare` (0 až 1).
 *
 * `strongestFirst` je pořadí klíčů od nejsilnější ruky; řádky, které v něm
 * chybí, se berou jako nejslabší v původním pořadí. Vrací nové řádky ve
 * stejném pořadí jako vstup.
 */
export function shiftContinueShare(
  rows: readonly ContinueRow[],
  strongestFirst: readonly string[],
  targetShare: number,
): ContinueRow[] {
  const result = rows.map((row) => ({ ...row, continueFrequency: clamp01(row.continueFrequency) }));
  const total = result.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (total <= 0) return result;
  const current = result.reduce((sum, row) => sum + Math.max(0, row.weight) * row.continueFrequency, 0);
  const target = clamp01(targetShare) * total;

  const rank = new Map(strongestFirst.map((hand, index) => [hand, index]));
  const order = result
    .map((row, index) => ({ row, index, strength: rank.get(row.hand) ?? strongestFirst.length + index }))
    .sort((left, right) => left.strength - right.strength);

  if (target < current) {
    // Ubrat od nejslabších.
    let remove = current - target;
    for (let cursor = order.length - 1; cursor >= 0 && remove > 1e-12; cursor -= 1) {
      const row = order[cursor].row;
      const weight = Math.max(0, row.weight);
      if (weight === 0) continue;
      const take = Math.min(remove, weight * row.continueFrequency);
      row.continueFrequency -= take / weight;
      remove -= take;
    }
  } else if (target > current) {
    // Přidat od nejsilnějších.
    let add = target - current;
    for (let cursor = 0; cursor < order.length && add > 1e-12; cursor += 1) {
      const row = order[cursor].row;
      const weight = Math.max(0, row.weight);
      if (weight === 0) continue;
      const give = Math.min(add, weight * (1 - row.continueFrequency));
      row.continueFrequency += give / weight;
      add -= give;
    }
  }
  for (const row of result) row.continueFrequency = clamp01(row.continueFrequency);
  return result;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
