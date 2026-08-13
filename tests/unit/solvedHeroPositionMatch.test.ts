import { describe, expect, it } from "vitest";

import { createTurnStrategyResolver } from "../../src/data/ranges/turnStrategyResolver";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Vyřešené pravidlo drží rozhodnutí jednoho hráče, ne obou.
 *
 * `SRP_CO_VS_BB` pojmenovává preflopovou akci a platí pro obě sedačky u toho
 * stolu. Dokud vyřešený obsah držel jen rozhodnutí hráče mimo pozici, stranu
 * určoval sám uzel: `TURN_OOP_LEAD` je z definice mimo pozici. Jakmile ale
 * přibude obsah pro obě strany - a ten leží už dnes nevyužitý v podhrách -
 * je „SRP_CO_VS_BB + čelí sázce" stejný klíč pro dva různé hráče a resolver by
 * mezi nimi vybíral pořadím v poli.
 *
 * Tenhle test tu díru zavírá dřív, než do ní ten obsah spadne. Spot dnes stranu
 * uvádí, protože ji trenažér zná z pozičního kontextu.
 */
const board = ["6s", "5d", "4c", "2c"].map((card) => ({
  rank: card[0] as never,
  suit: card[1] as never,
}));

function ruleFor(heroOutOfPosition: boolean): TurnStrategyRule {
  return {
    sourceDirectory: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR__654r",
    familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
    positionPattern: "SRP_CO_VS_BB",
    node: "CBET",
    potType: "SINGLE_RAISED",
    stackBB: 25,
    heroOutOfPosition,
    actions: ["CHECK", "BET 17.000000"],
    classCount: 1,
    buckets: [{ action: "CHECK", handClasses: ["AA"], combos: 6, mix: [] }],
    spot: {
      flop: ["6s", "5d", "4c"],
      turnCards: ["2c"],
      priorLine: [],
      potChips: 84,
      stackChips: 108,
      potBB: 16.8,
      stackBehindBB: 25,
      reach: 0.3,
      hero: {
        // Mimo pozici a na tahu první, tedy `TURN_OOP_LEAD`; sedačka se liší jen
        // podle toho, kterou stranu pravidlo drží.
        side: heroOutOfPosition ? "OOP" : "IP",
        seat: heroOutOfPosition ? "BB" : "CO",
        villainSeat: heroOutOfPosition ? "CO" : "BB",
        isAggressor: false,
        confidence: 1,
        facingBet: false,
      },
    },
  } as unknown as TurnStrategyRule;
}

function packFor(rule: TurnStrategyRule): TurnStrategyPack {
  return {
    id: "test-turn-pack",
    version: "turn-solved-v1",
    createdAt: "2026-08-13",
    provenance: "SOLVER_BACKED",
    confidence: "LOW",
    contentHash: "abc",
    familyIds: ["MTT9_25BB_CO_BB_SRP_CBET_LOWSPR"],
    assumptions: [],
    rules: [rule],
  } as unknown as TurnStrategyPack;
}

function inputWith(heroOutOfPosition: boolean | undefined): PostflopStrategyInput {
  return {
    street: "TURN",
    textures: [],
    board,
    potType: "SINGLE_RAISED",
    potBB: 16.8,
    effectiveStackBB: 25,
    positionPattern: "SRP_CO_VS_BB",
    actionNode: "TURN_OOP_LEAD",
    heroHand: "AA",
    ...(heroOutOfPosition === undefined ? {} : { heroOutOfPosition }),
  } as unknown as PostflopStrategyInput;
}

describe("vyřešená strana stolu", () => {
  it("odpoví hráči na té straně, pro kterou bylo pravidlo vyřešeno", () => {
    const answer = createTurnStrategyResolver(packFor(ruleFor(true)))(inputWith(true));
    expect(answer).not.toBeNull();
  });

  it("neodpoví hráči na druhé straně stolu", () => {
    // Tohle je celý smysl: stejný vzor, stejná deska, stejné rozhodnutí - jiný
    // hráč. Vydat mu strategii toho druhého by neslo cedulku SOLVER_BACKED.
    const answer = createTurnStrategyResolver(packFor(ruleFor(true)))(inputWith(false));
    expect(answer).toBeNull();
  });

  it("a naopak taky ne", () => {
    const answer = createTurnStrategyResolver(packFor(ruleFor(false)))(inputWith(true));
    expect(answer).toBeNull();
  });

  it("spot, který stranu neuvede, dostane odpověď jen tam, kde je jediná", () => {
    // Nástroje a starší volající stranu neuvádějí. Zamítnout je by stáhlo obsah,
    // který dnes funguje, protože každé dnešní pravidlo je pro hráče mimo pozici.
    const answer = createTurnStrategyResolver(packFor(ruleFor(true)))(inputWith(undefined));
    expect(answer).not.toBeNull();
  });
});
