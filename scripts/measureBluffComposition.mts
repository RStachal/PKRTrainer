import { MADE_VALUE_CATEGORIES, classifyFlopHand } from "../src/core/flopHandCategory";
import type { Card, HandLabel } from "../src/core/types";

/**
 * Z čeho se skládá blafovací část range, kterou dodáváme.
 *
 *   npm run mtt:bluff-composition
 *
 * ## Proč se to ptá
 *
 * Matice dělí ruce na VALUE a BLUFF, a do BLUFFu spadne **všechno**, co není
 * top pair a lepší: propadlé draws, overcards, ale i střední pár, který do
 * showdownu hodnotu má. Hráč tak vidí jednu lajnu tam, kde teorie rozlišuje
 * několik různých věcí - a nedozví se, jestli blafuje s draw, s overcards, nebo
 * s naprostým vzduchem.
 *
 * Tenhle skript to rozpadne po kategoriích, aby se dalo říct, jestli ta lajna
 * odpovídá tomu, jak se blafovat má.
 *
 * ## Co tenhle skript **nevidí**
 *
 * Riverovou kartu. Vyřešená pravidla nesou flop a turnovou kartu, river ne -
 * ten přidává až katalog při rozdávání. Riverová čísla proto popisují stav
 * **po turnu**: draw, který v nich stojí, se na riveru buď dotáhl, nebo
 * propadl, a tenhle skript neví který. Produkt sám klasifikuje proti desce,
 * kterou hráč vidí, takže tohle omezení má jen měření.
 */

interface Bucket { lane: string; action: string; handClasses: readonly string[] }

async function rulesFor(street: "flop" | "turn" | "river"): Promise<unknown[]> {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = `src/data/ranges/${street}`;
  const out: unknown[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const pack = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as { rules?: unknown[] };
    for (const rule of pack.rules ?? []) out.push(rule);
  }
  return out;
}

function boardOf(rule: Record<string, unknown>): Card[] {
  const spot = rule.spot as { flop?: string[]; turnCards?: string[] } | undefined;
  const flop = spot?.flop ?? [];
  const cards = [...flop, ...(spot?.turnCards?.slice(0, 1) ?? [])];
  return cards.map((text) => ({ rank: text[0], suit: text[1] })) as Card[];
}

for (const street of ["flop", "turn", "river"] as const) {
  const counts = new Map<string, number>();
  let bluffClasses = 0;
  for (const raw of await rulesFor(street)) {
    const rule = raw as Record<string, unknown>;
    const board = boardOf(rule);
    if (board.length < 3) continue;
    for (const bucket of (rule.buckets ?? []) as Bucket[]) {
      // Agresivní kbelíky: ty, které nejsou check ani fold.
      if (!/BET|RAISE|ALLIN/i.test(bucket.action ?? "")) continue;
      for (const hand of bucket.handClasses ?? []) {
        const category = classifyFlopHand(hand as HandLabel, board);
        // Seznam se **neopisuje**: hodnotové kategorie drží `flopHandCategory`.
        // Opsaná kopie tenhle skript jednou už zmátla - po přidání barvy počítal
        // udělanou barvu mezi blafy, protože o ní nevěděl.
        if (MADE_VALUE_CATEGORIES.includes(category)) continue;
        bluffClasses += 1;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
  }
  console.log(`${street.toUpperCase()} - tříd v blafovací lajně: ${bluffClasses}`);
  for (const [category, count] of [...counts].sort((left, right) => right[1] - left[1])) {
    const share = ((100 * count) / Math.max(bluffClasses, 1)).toFixed(1);
    console.log(`  ${category.padEnd(15)} ${String(count).padStart(7)}  ${share.padStart(5)} %`);
  }
  console.log("");
}
console.log(
  "Pozn.: kategorie se počítá proti flopu (a turnové kartě, kde je), ne proti\n"
  + "riverové - klasifikátor je flopový. Čísla proto popisují, s čím se do lajny\n"
  + "vstupuje, ne čím končí.",
);
