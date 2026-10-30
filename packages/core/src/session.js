import { CARDS } from './data/cards.js';
import { shuffleDeck } from './deck.js';
import { THREE_CARD_SPREAD } from './spread.js';

function initialState(spread) {
  return {
    phase: 'idle',
    question: '',
    river: [],
    picks: [],
    flipped: Array(spread.count).fill(false),
    readingStatus: null,
    readingText: '',
  };
}

export function createSession(options = {}) {
  const cards = options.cards || CARDS;
  const spread = options.spread || THREE_CARD_SPREAD;
  const rng = options.rng || Math.random;
  const listeners = new Set();
  let state = initialState(spread);

  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  }

  return {
    getState: () => state,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    setQuestion(q) {
      if (state.phase !== 'idle') return;
      set({ question: String(q ?? '').trim().slice(0, 80) });
    },

    start() {
      if (state.phase !== 'idle' || !state.question) return false;
      set({ phase: 'shuffling', river: shuffleDeck(cards, rng) });
      return true;
    },

    finishShuffle() {
      if (state.phase !== 'shuffling') return false;
      set({ phase: 'picking' });
      return true;
    },

    pick(riverIndex) {
      if (state.phase !== 'picking') return false;
      if (state.picks.length >= spread.count) return false;
      if (!Number.isInteger(riverIndex) || riverIndex < 0 || riverIndex >= state.river.length) return false;
      if (state.picks.some(p => p.riverIndex === riverIndex)) return false;
      set({ picks: [...state.picks, { ...state.river[riverIndex], riverIndex }] });
      return true;
    },

    unpick(riverIndex) {
      if (state.phase !== 'picking') return false;
      const next = state.picks.filter(p => p.riverIndex !== riverIndex);
      if (next.length === state.picks.length) return false;
      set({ picks: next });
      return true;
    },

    confirmPicks() {
      if (state.phase !== 'picking' || state.picks.length !== spread.count) return false;
      set({ phase: 'revealing' });
      return true;
    },

    flip(position) {
      if (state.phase !== 'revealing') return false;
      if (!Number.isInteger(position) || position < 0 || position >= spread.count) return false;
      if (state.flipped[position]) return false;
      const flipped = state.flipped.slice();
      flipped[position] = true;
      set({ flipped });
      return true;
    },

    async requestReading(provider) {
      if (state.phase !== 'revealing') return;
      if (!state.flipped.every(Boolean)) return;
      set({ readingStatus: 'loading', readingText: '' });
      try {
        const text = await provider.generate({
          question: state.question,
          spread,
          picks: state.picks,
        });
        // await 期间会话可能已被 reset（或同一解读被重复请求）；迟到结果不得写入
        if (state.phase !== 'revealing' || state.readingStatus !== 'loading') return;
        set({ readingStatus: 'ready', readingText: text });
      } catch {
        if (state.phase !== 'revealing' || state.readingStatus !== 'loading') return;
        set({ readingStatus: 'error', readingText: '' });
      }
    },

    reset() {
      state = initialState(spread);
      for (const fn of listeners) fn(state);
    },
  };
}
