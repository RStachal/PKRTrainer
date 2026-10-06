/**
 * `npm run mtt:board-cost` - změří cenu desky z nočního logu a zapíše ji na
 * jedno místo, odkud ji čtou runner, hlídač nocí i registr procesů.
 *
 * Proč jedno místo a proč tři odvozená čísla místo jedné konstanty je rozepsané
 * v `scripts/lib/boardCost.mts`. Tady je jen ta mechanika a jediné rozhodnutí,
 * které se nedá odvodit z logu: co s hloubkou, kterou noc ještě neměřila.
 *
 * ## Hloubka bez měření
 *
 * Nastagovat se dá hloubka, kterou noc nikdy nesolvila - právě to se stalo
 * 6. 10. 2026 s 50 bb. Odhadnout ji **z ničeho** se nemá, a tiše jí dát cenu
 * nejbližší známé hloubky je horší: je to odhad vydávaný za měření, přesně ten
 * vzor, který tahle vrstva ruší.
 *
 * Takže se extrapoluje, ale jen z **poměru dvou ručních sond**, a ten poměr je
 * tu zapsaný s provenienci. Důvod, proč zrovna poměr: ruční sonda přes den
 * neříká cenu noci (měřeno, viz lib), ale dvě ruční sondy sdílejí podmínky, tak
 * jejich poměr přenositelný je. Řádek nese `basis: "extrapolace"` a hlídač nocí
 * to hlásí, aby se na to nezapomnělo.
 *
 * Hloubka, která je nastagovaná a nemá ani měření, ani sondu, ze které by se
 * dala odvodit, je **chyba**, ne nula. Brána má padat zavřená.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";

import {
  BOARD_COST_PATH,
  EXPANSION_LOG_PATH,
  capFromP90,
  depthCostsFrom,
  parseBoardSolves,
  type BoardCostTable,
  type DepthCost,
} from "./lib/boardCost.mts";

const PARAMS_DIR = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters"
  + "/pkrtrainer_mtt_seat_pair_expansion_v1";

/**
 * Ruční sondy, ze kterých se smí brát **poměr** mezi hloubkami - nikdy
 * absolutní cena. Táž rodina a táž deska, aby se neporovnávaly textury:
 * `A72r` v `MTT9_<hloubka>BB_UTG_2_HJ_SRP`, plný strom.
 *
 * - 40 bb: 546 s, tedy 9,3 min (5. 10. 2026, exploitabilita 0,40 %)
 * - 50 bb: 1 153,79 s, tedy 19,2 min (6. 10. 2026, exploitabilita 0,32 %)
 *
 * Poměr 2,06 na krok 40 - 50 bb. Noční medián 40 bb je 19,3, takže 50 bb vychází
 * kolem 40 min. Pozor: tohle **není** cena 50 bb naměřená nocí, a až ji noc
 * naměří, měřený řádek tento přepíše sám.
 */
const MANUAL_PROBES: readonly { depthBB: number; minutes: number; when: string }[] = [
  { depthBB: 40, minutes: 9.3, when: "5. 10. 2026" },
  { depthBB: 50, minutes: 19.2, when: "6. 10. 2026" },
];

function stagedDepths(): number[] {
  if (!existsSync(PARAMS_DIR)) return [];
  const depths = new Set<number>();
  for (const name of readdirSync(PARAMS_DIR)) {
    const depth = /_(\d+)BB_/.exec(name);
    if (depth !== null) depths.add(Number(depth[1]));
  }
  return [...depths].sort((left, right) => left - right);
}

/**
 * Extrapolace hloubky bez měření: poměr ručních sond krát měřený řádek nejbližší
 * měřené hloubky. Vrací `undefined`, když poměr chybí - ne odhad.
 */
function extrapolate(depthBB: number, measured: readonly DepthCost[]): DepthCost | undefined {
  const probe = MANUAL_PROBES.find((row) => row.depthBB === depthBB);
  if (probe === undefined) return undefined;
  const candidates = measured
    .filter((row) => MANUAL_PROBES.some((other) => other.depthBB === row.depthBB))
    .sort((left, right) => Math.abs(left.depthBB - depthBB) - Math.abs(right.depthBB - depthBB));
  const base = candidates[0];
  if (base === undefined) return undefined;
  const baseProbe = MANUAL_PROBES.find((row) => row.depthBB === base.depthBB);
  if (baseProbe === undefined) return undefined;
  const ratio = probe.minutes / baseProbe.minutes;
  const p90 = Math.round(base.p90 * ratio * 10) / 10;
  return {
    depthBB,
    boards: 0,
    median: Math.round(base.median * ratio * 10) / 10,
    p90,
    max: 0,
    planMinutes: Math.round(base.median * ratio * 10) / 10,
    capMinutes: capFromP90(p90),
    reserveMinutes: Math.ceil(p90),
    basis: "extrapolace",
    note: `poměr ručních sond ${probe.minutes} / ${baseProbe.minutes} = ${ratio.toFixed(2)}`
      + ` krát noční ${base.depthBB} bb (${base.boards} desek)`,
  };
}

function main(): void {
  const write = process.argv.includes("--write");
  if (!existsSync(EXPANSION_LOG_PATH)) {
    console.error(`chybí ${EXPANSION_LOG_PATH}; cena desky se měří z nočního logu, jinak odnikud`);
    process.exit(1);
  }
  const lines = readFileSync(EXPANSION_LOG_PATH, "utf8").split(/\r?\n/);
  const solves = parseBoardSolves(lines);
  const measured = depthCostsFrom(solves);

  const depths: DepthCost[] = [...measured];
  const missing: number[] = [];
  for (const depth of stagedDepths()) {
    if (depths.some((row) => row.depthBB === depth)) continue;
    const guess = extrapolate(depth, measured);
    if (guess === undefined) missing.push(depth);
    else depths.push(guess);
  }
  depths.sort((left, right) => left.depthBB - right.depthBB);

  console.log(`změřeno ${solves.length} desek v ${EXPANSION_LOG_PATH}`);
  console.log("");
  console.log("hloubka  desek  medián    p90    max  |  plán  strop  rezerva  základ");
  for (const row of depths) {
    console.log(`${String(row.depthBB).padStart(5)}bb`
      + `${String(row.boards).padStart(7)}`
      + `${row.median.toFixed(1).padStart(8)}`
      + `${row.p90.toFixed(1).padStart(7)}`
      + `${row.max.toFixed(1).padStart(7)}`
      + `  |${row.planMinutes.toFixed(1).padStart(6)}`
      + `${String(row.capMinutes).padStart(7)}`
      + `${String(row.reserveMinutes).padStart(9)}`
      + `  ${row.basis}${row.note === undefined ? "" : ` (${row.note})`}`);
  }

  if (missing.length > 0) {
    console.log("");
    console.log(`CHYBA: nastagované hloubky bez ceny: ${missing.join(", ")} bb`);
    console.log("  Noc je nezměřila a není ruční sonda, ze které by šel vzít poměr.");
    console.log("  Změř jednu desku té hloubky a zapiš sondu do MANUAL_PROBES.");
    process.exitCode = 1;
    return;
  }

  // Čas se bere z logu, ne z hodin: tabulka má říkat, **ke kterému měření**
  // patří. Runner do řádků píše jen hodiny bez data, takže datum dává čas
  // poslední změny logu - tedy konec poslední noci, která do něj psala.
  const table: BoardCostTable = {
    measuredAt: statSync(EXPANSION_LOG_PATH).mtime.toISOString().slice(0, 16).replace("T", " "),
    source: EXPANSION_LOG_PATH,
    solves: solves.length,
    depths,
  };

  if (!write) {
    console.log("");
    console.log(`na disk se nic nezapsalo; zapiš přes --write do ${BOARD_COST_PATH}`);
    return;
  }
  writeFileSync(BOARD_COST_PATH, `${JSON.stringify(table, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`zapsáno do ${BOARD_COST_PATH}`);
}

main();
