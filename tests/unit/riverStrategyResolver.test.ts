import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildRiverStrategyRule, type RiverPlanItem } from "../../src/data/ranges/riverStrategyRuleBuilder";
import {
  RIVER_DEPTH_TOLERANCE_BB,
  createRiverStrategyResolver,
} from "../../src/data/ranges/riverStrategyResolver";
import type { RiverStrategyPack } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";

/**
 * Riverový resolver na skutečné vyřešené podhře.
 *
 * Fixture vznikla průchodem celé cesty - `plan_river.py` a `solve_plan.py` - a
 * ne vymyšlením tvaru, který by data mohla mít. Právě proto, že opačný postup už
 * jednou selhal: riverová fáze byla zapojená, otestovaná na plánování a spadla
 * na první položce.
 */
const node = JSON.parse(readFileSync("tests/fixtures/riverSubgame.sample.json", "utf8"));
const item = JSON.parse(
  readFileSync("tests/fixtures/riverPlanItem.sample.json", "utf8"),
) as RiverPlanItem;
const rule = buildRiverStrategyRule(
  "MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/river/CHECK_CHECK__2c",
  node,
  item,
)!;

const pack: RiverStrategyPack = {
  id: "test-river-pack",
  version: "river-solved-v1",
  createdAt: "2026-08-13",
  provenance: "SOLVER_BACKED",
  confidence: "LOW",
  contentHash: "abc",
  dimensions: {
    gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeeds: ["REGULAR"],
    street: "RIVER", evModel: "CHIP_EV", antes: ["OFF", "ON"],
  },
  familyIds: ["MTT9_20BB_BTN_BB_SRP_LOWSPR"],
  assumptions: [],
  rules: [rule],
};

function input(overrides: Partial<PostflopStrategyInput> = {}): PostflopStrategyInput {
  return {
    street: "RIVER",
    textures: [],
    board: item.board.map((card) => ({ rank: card[0], suit: card[1] })) as never,
    potType: rule.potType,
    potBB: 84,
    effectiveStackBB: rule.stackBB,
    positionPattern: rule.positionPattern as never,
    actionNode: "RIVER_OOP_LEAD",
    heroHand: rule.buckets[0].handClasses[0] as never,
    ...overrides,
  };
}

describe("riverový resolver", () => {
  it("odpoví na desku, kterou někdo vyřešil", () => {
    const answer = createRiverStrategyResolver(pack)(input());
    expect(answer).not.toBeNull();
    const source = answer?.source;
    expect(source?.kind).toBe("STRATEGY_PACK");
    if (source?.kind === "STRATEGY_PACK") expect(source.provenance).toBe("SOLVER_BACKED");
    // Text je pro hráče: česky a bez interních enumů.
    expect(answer?.explanation).toContain("Vyřešený river");
    expect(answer?.explanation).not.toContain("SRP_");
  });

  it("odmítne jinou pátou kartu", () => {
    // Na riveru je pátá karta celá odpověď; sousední deska je jiná hra.
    const other = [...item.board];
    other[4] = other[4][0] === "2" ? "As" : "2c";
    const answer = createRiverStrategyResolver(pack)(input({
      board: other.map((card) => ({ rank: card[0], suit: card[1] })) as never,
    }));
    expect(answer).toBeNull();
  });

  it("drží hloubku těsněji než turn, protože po riveru nic nenásleduje", () => {
    // Turn snese deset blindů, protože se pot stihne srovnat na další ulici.
    // Na riveru je rozdíl deseti blindů rozdíl mezi třetinovou sázkou a potovou.
    expect(RIVER_DEPTH_TOLERANCE_BB).toBeLessThan(10);
    const answer = createRiverStrategyResolver(pack)(input({
      effectiveStackBB: rule.stackBB + RIVER_DEPTH_TOLERANCE_BB + 1,
    }));
    expect(answer).toBeNull();
  });

  it("odmítne ruku, kterou v téhle desce nikdo neřešil", () => {
    const known = new Set(rule.buckets.flatMap((bucket) => bucket.handClasses));
    const unknown = ["72o", "82o", "92o"].find((hand) => !known.has(hand));
    if (unknown === undefined) return;
    expect(createRiverStrategyResolver(pack)(input({ heroHand: unknown as never }))).toBeNull();
  });
});
