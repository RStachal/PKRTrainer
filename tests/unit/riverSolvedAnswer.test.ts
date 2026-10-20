import { beforeEach, describe, expect, it } from "vitest";

import { clearSolvedRiverPacksForTests } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import type { RiverStrategyPack } from "../../src/data/ranges/riverStrategyPack";
import {
  createRiverSolvedStrategyResolverChain,
  RIVER_DEPTH_TOLERANCE_BB,
} from "../../src/data/ranges/riverStrategyResolver";
import type { RiverStrategyRule } from "../../src/data/ranges/riverStrategyRuleBuilder";
import { actionNodeForSolvedHero } from "../../src/data/ranges/solvedHeroActionNode";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";

/**
 * Vyřešený river se skutečně dostane k odpovědi.
 *
 * Turn strávil týdny ve stavu, kdy existoval na disku, stahoval se a nikdo se ho
 * na nic nezeptal. Pojistka o patro výš hlídá, že runtime pro ulici s manifestem
 * umí vydat resolver; tenhle test jde dál a ptá se na konkrétní desku, na které
 * ten obsah vznikl.
 *
 * Druhá polovina je stejně důležitá: deska, kterou nikdo neřešil, musí dostat
 * `null`. Odpovědět na ni z rodiny odvedle by bylo horší než heuristika, protože
 * heuristika se aspoň jako heuristika označuje - tahle odpověď by nesla cedulku
 * SOLVER_BACKED.
 *
 * ## Proč se spot bere z dodávaného obsahu (od 20. 10. 2026)
 *
 * Do té doby se test ptal natvrdo na 999r s turnem 2c a riverem 2d na 20 bb.
 * Plný cyklus 19. 10. tu desku z packu vyhodil - vadou výběru, kterou test
 * správně chytil (`scripts/lib/riverRuleBudget.mts`). Jenže ani po opravě se ten
 * spot nevrátil: oprava bere na každé desce nejčastěji dosahované linky a tahle
 * měla dosah 0,39 proti 0,93 u sousední. Pevný spot tak hlídal, co si zrovna
 * vybral generátor, ne jestli resolver odpovídá na vyřešený obsah. Ztrátu desek
 * teď hlídá test výběru; tenhle se ptá na první pravidlo hraní první, které se
 * opravdu dodává, a záporné případy si z téhož obsahu odvozuje tak, aby na ně
 * žádné pravidlo odpovědět nemohlo.
 */
const PROFILE = "FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF";

const board = (cards: readonly string[]) => cards.map((card) => ({
  rank: card[0] as never,
  suit: card[1] as never,
}));

/** Bez načtených packů; na obsahu nezáleží, jen na tom, že nic není načtené. */
const unloadedInput: PostflopStrategyInput = {
  street: "RIVER",
  positionPattern: "SRP_BTN_VS_BB",
  potType: "SINGLE_RAISED",
  effectiveStackBB: 20,
  potBB: 16.8,
  board: board(["9s", "9h", "9d", "2c", "2d"]),
  heroHand: "66",
  actionNode: "RIVER_OOP_LEAD",
} as unknown as PostflopStrategyInput;

const isLead = (rule: RiverStrategyRule): boolean => rule.spot?.hero?.facingBet === false
  && actionNodeForSolvedHero(rule.spot.hero, "RIVER") !== undefined;

/** První dodávané pravidlo hraní první a spot, na který odpovídá. */
function solvedLeadSpot(packs: readonly RiverStrategyPack[]): {
  rule: RiverStrategyRule;
  input: PostflopStrategyInput;
} {
  const rule = packs.flatMap((pack) => pack.rules).find(isLead);
  if (rule === undefined) throw new Error("dodávaný river nemá jediné pravidlo hraní první");
  const input = {
    street: "RIVER",
    positionPattern: rule.positionPattern,
    potType: rule.potType,
    effectiveStackBB: rule.stackBB,
    potBB: rule.spot?.potBB ?? 0,
    board: board([...rule.riverSpot.turnBoard, rule.riverSpot.riverCard]),
    heroHand: rule.buckets[0]?.handClasses[0],
    actionNode: actionNodeForSolvedHero(rule.spot?.hero, "RIVER"),
  } as unknown as PostflopStrategyInput;
  return { rule, input };
}

const sortedFlop = (cards: readonly string[]): string => cards.slice(0, 3)
  .map((card) => card.toLowerCase()).sort().join("");

/** Riverová karta, kterou na téhle desce a turnu nemá žádné dodávané pravidlo. */
function unsolvedRiverCard(packs: readonly RiverStrategyPack[], rule: RiverStrategyRule): string {
  const flop = sortedFlop(rule.riverSpot.turnBoard);
  const turn = rule.riverSpot.turnBoard[3].toLowerCase();
  const taken = new Set(rule.riverSpot.turnBoard.map((card) => card.toLowerCase()));
  for (const other of packs.flatMap((pack) => pack.rules)) {
    if (sortedFlop(other.riverSpot.turnBoard) !== flop) continue;
    if (other.riverSpot.turnBoard[3].toLowerCase() !== turn) continue;
    taken.add(other.riverSpot.riverCard.toLowerCase());
  }
  for (const rank of "23456789TJQKA") {
    for (const suit of "shdc") {
      if (!taken.has(`${rank}${suit}`.toLowerCase())) return `${rank}${suit}`;
    }
  }
  throw new Error("na téhle desce a turnu je vyřešená každá riverová karta");
}

/** Hloubka, na které v dosahu tolerance neleží žádné dodávané riverové pravidlo. */
function unsolvedDepth(packs: readonly RiverStrategyPack[], from: number): number {
  const depths = packs.flatMap((pack) => pack.rules.map((rule) => rule.stackBB));
  for (let depth = from + 2 * RIVER_DEPTH_TOLERANCE_BB + 1; depth < 1000; depth += 1) {
    if (depths.every((solved) => Math.abs(solved - depth) > RIVER_DEPTH_TOLERANCE_BB)) return depth;
  }
  throw new Error("každá hloubka má vyřešené pravidlo");
}

describe("vyřešený river odpovídá", () => {
  beforeEach(() => {
    clearSolvedRiverPacksForTests();
  });

  // Vlastní limit, ne výchozích pět vteřin.
  //
  // Tenhle případ načítá všechny dodávané riverové rodiny a těch bylo jedna,
  // dokud noční běh nedodal čtrnáct dalších. Výchozích pět vteřin pak přestalo
  // stačit a test spadl na obsahu, který přibyl - ne na vadě. Roste to dál,
  // takže limit musí být řádově jinde, ne o kousek výš.
  it("na desku, na které vznikl, vydá solverem podloženou akci", { timeout: 60000 }, async () => {
    const packs = await loadSolvedRiverPacks(PROFILE);
    const { input } = solvedLeadSpot(packs);
    const answer = createRiverSolvedStrategyResolverChain()(input);

    expect(answer).not.toBeNull();
    const source = answer?.source;
    // Provenience je strukturální, ne odvozená ze slov: buď ji zdroj nese, nebo
    // to není solverem podložená odpověď.
    expect(source !== undefined && "provenance" in source ? source.provenance : null)
      .toBe("SOLVER_BACKED");
    // Vysvětlení je pro hráče: mluví o hloubce a o skupině ruk, ne o rodině,
    // packu ani adresáři.
    expect(answer?.explanation).toContain("Vyřešený river");
    expect(answer?.explanation.toLowerCase()).not.toContain("zdroj");
    expect(answer?.explanation).not.toContain("MTT9_");
    expect(answer?.explanation).not.toContain("artifacts");
  });

  it("na pátou kartu, kterou nikdo neřešil, neodpoví", { timeout: 60000 }, async () => {
    const packs = await loadSolvedRiverPacks(PROFILE);
    const { rule, input } = solvedLeadSpot(packs);
    const river = unsolvedRiverCard(packs, rule);
    const other = { ...input, board: board([...rule.riverSpot.turnBoard, river]) };
    expect(createRiverSolvedStrategyResolverChain()(other)).toBeNull();
  });

  it("na jinou hloubku než vyřešenou neodpoví", { timeout: 60000 }, async () => {
    const packs = await loadSolvedRiverPacks(PROFILE);
    const { rule, input } = solvedLeadSpot(packs);
    // Po riveru už nic nenásleduje, takže hloubka se drží těsněji než u turnu:
    // rozdíl deseti blindů je rozdíl mezi sázkou za třetinu potu a za celý pot.
    const deep = { ...input, effectiveStackBB: unsolvedDepth(packs, rule.stackBB) };
    expect(createRiverSolvedStrategyResolverChain()(deep)).toBeNull();
  });

  it("na jiné rozhodnutí, než uzel drží, neodpoví", { timeout: 60000 }, async () => {
    // Tohle je vada, kterou tenhle resolver měl od začátku: deska seděla,
    // hloubka seděla, a hráči čelícímu sázce se vydala strategie pro hraní
    // první - s cedulkou, že to spočítal solver. Vyřešený uzel je jedno
    // rozhodnutí, ne odpověď na celou desku.
    //
    // Pack se pro tenhle test zúží na pravidla téhož rozhodnutí, jaké drží
    // odvozený spot. Jinak by test netvrdil nic o zábraně, jen o tom, že obsah
    // pro jiné rozhodnutí zrovna neexistuje - a ten existuje: hraní první jsou
    // na riveru dvě rozhodnutí (`RIVER_OOP_LEAD` bez iniciativy, `RIVER_PRESSURE`
    // s ní) a pack je drží na týchž deskách.
    const packs = await loadSolvedRiverPacks(PROFILE);
    const { input } = solvedLeadSpot(packs);
    const sameDecision = packs.map((pack) => ({
      ...pack,
      rules: pack.rules.filter((rule) => actionNodeForSolvedHero(rule.spot?.hero, "RIVER") === input.actionNode),
    }));
    // Zúžený řetězec na původní rozhodnutí odpovídá; jinak by null níž nic netvrdil.
    expect(createRiverSolvedStrategyResolverChain(sameDecision)(input)).not.toBeNull();

    const others = ["RIVER_FACING_BET", "RIVER_PRESSURE", "RIVER_OOP_LEAD"]
      .filter((actionNode) => actionNode !== input.actionNode);
    expect(others).toHaveLength(2);
    for (const actionNode of others) {
      const other = { ...input, actionNode } as PostflopStrategyInput;
      expect(createRiverSolvedStrategyResolverChain(sameDecision)(other), actionNode).toBeNull();
    }
  });

  it("bez uvedeného rozhodnutí neodpoví", { timeout: 60000 }, async () => {
    const packs = await loadSolvedRiverPacks(PROFILE);
    const { input } = solvedLeadSpot(packs);
    const bare = { ...input, actionNode: undefined } as PostflopStrategyInput;
    expect(createRiverSolvedStrategyResolverChain()(bare)).toBeNull();
  });

  it("bez načtených packů nevydá nic", () => {
    expect(createRiverSolvedStrategyResolverChain()(unloadedInput)).toBeNull();
  });
});
