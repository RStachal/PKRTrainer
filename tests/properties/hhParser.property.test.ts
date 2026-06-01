import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  MAX_INPUT_LENGTH,
  parseHandHistory,
  type HHFieldName,
} from "../../src/core/hhParser";
import { POSITION_ORDER, type Card, type Position, type Rank, type Suit } from "../../src/core/types";

const HH_FIELDS: HHFieldName[] = ["pozice", "akce", "hloubky", "karty"];
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

  it("odmitne vstup delsi nez 100000 znaku bez padu", () => {
    const result = parseHandHistory("x".repeat(MAX_INPUT_LENGTH + 1));

    expect(result.ok).toBe(false);
    expect(result.spot).toBeUndefined();
    expect(result.unreadableFields).toEqual(HH_FIELDS);
    expect(result.errors.join(" ")).toContain(String(MAX_INPUT_LENGTH));
  });
});
