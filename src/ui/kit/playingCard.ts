import type { Card, Rank, Suit } from "../../core/types";
import { getAppLanguage } from "../cs";

export type PlayingCardSize = "sm" | "md" | "lg";

const SUIT_SYMBOL: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

/** Na kartě „10“ jako na skutečné kartě; zápis rukou (KTs) zůstává s T. */
function rankFace(rank: Rank): string {
  return rank === "T" ? "10" : rank;
}

type Gender = "m" | "f" | "n";

const CZECH_RANK: Record<Rank, { noun: string; gender: Gender }> = {
  A: { noun: "eso", gender: "n" },
  K: { noun: "král", gender: "m" },
  Q: { noun: "dáma", gender: "f" },
  J: { noun: "kluk", gender: "m" },
  T: { noun: "desítka", gender: "f" },
  "9": { noun: "devítka", gender: "f" },
  "8": { noun: "osmička", gender: "f" },
  "7": { noun: "sedmička", gender: "f" },
  "6": { noun: "šestka", gender: "f" },
  "5": { noun: "pětka", gender: "f" },
  "4": { noun: "čtyřka", gender: "f" },
  "3": { noun: "trojka", gender: "f" },
  "2": { noun: "dvojka", gender: "f" },
};

const CZECH_SUIT_STEM: Record<Suit, string> = {
  s: "pikov",
  h: "srdcov",
  d: "károv",
  c: "křížov",
};

const CZECH_ENDING: Record<Gender, string> = { m: "ý", f: "á", n: "é" };

const ENGLISH_RANK: Record<Rank, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "Ten",
  "9": "Nine",
  "8": "Eight",
  "7": "Seven",
  "6": "Six",
  "5": "Five",
  "4": "Four",
  "3": "Three",
  "2": "Two",
};

const ENGLISH_SUIT: Record<Suit, string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

/** Jméno karty pro čtečku obrazovky: „křížový král“, „King of clubs“. */
export function playingCardName(card: Card): string {
  if (getAppLanguage() === "EN") return `${ENGLISH_RANK[card.rank]} of ${ENGLISH_SUIT[card.suit]}`;
  const rank = CZECH_RANK[card.rank];
  return `${CZECH_SUIT_STEM[card.suit]}${CZECH_ENDING[rank.gender]} ${rank.noun}`;
}

export function playingCard(doc: Document, card: Card, size: PlayingCardSize = "md"): HTMLSpanElement {
  const element = doc.createElement("span");
  element.className = size === "md"
    ? `dx-card dx-card--${card.suit}`
    : `dx-card dx-card--${size} dx-card--${card.suit}`;
  element.dataset.card = `${card.rank}${card.suit}`;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", playingCardName(card));

  const rank = doc.createElement("span");
  rank.className = "dx-card__rank";
  rank.setAttribute("aria-hidden", "true");
  rank.textContent = rankFace(card.rank);
  const suit = doc.createElement("span");
  suit.className = "dx-card__suit";
  suit.setAttribute("aria-hidden", "true");
  suit.textContent = SUIT_SYMBOL[card.suit];

  element.append(rank, suit);
  return element;
}
