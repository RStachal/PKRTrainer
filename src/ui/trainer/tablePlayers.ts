import type { PostflopTrainingSpot } from "../../core/postflopTrainingSpot";
import { hashStr } from "../../core/rng";
import { POSITION_ORDER, type ActionKey, type Position, type Spot } from "../../core/types";
import type { TrainingMode, VillainArchetype } from "../../core/villain/archetypes";
import { castTable, type TableCastOptions } from "../../core/villain/tableCast";
import type { TablePlayers } from "../kit/pokerTable";
import { deriveSeats } from "../tableModel";

/**
 * Kdo sedí u stolu obrazovky tréninku (Agents/plan-gto-real-2026-11.md, 3.1).
 *
 * Režim a soupeř ve hře jdou z nastavení relace; obsazení živého stolu se
 * míchá podle spotu, takže tentýž spot má vždy tentýž stůl.
 */
export interface PlayerSettings {
  mode: TrainingMode;
  /** Trénink proti typu: soupeř ve hře je vždy tenhle typ. */
  focus?: VillainArchetype;
}

export const GTO_PLAYERS: PlayerSettings = { mode: "GTO" };

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

function cast(
  seed: number,
  order: readonly Position[],
  hero: Position,
  settings: PlayerSettings,
  focusSeat: Position | undefined,
): TablePlayers["cast"] {
  if (settings.mode !== "REAL") return {};
  const options: TableCastOptions = {
    ...(settings.focus === undefined ? {} : { focus: settings.focus }),
    ...(focusSeat === undefined ? {} : { focusSeat }),
  };
  return castTable(seed, order, hero, options);
}

export function preflopTablePlayers(
  spot: Spot,
  settings: PlayerSettings,
  order: readonly Position[] = POSITION_ORDER,
): TablePlayers {
  const focusSeat = preflopFocusSeat(spot, order);
  return {
    mode: settings.mode,
    cast: cast(hashStr(spot.id), order, spot.heroPos, settings, focusSeat),
    ...(focusSeat === undefined ? {} : { focusSeat }),
  };
}

export function postflopTablePlayers(
  spot: PostflopTrainingSpot,
  settings: PlayerSettings,
  order: readonly Position[] = POSITION_ORDER,
): TablePlayers {
  return {
    mode: settings.mode,
    cast: cast(spot.seed >>> 0, order, spot.heroPosition, settings, spot.villainPosition),
    focusSeat: spot.villainPosition,
  };
}
