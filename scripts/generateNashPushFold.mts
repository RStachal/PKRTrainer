import { writeFileSync } from "node:fs";

import { NASH_ANTE_TOTAL, NASH_STACKS, nashKey } from "../src/core/preflop/nashTable";
import { solvePushFold } from "../src/core/preflop/nashPushFold";
import { ALL_HAND_CLASSES } from "../src/core/poker";
import { loadPreflopEquity } from "../src/core/preflopEquity";
import { POSITION_ORDER, type AnteMode, type HandLabel, type Position } from "../src/core/types";

/**
 * Tabulka Nashovy rovnováhy pro trenažér (plán 7.1).
 *
 *   npm run mtt:nash-table
 *
 * Řádek má znak na každou třídu z `ALL_HAND_CLASSES`: 0 až 9 jsou desetiny frekvence, A je
 * vždy. Hodnoty rukou se z range dopočítávají za běhu, tak je soubor malý.
 */

const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const encode = (frequency: Readonly<Record<HandLabel, number>>): string => HANDS.map((hand) => {
  const tenth = Math.round(frequency[hand] * 10);
  return tenth === 10 ? "A" : String(tenth);
}).join("");

if (!(await loadPreflopEquity())) throw new Error("equity se nenačetla");

const rows: [string, string][] = [];
for (const ante of ["ON", "OFF"] as AnteMode[]) {
  for (const stack of NASH_STACKS) {
    const seats = solvePushFold({ seats: POSITION_ORDER, stackBB: stack, anteTotalBB: NASH_ANTE_TOTAL[ante] });
    if (seats === undefined) throw new Error("výpočet bez equity");
    const worst = Math.max(...seats.map((seat) => seat.exploitability));
    if (worst > 0.002) throw new Error(`ante ${ante}, ${stack} BB: exploitability ${worst}`);
    for (const seat of seats) {
      rows.push([nashKey(ante, stack, seat.seat), encode(seat.jam)]);
      for (const [caller, call] of Object.entries(seat.calls)) {
        rows.push([nashKey(ante, stack, seat.seat, caller as Position), encode(call!.frequency)]);
      }
    }
    console.log(`ante ${ante}, ${stack} BB: exploitability ${worst.toFixed(5)} BB`);
  }
}

const body = rows.map(([key, row]) => `  ${JSON.stringify(key)}: "${row}",`).join("\n");
const source = `// Generováno: npm run mtt:nash-table. Neupravovat ručně.
export const NASH_PUSH_FOLD: Readonly<Record<string, string>> = {
${body}
};
`;
writeFileSync("src/data/ranges/nashPushFold.generated.ts", source, "utf8");
console.log(`zapsáno: ${rows.length} řádků, ${(source.length / 1024).toFixed(1)} KiB`);
