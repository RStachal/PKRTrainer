import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Míří noc tam, kde z ní turnová EV něco má?
 *
 *   npm run mtt:night-turn-ev -- [--log=artifacts/decomposition/night.log] [--since=LINE]
 *
 * ## Proč to musí vzniknout
 *
 * Bod 236 změřil, že jedenáct nočních vrstev pod jednou rodinou nezměnilo
 * v tabulce turnové EV ani jednu hodnotu. Rozpočet už od bodu 237 nedrží, takže
 * zbývá druhý důvod: **vrstva padla pod podhru, ve které žádné dodávané
 * pravidlo nesedí.** Pack drží ~260 pravidel na rodinu podle dosahu, ale podher
 * má rodina víc - a noc vybírá podle dosahu podhry, ne podle toho, jestli v ní
 * je pravidlo, které se hráči rozdá.
 *
 * Pokrytí řádku klesá jen tam, kde pod turnovou linkou vrstva **není vůbec**
 * (`turnActionEv`: all-in dodá dojezd, existující vrstva je kompletní na
 * podhru). Noc tedy turnové EV pomůže právě jednou: když dá vrstvu podhře,
 * která hostí dodávané pravidlo a vrstvu ještě nemá. Tenhle skript to spočítá
 * z obou stran - kolik takových podher je, a kolik z nočních vrstev je trefilo.
 */

const ROOT = "artifacts/decomposition";
const PACK_DIR = "src/data/ranges/turn";
const logPath = process.argv.find((arg) => arg.startsWith("--log="))?.split("=")[1]
  ?? "artifacts/decomposition/night.log";
const sinceLine = Number(process.argv.find((arg) => arg.startsWith("--since="))?.split("=")[1] ?? "0");

interface PlanItem { line?: string[]; turn?: string }
interface PackRule { sourceDirectory: string; spot?: { turnCards?: string[]; priorLine?: string[]; reach?: number } }

const encode = (line: readonly string[]): string => line.map((action) => {
  const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
  if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
  return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
}).join("_") || "ROOT";

const plans = new Map<string, PlanItem[]>();
function planOf(directory: string): PlanItem[] {
  const held = plans.get(directory);
  if (held !== undefined) return held;
  const path = join(ROOT, directory, "plan.json");
  const items = existsSync(path)
    ? ((JSON.parse(readFileSync(path, "utf8")) as { items?: PlanItem[] }).items ?? [])
    : [];
  plans.set(directory, items);
  return items;
}

/** Má podhra kompletní riverovou vrstvu? Táž definice jako v nočním běhu. */
function hasCompleteLayer(directory: string, subgame: string): boolean {
  const dir = join(ROOT, directory, "river", subgame);
  const plan = join(dir, "plan.json");
  if (!existsSync(plan)) return false;
  const planned = ((JSON.parse(readFileSync(plan, "utf8")) as { items?: unknown[] }).items ?? []).length;
  const solved = readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "plan.json").length;
  return solved >= planned;
}

// 1) Podhry, ve kterých sedí dodávané pravidlo, a kolik dosahu na ně připadá.
const hosting = new Map<string, number>();
const reachOf = new Map<string, number>();
for (const file of readdirSync(PACK_DIR).filter((name) => name.endsWith(".json"))) {
  const pack = JSON.parse(readFileSync(join(PACK_DIR, file), "utf8")) as { rules: PackRule[] };
  for (const rule of pack.rules) {
    const turn = rule.spot?.turnCards?.[0];
    const prior = rule.spot?.priorLine ?? [];
    if (turn === undefined) continue;
    const item = planOf(rule.sourceDirectory)
      .filter((candidate) => candidate.turn === turn
        && (candidate.line ?? []).every((step, at) => prior[at] === step))
      .sort((left, right) => (right.line ?? []).length - (left.line ?? []).length)[0];
    if (item === undefined) continue;
    const key = `${rule.sourceDirectory}/${encode(item.line ?? [])}__${turn}`;
    hosting.set(key, (hosting.get(key) ?? 0) + 1);
    reachOf.set(key, (reachOf.get(key) ?? 0) + (rule.spot?.reach ?? 0));
  }
}

let withLayer = 0;
let rulesWithLayer = 0;
let rulesWithout = 0;
const missing: { directory: string; subgame: string; rules: number; reach: number }[] = [];
for (const [key, rules] of hosting) {
  const slash = key.indexOf("/");
  const directory = key.slice(0, slash);
  const subgame = key.slice(slash + 1);
  if (hasCompleteLayer(directory, subgame)) { withLayer += 1; rulesWithLayer += rules; }
  else { rulesWithout += rules; missing.push({ directory, subgame, rules, reach: reachOf.get(key) ?? 0 }); }
}
// Nejdřív to, co se hráči rozdá nejčastěji: dosah pravidel, ne počet.
missing.sort((left, right) => right.reach - left.reach || right.rules - left.rules);

/**
 * Prioritní seznam pro noc.
 *
 * Noc vybírá riverové vrstvy podle dosahu **podhry**, a to je pořadí, ve
 * kterém 64 % vrstev padne mimo dodávané pravidlo (změřeno 12. 9. 2026 na
 * noci 11./12.: 52 ze 145). Tenhle soubor říká, které podhry hostí dodávané
 * pravidlo a vrstvu nemají, v pořadí podle dosahu těch pravidel - tedy podle
 * toho, co hráč dostane. Noc ho vezme před svůj vlastní výběr a zbytek okna
 * dál rozděluje postaru.
 *
 * Pořadí podle dosahu je jen výchozí: runner soubor hned ocení
 * (`price_river_layers.py` doplní `cost` = kolik riverových podher vrstva
 * stojí) a přerovná podle `reach / cost`. Změřeno 14. 9. 2026 simulací nad
 * nocí 13./14.: o 79 % víc dosahu za stejnou noc. Cena se počítá v Pythonu
 * schválně - týmiž funkcemi jako plánovač, aby nebyly dvě definice.
 */
if (process.argv.includes("--write")) {
  const out = join(ROOT, "turn-ev-priority.json");
  writeFileSync(out, `${JSON.stringify({
    schemaVersion: "PKRTRAINER_TURN_EV_PRIORITY_V1",
    writtenAt: new Date().toISOString(),
    entries: missing,
  }, null, 1)}
`, "utf8");
  console.log(`prioritní seznam pro noc zapsán: ${out} (${missing.length} podher)`);
  console.log("");
}

// 2) Kam padly noční vrstvy.
const lines = readFileSync(logPath, "utf8").split(/\r?\n/).slice(sinceLine);
let nightLayers = 0;
let nightHits = 0;
let nightHitRules = 0;
for (const line of lines) {
  const match = /solving river ([A-Z0-9_]+__[A-Za-z0-9]+) \/ ([A-Za-z0-9_]+)(?::|$)/.exec(line);
  if (match === null) continue;
  nightLayers += 1;
  const rules = hosting.get(`${match[1]}/${match[2]}`);
  if (rules !== undefined) { nightHits += 1; nightHitRules += rules; }
}

console.log("Míří noc tam, kde z ní turnová EV něco má?");
console.log("");
console.log(`podher hostících dodávané pravidlo: ${hosting.size}`);
console.log(`  s kompletní vrstvou:   ${String(withLayer).padStart(5)}  (${rulesWithLayer} pravidel)`);
console.log(`  bez vrstvy:            ${String(hosting.size - withLayer).padStart(5)}  (${rulesWithout} pravidel) <- tady noc pomůže`);
console.log("");
console.log(`nočních vrstev v logu od řádku ${sinceLine}: ${nightLayers}`);
console.log(`  pod podhrou s dodávaným pravidlem: ${nightHits} (${(100 * nightHits / Math.max(1, nightLayers)).toFixed(0)} %), ${nightHitRules} pravidel`);
console.log(`  jinam:                             ${nightLayers - nightHits}`);
console.log("");
console.log(
  "Vrstva „jinam\" není zbytečná - odpovídá riverovému spotu, který se rozdává -\n"
  + "ale turnové EV nepřidá nic. Poměr nahoře je cena nočního výběru podle dosahu\n"
  + "podhry proti výběru podle toho, kde sedí dodávané pravidlo bez vrstvy.",
);
