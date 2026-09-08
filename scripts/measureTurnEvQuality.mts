/**
 * Jak daleko od rovnováhy je turnová EV - a jak daleko jsou data pod ní.
 *
 *   npm run mtt:turn-ev-quality -- MTT9_20BB_BTN_BB_SRP_LOWSPR__222r CHECK_CHECK__3c
 *
 * Turnová EV se skládá z vyřešených riverových vrstev, takže samotné číslo
 * „výpočet se mýlí o tolik" nic neříká: dumpy solveru samy nejsou v rovnováze.
 * Skript proto měří obojí a vedle sebe - **nejdřív riverovou vrstvu samotnou**
 * (počítá ji `riverActionEv`, modul, který s turnovým kódem nesdílí nic), pak
 * turnový dopočet. Teprve rozdíl těch dvou čísel je výpověď o mém kódu.
 *
 * Přísná zkouška („hraná akce nesmí mít nižší EV než nehraná") se **nedá použít
 * jako propust**: padá i na čistě riverových datech, která už hráč dostává
 * (80,4 % na `876tt/BET79_CALL__2c`, největší porušení 223,6 žetonu). Použitelné
 * je až srovnání ztráty hrané strategie v procentech potu.
 *
 * Změřeno 8. 9. 2026 na dvou podherách s plně vyřešeným plánem:
 *
 * | podhra              | river (data) | turn (dopočet) |
 * | ------------------- | ------------ | -------------- |
 * | 20 bb `222r`        | 3,0 % potu   | 7,1 % potu     |
 * | 110 bb `876tt`      | 2,5 % potu   | 6,4 % potu     |
 *
 * Výsledky po kombinacích se dělí podle pokrytí, protože noc neřeší všechny
 * linky a EV stojící na třetině dosahu není totéž co EV na celém.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { combosOfClass, riverActionEv, type SolverNode } from "../src/core/riverActionEv";
import { turnActionEv } from "../src/core/turnActionEv";

const [familyArgument, subgameArgument] = process.argv.slice(2);
const BOARD_DIR = `artifacts/decomposition/${familyArgument
  ?? "MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR__532mono"}`;
const SUBGAME = subgameArgument ?? "CHECK_CHECK__2c";
/** Podhra se jmenuje `<linka flopu>__<karta turnu>`. */
const TURN_CARD = SUBGAME.split("__").at(-1) ?? "";

const encode = (line: readonly string[]): string => line.map((action) => {
  const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
  if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
  return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
}).join("_") || "ROOT";

interface PlanItem {
  line: string[];
  river: string;
  represents: string[];
  reach: number;
  pot: number;
  stack: number;
  board: string[];
  oop: Record<string, number>;
  ip: Record<string, number>;
}

const layerDir = join(BOARD_DIR, "river", SUBGAME);
const plan = JSON.parse(readFileSync(join(layerDir, "plan.json"), "utf8")) as {
  items: PlanItem[]; linesTotal: number; linesLive: number; linesChosen: number;
  coverageAchieved: number;
};
const turnFile = join(BOARD_DIR, `${SUBGAME}.json`);
const turnNode = JSON.parse(readFileSync(turnFile, "utf8")) as SolverNode;

// Turnová podhra nese vlastní plán desky; range pro kořen turnu bere z něj.
const boardPlan = JSON.parse(readFileSync(join(BOARD_DIR, "plan.json"), "utf8")) as {
  items?: Array<{ turn?: string; oop?: Record<string, number>; ip?: Record<string, number>;
    pot?: number; stack?: number; board?: string[] }>;
};
const turnItem = (boardPlan.items ?? []).find((item) => item.turn === TURN_CARD);

console.log(`podhra ${SUBGAME}`);
console.log(`  plán: ${plan.linesChosen} linek z ${plan.linesLive} živých (${plan.linesTotal} celkem)`
  + `, pokrytí dosahu ${(plan.coverageAchieved * 100).toFixed(1)} %`);
console.log(`  položek: ${plan.items.length}`);
console.log(`  kořen turnu: ${turnNode.node_type}, hráč ${turnNode.player}`
  + `, akce ${Object.keys(turnNode.childrens ?? {}).join(", ")}`);

/** Kvantil z už seřazeného pole. */
const quantileOf = (sorted: readonly number[], share: number): number => (
  sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0
);

/**
 * Kontrolní měření: jak daleko od rovnováhy je **samotný solver**.
 *
 * Turnová EV se skládá z riverových vrstev, takže její nepřesnost může být
 * chyba výpočtu, nebo vlastnost dat. Rozhodne to týž test spuštěný jen na
 * riverové vrstvě, kde počítá `riverActionEv` - modul, který s turnovým kódem
 * nesdílí nic. Bez tohohle čísla nemá turnový výsledek s čím být srovnán.
 */
function riverControl(): void {
  let lossSum = 0;
  let lossCount = 0;
  let lossWorst = 0;
  let potSum = 0;
  let strict = 0;
  let strictTotal = 0;
  let layers = 0;
  const gaps: number[] = [];

  for (const item of plan.items) {
    const path = join(layerDir, `${encode(item.line)}__${item.river}.json`);
    if (!existsSync(path)) continue;
    const node = JSON.parse(readFileSync(path, "utf8")) as SolverNode;
    const strategy = node.strategy;
    if (strategy === undefined) continue;
    layers += 1;

    const rows = riverActionEv({
      node, board: item.board, potChips: item.pot, oop: item.oop, ip: item.ip, line: [],
    });
    const byCombo = new Map<string, { action: string; ev: number }[]>();
    for (const row of rows) {
      byCombo.set(row.combo, [...(byCombo.get(row.combo) ?? []),
        { action: row.action, ev: row.evChips }]);
    }

    for (const [combo, actions] of byCombo) {
      const played = strategy.strategy[combo];
      if (played === undefined) continue;
      const evOf = new Map(actions.map((row) => [row.action, row.ev]));
      let mixed = 0;
      let frequency = 0;
      let best = -Infinity;
      const playedEv: number[] = [];
      const idleEv: number[] = [];
      for (const [index, action] of strategy.actions.entries()) {
        const ev = evOf.get(action);
        if (ev === undefined) continue;
        const share = played[index] ?? 0;
        mixed += share * ev;
        frequency += share;
        best = Math.max(best, ev);
        (share > 0.01 ? playedEv : idleEv).push(ev);
      }
      if (frequency <= 0 || best === -Infinity) continue;
      lossSum += best - mixed / frequency;
      lossWorst = Math.max(lossWorst, best - mixed / frequency);
      lossCount += 1;
      potSum += item.pot;
      if (playedEv.length > 0 && idleEv.length > 0) {
        const gap = Math.max(...idleEv) - Math.min(...playedEv);
        gaps.push(Math.max(0, gap));
        strictTotal += 1;
        if (gap <= 1e-6) strict += 1;
      }
    }
  }

  const sorted = [...gaps].sort((left, right) => left - right);
  console.log("");
  console.log(`kontrola na samotné riverové vrstvě: ${layers} vyřešených uzlů`);
  console.log(`  přísná zkouška: splněno ${strict}/${strictTotal}`
    + ` (${strictTotal === 0 ? "0" : (100 * strict / strictTotal).toFixed(1)} %)`
    + `, porušení medián ${quantileOf(sorted, 0.5).toFixed(2)}`
    + ` / p90 ${quantileOf(sorted, 0.9).toFixed(2)}`
    + ` / max ${(sorted[sorted.length - 1] ?? 0).toFixed(1)} žetonů`);
  if (lossCount > 0) {
    const pot = potSum / lossCount;
    console.log(`  ztráta hrané strategie proti nejlepší odpovědi:`
      + ` průměr ${(lossSum / lossCount).toFixed(2)} žetonu`
      + ` (${(100 * lossSum / lossCount / pot).toFixed(1)} % potu ${pot.toFixed(0)})`
      + `, nejhorší ${lossWorst.toFixed(1)} z ${lossCount} kombinací`);
  }
}

riverControl();

/** Hodnota riverového uzlu pro každou kombinaci, spočtená jednou na kartu. */
const cache = new Map<string, Map<string, number>>();
function riverValuesFor(item: PlanItem): Map<string, number> | undefined {
  const key = `${encode(item.line)}|${item.river}`;
  const held = cache.get(key);
  if (held !== undefined) return held;
  const path = join(layerDir, `${encode(item.line)}__${item.river}.json`);
  if (!existsSync(path)) return undefined;
  const node = JSON.parse(readFileSync(path, "utf8")) as SolverNode;
  // Hodnota uzlu je součet EV akcí vážený strategií, kterou tam hrdina hraje.
  if (node.player !== 1 || node.strategy === undefined) return undefined;
  const rows = riverActionEv({
    node, board: item.board, potChips: item.pot, oop: item.oop, ip: item.ip, line: [],
  });
  const strategy = node.strategy;
  const byCombo = new Map<string, number>();
  for (const row of rows) {
    const index = strategy.actions.indexOf(row.action);
    const frequency = strategy.strategy[row.combo]?.[index] ?? 0;
    if (frequency <= 0) continue;
    byCombo.set(row.combo, (byCombo.get(row.combo) ?? 0) + frequency * row.evChips);
  }
  cache.set(key, byCombo);
  return byCombo;
}

const byLine = new Map<string, PlanItem[]>();
for (const item of plan.items) {
  const key = encode(item.line);
  byLine.set(key, [...(byLine.get(key) ?? []), item]);
}

const asked = new Map<string, number>();
function riverValue(line: readonly string[], heroCombo: string): number | undefined {
  const key = encode(line);
  asked.set(key, (asked.get(key) ?? 0) + 1);
  const items = byLine.get(key);
  if (items === undefined) return undefined;
  let sum = 0;
  let weight = 0;
  for (const item of items) {
    const values = riverValuesFor(item);
    if (values === undefined) continue;
    const value = values.get(heroCombo);
    if (value === undefined) continue;
    // Jedna vyřešená karta zastupuje několik rovnocenných.
    const cards = Math.max(1, item.represents.length);
    sum += cards * value;
    weight += cards;
  }
  return weight === 0 ? undefined : sum / weight;
}

// Rozvinutá range musí sedět na to, co má solver ve strategii. Kombinace, která
// tam chybí, dostane frekvenci nula - u soupeře to znamená, že jeho váha zmizí
// z čitatele a zůstane ve jmenovateli, a EV vyjde tiše nižší.
{
  const deadCards = new Set(turnItem?.board ?? []);
  const expand = (range: Record<string, number> | undefined): Set<string> => new Set(
    Object.entries(range ?? {})
      .filter(([, weight]) => weight > 0)
      .flatMap(([handClass]) => combosOfClass(handClass, deadCards)),
  );
  const mine = { oop: expand(turnItem?.oop), ip: expand(turnItem?.ip) };
  const rootKeys = new Set(Object.keys(turnNode.strategy?.strategy ?? {}));
  const villainNode = Object.values(turnNode.childrens ?? {})
    .find((child) => (child as SolverNode).player === 0) as SolverNode | undefined;
  const villainKeys = new Set(Object.keys(villainNode?.strategy?.strategy ?? {}));
  const missing = (from: Set<string>, inside: Set<string>): number => (
    [...from].filter((combo) => !inside.has(combo)).length
  );
  console.log("");
  console.log("shoda rozvinuté range se strategií solveru:");
  console.log(`  hrdina (hráč 1): rozvinuto ${mine.oop.size}, ve strategii kořene ${rootKeys.size}`
    + `, chybí ve strategii ${missing(mine.oop, rootKeys)}`
    + `, navíc ve strategii ${missing(rootKeys, mine.oop)}`);
  console.log(`  soupeř (hráč 0): rozvinuto ${mine.ip.size}, ve strategii uzlu ${villainKeys.size}`
    + `, chybí ve strategii ${missing(mine.ip, villainKeys)}`
    + `, navíc ve strategii ${missing(villainKeys, mine.ip)}`);
}

const result = turnActionEv({
  node: turnNode,
  board: turnItem?.board ?? [],
  potChips: turnItem?.pot ?? 0,
  stackChips: turnItem?.stack ?? 0,
  oop: turnItem?.oop ?? {},
  ip: turnItem?.ip ?? {},
  riverValue,
});

console.log("");
console.log(`linky v plánu (${byLine.size}): ${[...byLine.keys()].join(" ")}`);
console.log(`linky, na které se výpočet ptal (${asked.size}):`);
for (const [key, count] of [...asked].sort((left, right) => right[1] - left[1])) {
  console.log(`  ${byLine.has(key) ? "nalezena " : "CHYBÍ    "} ${count.toString().padStart(5)}x  ${key}`);
}
console.log(`syrová linka první položky plánu: ${JSON.stringify(plan.items[0]?.line)}`);
console.log("");
console.log(`vráceno řádků: ${result.rows.length}, pokryto hry: ${(result.coveredReach * 100).toFixed(1)} %`);
if (result.rows.length === 0) {
  console.log("  nic ke kontrole");
} else {
  const byCombo = new Map<string, { action: string; ev: number; covered: number }[]>();
  for (const row of result.rows) {
    byCombo.set(row.combo, [...(byCombo.get(row.combo) ?? []),
      { action: row.action, ev: row.evChips, covered: row.coveredShare }]);
  }
  const strategy = turnNode.strategy;
  let agree = 0;
  let compared = 0;
  let minEv = Infinity;
  let maxEv = -Infinity;
  for (const [combo, actions] of byCombo) {
    for (const row of actions) { minEv = Math.min(minEv, row.ev); maxEv = Math.max(maxEv, row.ev); }
    const played = strategy?.strategy[combo];
    if (played === undefined || strategy === undefined) continue;
    let bestPlayed = -1;
    let bestIndex = -1;
    for (const [index, frequency] of played.entries()) {
      if (frequency > bestPlayed) { bestPlayed = frequency; bestIndex = index; }
    }
    const topAction = [...actions].sort((left, right) => right.ev - left.ev)[0];
    if (bestIndex < 0 || topAction === undefined) continue;
    compared += 1;
    if (strategy.actions[bestIndex] === topAction.action) agree += 1;
  }
  console.log("");
  console.log("falzifikační zkouška podle pokrytí - hraná akce nesmí mít nižší EV než nehraná:");
  const bands: Array<{
    name: string; min: number; ok: number; total: number; worst: number; gaps: number[];
  }> = [
    { name: "nad 99 %", min: 0.99, ok: 0, total: 0, worst: 0, gaps: [] },
    { name: "90-99 %", min: 0.90, ok: 0, total: 0, worst: 0, gaps: [] },
    { name: "50-90 %", min: 0.50, ok: 0, total: 0, worst: 0, gaps: [] },
    { name: "pod 50 %", min: 0, ok: 0, total: 0, worst: 0, gaps: [] },
  ];
  for (const [combo, actions] of byCombo) {
    const played = strategy?.strategy[combo];
    if (played === undefined || strategy === undefined) continue;
    const evOf = new Map(actions.map((row) => [row.action, row]));
    const playedEv: number[] = [];
    const idleEv: number[] = [];
    let worstCover = 1;
    for (const [index, action] of strategy.actions.entries()) {
      const row = evOf.get(action);
      if (row === undefined) continue;
      worstCover = Math.min(worstCover, row.covered);
      ((played[index] ?? 0) > 0.01 ? playedEv : idleEv).push(row.ev);
    }
    if (playedEv.length === 0 || idleEv.length === 0) continue;
    const band = bands.find((row) => worstCover >= row.min);
    if (band === undefined) continue;
    band.total += 1;
    const gap = Math.max(...idleEv) - Math.min(...playedEv);
    band.gaps.push(Math.max(0, gap));
    if (gap <= 1e-6) band.ok += 1;
    else band.worst = Math.max(band.worst, gap);
  }
  for (const band of bands) {
    if (band.total === 0) { console.log(`  ${band.name.padEnd(9)} žádná kombinace`); continue; }
    // Maximum samo o sobě nic neříká: jedno velké porušení mezi stovkou malých
    // vypadá stejně jako systematická vada. Proto kvantily.
    const sorted = [...band.gaps].sort((left, right) => left - right);
    const quantile = (share: number): number => sorted[Math.min(sorted.length - 1,
      Math.floor(share * sorted.length))] ?? 0;
    console.log(`  ${band.name.padEnd(9)} splněno ${band.ok}/${band.total}`
      + ` (${(100 * band.ok / band.total).toFixed(1)} %)`
      + `, porušení medián ${quantile(0.5).toFixed(2)}`
      + ` / p90 ${quantile(0.9).toFixed(2)}`
      + ` / max ${band.worst.toFixed(1)} žetonů`);
  }
  // Kolik hraná strategie ztrácí proti nejlepší odpovědi. Tohle je vlastní míra
  // kvality rovnováhy: solver nekonverguje do nuly, takže malá ztráta je
  // v pořádku, velká ne. Počítá se jen tam, kde je pokrytí plné.
  let lossSum = 0;
  let lossCount = 0;
  let lossWorst = 0;
  for (const [combo, actions] of byCombo) {
    const played = strategy?.strategy[combo];
    if (played === undefined || strategy === undefined) continue;
    const evOf = new Map(actions.map((row) => [row.action, row]));
    let mixed = 0;
    let best = -Infinity;
    let frequency = 0;
    let covered = 1;
    for (const [index, action] of strategy.actions.entries()) {
      const row = evOf.get(action);
      if (row === undefined) continue;
      covered = Math.min(covered, row.covered);
      const share = played[index] ?? 0;
      mixed += share * row.ev;
      frequency += share;
      best = Math.max(best, row.ev);
    }
    if (frequency <= 0 || best === -Infinity || covered < 0.99) continue;
    const loss = best - mixed / frequency;
    lossSum += loss;
    lossWorst = Math.max(lossWorst, loss);
    lossCount += 1;
  }
  if (lossCount > 0) {
    const pot = turnItem?.pot ?? 1;
    console.log(`  ztráta hrané strategie proti nejlepší odpovědi (pokrytí nad 99 %):`
      + ` průměr ${(lossSum / lossCount).toFixed(2)} žetonu`
      + ` (${(100 * lossSum / lossCount / pot).toFixed(1)} % potu)`
      + `, nejhorší ${lossWorst.toFixed(1)} z ${lossCount} kombinací`);
  }
  console.log(`  rozsah EV: ${minEv.toFixed(1)} az ${maxEv.toFixed(1)} žetonů (pot ${turnItem?.pot ?? 0})`);
}
