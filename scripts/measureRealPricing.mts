import { bestActionsForActionEv } from "../src/core/actionEv";
import { buildPool } from "../src/core/drillEngine";
import { withRealPricing } from "../src/core/preflop/realPricing";
import { loadPreflopEquity } from "../src/core/preflopEquity";
import type { ActionContext, ActionKey, Filters, Spot } from "../src/core/types";
import { VILLAIN_ARCHETYPES, type VillainArchetype } from "../src/core/villain/archetypes";
import { preflopVillainModel } from "../src/core/villain/preflopModel";
import { createRangeStoreFromRangePack } from "../src/data/rangeStore";
import { currentMttPreflopRangePack } from "../src/data/ranges/mttPreflopRangePacks";

/**
 * Co režim REAL dělá s preflopem (Agents/plan-gto-real-2026-11.md, 4.6): jak často
 * se proti typu změní doporučená akce a o kolik, kde se to dá říct v BB.
 *
 *   npm run mtt:real-pricing
 *
 * Testy hlídají směr, tohle velikost. Kdyby proti kameni vycházelo dorovnat skoro
 * nic a proti velrybě skoro všechno, je to karikatura a hráč by se učil špatně.
 * Ukázky jsou ke čtení: dá se u nich říct, jestli to tak hráč opravdu hraje.
 */

const CONTEXTS: readonly ActionContext[] = [
  "RFI", "VS_OPEN", "VS_3BET", "VS_4BET", "PUSH_FOLD", "VS_ALLIN", "VS_LIMP", "BVB", "SQUEEZE",
];
const POOL = 1500;

const store = createRangeStoreFromRangePack(currentMttPreflopRangePack("ON"));

function recommended(spot: Spot): readonly ActionKey[] {
  return spot.actionEvs === undefined ? spot.strictCorrect : bestActionsForActionEv(spot.actionEvs);
}

function same(left: readonly ActionKey[], right: readonly ActionKey[]): boolean {
  return left.length === right.length && left.every((key) => right.includes(key));
}

await loadPreflopEquity();

console.log("Model typů (násobek šířky proti chartu, po bezpečné exploitaci):");
for (const type of VILLAIN_ARCHETYPES) {
  const { callWidth, raiseWidth } = preflopVillainModel(type);
  console.log(`  ${type.padEnd(6)} dorovnání ${callWidth.toFixed(2)}  zvyšování ${raiseWidth.toFixed(2)}`);
}

for (const context of CONTEXTS) {
  const filters: Filters = {
    positions: [], buckets: [], contexts: [context], ante: "ON", scoringMode: "LENIENT",
  };
  const spots = buildPool(1, context, filters, store, { maxSize: POOL })
    .filter((spot) => spot.tableState.stackSetupId === undefined);
  console.log(`\n${context}: ${spots.length} spotů`);
  if (spots.length === 0) continue;

  const line = (name: string, price: (spot: Spot) => Spot): void => {
    let priced = 0;
    let flipped = 0;
    let withEv = 0;
    let shift = 0;
    const samples: string[] = [];
    for (const spot of spots) {
      const real = price(spot);
      if (real.real === undefined) continue;
      priced += 1;
      if (real.actionEvs !== undefined && real.real.gtoEvs !== undefined) {
        withEv += 1;
        const best = Math.max(...real.actionEvs.values.map((item) => item.evBb));
        const baseline = Math.max(...real.real.gtoEvs.values.map((item) => item.evBb));
        shift += Math.abs(best - baseline);
      }
      if (!same(recommended(real), real.real.gtoActions)) {
        flipped += 1;
        if (samples.length < 3) {
          samples.push(
            `      ${spot.heroPos} ${spot.effStack} BB ${spot.hand}: GTO ${real.real.gtoActions.join("/")}, proti typu ${recommended(real).join("/")}`,
          );
        }
      }
    }
    if (priced === 0) {
      console.log(`  ${name.padEnd(10)} bez ocenění`);
      return;
    }
    const rate = ((flipped / priced) * 100).toFixed(1);
    const share = ((priced / spots.length) * 100).toFixed(0);
    const bb = withEv === 0 ? "" : `, průměrný posun ${(shift / withEv).toFixed(2)} BB`;
    console.log(`  ${name.padEnd(10)} oceněno ${share.padStart(3)} %, změna ${rate.padStart(5)} %${bb}`);
    for (const sample of samples) console.log(sample);
  };

  line("živý stůl", (spot) => withRealPricing(spot, { mode: "REAL" }, store));
  for (const focus of VILLAIN_ARCHETYPES as readonly VillainArchetype[]) {
    line(focus, (spot) => withRealPricing(spot, { mode: "REAL", focus }, store));
  }
}
