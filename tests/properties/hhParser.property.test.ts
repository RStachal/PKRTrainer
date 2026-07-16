import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  MAX_INPUT_LENGTH,
  parseHandHistory,
  type HHFieldName,
} from "../../src/core/hhParser";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import { POSITION_ORDER, type Card, type Position, type Rank, type Suit } from "../../src/core/types";
import type { RangeStore } from "../../src/data/rangeStore";

const HH_FIELDS: HHFieldName[] = ["position", "actions", "stack", "cards"];
const RANKS: Rank[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS: Suit[] = ["s", "h", "d", "c"];

const OFFSET_BY_POSITION: Record<Position, number> = {
  BTN: 0,
  SB: 1,
  BB: 2,
  UTG: 3,
  "UTG+1": 4,
  "UTG+2": 5,
  LJ: 6,
  HJ: 7,
  CO: 8,
};

const arbDistinctCards: fc.Arbitrary<[Card, Card]> = fc
  .tuple(
    fc.record({
      rank: fc.constantFrom<Rank>(...RANKS),
      suit: fc.constantFrom<Suit>(...SUITS),
    }),
    fc.record({
      rank: fc.constantFrom<Rank>(...RANKS),
      suit: fc.constantFrom<Suit>(...SUITS),
    }),
  )
  .filter(([a, b]) => a.rank !== b.rank || a.suit !== b.suit);

function cardToken(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function validNineHandedText(position: Position, cards: [Card, Card]): string {
  const heroSeat = OFFSET_BY_POSITION[position] + 1;
  const seats = Array.from({ length: 9 }, (_, i) => {
    const seat = i + 1;
    const name = seat === heroSeat ? "Hero" : `Villain${seat}`;
    return `Seat ${seat}: ${name} (1000 in chips)`;
  }).join("\n");
  const sbName = heroSeat === 2 ? "Hero" : "Villain2";
  const bbName = heroSeat === 3 ? "Hero" : "Villain3";

  return [
    "PokerStars Hand #1: Tournament #1, 10/20",
    "Table 'Test' 9-max Seat #1 is the button",
    seats,
    `${sbName}: posts small blind 10`,
    `${bbName}: posts big blind 20`,
    "*** HOLE CARDS ***",
    `Dealt to Hero [${cardToken(cards[0])} ${cardToken(cards[1])}]`,
    "Hero: folds",
    "*** SUMMARY ***",
  ].join("\n");
}

function incompatibleTableText(seatCount: number): string {
  const seats = Array.from({ length: seatCount }, (_, i) => {
    const seat = i + 1;
    const name = seat === 1 ? "Hero" : `Villain${seat}`;
    return `Seat ${seat}: ${name} (1500 in chips)`;
  }).join("\n");

  return [
    "PokerStars Hand #1: Tournament #1, 10/20",
    "Table 'Test' 9-max Seat #1 is the button",
    seats,
    "Hero: posts small blind 10",
    "Villain2: posts big blind 20",
    "*** HOLE CARDS ***",
    "Dealt to Hero [Ah Kd]",
    "Hero: folds",
    "*** SUMMARY ***",
  ].join("\n");
}

const sixMaxProfile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "SIX_MAX",
  blindSpeed: "REGULAR",
  street: "PREFLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

const sixMaxFixtureStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => ({
    actions: { AKo: ["FOLD"] } as never,
    strict: { AKo: ["FOLD"] } as never,
  }),
};

describe("hhParser - total parser properties", () => {
  // Feature: mtt-preflop-trainer, Property 28: HH round-trip zachova pole hrdiny a sestavi Spot
  // Validates: Requirements 11.1, 11.4
  it("Property 28: validni 9-handed HH zachova pozici, karty a sestavi Spot", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Position>(...POSITION_ORDER),
        arbDistinctCards,
        (position, cards) => {
          const result = parseHandHistory(validNineHandedText(position, cards));

          expect(result.ok).toBe(true);
          expect(result.spot).toBeDefined();
          expect(result.fields.position).toBe(position);
          expect(result.fields.heroCards).toEqual(cards);
          expect(result.fields.effStackBucket).toBe(50);
          expect(result.spot?.heroPos).toBe(position);
          expect(result.spot?.heroCards).toEqual(cards);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 29: Parser je totalni a oznacuje necitelna pole
  // Validates: Requirements 11.2, 11.3
  it("Property 29: parseHandHistory vraci HHResult pro libovolny kratky text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (text) => {
        const result = parseHandHistory(text);

        expect(typeof result.ok).toBe("boolean");
        expect(typeof result.fields).toBe("object");
        expect(Array.isArray(result.unreadableFields)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
        for (const field of result.unreadableFields) {
          expect(HH_FIELDS).toContain(field);
        }
        if (!result.ok) {
          expect(result.spot).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 30: Nekompatibilni data nesestavi Spot
  // Validates: Requirements 11.5
  it("Property 30: ne-9-handed HH je nekompatibilni a nesestavi Spot", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), (seatCount) => {
        const result = parseHandHistory(incompatibleTableText(seatCount));

        expect(result.ok).toBe(false);
        expect(result.spot).toBeUndefined();
        expect(result.incompatible).toBe(true);
        expect(result.fields.tableSize).toBe(seatCount);
      }),
      { numRuns: 100 },
    );
  });

  it("s potvrzenym SIX_MAX profilem odvozuje sest pozic bez 9-max fallbacku", () => {
    const result = parseHandHistory(incompatibleTableText(6), {
      profile: sixMaxProfile,
      rangeStore: sixMaxFixtureStore,
      requireLoadedStrategy: true,
    });

    expect(result.ok).toBe(true);
    expect(result.fields.tableFormat).toBe("SIX_MAX");
    expect(result.fields.position).toBe("BTN");
    expect(result.fields.profile).toEqual(sixMaxProfile);
    expect(result.fields.stackBucketPolicy).toBe("NEAREST_SUPPORTED_BUCKET");
    expect(result.spot?.heroPos).toBe("BTN");
  });

  it("fail-closed zablokuje review bez nactene strategie pro potvrzeny profil", () => {
    const result = parseHandHistory(validNineHandedText("BTN", [
      { rank: "A", suit: "s" },
      { rank: "K", suit: "d" },
    ]), {
      profile: {
        ...sixMaxProfile,
        tableFormat: "FULL_RING_9",
        evModel: "DOLAR_EV",
      },
      rangeStore: {
        lookup: () => undefined,
        isLoaded: () => false,
      },
      requireLoadedStrategy: true,
    });

    expect(result.ok).toBe(false);
    expect(result.strategyUnavailable).toBe(true);
    expect(result.fields.profile?.evModel).toBe("DOLAR_EV");
    expect(result.spot).toBeUndefined();
    expect(result.errors.join(" ")).toContain("produkční preflop strategie");
  });

  it("odmitne duplicitni kartu mezi hero handou a boardem", () => {
    const text = validNineHandedText("BTN", [
      { rank: "A", suit: "s" },
      { rank: "K", suit: "d" },
    ]).replace("*** SUMMARY ***", "*** FLOP *** [As 7d 2c]\n*** SUMMARY ***");

    const result = parseHandHistory(text);

    expect(result.ok).toBe(false);
    expect(result.incompatible).toBe(true);
    expect(result.errors.join(" ")).toContain("duplicitní karty");
  });

  it("normalizuje sizing a all-in priznak v BB", () => {
    const text = validNineHandedText("BTN", [
      { rank: "A", suit: "s" },
      { rank: "K", suit: "d" },
    ]).replace("Hero: folds", "Hero: raises 980 to 1000 and is all-in");

    const result = parseHandHistory(text);

    expect(result.ok).toBe(true);
    expect(result.fields.preflopActionDetails).toEqual([
      {
        actor: "Hero",
        kind: "RAISE",
        raw: "raises 980 to 1000 and is all-in",
        amountBB: 49,
        raiseToBB: 50,
        allIn: true,
      },
    ]);
  });

  it("odmitne vstup delsi nez 100000 znaku bez padu", () => {
    const result = parseHandHistory("x".repeat(MAX_INPUT_LENGTH + 1));

    expect(result.ok).toBe(false);
    expect(result.spot).toBeUndefined();
    expect(result.unreadableFields).toEqual(HH_FIELDS);
    expect(result.errors.join(" ")).toContain(String(MAX_INPUT_LENGTH));
  });

  it("vraci podrobne EN chyby a EN vysvetleni importovaneho spotu", () => {
    const empty = parseHandHistory("", { language: "EN" });
    expect(empty.errors).toEqual(["Input is empty or contains only whitespace."]);

    const incompatible = parseHandHistory(incompatibleTableText(5), { language: "EN" });
    expect(incompatible.errors.join(" ")).toContain("not compatible with the training model");
    expect(incompatible.errors.join(" ")).not.toContain("Data nejsou kompatibilní");

    const valid = parseHandHistory(validNineHandedText("BTN", [
      { rank: "A", suit: "s" },
      { rank: "K", suit: "d" },
    ]), { language: "EN" });
    expect(valid.ok).toBe(true);
    expect(valid.spot?.explanation).toContain("Recommended:");
    expect(valid.spot?.explanation).toContain("Position:");
    expect(valid.spot?.explanation).not.toContain("Doporučení:");
  });

  it("podporuje bezne odchylky HH: currency stacks, unicode karty, header blindy a alternativni button", () => {
    const seats = Array.from({ length: 9 }, (_, i) => {
      const seat = i + 1;
      const name = seat === 8 ? "Hero" : `Villain${seat}`;
      return `Seat ${seat}: ${name} ($1,000)`;
    }).join("\n");
    const text = [
      "PokerStars Hand #2: Tournament #2 - Level II (10/20)",
      "Table 'Alt' 9-max button is in seat #1",
      seats,
      "*** HOLE CARDS ***",
      "Dealt to Hero [A♠ K♦]",
      "Hero: folds",
      "*** SUMMARY ***",
    ].join("\n");

    const result = parseHandHistory(text);

    expect(result.ok).toBe(true);
    expect(result.fields.position).toBe("HJ");
    expect(result.fields.effStackBucket).toBe(50);
    expect(result.spot?.hand).toBe("AKo");
  });

  it("podporuje slepene tokeny karet a akce bez HOLE CARDS sekce", () => {
    const seats = Array.from({ length: 9 }, (_, i) => {
      const seat = i + 1;
      const name = seat === 7 ? "Hero" : `Villain${seat}`;
      return `Seat ${seat}: ${name} (750 chips)`;
    }).join("\n");
    const text = [
      "GAME #3 - Blinds 10/20",
      "Seat #1 is the button",
      seats,
      "Villain2: posts the small blind 10",
      "Villain3: posts the big blind 20",
      "Dealt to Hero [AsKs]",
      "Villain4: raises 40 to 60",
      "Hero: calls 60",
      "*** FLOP *** [2c 7d Jh]",
    ].join("\n");

    const result = parseHandHistory(text);

    expect(result.ok).toBe(true);
    expect(result.fields.position).toBe("LJ");
    expect(result.fields.actions).toEqual(["calls 60"]);
    expect(result.spot?.context).toBe("VS_OPEN");
    expect(result.spot?.hand).toBe("AKs");
  });
});
