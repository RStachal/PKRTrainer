/**
 * Která riverová pravidla se vejdou do rozpočtu rodiny, a v jakém pořadí.
 *
 * Rozpočet se dělí rovným dílem mezi rozhodnutí (uzel a strana stolu, tedy to,
 * co porovnává resolver). **Assumption:** poměr, ve kterém trenažér ty situace
 * rozdává, změřený není; bez dělení by nejčastější situace zabrala všechno.
 *
 * ## Proč se uvnitř rozhodnutí střídají desky, a ne podhry (20. 10. 2026)
 *
 * Uvnitř rozhodnutí se dosud střídalo po turnových podhrách v pořadí adresářů,
 * tedy podle jména desky. Dokud měla deska na rozhodnutí podhru nebo dvě, bylo
 * to totéž jako střídat desky. Noční riverové fáze ale od září přidávaly vrstvy
 * po dodávaných turnových pravidlech, tedy několik podher na desku, a podher na
 * rozhodnutí je dnes víc, než kolik činí jeho podíl rozpočtu. První kolo
 * střídání pak skončilo dřív, než došlo na desky z konce abecedy.
 *
 * Plný cyklus 19. 10. 2026 tak 21 riverovým packům vzal 103 desek a nepřidal
 * žádnou. `MTT9_20BB_BTN_BB_SRP_LOWSPR` měl 15 desek po 20 pravidlech; po
 * přegenerování zbylo 8 desek (222r až 986tt) a 999r, A54mono až A98r vypadly,
 * přestože jejich vrstvy na disku jsou. Hráč by na riveru viděl o třetinu méně
 * flopových textur. Našel to `riverSolvedAnswer.test.ts`, který se ptá právě
 * na 999r.
 *
 * Střídá se proto o úroveň výš: v každém kole jedno pravidlo z každé desky,
 * uvnitř desky střídavě po podhrách, v podhře podle dosahu. Desky i podhry jdou
 * od nejčastěji dosahovaných, takže když se přece jen nevejdou všechny, vypadne
 * ta nejméně dosahovaná, ne ta s pozdějším jménem.
 *
 * ## Proč na pořadí výsledku záleží
 *
 * Bajtový strop modulu (`trimToModuleBudget`) drží prefix seznamu. Výsledek
 * šel dosud rozhodnutí po rozhodnutí, takže ořez by sebral celé poslední
 * rozhodnutí a ostatních se nedotkl. Teď jsou i rozhodnutí proložená, a prefix
 * je tak v každé délce vyvážený: ořez ubere nejméně důležitá pravidla všude.
 */
export interface RiverBudgetKeys<T> {
  decision: (rule: T) => string;
  board: (rule: T) => string;
  subgame: (rule: T) => string;
  reach: (rule: T) => number;
}

export function pickRiverRulesWithinBudget<T>(
  rules: readonly T[],
  budget: number,
  keys: RiverBudgetKeys<T>,
): T[] {
  // rozhodnutí -> deska -> turnová podhra -> pravidla
  const byDecision = new Map<string, Map<string, Map<string, T[]>>>();
  for (const rule of rules) {
    const decision = keys.decision(rule);
    const boards = byDecision.get(decision) ?? new Map<string, Map<string, T[]>>();
    const board = keys.board(rule);
    const subgames = boards.get(board) ?? new Map<string, T[]>();
    const subgame = keys.subgame(rule);
    const bucket = subgames.get(subgame) ?? [];
    bucket.push(rule);
    subgames.set(subgame, bucket);
    boards.set(board, subgames);
    byDecision.set(decision, boards);
  }

  const share = Math.max(1, Math.floor(budget / Math.max(1, byDecision.size)));
  const byReach = (left: T, right: T): number => keys.reach(right) - keys.reach(left);
  const perDecision: T[][] = [];
  for (const boards of byDecision.values()) {
    const boardQueues = [...boards.values()].map((subgames) => {
      const queues = [...subgames.values()].map((bucket) => [...bucket].sort(byReach));
      queues.sort((left, right) => byReach(left[0], right[0]));
      return interleave(queues);
    });
    boardQueues.sort((left, right) => byReach(left[0], right[0]));
    perDecision.push(interleave(boardQueues).slice(0, share));
  }
  return interleave(perDecision).slice(0, budget);
}

/** Po jednom z každé fronty, dokud některá má co dát. */
function interleave<T>(queues: readonly (readonly T[])[]): T[] {
  const out: T[] = [];
  for (let round = 0; ; round += 1) {
    let placed = 0;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      out.push(queue[round]);
      placed += 1;
    }
    if (placed === 0) return out;
  }
}
