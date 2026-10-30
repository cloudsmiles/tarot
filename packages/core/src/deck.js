export function shuffleDeck(cards, rng = Math.random) {
  const deck = cards.map(card => ({ card, reversed: false }));
  for (let i = deck.length - 1; i >= 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    if (j !== i) {
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    deck[i].reversed = rng() < 0.5;
  }
  return deck;
}
