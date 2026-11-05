import { mulberry32 } from "../rng";
import type { Position } from "../types";
import type { VillainArchetype } from "./archetypes";

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
