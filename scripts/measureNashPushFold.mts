import { solvePushFold, type PushFoldSeat } from "../src/core/preflop/nashPushFold";
import { ALL_HAND_CLASSES } from "../src/core/poker";
import { combosInClass, loadPreflopEquity, TOTAL_COMBOS } from "../src/core/preflopEquity";
import { POSITION_ORDER, type AnteMode, type HandLabel, type Position, type StackBucket } from "../src/core/types";
import { createRangeStoreFromRangePack } from "../src/data/rangeStore";
import { currentMttPreflopRangePack } from "../src/data/ranges/mttPreflopRangePacks";

/**
 * Nash push/fold proti chartům (plán 7.1): kde se výpočet a chart rozcházejí.
 *
 *   npm run mtt:nash
 *
 * Tvrdé hranice tu nejsou, výstup je ke čtení. Kvalitu výpočtu hlídá
 * `tests/unit/nashPushFold.test.ts`.
 */

const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const ANTE_TOTAL: Readonly<Record<AnteMode, number>> = { ON: 1, OFF: 0 };

function share(frequency: Readonly<Record<HandLabel, number>>): number {
  return HANDS.reduce((sum, hand) => sum + frequency[hand] * combosInClass(hand), 0) / TOTAL_COMBOS;
}

await loadPreflopEquity();

for (const ante of ["ON", "OFF"] as const) {
  const store = createRangeStoreFromRangePack(currentMttPreflopRangePack(ante));
  const pushChart = (seat: Position, bucket: number): ReadonlySet<HandLabel> | undefined => {
    const entry = store.lookup({ ante, position: seat, bucket: bucket as StackBucket, context: "PUSH_FOLD" });
    if (entry === undefined) return undefined;
    return new Set(Object.entries(entry.strict).filter(([, keys]) => keys.includes("JAM" as never)).map(([hand]) => hand as HandLabel));
  };

  console.log(`\n===== ante ${ante} =====`);
  const solved = new Map<number, PushFoldSeat[]>();
  for (const stack of [4, 5, 6, 7, 8, 10]) {
    const started = Date.now();
    const seats = solvePushFold({ seats: POSITION_ORDER, stackBB: stack, anteTotalBB: ANTE_TOTAL[ante] });
    if (seats === undefined) throw new Error("equity se nenačetla");
    solved.set(stack, seats);
    const worst = Math.max(...seats.map((seat) => seat.exploitability));
    console.log(`${stack} BB: výpočet ${Date.now() - started} ms, nejhorší exploitability ${worst.toFixed(4)} BB`);
  }

  console.log("\nShove podle sedačky: Nash a chart, podíl všech rukou");
  for (const stack of [5, 10]) {
    for (const seat of solved.get(stack)!) {
      const chart = pushChart(seat.seat, stack);
      const nash = (share(seat.jam) * 100).toFixed(1);
      if (chart === undefined) {
        console.log(`  ${stack} BB ${seat.seat.padEnd(5)} Nash ${nash} %, chart není`);
        continue;
      }
      const chartShare = HANDS.reduce((sum, hand) => sum + (chart.has(hand) ? combosInClass(hand) : 0), 0) / TOTAL_COMBOS;
      const nashOnly = HANDS.filter((hand) => seat.jam[hand] >= 0.5 && !chart.has(hand));
      const chartOnly = HANDS.filter((hand) => seat.jam[hand] < 0.5 && chart.has(hand));
      const agreed = HANDS.reduce((sum, hand) => sum + ((seat.jam[hand] >= 0.5) === chart.has(hand) ? combosInClass(hand) : 0), 0) / TOTAL_COMBOS;
      console.log(`  ${stack} BB ${seat.seat.padEnd(5)} Nash ${nash.padStart(5)} %, chart ${(chartShare * 100).toFixed(1).padStart(5)} %, shoda ${(agreed * 100).toFixed(1)} %`);
      if (nashOnly.length > 0) console.log(`      jen Nash:  ${nashOnly.slice(0, 24).join(" ")}${nashOnly.length > 24 ? ` ... (${nashOnly.length})` : ""}`);
      if (chartOnly.length > 0) console.log(`      jen chart: ${chartOnly.slice(0, 24).join(" ")}${chartOnly.length > 24 ? ` ... (${chartOnly.length})` : ""}`);
    }
  }

  console.log("\nKTo a KTs: frekvence shovu v rovnováze a jeho hodnota v BB");
  for (const hand of ["KTo", "KTs"] as HandLabel[]) {
    console.log(`  ${hand}`);
    for (const seat of POSITION_ORDER.slice(0, -1)) {
      const cells = [...solved.entries()].map(([stack, seats]) => {
        const cell = seats.find((item) => item.seat === seat)!;
        return `${stack}BB ${(cell.jam[hand] * 100).toFixed(0).padStart(3)} % (${cell.jamEv[hand] >= 0 ? "+" : ""}${cell.jamEv[hand].toFixed(2)})`;
      });
      console.log(`    ${seat.padEnd(5)} ${cells.join("  ")}`);
    }
  }
}
