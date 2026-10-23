import { resolve } from "node:path";

import { texasSolverBoardForId } from "../../src/core/texasSolverBoardCatalog.ts";
import { toSolverRangeSpec } from "../../src/data/ranges/solverInputRanges.ts";

/**
 * Parametry monolitického solvu jedné desky SRP rodiny.
 *
 * Jeden zdroj pro založení nové dvojice sedaček (`mtt:seat-pair-expansion`) i
 * pro dosolvení dalších desek rodině, která už existuje (`mtt:board-growth`).
 * Dvě kopie téhož stromu by se rozešly v první úpravě - a strom je to, podle
 * čeho se pozná plný od redukovaného (turnový donk).
 */

/** Kam ukládá checkpointy zbytek řetězu; noční rozklad je hledá právě tady. */
export const CHECKPOINT_BASE =
  "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

/** Kam noční expanze čte parametry; jen odsud, v pořadí jména souboru. */
export const EXPANSION_PARAMS_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_seat_pair_expansion_v1";

/** Sto žetonů na blind: váhy ranží se pak vejdou do celých čísel. */
export const CHIPS_PER_BB = 100;
/** Otevření na 2,5 BB, dorovnání, složený malý blind. */
export const SRP_POT_BB = 5.5;
export const OPEN_TO_BB = 2.5;

/** Kam má solver zapsat checkpoint, absolutně a pod jménem, jaké se hledá. */
export function checkpointPath(familyId: string, boardId: string): string {
  // Lomítka dopředu i na Windows: solver bere cestu jako řetězec a zpětné
  // lomítko si v parametrovém souboru vyloží jako escape.
  return resolve(CHECKPOINT_BASE, familyId, "raw", `pkrtrainer_${familyId}_${boardId}.json`)
    .split("\\").join("/");
}

export function srpMonolithParams(options: {
  familyId: string;
  boardId: string;
  potChips: number;
  stackChips: number;
  oop: Record<string, number>;
  ip: Record<string, number>;
}): string {
  const { familyId, boardId, potChips, stackChips, oop, ip } = options;
  return [
    `set_pot ${potChips}`,
    `set_effective_stack ${stackChips}`,
    `set_board ${texasSolverBoardForId(boardId)}`,
    `set_range_oop ${toSolverRangeSpec(oop)}`,
    `set_range_ip ${toSolverRangeSpec(ip)}`,
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
  ].join("\n");
}
