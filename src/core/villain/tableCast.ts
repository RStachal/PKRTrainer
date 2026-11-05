import { mulberry32 } from "../rng";
import { POSITION_ORDER, type Position } from "../types";
import type { TrainingMode, VillainArchetype, VillainFields } from "./archetypes";

/**
 * Kdo sedí u stolu v režimu REAL (Agents/plan-gto-real-2026-11.md, 3.1).
 *
 * Živý stůl je mix typů, který majitel schválil (R3): na devět míst jeden
 * žralok, dva orli, dva kameny, jedna kostka a dvě velryby, na šest míst od
 * každého jeden. Míchá se podle seedu spotu, takže tentýž spot má vždy
 * tentýž stůl a dva spoty po sobě obvykle jiný.
 *
 * Trénink proti typu jen přepíše soupeře ve hře - toho, proti komu se hráč
 * rozhoduje. Ostatní sedadla zůstávají živým stolem, protože stůl samých
 * velryb by nebyl stůl, ale karikatura.
 */

export const LIVE_TABLE_NINE: readonly VillainArchetype[] = [
  "SHARK", "EAGLE", "EAGLE", "ROCK", "ROCK", "DICE", "WHALE", "WHALE",
];

export const LIVE_TABLE_SIX: readonly VillainArchetype[] = ["SHARK", "EAGLE", "ROCK", "DICE", "WHALE"];

export interface TableCastOptions {
  /** Trénink proti typu: soupeř ve hře je vždy tenhle typ. */
  focus?: VillainArchetype;
  /** Sedadlo soupeře ve hře (otevírající, sázející); bez něj se focus nepoužije. */
  focusSeat?: Position;
}

/** Typ hráče na každém sedadle kromě hráčova. */
export type TableCast = Partial<Record<Position, VillainArchetype>>;

export function castTable(
  seed: number,
  seats: readonly Position[],
  heroSeat: Position,
  options: TableCastOptions = {},
): TableCast {
  const others = seats.filter((seat) => seat !== heroSeat);
  const mix = [...(others.length <= LIVE_TABLE_SIX.length ? LIVE_TABLE_SIX : LIVE_TABLE_NINE)];
  // Fisher-Yates nad seedovaným generátorem: stejný seed, stejný stůl.
  const random = mulberry32(seed >>> 0);
  for (let index = mix.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [mix[index], mix[swap]] = [mix[swap], mix[index]];
  }
  const cast: TableCast = {};
  others.forEach((seat, index) => {
    cast[seat] = mix[index % mix.length];
  });
  if (options.focus !== undefined && options.focusSeat !== undefined && options.focusSeat !== heroSeat) {
    cast[options.focusSeat] = options.focus;
  }
  return cast;
}

/** Režim a soupeř ve hře z nastavení relace. */
export interface PlayerSettings {
  mode: TrainingMode;
  /** Trénink proti typu: soupeř ve hře je vždy tenhle typ. */
  focus?: VillainArchetype;
}

export const GTO_PLAYERS: PlayerSettings = { mode: "GTO" };

export function playerSettings(
  filters: { trainingMode?: TrainingMode; villainFocus?: VillainArchetype } | null | undefined,
): PlayerSettings {
  return {
    mode: filters?.trainingMode ?? "GTO",
    ...(filters?.villainFocus === undefined ? {} : { focus: filters.villainFocus }),
  };
}

/**
 * Kdo sedí u stolu spotu. V režimu GTO má každé sedadlo žeton s pozicí, v REAL
 * kresbu typu hráče z obsazení.
 */
export interface TablePlayers {
  mode: TrainingMode;
  /** Typ hráče na sedadle; v GTO se nečte. */
  cast: TableCast;
  /** Soupeř ve hře, proti kterému se hráč rozhoduje - dostane bílý lem. */
  focusSeat?: Position;
}

export function castForPlayers(
  seed: number,
  seats: readonly Position[],
  heroSeat: Position,
  settings: PlayerSettings,
  focusSeat: Position | undefined,
): TableCast {
  if (settings.mode !== "REAL") return {};
  return castTable(seed, seats, heroSeat, {
    ...(settings.focus === undefined ? {} : { focus: settings.focus }),
    ...(focusSeat === undefined ? {} : { focusSeat }),
  });
}

/**
 * Stůl postflopového spotu. Seed je stejný na všech ulicích linky, takže hráči
 * mezi ulicemi nemění typ; soupeř ve hře je protihráč spotu.
 */
export function postflopTablePlayers(
  spot: { seed: number; heroPosition: Position; villainPosition: Position },
  settings: PlayerSettings,
  order: readonly Position[] = POSITION_ORDER,
): TablePlayers {
  return {
    mode: settings.mode,
    cast: castForPlayers(spot.seed >>> 0, order, spot.heroPosition, settings, spot.villainPosition),
    focusSeat: spot.villainPosition,
  };
}

/** Pole o soupeři k odpovědi: zapíše se to, co hráč u stolu viděl. */
export function villainFields(players: TablePlayers): VillainFields {
  if (players.mode !== "REAL") return {};
  const villainArchetype = players.focusSeat === undefined ? undefined : players.cast[players.focusSeat];
  return { trainingMode: "REAL", ...(villainArchetype === undefined ? {} : { villainArchetype }) };
}
