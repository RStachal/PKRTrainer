import { describe, expect, it } from "vitest";

import { buildImportedPostflopTrainingSpots } from "../../src/core/hhPostflopBridge";
import { parseHandHistory } from "../../src/core/hhParser";
import type {
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../src/core/postflopGenerator";

const facingBetRunoutHh = [
  "PokerStars Hand #4: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Villain1: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ks Qs]",
  "Hero: raises 40 to 60",
  "Villain1: calls 40",
  "*** FLOP *** [Ah 7d 2c]",
  "Villain1: bets 40",
  "Hero: calls 40",
  "*** TURN *** [Ah 7d 2c] [5s]",
  "Villain1: bets 80",
  "Hero: calls 80",
  "*** RIVER *** [Ah 7d 2c 5s] [Jd]",
  "Villain1: bets 120",
  "Hero: calls 120",
  "*** SUMMARY ***",
].join("\n");

describe("hhPostflopBridge", () => {
  it("routes imported flop-turn-river MTT spots through the provided production resolver", () => {
    const result = parseHandHistory(facingBetRunoutHh);
    const resolverInputs: PostflopStrategyInput[] = [];
    const resolver: PostflopStrategyResolver = (input) => {
      resolverInputs.push({
        ...input,
        textures: [...input.textures],
        board: input.board ? [...input.board] : undefined,
      });
      return {
        action: input.actionNode?.endsWith("_FACING_BET") ? "CALL" : "BET_SMALL",
        explanation: `Production HH resolver ${input.street} ${input.actionNode}`,
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "internal-hh-production-parity-pack",
          packVersion: "2026.06",
          packVerifiedAt: "2026-06-17",
          ruleId: `hh-production-${input.street.toLowerCase()}`,
          confidence: "HIGH",
          matchedTextures: input.textures,
          sprMin: 0,
          sprMax: 30,
          positionPattern: input.positionPattern,
          sourceUrls: ["https://solver.example/internal/hh-production"],
          assumptions: ["production parity test fixture"],
          selectionScore: 100,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        },
      };
    };

    const spots = buildImportedPostflopTrainingSpots(result, resolver);

    expect(result.ok).toBe(true);
    expect(spots.map((spot) => spot.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(spots.map((spot) => spot.actionNode)).toEqual([
      "FLOP_FACING_BET",
      "TURN_FACING_BET",
      "RIVER_FACING_BET",
    ]);
    expect(spots.map((spot) => spot.recommendedAction)).toEqual(["CALL", "CALL", "CALL"]);
    expect(spots.map((spot) => spot.explanation.source.kind)).toEqual([
      "STRATEGY_PACK",
      "STRATEGY_PACK",
      "STRATEGY_PACK",
    ]);
    expect(resolverInputs.map((input) => input.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(resolverInputs.map((input) => input.actionNode)).toEqual([
      "FLOP_FACING_BET",
      "TURN_FACING_BET",
      "RIVER_FACING_BET",
    ]);
    expect(resolverInputs[1].priorFlopAction).toBe("CALL");
    expect(resolverInputs[2].priorTurnAction).toBe("CALL");
    expect(resolverInputs.map((input) => input.potBB)).toEqual([6.5, 10.5, 18.5]);
    expect(resolverInputs.map((input) => input.effectiveStackBB)).toEqual([47, 45, 41]);
    expect(result.fields.financialState).toEqual({
      flop: {
        potBeforeBB: 6.5,
        potAfterBB: 10.5,
        heroStackBeforeBB: 47,
        heroStackAfterBB: 45,
        effectiveStackBeforeBB: 47,
        effectiveStackAfterBB: 45,
      },
      turn: {
        potBeforeBB: 10.5,
        potAfterBB: 18.5,
        heroStackBeforeBB: 45,
        heroStackAfterBB: 41,
        effectiveStackBeforeBB: 45,
        effectiveStackAfterBB: 41,
      },
      river: {
        potBeforeBB: 18.5,
        potAfterBB: 30.5,
        heroStackBeforeBB: 41,
        heroStackAfterBB: 35,
        effectiveStackBeforeBB: 41,
        effectiveStackAfterBB: 35,
      },
    });
    expect(result.fields.preflopActionDetails).toEqual([
      {
        actor: "Hero",
        kind: "RAISE",
        raw: "raises 40 to 60",
        amountBB: 2,
        raiseToBB: 3,
        allIn: false,
      },
      {
        actor: "Villain1",
        kind: "CALL",
        raw: "calls 40",
        amountBB: 2,
        allIn: false,
      },
    ]);
    expect(result.fields.postflopActions?.river?.details).toEqual([
      {
        actor: "Villain1",
        kind: "BET",
        raw: "bets 120",
        amountBB: 6,
        allIn: false,
      },
      {
        actor: "Hero",
        kind: "CALL",
        raw: "calls 120",
        amountBB: 6,
        allIn: false,
      },
    ]);
    expect(resolverInputs.every((input) => input.positionPattern === "SRP_BTN_VS_BB")).toBe(true);
  });
});

/**
 * Obrana velkeho blindu - nejcastejsi postflopovy spot, ktery rozbor neznal.
 *
 * Rozbor bral jen ruce, kde hrdina sam zvedal, protoze pro hrace, ktery jen
 * dorovnal, neexistovala zadna sedacka: vsechny kontexty jsou psane ze strany
 * raisera. Ruce s obranou blindu se proto tise preskakovaly.
 */
const bigBlindDefenceHh = [
  "PokerStars Hand #7: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Hero (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Villain8 (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Hero: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [9s 8s]",
  "Villain2: folds",
  "Villain3: folds",
  "Villain4: folds",
  "Villain5: folds",
  "Villain6: folds",
  "Villain7: raises 40 to 60",
  "Villain8: folds",
  "Villain9: folds",
  "Hero: calls 40",
  "*** FLOP *** [7h 5d 2c]",
  "Hero: checks",
  "Villain6: bets 40",
  "Hero: calls 40",
  "*** TURN *** [7h 5d 2c] [4s]",
  "Hero: bets 60",
  "*** SUMMARY ***",
].join("\n");

describe("hhPostflopBridge - obrana velkeho blindu", () => {
  it("pozna, kdo v ruce zvedal naposledy", () => {
    const result = parseHandHistory(bigBlindDefenceHh);
    // Button na sedadle 8: sedadlo 9 je SB, sedadlo 1 je BB. Hrdina tedy sedi
    // ve velkem blindu a otviral hrac ze sedadla 7.
    expect(result.fields.position).toBe("BB");
    expect(result.fields.preflopAggressorPosition).toBeDefined();
    expect(result.fields.preflopAggressorPosition).not.toBe("BB");
  });

  it("posadi hrdinu do velkeho blindu, ne do kresla otvirajiciho", () => {
    const result = parseHandHistory(bigBlindDefenceHh);
    const spots = buildImportedPostflopTrainingSpots(result, undefined, { allowFallback: true });
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(spot.heroPosition).toBe("BB");
      expect(spot.aggressorPosition).not.toBe("BB");
      expect(spot.callerPosition).toBe("BB");
      expect(spot.potType).toBe("SINGLE_RAISED");
    }
  });

  it("pojmenuje turn jako vedeni bez iniciativy, ne jako barrel", () => {
    const result = parseHandHistory(bigBlindDefenceHh);
    const spots = buildImportedPostflopTrainingSpots(result, undefined, { allowFallback: true });
    const turn = spots.find((spot) => spot.street === "TURN");
    expect(turn?.actionNode).toBe("TURN_OOP_LEAD");
    // Flop hrdina checkoval do agresora, takze i tam jde o rozhodnuti obrance.
    const flop = spots.find((spot) => spot.street === "FLOP");
    expect(flop?.actionNode).toBe("FLOP_OOP_LEAD");
  });
});
