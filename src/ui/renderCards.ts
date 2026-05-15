function getCardSuitClass(card: string): string {
  if (card.includes("♥") || card.includes("♦")) return "is-red";
  return "is-black";
}

export function renderCards(cards: readonly string[] = []): string {
  if (cards.length === 0) return `<span class="empty-board">Před flopem</span>`;

  return cards
    .map(
      (card) =>
        `<span class="card ${getCardSuitClass(card)}" aria-label="${card}">${card}</span>`,
    )
    .join("");
}
