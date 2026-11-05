import { hashStr } from "../../core/rng";
import { POSITION_ORDER, type ActionKey, type Position, type Spot } from "../../core/types";
import { castForPlayers, type PlayerSettings, type TablePlayers } from "../../core/villain/tableCast";
import { deriveSeats } from "../tableModel";

/**
 * Kdo sedí u preflopového stolu obrazovky tréninku (Agents/plan-gto-real-2026-11.md,
 * 3.1). Soupeře ve hře určuje rozmístění akcí z `tableModel.ts`, proto je to tady;
 * obsazení živého stolu se míchá podle spotu, takže tentýž spot má vždy tentýž stůl.
 * Postflopový stůl potřebuje jen protihráče spotu, ten je v `core/villain/tableCast.ts`.
 */

/** Akce, které nikoho nedělají soupeřem ve hře: dorovnání a limp za agresorem. */
const PASSIVE: ReadonlySet<ActionKey> = new Set<ActionKey>(["CALL", "LIMP", "OVERLIMP", "FOLD"]);

/**
 * Sedadlo, proti kterému se hráč na preflopu rozhoduje: jmenovaný soupeř spotu,
 * jinak poslední agresor, a když nikdo nezvyšoval, poslední limper. Bez akce
 * před hráčem (první vstup do potu) soupeř ve hře není.
 */
export function preflopFocusSeat(spot: Spot, order: readonly Position[] = POSITION_ORDER): Position | undefined {
  if (spot.tableState.vsSeat !== undefined) return spot.tableState.vsSeat;
  const acted = deriveSeats(spot, order).filter((seat) => !seat.isHero && seat.badge !== null);
  const aggressors = acted.filter((seat) => seat.badge !== null && !PASSIVE.has(seat.badge));
  const limpers = acted.filter((seat) => seat.badge === "LIMP" || seat.badge === "OVERLIMP");
  const pool = aggressors.length > 0 ? aggressors : limpers;
  return pool.length > 0 ? pool[pool.length - 1].position : undefined;
}

export function preflopTablePlayers(
  spot: Spot,
  settings: PlayerSettings,
  order: readonly Position[] = POSITION_ORDER,
): TablePlayers {
  const focusSeat = preflopFocusSeat(spot, order);
  return {
    mode: settings.mode,
    cast: castForPlayers(hashStr(spot.id), order, spot.heroPos, settings, focusSeat),
    ...(focusSeat === undefined ? {} : { focusSeat }),
  };
}
