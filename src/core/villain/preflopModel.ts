import { combosInClass, strengthOrder } from "../preflopEquity";
import { ALL_HAND_CLASSES } from "../poker";
import type { HandLabel } from "../types";
import { ARCHETYPES, type StatBand, type VillainArchetype } from "./archetypes";

/**
 * Jak typ hráče posouvá preflopové range proti chartu
 * (Agents/plan-gto-real-2026-11.md, 4.3 a 4.5).
 *
 * Chart je rovnováha a žralok podle plánu hraje blízko ní, takže je měřítkem:
 * poměr statistiky typu k žralokovi říká, o kolik je jeho range širší nebo užší.
 * Čísla jsou ze schválené tabulky typů (R2), žádná nová. Fold na 3-bet je nejbližší
 * statistika k tomu, jak hráč reaguje na velkou agresi, proto určuje i dorovnání
 * shove; PFR určuje, jak široko sám zvyšuje a shovuje.
 *
 * Statistiky s původem odhad se berou napůl (4.5, bezpečná exploitace): exploit
 * stojí na modelu, který může přestřelit, a hráč se nemá učit hrát proti karikatuře.
 */

export interface PreflopVillainModel {
  /** Násobek šířky range, kterým dorovná shove. */
  readonly callWidth: number;
  /** Násobek šířky range, kterým sám zvyšuje a shovuje. */
  readonly raiseWidth: number;
}

const middle = (band: StatBand): number => (band.min + band.max) / 2;

function safeFactor(factor: number, basis: "MEASURED" | "INTERPOLATED"): number {
  return basis === "MEASURED" ? factor : 1 + (factor - 1) / 2;
}

export function preflopVillainModel(archetype: VillainArchetype): PreflopVillainModel {
  const { stats, basis } = ARCHETYPES[archetype];
  const baseline = ARCHETYPES.SHARK.stats;
  return {
    callWidth: safeFactor(
      (100 - middle(stats.foldToThreeBet)) / (100 - middle(baseline.foldToThreeBet)),
      basis,
    ),
    raiseWidth: safeFactor(middle(stats.pfr) / middle(baseline.pfr), basis),
  };
}

export function comboCount(classes: readonly HandLabel[]): number {
  return classes.reduce((sum, hand) => sum + combosInClass(hand), 0);
}

/**
 * Uspořádaný přesun po celých třídách: range o `targetCombos` kombinacích.
 *
 * Užší range přijde o nejslabší třídy, širší přibere nejsilnější z `pool`, které
 * v něm nejsou. Mění se jen to, co cíl vyžaduje, takže struktura chartu zůstává.
 */
export function rangeOfCombos(
  range: readonly HandLabel[],
  targetCombos: number,
  pool: readonly HandLabel[] = ALL_HAND_CLASSES,
): HandLabel[] {
  const current = comboCount(range);
  const members = new Set(range);
  if (targetCombos < current) {
    const kept: HandLabel[] = [];
    let combos = 0;
    for (const hand of strengthOrder()) {
      if (!members.has(hand)) continue;
      if (combos >= targetCombos) break;
      kept.push(hand);
      combos += combosInClass(hand);
    }
    return kept;
  }
  const widened = [...range];
  const allowed = new Set(pool);
  let combos = current;
  for (const hand of strengthOrder()) {
    if (combos >= targetCombos) break;
    if (members.has(hand) || !allowed.has(hand)) continue;
    widened.push(hand);
    combos += combosInClass(hand);
  }
  return widened;
}

/**
 * Range `factor`krát širší. Při faktoru 1 vrací tentýž objekt: volající tak pozná,
 * že se proti chartu nic nezměnilo, a může počítat přesně jako GTO.
 */
export function resizedRange(
  range: readonly HandLabel[],
  factor: number,
  pool: readonly HandLabel[] = ALL_HAND_CLASSES,
): readonly HandLabel[] {
  if (factor === 1) return range;
  return rangeOfCombos(range, comboCount(range) * factor, pool);
}
