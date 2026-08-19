import { execFileSync } from "node:child_process";

/**
 * Části generátoru packů, které nezávisí na ulici.
 *
 * Turnový generátor je jediné místo, kde se z 4,2 GB solverového výstupu stává
 * obsah pro hráče, a stálo to několik oprav, které nejsou samozřejmé: určení
 * strany stolu ze dvou nezávislých signálů, vyloučení boardů z redukovaného
 * stromu, mapování sedaček podle postflopového pořadí. Riverový generátor
 * potřebuje přesně totéž.
 *
 * Kopie by znamenala dvě místa, kde se opravuje jedna chyba. Tenhle soubor je
 * proto společný a scripty ho importují; samotné generátory drží jen to, co je
 * pro jejich ulici jiné - jak se prochází adresáře, jak se jmenuje karta v plánu
 * a kam se zapisuje.
 */

/** "AhKs" to "AKs", so a node's combinations can be compared with a plan's range. */
export function handClassOfCombo(combo: string): string | undefined {
  if (combo.length < 4) return undefined;
  const [rankOne, suitOne, rankTwo, suitTwo] = combo;
  if (rankOne === rankTwo) return `${rankOne}${rankTwo}`;
  return `${rankOne}${rankTwo}${suitOne === suitTwo ? "s" : "o"}`;
}

/**
 * Which player a solved node belongs to, decided by its hand classes.
 *
 * The directory name cannot answer this. `MTT9_25BB_CO_BB_SRP_CBET_LOWSPR` names
 * the flop c-bet that defines the family, and the turn node inside it turned out
 * to hold the big blind's strategy for acting first after calling that c-bet -
 * so filing by name would have shown the cutoff's seat the big blind's answers.
 *
 * The plan states both ranges at every turn it planned, `oop` and `ip`, which is
 * the solve's own record of who holds what. Overlap decides it. The two ranges
 * are not disjoint - both players hold sixes on a board with a six - so the test
 * is which side the node's classes are more contained in, and by enough of a
 * margin that the answer is not a coin toss.
 */
export function heroSideOfNode(
  node: { player?: unknown; strategy?: { strategy?: Record<string, unknown> } },
  item: { oop?: Record<string, number>; ip?: Record<string, number> },
): { side: "OOP" | "IP"; confidence: number; source: "OVERLAP" | "NODE_PLAYER" } | undefined {
  // Solver sám říká, kdo je na tahu, a plán mapuje jeho indexy: `reach[1]` je
  // OOP, `reach[0]` je IP. Tohle je přímý údaj, ne odvození - a přesně tenhle
  // údaj se dosud nepoužíval.
  const fromPlayer: "OOP" | "IP" | undefined = node.player === 1
    ? "OOP"
    : node.player === 0 ? "IP" : undefined;
  const combos = Object.keys(node.strategy?.strategy ?? {});
  const classes = new Set(
    combos.map(handClassOfCombo).filter((item): item is string => item !== undefined),
  );
  if (classes.size === 0) return undefined;

  const oopKeys = new Set(Object.keys(item.oop ?? {}));
  const ipKeys = new Set(Object.keys(item.ip ?? {}));

  const containment = (keys: Set<string>) => {
    let inside = 0;
    for (const handClass of classes) if (keys.has(handClass)) inside += 1;
    return inside / classes.size;
  };
  const oopContainment = containment(oopKeys);
  const ipContainment = containment(ipKeys);

  // Containment alone cannot decide this, and relying on it threw away 4,882
  // turns. The two ranges overlap heavily and the wider one contains the
  // narrower node almost by construction, so whichever player was dealt the
  // looser range wins on containment whoever the node actually belongs to - and
  // the margin test that was meant to catch the ambiguity simply rejected the
  // whole family instead.
  //
  // The classes only one side can hold are the evidence. A hand in the big
  // blind's defending range and not in the cutoff's opening range identifies its
  // owner outright, and a node holding several of those has said whose it is.
  let oopOnly = 0;
  let ipOnly = 0;
  for (const handClass of classes) {
    const inOop = oopKeys.has(handClass);
    const inIp = ipKeys.has(handClass);
    if (inOop && !inIp) oopOnly += 1;
    if (inIp && !inOop) ipOnly += 1;
  }

  const [side, containmentOfSide, exclusive, otherExclusive] = oopOnly >= ipOnly
    ? ["OOP" as const, oopContainment, oopOnly, ipOnly]
    : ["IP" as const, ipContainment, ipOnly, oopOnly];

  // The node's classes have to be inside the range claimed for them, and the
  // exclusive evidence has to point one way rather than being split. Both, or
  // the turn is left out: shipping a coin toss decides which player's strategy a
  // reader is shown by rounding.
  // Překryv nerozhodl. Dřív to znamenalo turn zahodit - u rodin blind proti
  // blindu se tak ztrácely tisíce, protože obě range jsou široké a podobné a
  // výhradních tříd je málo. Solverův vlastní údaj o hráči na tahu tu pochybnost
  // nemá, tak se použije.
  const overlapUndecided = containmentOfSide < HERO_CONTAINMENT_FLOOR ||
    exclusive === 0 ||
    exclusive < otherExclusive * HERO_EXCLUSIVE_RATIO;
  if (overlapUndecided) {
    return fromPlayer === undefined
      ? undefined
      : { side: fromPlayer, confidence: 1, source: "NODE_PLAYER" };
  }

  // Oba signály rozhodly a neshodly se. Jeden z nich je špatně a nevíme který,
  // takže se turn zahodí - to je jediná odpověď, která nehádá, čí strategii
  // hráči ukážeme.
  //
  // Na současných datech se to nestane ani jednou: 2 564 shod, 0 neshod, 244
  // případů, kde překryv nerozhodne a rozhodne uzel. Dřívější měření hlásilo
  // dvanáct neshod, ale porovnávalo uzel s ranži z nesprávné položky plánu -
  // soubor `BET17_CALL__2c.json` patří lince bez úvodního checku, ne první
  // položce se stejnou turnovou kartou. Ta větev tedy hlídá něco, co dnes
  // nenastává, a to je důvod ji nechat: až nastane, je to vada, ne detail.
  if (fromPlayer !== undefined && fromPlayer !== side) return undefined;
  return { side, confidence: Math.round(containmentOfSide * 1000) / 1000, source: "OVERLAP" };
}

/** Share of a node's classes that must sit inside the range claimed for it. */
export const HERO_CONTAINMENT_FLOOR = 0.9;
/**
 * How far ahead the winning side's exclusive evidence must be.
 *
 * Three to one. Card removal and rounding put a stray class on the wrong side of
 * this line now and then, so demanding none at all would reject sound turns; a
 * near-tie is a genuine ambiguity and gets rejected.
 */
export const HERO_EXCLUSIVE_RATIO = 3;


/**
 * The two seats a family names, and which of them acts last after the flop.
 *
 * Postflop order runs SB, BB, then UTG round to the button, so the later a seat
 * sits in that order the more often it is in position - with the blinds first
 * rather than last, which is the whole reason this cannot be read off the
 * preflop order.
 */
export const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG_1", "UTG_2", "LJ", "HJ", "CO", "BTN"];

export function seatsOfFamily(
  directoryName: string,
): { oop: string; ip: string; aggressor: string } | undefined {
  const match = /^MTT9_\d+BB_([A-Z0-9_]+?)_([A-Z0-9_]+?)_(SRP|3BP)/.exec(directoryName);
  if (match === null) return undefined;
  const [first, second, potType] = [match[1], match[2], match[3]];
  const rank = (seat: string) => POSTFLOP_ORDER.indexOf(seat);
  if (rank(first) < 0 || rank(second) < 0) return undefined;
  // The name lists the seats in the order they acted before the flop. In a
  // single-raised pot that makes the first one the raiser; in a three-bet pot
  // the first opened and the second raised them, so the aggressor is the second.
  const aggressor = potType === "3BP" ? second : first;
  const seats = rank(first) < rank(second)
    ? { oop: first, ip: second }
    : { oop: second, ip: first };
  return { ...seats, aggressor };
}


/**
 * Boardy vyřešené na plném solverovém stromu, po rodinách.
 *
 * Tři rodiny mají část boardů z plného stromu a část z redukovaného, který
 * vznikl jen pro review. Agregát přes obojí míchá dvě různé hry - a dvě z těch
 * rodin jsou mezi turn rodinami, které se dodávají hráči. Redukovaný board se
 * proto do packu nedostane; radši užší rodina než rodina, která tiše kombinuje
 * dva stromy.
 *
 * Když audit neproběhne, vrátí se prázdná mapa a nefiltruje se. Riziko, které
 * neumíme změřit, se hlásí jinde; tohle je generátor, ne brána.
 */
export function fullTreeBoardsByFamily(): Map<string, Set<string>> {
  const byFamily = new Map<string, Set<string>>();
  try {
    const output = execFileSync(process.execPath, [
      "scripts/run-cli.mjs",
      "scripts/auditTexasSolverTreeProvenance.mts",
      "--json",
    ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const start = output.indexOf("{");
    if (start < 0) return byFamily;
    const report = JSON.parse(output.slice(start)) as {
      families?: Array<{
        familyId?: unknown;
        fullTree?: unknown;
        reducedTree?: unknown;
        boardRows?: Array<{ boardId?: unknown; profile?: unknown }>;
      }>;
    };
    for (const family of report.families ?? []) {
      // Rodina celá na jednom stromě se nefiltruje: filtr má řešit míchání, ne
      // zužovat rodiny, u kterých není co míchat.
      if (Number(family.fullTree) === 0 || Number(family.reducedTree) === 0) continue;
      const boards = new Set<string>();
      for (const row of family.boardRows ?? []) {
        if (String(row.profile) === "FULL_TREE") boards.add(String(row.boardId));
      }
      byFamily.set(String(family.familyId).toUpperCase(), boards);
    }
  } catch {
    return new Map();
  }
  return byFamily;
}


/**
 * Kolik smí mít vygenerovaný modul bajtů, než ho rozpočet svazku odmítne.
 *
 * Musí sedět s `BUNDLE_MAX_LAZY_MTT_JS_KB` v `checkBundleBudget.mts`. Drobná
 * rezerva je schválně: rozpočet měří hotový JS chunk po sestavení, tohle měří
 * JSON před ním, a ty dvě čísla si nejsou rovna.
 */
export const MODULE_BUDGET_BYTES = Math.floor(500 * 1024);

/**
 * Ořež pravidla, dokud se modul nevejde do rozpočtu.
 *
 * Generátory se dosud řídily počtem pravidel (`RULE_BUDGET`), jenže rozpočet je
 * v kilobajtech a velikost jednoho pravidla se rodinu od rodiny liší podle toho,
 * kolik kombinací nese. Proxy proto neplatí: `MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR`
 * se vešla do tří set pravidel a vyrobila modul o 527 KiB proti limitu 512.
 *
 * Ořezává se od konce, ne podle dosahu. Pořadí, ve kterém pravidla přišla, už je
 * výsledkem rozdělení rozpočtu mezi jednotlivá rozhodnutí rovným dílem; setřídit
 * je znovu podle dosahu by tu rovnováhu zahodilo a rodina by mohla skončit s
 * jedním rozhodnutím pokrytým a ostatními prázdnými.
 *
 * Hledá se půlením, aby se modul nesestavoval stokrát.
 */
export function trimToModuleBudget<R>(
  rules: readonly R[],
  sizeOf: (candidate: readonly R[]) => number,
  budgetBytes: number = MODULE_BUDGET_BYTES,
): { kept: R[]; dropped: number } {
  if (rules.length === 0 || sizeOf(rules) <= budgetBytes) {
    return { kept: [...rules], dropped: 0 };
  }
  let low = 0;
  let high = rules.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sizeOf(rules.slice(0, mid)) <= budgetBytes) low = mid;
    else high = mid - 1;
  }
  return { kept: rules.slice(0, low), dropped: rules.length - low };
}

/**
 * Rodina, která tuhle nahradila, nebo `undefined`.
 *
 * `_REPAIR` je přeřešená verze téhož spotu. Obě projdou review bránou a obě umí
 * postavit pack - jenže resolver bere první pack v řetězci, který sedí, takže
 * kdyby se dodávaly obě, odpovídala by ta zaregistrovaná dřív. To může být ta
 * vadná, a poznat by to nešlo: obě nesou stejný pattern, stejnou hloubku a
 * stejný typ potu, a v UI se liší jen identifikátorem, který hráč nevidí.
 *
 * Kontrola byla dosud jen v turnovém generátoru, takže `MTT9_35BB_CO_BTN_3BP`
 * neprošla na turnu, ale na riveru ano - a produkt tak dodával riverovou
 * strategii z rodiny, kterou na ostatních ulicích sám odmítá. Našel to až plán
 * čtení, kde ta rodina svítila jako jediná se samotným riverem.
 *
 * Levnější je to zakázat než se na to spoléhat.
 */
export function supersededByRepair(
  familyId: string,
  manifestSource: string,
): string | undefined {
  const repair = `${familyId}_REPAIR`;
  return manifestSource.includes(`familyId: "${repair}"`) ? repair : undefined;
}
