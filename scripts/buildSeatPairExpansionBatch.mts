import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { texasSolverBoardForId } from "../src/core/texasSolverBoardCatalog.ts";
import {
  srpSolverInputRanges,
  toSolverRangeSpec,
} from "../src/data/ranges/solverInputRanges.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
import type { Position, StackBucket } from "../src/core/types";

/**
 * Parametry pro solver na dvojice sedaček, které rozklad nemá.
 *
 *   npm run mtt:seat-pair-expansion            # co by vzniklo
 *   npm run mtt:seat-pair-expansion -- --write # zapsat
 *
 * ## Proč
 *
 * Rozklad drží pět dvojic sedaček a trenažér se ptá na dvaatřicet vzorů, takže
 * dvanáct procent dotazů míří na spot, který vůbec máme. Dosud se nová rodina
 * zakládala tak, že někdo do skriptu napsal ranže ručně - to jde pro šest rodin,
 * ne pro sedmadvacet dvojic krát hloubky.
 *
 * Ranže se proto berou z produkčních preflop packů (`srpSolverInputRanges`) a
 * tenhle skript k nim doplní pot, stack a desky.
 *
 * ## Konvence potu, a proč nová
 *
 * Existující rodiny mají `set_pot 50` úplně všechny, ale žetonů na blind mají od
 * 4 do 6,5 - takže tentýž zápis znamená pot od 7,7 do 12,5 blindu. Ta
 * nejednotnost vznikla postupně a kopírovat ji do nových rodin by znamenalo
 * rozšířit zmatek na dvaatřicet vzorů.
 *
 * Nové rodiny proto počítají pot z pravidel hry: otvírač zvýší na 2,5 BB,
 * obránce dorovná, malý blind složí půl blindu. Pot je tedy 5,5 BB a za ním
 * zbývá hloubka minus 2,5 BB. Jeden blind je sto žetonů, aby se váhy ranží
 * vešly do celých čísel.
 *
 * Znamená to, že nové rodiny nebudou přímo srovnatelné se starými. Je to vědomé:
 * srovnatelnost s nejednotností nemá cenu.
 */

const write = process.argv.includes("--write");
/** Kolik rodin nejvýš založit. 522 desek nikdo neodsolví najednou. */
const limit = Number(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 0,
);

/**
 * Jak často se trenažér na který vzor ptá.
 *
 * Bez toho by rozšíření vznikalo v abecedním pořadí, tedy náhodně vzhledem k
 * tomu, co hráč doopravdy potkává. Měření běží nad skutečným rozdáváním, takže
 * první odsolvené rodiny jsou ty, které nejdřív někdo uvidí.
 *
 * Když měření neproběhne, řadí se abecedně a **řekne se to** - tiché seřazení
 * podle ničeho by vypadalo stejně důvěryhodně jako podle poptávky.
 */
function demandByPattern(): { counts: Map<string, number>; measured: boolean } {
  try {
    const out = execFileSync(process.execPath, [
      "scripts/run-cli.mjs", "scripts/checkSolvedSpotCoverage.mts", "--spots=200", "--json",
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const start = out.lastIndexOf("{\"schemaVersion");
    if (start < 0) return { counts: new Map(), measured: false };
    const parsed = JSON.parse(out.slice(start)) as {
      askedPatterns?: { pattern: string; count: number }[];
    };
    const counts = new Map<string, number>();
    for (const row of parsed.askedPatterns ?? []) counts.set(row.pattern, row.count);
    return { counts, measured: counts.size > 0 };
  } catch {
    return { counts: new Map(), measured: false };
  }
}
const OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_seat_pair_expansion_v1";
const WORK = "artifacts/decomposition";

/** Sto žetonů na blind: váhy ranží se pak vejdou do celých čísel. */
const CHIPS_PER_BB = 100;
/** Otevření na 2,5 BB, dorovnání, složený malý blind. */
const SRP_POT_BB = 5.5;
const OPEN_TO_BB = 2.5;

/**
 * Desky, na kterých se rodina zakládá.
 *
 * Šest textur, ne víc: každá deska je samostatný solve a rodina se dodává až
 * úplná, takže široký záběr na začátku znamená, že se nedodá nic. Výběr drží
 * jednu suchou vysokou, jednu spárovanou, jednu spojenou, jednu monotónní, jednu
 * nízkou a jednu se dvěma stejnými barvami - to jsou třídy, které se od sebe
 * strategicky liší nejvíc.
 */
const BOARD_IDS = ["A72r", "883r", "986tt", "AT4mono", "742r", "K98tt"] as const;

/** Hloubky, na kterých má smysl zakládat: mělká, střední, hluboká. */
const DEPTHS: readonly StackBucket[] = [25, 50, 100] as StackBucket[];

/** Sedačky v preflopovém pořadí; dvojice se berou jen "dřívější otevře". */
const SEATS: readonly Position[] = [
  "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB",
];

function heldPairs(): Set<string> {
  const held = new Set<string>();
  if (!existsSync(WORK)) return held;
  for (const name of readdirSync(WORK)) {
    if (!name.includes("__")) continue;
    const match = /^MTT9_\d+BB_([A-Z0-9_]+?_[A-Z0-9_]+?_(?:SRP|3BP))/.exec(name.split("__")[0]);
    if (match !== null) held.add(match[1]);
  }
  return held;
}

/** `UTG` + `BB` na `UTG_BB_SRP`, tedy tvar, jaký nesou jména rodin. */
function pairId(opener: Position, defender: Position): string {
  const clean = (seat: string) => seat.replace("+", "_");
  return `${clean(opener)}_${clean(defender)}_SRP`;
}

await loadCompleteMttProductionRegistry();

const held = heldPairs();
const planned: {
  familyId: string;
  pair: string;
  depth: number;
  files: { name: string; body: string }[];
}[] = [];
const skipped: string[] = [];

for (const [openerIndex, opener] of SEATS.entries()) {
  for (const defender of SEATS.slice(openerIndex + 1)) {
    const pair = pairId(opener, defender);
    if (held.has(pair)) continue;
    for (const depth of DEPTHS) {
      const ranges = srpSolverInputRanges({
        openerSeat: opener, defenderSeat: defender, bucket: depth, ante: "OFF",
      });
      if (ranges === undefined) {
        skipped.push(`${pair} @ ${depth}BB: preflop pack nemá obě ranže`);
        continue;
      }
      const familyId = `MTT9_${depth}BB_${pair}`;
      const potChips = Math.round(SRP_POT_BB * CHIPS_PER_BB);
      const stackChips = Math.round((depth - OPEN_TO_BB) * CHIPS_PER_BB);

      const files = BOARD_IDS.map((boardId) => ({
        name: `${familyId}_${boardId}.txt`,
        body: [
          `set_pot ${potChips}`,
          `set_effective_stack ${stackChips}`,
          `set_board ${texasSolverBoardForId(boardId)}`,
          `set_range_oop ${toSolverRangeSpec(ranges.oop)}`,
          `set_range_ip ${toSolverRangeSpec(ranges.ip)}`,
          // Stromy stejné jako u plného stromu existujících rodin: turnový donk
          // je ten znak, podle kterého se pozná plný strom od redukovaného.
          "set_bet_sizes oop,flop,bet,33,50,75",
          "set_bet_sizes oop,flop,raise,75,100",
          "set_bet_sizes oop,flop,allin",
          "set_bet_sizes ip,flop,bet,33,50",
          "set_bet_sizes ip,flop,raise,75,100",
          "set_bet_sizes ip,flop,allin",
          "set_bet_sizes oop,turn,bet,50,75",
          "set_bet_sizes oop,turn,raise,100",
          "set_bet_sizes oop,turn,donk,50",
          "set_bet_sizes oop,turn,allin",
          "set_bet_sizes ip,turn,bet,50,75",
          "set_bet_sizes ip,turn,raise,100",
          "set_bet_sizes ip,turn,allin",
          "set_bet_sizes oop,river,bet,50,75",
          "set_bet_sizes oop,river,raise,100",
          "set_bet_sizes oop,river,allin",
          "set_bet_sizes ip,river,bet,50,75",
          "set_bet_sizes ip,river,raise,100",
          "set_bet_sizes oop,river,donk,50",
          "set_bet_sizes ip,river,allin",
          "set_allin_threshold 0.67",
          "build_tree",
          "set_thread_num 12",
          "set_accuracy 0.5",
          "set_max_iteration 1200",
          "set_print_interval 100",
          "set_use_isomorphism 1",
          "start_solve",
          "set_dump_rounds 1",
          `dump_result ${familyId}_${boardId}.json`,
          "",
        ].join("\n"),
      }));
      planned.push({ familyId, pair, depth, files });
    }
  }
}

const demand = demandByPattern();
/** `UTG_BB_SRP` na `SRP_UTG_VS_BB`, tedy tvar, jakým se ptá trenažér. */
const askedForm = (pair: string) => {
  const match = /^(.+?)_(.+?)_SRP$/.exec(pair);
  return match === null ? pair : `SRP_${match[1]}_VS_${match[2]}`;
};
planned.sort((left, right) => {
  const byDemand = (demand.counts.get(askedForm(right.pair)) ?? 0)
    - (demand.counts.get(askedForm(left.pair)) ?? 0);
  return byDemand !== 0 ? byDemand : left.familyId.localeCompare(right.familyId);
});
const selected = limit > 0 ? planned.slice(0, limit) : planned;

const pairs = new Set(selected.map((row) => row.pair));
console.log("Rozšíření na chybějící dvojice sedaček");
console.log("");
console.log(`drženo dnes: ${held.size} dvojic`);
console.log(`k založení:  ${pairs.size} dvojic, ${selected.length} rodin, ${selected.length * BOARD_IDS.length} desek`);
console.log(demand.measured
  ? "pořadí:      podle změřené poptávky trenažéru"
  : "pořadí:      ABECEDNĚ - měření poptávky neproběhlo, takže první rodiny nejsou ty nejžádanější");
if (limit > 0 && planned.length > selected.length) {
  console.log(`omezeno:     ${selected.length} z ${planned.length} rodin (--limit)`);
}
console.log(`konvence:    pot ${SRP_POT_BB} BB (otevření na ${OPEN_TO_BB}, dorovnání, složený SB), ${CHIPS_PER_BB} žetonů na blind`);
if (skipped.length > 0) {
  console.log("");
  console.log(`nezaloženo (${skipped.length}):`);
  for (const line of skipped.slice(0, 6)) console.log(`  ${line}`);
}

const sample = selected[0];
if (sample !== undefined) {
  const ranges = srpSolverInputRanges({
    openerSeat: SEATS.find((seat) => sample.pair.startsWith(seat.replace("+", "_"))) ?? "UTG",
    defenderSeat: "BB",
    bucket: sample.depth as StackBucket,
    ante: "OFF",
  });
  console.log("");
  console.log("co si musí přečíst, kdo z toho solví:");
  for (const caveat of ranges?.caveats ?? []) console.log(`  - ${caveat}`);
}

if (!write) {
  console.log("");
  console.log("Nic nezapsáno. Zápis: npm run mtt:seat-pair-expansion -- --write");
} else {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  let index = 0;
  for (const family of selected) {
    for (const file of family.files) {
      index += 1;
      writeFileSync(
        join(OUTPUT_DIR, `${String(index).padStart(4, "0")}_${file.name}`),
        file.body,
        "utf8",
      );
    }
  }
  console.log("");
  console.log(`Zapsáno ${index} parametrů do ${OUTPUT_DIR}`);
  console.log("Solve je monolitický běh; tenhle skript ho nespouští.");
}
