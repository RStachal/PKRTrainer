import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { texasSolverBoardForId } from "../src/core/texasSolverBoardCatalog.ts";
import {
  srpSolverInputGap,
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

/** Kam ukládá checkpointy zbytek řetězu; noční rozklad je hledá právě tady. */
const CHECKPOINT_BASE =
  "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

/** Kam má solver zapsat checkpoint, absolutně a pod jménem, jaké se hledá. */
function checkpointPath(familyId: string, boardId: string): string {
  // Lomítka dopředu i na Windows: solver bere cestu jako řetězec a zpětné
  // lomítko si v parametrovém souboru vyloží jako escape.
  return resolve(CHECKPOINT_BASE, familyId, "raw", `pkrtrainer_${familyId}_${boardId}.json`)
    .split("\\").join("/");
}

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

/**
 * Hloubky, které se zakládají. Jen mělká, a je to změřené.
 *
 * Solve jedné desky téhle rodiny trvá podle hloubky řádově jinak dlouho -
 * naměřeno 20. 8. 2026 na `LJ_HJ_SRP`, deska A72r, plný strom, 1200 iterací:
 *
 * - **25BB: 148 vteřin**, commit 1,68 GB, doběhlo na exploitability 1,3 %
 * - 50BB: po pěti minutách pořád pod stou iterací z dvanácti set
 * - 100BB: po čtrnácti minutách totéž, commit 8,36 GB, odhad přes 2,5 hodiny
 *
 * Při jedenáctihodinovém okně to znamená kolem 260 desek za noc na 25BB, ale
 * sotva čtyři na 100BB. Šířka vzorů je dnes to, co chybí - dvaatřicet vzorů
 * proti pěti - takže mělká hloubka napříč vzory přinese mnohem víc než hloubka
 * u jednoho. Hlubší jde zapnout přes `--depths`, ale má se to dělat vědomě.
 */
const DEPTHS: readonly StackBucket[] = ((): readonly StackBucket[] => {
  const raw = process.argv.find((arg) => arg.startsWith("--depths="))?.split("=")[1];
  if (raw === undefined) return [25] as StackBucket[];
  return raw.split(",").map((value) => Number(value.trim())).filter((value) => value > 0) as StackBucket[];
})();

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
        // Říct **která** chybí. Bez toho se mezera stopuje ručně pokaždé znovu;
        // změřeno 27. 8. 2026, že je to vždycky ta obranná.
        const gap = srpSolverInputGap({
          openerSeat: opener, defenderSeat: defender, bucket: depth, ante: "OFF",
        });
        skipped.push(`${pair} @ ${depth}BB: preflop pack nemá ${gap.join(" ani ")}`);
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
          // Dvě kola, ne jedno.
          //
          // Existující rodiny mají všechny `set_dump_rounds 2` a jejich
          // checkpointy mají desítky megabajtů. S jedním kolem vyšel dump na
          // 204 kB - to je flopový uzel bez turnové vrstvy, tedy přesně to, co
          // noční rozklad potřebuje a nenašel by. Solver na to neupozorní:
          // soubor vznikne, jen je v něm míň, než kdo čeká.
          "set_dump_rounds 2",
          // Absolutní cesta a jméno, jaké čeká zbytek řetězu.
          //
          // Relativní cesta se u solveru vyhodnotí proti jeho vlastnímu kořeni,
          // kde nic z tohohle neleží - a on na to neupozorní: nic nevypíše,
          // vrátí nulu a soubor prostě nevznikne tam, kde ho někdo hledá. Tahle
          // past už jednou stála jednu vrstvu odsolvovanou dvakrát.
          //
          // Jméno musí být `pkrtrainer_<rodina>_<deska>.json` a ležet v
          // `<output>/<rodina>/raw/`, protože přesně to hledá noční rozklad i
          // kontrola, jestli rodina vůbec má checkpoint.
          `dump_result ${checkpointPath(familyId, boardId)}`,
          "",
        ].join("\n"),
      }));
      planned.push({ familyId, pair, depth, files });
    }
  }
}

const demand = demandByPattern();

/** Sedačka tak, jak ji píše jméno dvojice: `UTG+1` je v něm `UTG_1`. */
const asToken = (seat: Position) => seat.replace("+", "_");

/**
 * Rozdělí `UTG_2_BTN_SRP` na otevírajícího a bránícího.
 *
 * Delší jméno se zkouší napřed, protože podtržítko je tu zároveň oddělovač i
 * součást názvu sedačky. Líný regex `^(.+?)_(.+?)_SRP$` vzal první rozdělení,
 * které projde, takže z `UTG_2_BTN_SRP` udělal `SRP_UTG_VS_2_BTN` - vzor, na
 * který se trenažér nikdy nezeptá. Poptávka těch dvanácti rodin proto vyšla
 * nula a seřadily se na konec, přestože se o ně hráči hlásí. **Stroj, který má
 * rozhodovat podle měření, si tím měření pokazil sám.**
 */
function seatsOfPair(pair: string): { opener: Position; defender: Position } | undefined {
  const body = pair.replace(/_(?:SRP|3BP)$/, "");
  const byLongest = [...SEATS].sort((left, right) => asToken(right).length - asToken(left).length);
  const opener = byLongest.find((seat) => body.startsWith(`${asToken(seat)}_`));
  if (opener === undefined) return undefined;
  const rest = body.slice(asToken(opener).length + 1);
  const defender = SEATS.find((seat) => asToken(seat) === rest);
  return defender === undefined ? undefined : { opener, defender };
}

/** `UTG_BB_SRP` na `SRP_UTG_VS_BB`, tedy tvar, jakým se ptá trenažér. */
const askedForm = (pair: string) => {
  const seats = seatsOfPair(pair);
  return seats === undefined
    ? pair
    : `SRP_${asToken(seats.opener)}_VS_${asToken(seats.defender)}`;
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
console.log(`hloubky:     ${DEPTHS.join(", ")} BB (měřeno: 25BB je 148 s na desku, 100BB přes 2,5 h)`);
console.log(`konvence:    pot ${SRP_POT_BB} BB (otevření na ${OPEN_TO_BB}, dorovnání, složený SB), ${CHIPS_PER_BB} žetonů na blind`);
if (skipped.length > 0) {
  console.log("");
  console.log(`nezaloženo (${skipped.length}):`);
  for (const line of skipped.slice(0, 6)) console.log(`  ${line}`);
}

const sample = selected[0];
if (sample !== undefined) {
  const ranges = srpSolverInputRanges({
    // Tatáž past jako u `askedForm`: `startsWith` uspěje na „UTG" i u dvojice,
    // která začíná „UTG_1", takže by se ranže ukázaly za jinou sedačku.
    openerSeat: seatsOfPair(sample.pair)?.opener ?? "UTG",
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
  // Solver adresář sám nezaloží a na chybějící cestu neupozorní - jen soubor
  // nevznikne.
  for (const family of selected) {
    mkdirSync(join(CHECKPOINT_BASE, family.familyId, "raw"), { recursive: true });
  }
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
