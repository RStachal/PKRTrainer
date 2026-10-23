import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSolverBoardCoveragePlan,
  classifySolverBoardId,
  LEGACY_TEXAS_SOLVER_BOARDS,
  SOLVER_BOARD_COHORTS,
  type SolverBoardCohortId,
} from "../src/core/texasSolverBoardCatalog.ts";
import type { Position, StackBucket } from "../src/core/types";
import { srpSolverInputRanges } from "../src/data/ranges/solverInputRanges.ts";
import {
  CHECKPOINT_BASE,
  CHIPS_PER_BB,
  EXPANSION_PARAMS_DIR,
  OPEN_TO_BB,
  SRP_POT_BB,
  srpMonolithParams,
} from "./lib/srpMonolithParams.mts";
import { readExpansionQueue } from "./lib/expansionQueue.mts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";

/**
 * Další desky rodinám, které mají flopů nejmíň.
 *
 *   npm run mtt:board-growth                       # co by vzniklo
 *   npm run mtt:board-growth -- --boards=6 --write # zapsat parametry pro noc
 *   npm run mtt:board-growth -- --write --flop-only # a rozklad ať je vynechá
 *
 * ## Proč to musí vzniknout
 *
 * Změřeno 14. 9. 2026: flopové packy nejsou omezené rozpočtem (26 az 230 KiB
 * proti 500) a dodávají všechno, co je na disku - jenže **30 ze 48 rodin má
 * na disku šest desek**, a je to týchž šest textur (`A72r`, `883r`, `986tt`,
 * `AT4mono`, `742r`, `K98tt`), se kterými se dvojice sedaček zakládaly. Hráč
 * tedy v třiceti rodinách potkává pořád stejných šest flopů. Flop drží šířka
 * desek, ne rozpočet ani kód.
 *
 * ## Co se vybírá
 *
 * Katalog desek zná čtrnáct kohort textur; zakládací šestice pokrývá šest.
 * Každé rodině se doplní jedna deska za každou **chybějící** kohortu, v pořadí
 * podle toho, jak často se textura rozdává (nejdřív A-high dynamické a
 * broadway suché, nakonec tripsy). Bere se deska, kterou projekt už někde
 * solvil (`LEGACY_TEXAS_SOLVER_BOARDS`), aby textury zůstaly sdílené napříč
 * rodinami; teprve když v kohortě žádná není, vezme se první z růstového plánu.
 *
 * ## Co to stojí, a proč se to píše dopředu
 *
 * Změřeno na 25BB rodinách (noc 20./21. 8. a rozklad 21./22. 8. 2026):
 * monolit 1,5 az 6,3 min na desku, turnová vrstva 3,8 az 14,7 min - dohromady
 * kolem **11 min na desku**. Šest desek pro třicet rodin je 180 desek, tedy
 * ~33 h, **tři až čtyři celé noci**, během kterých riverová fáze (turnová EV)
 * nepoběží - turn má přednost a fronta bere celé okno. To je cena, kterou
 * majitel zvolil 14. 9. 2026 („musíme zapracovat na dodání obsahu na flopu").
 *
 * Soubory jdou do téže složky jako zakládací dávka, protože jen odtud noční
 * expanze čte, s číslem za poslední existující; **pořadí je po deskách, ne po
 * rodinách**: napřed první nová deska všem rodinám, pak druhá - tak po každé
 * noci mají rodiny podobně, ne jedna dvanáct a ostatní šest.
 */

const write = process.argv.includes("--write");
/**
 * `--flop-only`: zapsat desky i do seznamu, který noční rozklad vynechá.
 *
 * Monolit dá flopový pack; turnová vrstva k němu je turnový obsah a stojí
 * ~8 min na desku (174 desek = ~2 noci bez turnové EV), přičemž turnové packy
 * sedí na 260 pravidlech, takže by většinou jen vyměnila pravidlo za pravidlo.
 * Seznam `artifacts/decomposition/flop-only-boards.txt` čte runner; přidat
 * i odebrat řádek jde kdykoli, rozklad vynechané desky dožene, až se odeberou.
 */
const flopOnly = process.argv.includes("--flop-only");
const boardsPerFamily = Number(
  process.argv.find((arg) => arg.startsWith("--boards="))?.split("=")[1] ?? 6,
);
const maxExisting = Number(
  process.argv.find((arg) => arg.startsWith("--max-boards="))?.split("=")[1] ?? 6,
);
const WORK = "artifacts/decomposition";
const FLOP_ONLY_LIST = join(WORK, "flop-only-boards.txt");

/** Kohorty od nejčastěji rozdávané textury; ta pořadí je volba, ne měření. */
const COHORT_ORDER: readonly SolverBoardCohortId[] = [
  "ACE_HIGH_DYNAMIC",
  "BROADWAY_DRY_RAINBOW",
  "MIDDLE_DRY_RAINBOW",
  "LOW_DYNAMIC",
  "HIGH_PAIRED_RAINBOW",
  "PAIRED_TWO_TONE",
  "ACE_HIGH_DRY_RAINBOW",
  "BROADWAY_DYNAMIC",
  "MIDDLE_DYNAMIC",
  "LOW_DRY_RAINBOW",
  "LOW_PAIRED_RAINBOW",
  "HIGH_MONOTONE",
  "LOW_MONOTONE",
  "TRIPS_RAINBOW",
];

/** Sedačky v preflopovém pořadí. */
const SEATS: readonly Position[] = [
  "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB",
];
const asToken = (seat: Position) => seat.replace("+", "_");

/** `MTT9_25BB_UTG_2_BTN_SRP` na hloubku, otvírače a obránce. */
function parseSrpFamily(familyId: string): { depth: number; opener: Position; defender: Position } | undefined {
  const match = /^MTT9_(\d+)BB_(.+)_SRP$/.exec(familyId);
  if (match === null) return undefined;
  const body = match[2];
  const byLongest = [...SEATS].sort((left, right) => asToken(right).length - asToken(left).length);
  const opener = byLongest.find((seat) => body.startsWith(`${asToken(seat)}_`));
  if (opener === undefined) return undefined;
  const rest = body.slice(asToken(opener).length + 1);
  const defender = SEATS.find((seat) => asToken(seat) === rest);
  return defender === undefined ? undefined : { depth: Number(match[1]), opener, defender };
}

/** Desky na disku po rodinách - jen ty s plánem, tedy rozložené. */
function boardsOnDisk(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!existsSync(WORK)) return out;
  for (const name of readdirSync(WORK)) {
    if (!name.includes("__")) continue;
    if (!existsSync(join(WORK, name, "plan.json"))) continue;
    const [family, board] = name.split("__");
    out.set(family, [...(out.get(family) ?? []), board]);
  }
  return out;
}

/**
 * Desky už nastagované pro noc (i bez checkpointu), aby se nezapsaly dvakrát.
 * Fronta se čte sdíleným modulem, tedy stejně jako ji čte runner.
 */
const queue = readExpansionQueue();
function stagedBoards(): Set<string> {
  return new Set(queue.boards.map((board) => `${board.familyId}__${board.boardId}`));
}

/** Deska za kohortu: nejdřív ta, kterou projekt už solvil jinde. */
function boardForCohort(cohort: SolverBoardCohortId, existing: readonly string[]): string | undefined {
  const legacy = Object.keys(LEGACY_TEXAS_SOLVER_BOARDS)
    .filter((id) => classifySolverBoardId(id).cohortId === cohort && !existing.includes(id))
    .sort();
  if (legacy.length > 0) return legacy[0];
  const row = buildSolverBoardCoveragePlan(existing).find((item) => item.id === cohort);
  return row?.growthBoardIds.find((id) => !existing.includes(id));
}

await loadCompleteMttProductionRegistry();

const onDisk = boardsOnDisk();
const staged = stagedBoards();
const plans: { familyId: string; boards: string[]; oop: Record<string, number>; ip: Record<string, number>; potChips: number; stackChips: number }[] = [];
const skipped: string[] = [];

for (const [familyId, boards] of [...onDisk].sort()) {
  if (boards.length > maxExisting) continue;
  const parsed = parseSrpFamily(familyId);
  if (parsed === undefined) { skipped.push(`${familyId}: není SRP dvojice, kterou umím založit z preflop packu`); continue; }
  const ranges = srpSolverInputRanges({
    openerSeat: parsed.opener, defenderSeat: parsed.defender, bucket: parsed.depth as StackBucket, ante: "OFF",
  });
  if (ranges === undefined) { skipped.push(`${familyId}: preflop pack nemá ranže`); continue; }
  const have = new Set(boards.map((id) => classifySolverBoardId(id).cohortId));
  const chosen: string[] = [];
  const taken = [...boards];
  for (const cohort of COHORT_ORDER) {
    if (chosen.length >= boardsPerFamily) break;
    if (have.has(cohort)) continue;
    const board = boardForCohort(cohort, taken);
    if (board === undefined || staged.has(`${familyId}__${board}`)) continue;
    chosen.push(board);
    taken.push(board);
  }
  if (chosen.length === 0) continue;
  plans.push({
    familyId,
    boards: chosen,
    oop: ranges.oop,
    ip: ranges.ip,
    potChips: Math.round(SRP_POT_BB * CHIPS_PER_BB),
    stackChips: Math.round((parsed.depth - OPEN_TO_BB) * CHIPS_PER_BB),
  });
}

// Po deskách, ne po rodinách (viz hlavička).
const files: { name: string; body: string }[] = [];
const rounds = Math.max(0, ...plans.map((plan) => plan.boards.length));
for (let round = 0; round < rounds; round += 1) {
  for (const plan of plans) {
    const boardId = plan.boards[round];
    if (boardId === undefined) continue;
    files.push({
      name: `${plan.familyId}_${boardId}.txt`,
      body: srpMonolithParams({
        familyId: plan.familyId, boardId, potChips: plan.potChips, stackChips: plan.stackChips, oop: plan.oop, ip: plan.ip,
      }),
    });
  }
}

/**
 * Šablona musí sedět na to, co už noc solvila.
 *
 * Kdyby se sdílená šablona lišila od souborů zakládací dávky byť v jednom
 * řádku, nové desky by hrály jiný strom než starých šest - a flopový pack by
 * je slepil do jedné rodiny. Ověřuje se proti prvnímu nastagovanému souboru.
 */
function templateMatchesStaged(): string {
  if (!existsSync(EXPANSION_PARAMS_DIR)) return "nelze ověřit: složka dávky neexistuje";
  const sample = readdirSync(EXPANSION_PARAMS_DIR).filter((name) => name.endsWith(".txt")).sort()[0];
  if (sample === undefined) return "nelze ověřit: dávka je prázdná";
  const match = /^\d+_(MTT9_(\d+)BB_.+_SRP)_([^_]+)\.txt$/.exec(sample);
  if (match === null) return `nelze ověřit: ${sample} nemá čekaný tvar`;
  const parsed = parseSrpFamily(match[1]);
  if (parsed === undefined) return `nelze ověřit: ${match[1]} není SRP dvojice`;
  const ranges = srpSolverInputRanges({
    openerSeat: parsed.opener, defenderSeat: parsed.defender, bucket: parsed.depth as StackBucket, ante: "OFF",
  });
  if (ranges === undefined) return `nelze ověřit: ${match[1]} nemá ranže`;
  const body = srpMonolithParams({
    familyId: match[1], boardId: match[3],
    potChips: Math.round(SRP_POT_BB * CHIPS_PER_BB),
    stackChips: Math.round((parsed.depth - OPEN_TO_BB) * CHIPS_PER_BB),
    oop: ranges.oop, ip: ranges.ip,
  });
  const onDiskBody = readFileSync(join(EXPANSION_PARAMS_DIR, sample), "utf8").replace(/\r\n/g, "\n");
  return body === onDiskBody ? `sedí bajt po bajtu na ${sample}` : `NESEDÍ na ${sample} - nezapisovat`;
}

const templateCheck = templateMatchesStaged();
const cohortLabel = (id: string) => SOLVER_BOARD_COHORTS.find((cohort) => cohort.id === id)?.label ?? id;

console.log("Další desky rodinám s nejmíň flopy");
console.log("");
console.log(`rodin na disku: ${onDisk.size}; s nejvýš ${maxExisting} deskami: ${[...onDisk.values()].filter((b) => b.length <= maxExisting).length}`);
console.log(`k dosolvení: ${plans.length} rodin, ${files.length} desek (nejvýš ${boardsPerFamily} na rodinu)`);
console.log(`odhad: ${files.length} x ~11 min = ${(files.length * 11 / 60).toFixed(0)} h, tedy ~${(files.length * 11 / 600).toFixed(1)} nocí bez riverové fáze`);
console.log(`šablona: ${templateCheck}`);
if (plans.length > 0) {
  const byCohort = new Map<string, number>();
  for (const plan of plans) for (const id of plan.boards) {
    const cohort = classifySolverBoardId(id).cohortId;
    byCohort.set(`${cohortLabel(cohort)} (${id})`, (byCohort.get(`${cohortLabel(cohort)} (${id})`) ?? 0) + 1);
  }
  console.log("");
  console.log("desky podle textury:");
  for (const [label, count] of [...byCohort].sort((l, r) => r[1] - l[1])) console.log(`  ${String(count).padStart(3)}  ${label}`);
  console.log("");
  console.log(`první rodina: ${plans[0].familyId} -> ${plans[0].boards.join(", ")}`);
}
if (skipped.length > 0) {
  console.log("");
  console.log(`vynecháno (${skipped.length}):`);
  for (const line of skipped.slice(0, 8)) console.log(`  ${line}`);
}

if (!write) {
  console.log("");
  console.log("Nic nezapsáno. Zápis: npm run mtt:board-growth -- --write");
} else if (!templateCheck.startsWith("sedí")) {
  console.log("");
  console.log("Nezapsáno: šablona nesedí na zakládací dávku, nové desky by hrály jiný strom.");
  process.exitCode = 1;
} else {
  mkdirSync(EXPANSION_PARAMS_DIR, { recursive: true });
  for (const plan of plans) mkdirSync(join(CHECKPOINT_BASE, plan.familyId, "raw"), { recursive: true });
  let index = queue.highestIndex;
  for (const file of files) {
    index += 1;
    writeFileSync(join(EXPANSION_PARAMS_DIR, `${String(index).padStart(4, "0")}_${file.name}`), file.body, "utf8");
  }
  if (flopOnly) {
    const existing = existsSync(FLOP_ONLY_LIST) ? readFileSync(FLOP_ONLY_LIST, "utf8").split(/\r?\n/) : [];
    const lines = new Set(existing.map((line) => line.trim()).filter((line) => line.length > 0));
    for (const plan of plans) for (const boardId of plan.boards) lines.add(`${plan.familyId}__${boardId}`);
    writeFileSync(FLOP_ONLY_LIST, `${[...lines].join("\n")}\n`, "utf8");
    console.log(`Desky zapsány i do ${FLOP_ONLY_LIST}: rozklad je vynechá (${lines.size} řádků)`);
  }
  console.log("");
  console.log(`Zapsáno ${files.length} parametrů do ${EXPANSION_PARAMS_DIR} (čísla od ${String(index - files.length + 1).padStart(4, "0")})`);
  console.log("Solve je noční monolitický běh (PKRTrainer-Night-Expansion); tenhle skript ho nespouští.");
  console.log("Po dosolvení se flopové packy přestaví plným cyklem: npm run mtt:after-night -- --write");
}
