import type { Card, Rank } from "./types";
import { RANKS, SUITS, rankValue } from "./poker";
import { mulberry32 } from "./rng";

export type PostflopStreet = "FLOP" | "TURN" | "RIVER";
export type BoardTexture =
  | "paired"
  | "monotone"
  | "two-tone"
  | "rainbow"
  | "connected"
  | "dry";

export interface PostflopSpot {
  seed: number;
  street: PostflopStreet;
  heroCards: [Card, Card];
  board: Card[];
  potBB: number;
  effectiveStackBB: number;
  textures: BoardTexture[];
  actions: readonly ["CHECK", "BET_SMALL", "BET_BIG"];
}

export interface PostflopConfig {
  seed: number;
  street?: PostflopStreet;
  heroCards?: [Card, Card];
  potBB?: number;
  effectiveStackBB?: number;
}

export function generatePostflopSpot(config: PostflopConfig): PostflopSpot {
  const rng = mulberry32(config.seed);
  const heroCards = config.heroCards ?? dealCards(rng, fullDeck(), 2) as [Card, Card];
  const deck = fullDeck().filter((card) => !sameCard(card, heroCards[0]) && !sameCard(card, heroCards[1]));
  const street = config.street ?? randomStreet(rng);
  const board = dealCards(rng, deck, boardLength(street));
  const textures = classifyBoard(board);

  return {
    seed: config.seed >>> 0,
    street,
    heroCards,
    board,
    potBB: config.potBB ?? 6,
    effectiveStackBB: config.effectiveStackBB ?? 40,
    textures,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
  };
}

export function classifyBoard(board: readonly Card[]): BoardTexture[] {
  const textures = new Set<BoardTexture>();
  const ranks = board.map((card) => card.rank);
  const suits = board.map((card) => card.suit);
  const uniqueRanks = new Set(ranks);
  const uniqueSuits = new Set(suits);

  if (uniqueRanks.size < ranks.length) textures.add("paired");
  if (uniqueSuits.size === 1 && suits.length >= 3) textures.add("monotone");
  else if (uniqueSuits.size === 2 && suits.length >= 3) textures.add("two-tone");
  else if (uniqueSuits.size >= 3) textures.add("rainbow");

  if (isConnected(ranks)) textures.add("connected");
  if (textures.size === 0 || (textures.size === 1 && textures.has("rainbow"))) {
    textures.add("dry");
  }
  return [...textures];
}

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function dealCards(rng: () => number, deck: Card[], count: number): Card[] {
  const cards: Card[] = [];
  const mutable = deck.slice();
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(rng() * mutable.length);
    const [card] = mutable.splice(index, 1);
    cards.push(card);
  }
  return cards;
}

function randomStreet(rng: () => number): PostflopStreet {
  const streets: PostflopStreet[] = ["FLOP", "TURN", "RIVER"];
  return streets[Math.floor(rng() * streets.length)];
}

function boardLength(street: PostflopStreet): number {
  switch (street) {
    case "FLOP":
      return 3;
    case "TURN":
      return 4;
    case "RIVER":
      return 5;
  }
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function isConnected(ranks: readonly Rank[]): boolean {
  const values = [...new Set(ranks.map(rankValue))].sort((a, b) => b - a);
  if (values.length < 3) return false;
  for (let i = 0; i <= values.length - 3; i += 1) {
    if (values[i] - values[i + 2] <= 4) return true;
  }
  if (values.includes(14) && values.includes(5) && values.includes(4)) return true;
  return false;
}
