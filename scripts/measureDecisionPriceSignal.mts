import { buildPool, openSizeAtDepth } from "../src/core/drillEngine";
import { rangeStore } from "../src/data/rangeStore";
import { loadPreflopEquity, equityVsRange } from "../src/core/preflopEquity";
import { decisionPrices } from "../src/core/decisionPrice";
import type { HandLabel } from "../src/core/types";

/**
 * Je práh dorovnání užitečný signál, nebo jen další číslo na obrazovce?
 *
 *   npm run mtt:price-signal
 *
 * ## Co se ptá
 *
 * Práh říká, kolik ekvity dorovnání potřebuje. Sám o sobě je to fakt o ceně -
 * užitečný teprve tehdy, když se dá porovnat s tím, kolik ekvity ruka **má**.
 * Tenhle skript to porovnání udělá na celém `VS_OPEN` poolu a zeptá se, jestli
 * odpověď „ekvita nad prahem" souhlasí s tím, co strategie doopravdy radí.
 *
 * Kdyby souhlas byl mizivý, znamenalo by to, že se ta dvě čísla hráči budou
 * plést do sebe a číslo patří spíš pryč. Kdyby byl vysoký, je to naopak
 * nejlevnější způsob, jak vysvětlit **proč** se ta ruka hraje.
 *
 * Pozor na jednu věc, kterou tenhle skript **neměří**: realizaci ekvity po
 * flopu. Mimo pozici se z ekvity realizuje míň, takže „nad prahem" není totéž
 * co „dorovnat". Právě proto je to práh, ne EV.
 */
await loadPreflopEquity();

const filters = { positions: [], buckets: [], contexts: [], ante: "OFF", scoringMode: "LENIENT" } as never;
const pool = buildPool(20260828, "VS_OPEN" as never, filters, rangeStore);

let priced = 0;
let agree = 0;
let overThresholdAndCalls = 0;
let underThresholdAndFolds = 0;
const byBucket = new Map<number, { n: number; agree: number }>();

for (const spot of pool) {
  const open = openSizeAtDepth(spot.effStack, spot.ante, rangeStore);
  if (open === undefined) continue;
  // Pot před hrdinou a cena dorovnání. Hrdina v BB už má blind ve hře.
  const potBB = 0.5 + 1 + open;
  const toCallBB = spot.heroPos === "BB" ? open - 1 : spot.heroPos === "SB" ? open - 0.5 : open;
  const [price] = decisionPrices({ actions: ["CALL"], potBB, toCallBB, riskByAction: {} });
  if (price?.required === undefined) continue;

  // Ekvita hrdinovy ruky proti otevírací range - té, ze které se dnes počítá
  // cena re-jamu, aby se neměřilo proti jiné množině než produkt.
  const opener = rangeStore.lookup({
    ante: spot.ante, position: "LJ", bucket: spot.effStack, context: "RFI",
  } as never);
  if (opener === undefined) continue;
  const villain = Object.entries((opener as unknown as { strict: Record<string, string[]> }).strict)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .map(([hand]) => hand as HandLabel);
  const equity = equityVsRange(spot.hand as HandLabel, villain);
  if (equity === undefined) continue;

  priced += 1;
  const overThreshold = equity >= price.required;
  const strategyContinues = spot.correctKeys.some((key) => key !== "FOLD");
  if (overThreshold === strategyContinues) {
    agree += 1;
    if (overThreshold) overThresholdAndCalls += 1; else underThresholdAndFolds += 1;
  }
  const row = byBucket.get(spot.effStack) ?? { n: 0, agree: 0 };
  row.n += 1;
  if (overThreshold === strategyContinues) row.agree += 1;
  byBucket.set(spot.effStack, row);
}

const pct = (part: number, whole: number) => (whole === 0 ? "—" : `${((100 * part) / whole).toFixed(1)} %`);
console.log("Souhlasí práh dorovnání s tím, co strategie radí? (VS_OPEN)");
console.log("");
console.log(`spotů s cenou i ekvitou: ${priced}`);
console.log(`souhlas: ${pct(agree, priced)}`);
console.log(`  z toho nad prahem a strategie pokračuje: ${overThresholdAndCalls}`);
console.log(`  z toho pod prahem a strategie skládá:    ${underThresholdAndFolds}`);
console.log("");
console.log("podle hloubky:");
for (const [bucket, row] of [...byBucket].sort((left, right) => left[0] - right[0])) {
  console.log(`  ${String(bucket).padStart(3)} BB  ${pct(row.agree, row.n)}  (${row.n} spotů)`);
}
console.log("");
console.log(
  "Nesouhlas není chyba: práh mluví o ceně teď, strategie počítá i s tím, jak\n"
  + "se ruka hraje po flopu. Číslo je zajímavé tím, kde se ty dva pohledy rozejdou.",
);
