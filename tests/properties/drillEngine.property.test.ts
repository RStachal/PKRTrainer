import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildPool, spotSequence } from "../../src/core/drillEngine";
import {
  ALL_CONTEXTS,
  RAISE_CONTEXTS,
  arbAnte,
  arbContext,
  arbSeed,
  genSpot,
  makeFilters,
  take,
  validBucketsFor,
} from "./drillSupport";
import { rangeStore } from "../../src/data/rangeStore";
import {
  POSITION_ORDER,
  PUSH_FOLD_MAX,
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type Position,
  type StackBucket,
} from "../../src/core/types";

const arbPositionFilter: fc.Arbitrary<Position[]> = fc
  .uniqueArray(fc.constantFrom<Position>(...POSITION_ORDER), {
    maxLength: POSITION_ORDER.length,
  })
  .map((xs) => xs as Position[]);

const arbBucketFilter: fc.Arbitrary<StackBucket[]> = fc
  .uniqueArray(fc.constantFrom<StackBucket>(...STACK_BUCKETS), {
    maxLength: STACK_BUCKETS.length,
  })
  .map((xs) => xs as StackBucket[]);

const arbContextFilter: fc.Arbitrary<ActionContext[]> = fc
  .uniqueArray(fc.constantFrom<ActionContext>(...ALL_CONTEXTS), {
    maxLength: ALL_CONTEXTS.length,
  })
  .map((xs) => xs as ActionContext[]);

function expectGeneratedSpot(
  seed: number,
  context: ActionContext,
  bucket: StackBucket,
  ante: "ON" | "OFF",
) {
  const spot = genSpot(
    seed,
    context,
    makeFilters({ buckets: [bucket], contexts: [context], ante }),
  );
  expect(spot).not.toBeNull();
  if (spot === null) throw new Error("Spot nebyl vygenerovan.");
  return spot;
}

function answerKeys(answers: { key: ActionKey }[]): ActionKey[] {
  return answers.map((a) => a.key);
}

function hasKeyWithPrefix(keys: readonly ActionKey[], prefix: string): boolean {
  return keys.some((key) => key.startsWith(prefix));
}

function narrowFiltersFor(context: ActionContext, ante: "ON" | "OFF") {
  return makeFilters({
    positions: [context === "BVB" ? "SB" : "BTN"],
    buckets: [validBucketsFor(context)[0]],
    contexts: [context],
    ante,
  });
}

const TEST_POOL_LIMITS = {
  maxConsecutiveMisses: 20,
  maxSize: 80,
};

describe("drillEngine - generateSpot properties", () => {
  // Feature: mtt-preflop-trainer, Property 1: Celistvost a unikatnost 9 pozic
  // Generated spots always use one of the 9 canonical full-ring positions.
  // Validates: Requirements 1.1, 1.3
  it("Property 1: hrdina je vzdy na jedne z 9 unikátních pozic", () => {
    expect(POSITION_ORDER.length).toBe(9);
    expect(new Set(POSITION_ORDER).size).toBe(9);

    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const bucket = validBucketsFor(context)[0];
        const spot = expectGeneratedSpot(seed, context, bucket, ante);

        expect(POSITION_ORDER).toContain(spot.heroPos);
        expect(spot.tableState.heroPos).toBe(spot.heroPos);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 2: Efektivni stack pouze z 13 kosu
  // Validates: Requirements 2.1, 2.2
  it("Property 2: efektivni stack je vzdy jeden ze 13 definovanych kosu", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const bucket = validBucketsFor(context)[0];
        const spot = expectGeneratedSpot(seed, context, bucket, ante);

        expect(STACK_BUCKETS).toContain(spot.effStack);
        expect(Number.isInteger(spot.effStack)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 3: Kratky stack vynucuje push/fold
  // Validates: Requirements 2.3, 3.9
  it("Property 3: PUSH_FOLD spot nabizi vyhradne Jam a Fold", () => {
    fc.assert(
      fc.property(arbSeed, arbAnte, (seed, ante) => {
        const spot = expectGeneratedSpot(seed, "PUSH_FOLD", 5, ante);

        expect(spot.effStack).toBeLessThanOrEqual(PUSH_FOLD_MAX);
        expect(spot.pushFold).toBe(true);
        expect(new Set(answerKeys(spot.answers))).toEqual(
          new Set<ActionKey>(["JAM", "FOLD"]),
        );
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 4: Hluboky stack nabizi sizingove raise akce
  // Validates: Requirements 2.4
  it("Property 4: hluboke raise kontexty obsahuji prislusnou raise akci", () => {
    fc.assert(
      fc.property(
        arbSeed,
        fc.constantFrom<ActionContext>(...RAISE_CONTEXTS),
        arbAnte,
        (seed, context, ante) => {
          const bucket = validBucketsFor(context)[0];
          const spot = expectGeneratedSpot(seed, context, bucket, ante);
          const keys = answerKeys(spot.answers);

          expect(spot.effStack).toBeGreaterThan(PUSH_FOLD_MAX);
          expect(spot.pushFold).toBe(false);

          if (context === "RFI") {
            expect(hasKeyWithPrefix(keys, "OPEN_")).toBe(true);
          } else if (context === "VS_LIMP") {
            expect(hasKeyWithPrefix(keys, "ISO_")).toBe(true);
          } else if (context === "VS_OPEN") {
            expect(keys).toContain("3BET");
          } else if (context === "VS_3BET") {
            expect(keys).toContain("4BET");
          } else if (context === "VS_4BET") {
            expect(keys).toContain("JAM");
          } else if (context === "SQUEEZE") {
            expect(keys).toContain("SQUEEZE");
          } else if (context === "BVB") {
            expect(
              hasKeyWithPrefix(keys, "OPEN_") || keys.includes("3BET"),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 7: Blind-vs-blind stavi hrdinu mezi SB a BB
  // Validates: Requirements 3.11
  it("Property 7: BVB generuje pouze SB nebo BB", () => {
    fc.assert(
      fc.property(arbSeed, arbAnte, (seed, ante) => {
        const spot = expectGeneratedSpot(seed, "BVB", 15, ante);

        expect(["SB", "BB"]).toContain(spot.heroPos);
        expect(spot.tableState.isBvB).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 8: Kazda nabizena akce ma prave jeden Akcni_klic
  // Validates: Requirements 3.12
  it("Property 8: answer keys jsou neprázdné a bez duplicit", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const bucket = validBucketsFor(context)[0];
        const spot = expectGeneratedSpot(seed, context, bucket, ante);
        const keys = answerKeys(spot.answers);

        expect(keys.length).toBeGreaterThan(0);
        expect(new Set(keys).size).toBe(keys.length);
        expect(spot.answers.every((a) => a.label.length > 0)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 9: Generovany spot ma neprazdne doporuceni v obou sadach
  // Validates: Requirements 4.4, 7.4, 7.6
  it("Property 9: correctKeys i strictCorrect jsou neprázdné", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const bucket = validBucketsFor(context)[0];
        const spot = expectGeneratedSpot(seed, context, bucket, ante);

        expect(spot.correctKeys.length).toBeGreaterThan(0);
        expect(spot.strictCorrect.length).toBeGreaterThan(0);
        expect(spot.explanation.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 9b: Doporuceni je vzdy mezi nabizenymi odpovedmi
  // Validates: Requirements 3.5, 4.4, 7.2
  it("Property 9b: strictCorrect je vždy mezi nabízenými odpověďmi, ve všech koších", () => {
    // The guard that was missing. Ranges and the offered-action set are built by
    // two separate paths, and nothing checked they agreed - so when the re-jam
    // ranges started recommending JAM against an open, the drill went on offering
    // only fold, call and three-bet. A player would have been marked wrong for
    // every answer available to them, and every existing test still passed.
    //
    // Sweeps every bucket rather than the first valid one, because the disagreement
    // only existed between 15 and 30BB.
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        for (const bucket of validBucketsFor(context)) {
          const spot = genSpot(
            seed,
            context,
            makeFilters({ buckets: [bucket], contexts: [context], ante }),
          );
          if (spot === null) continue;
          const offered = new Set(spot.answers.map((answer) => answer.key));
          for (const key of spot.strictCorrect) {
            expect(
              offered.has(key),
              `${context} ${spot.heroPos} ${bucket}BB ${spot.hand}: recommends ${key}, offers ${[...offered].join("/")}`,
            ).toBe(true);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 13: Ante mod urcuje variantu dat i startovni pot
  // Validates: Requirements 5.2, 5.3
  it("Property 13: ante ON/OFF urcuje startovni pot", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const bucket = validBucketsFor(context)[0];
        const spot = expectGeneratedSpot(seed, context, bucket, ante);

        expect(spot.ante).toBe(ante);
        expect(spot.startingPot).toBe(ante === "ON" ? 2.5 : 1.5);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 31: Filtrovani je logicky prunik dimenzi
  // Validates: Requirements 13.5, 13.7, 13.8
  it("Property 31: vygenerovany spot respektuje zvolene filtry", () => {
    fc.assert(
      fc.property(
        arbSeed,
        arbContext,
        arbPositionFilter,
        arbBucketFilter,
        arbContextFilter,
        arbAnte,
        (seed, context, positions, buckets, contexts, ante) => {
          const spot = genSpot(
            seed,
            context,
            makeFilters({ positions, buckets, contexts, ante }),
          );

          if (contexts.length > 0 && !contexts.includes(context)) {
            expect(spot).toBeNull();
            return;
          }

          if (spot === null) return;

          if (positions.length > 0) expect(positions).toContain(spot.heroPos);
          if (buckets.length > 0) expect(buckets).toContain(spot.effStack);
          if (contexts.length > 0) expect(contexts).toContain(spot.context);
          expect(spot.context).toBe(context);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("drillEngine - pool a sekvence", () => {
  // Feature: mtt-preflop-trainer, Property 14: Stejny seed a filtry davaji identickou sekvenci spotu
  // Validates: Requirements 6.2
  it("Property 14: stejny seed a filtry davaji identickou sekvenci", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const filters = narrowFiltersFor(context, ante);
        const cfg = { seed, filters };

        const first = take(spotSequence(cfg, rangeStore, TEST_POOL_LIMITS), 25).map((spot) => ({
          id: spot.id,
          context: spot.context,
          heroPos: spot.heroPos,
          effStack: spot.effStack,
          hand: spot.hand,
          cards: spot.heroCards,
        }));
        const second = take(spotSequence(cfg, rangeStore, TEST_POOL_LIMITS), 25).map((spot) => ({
          id: spot.id,
          context: spot.context,
          heroPos: spot.heroPos,
          effStack: spot.effStack,
          hand: spot.hand,
          cards: spot.heroCards,
        }));

        expect(first.length).toBeGreaterThan(0);
        expect(first).toEqual(second);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 15: Pool obsahuje pouze unikatni spoty v deterministickem poradi
  // Validates: Requirements 6.3
  it("Property 15: buildPool je deterministicky a bez duplicit Question_ID", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const filters = narrowFiltersFor(context, ante);
        const first = buildPool(seed, context, filters, rangeStore, TEST_POOL_LIMITS);
        const second = buildPool(seed, context, filters, rangeStore, TEST_POOL_LIMITS);
        const firstIds = first.map((spot) => spot.id);

        expect(first.length).toBeGreaterThan(0);
        expect(new Set(firstIds).size).toBe(firstIds.length);
        expect(firstIds).toEqual(second.map((spot) => spot.id));
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 17: Jeden pruchod Poolem nezobrazi Question_ID dvakrat
  // Validates: Requirements 6.5
  it("Property 17: jeden pruchod sekvenci nema duplicitni Question_ID", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const filters = narrowFiltersFor(context, ante);
        const pool = buildPool(seed, context, filters, rangeStore, TEST_POOL_LIMITS);
        const pass = take(
          spotSequence({ seed, filters }, rangeStore, TEST_POOL_LIMITS),
          pool.length,
        );
        const ids = pass.map((spot) => spot.id);

        expect(pool.length).toBeGreaterThan(0);
        expect(pass.length).toBe(pool.length);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 18: Vycerpany Pool se cykli od zacatku ve stejnem poradi
  // Validates: Requirements 6.6
  it("Property 18: druhy pruchod zacina stejnym poradim jako prvni", () => {
    fc.assert(
      fc.property(arbSeed, arbContext, arbAnte, (seed, context, ante) => {
        const filters = narrowFiltersFor(context, ante);
        const pool = buildPool(seed, context, filters, rangeStore, TEST_POOL_LIMITS);
        const ids = take(
          spotSequence({ seed, filters }, rangeStore, TEST_POOL_LIMITS),
          pool.length * 2,
        )
          .map((spot) => spot.id);
        const firstPass = ids.slice(0, pool.length);
        const secondPass = ids.slice(pool.length);

        expect(pool.length).toBeGreaterThan(0);
        expect(firstPass).toEqual(pool.map((spot) => spot.id));
        expect(secondPass).toEqual(firstPass);
      }),
      { numRuns: 100 },
    );
  });
});
