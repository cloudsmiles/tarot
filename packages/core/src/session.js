import { CARDS } from './data/cards.js';
import { shuffleDeck } from './deck.js';
import { THREE_CARD_SPREAD } from './spread.js';

function initialState(spread) {
  return {
    phase: 'idle',
    question: '',
    spreadId: spread.id,
    river: [],
    picks: [],
    flipped: Array(spread.count).fill(false),
    readingStatus: null,
    readingText: '',
    readingStreaming: false,
  };
}

export function createSession(options = {}) {
  const cards = options.cards || CARDS;
  let spread = options.spread || THREE_CARD_SPREAD;
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

    setSpread(next) {
      if (state.phase !== 'idle') return false;
      if (!next || typeof next.id !== 'string' || next.count === undefined) return false;
      spread = next;
      set({ spreadId: spread.id, flipped: Array(spread.count).fill(false) });
      return true;
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
      set({ readingStatus: 'loading', readingText: '', readingStreaming: false });
      const ctx = { question: state.question, spread, picks: state.picks };
      // await 期间会话可能已被 reset（或同一解读被重复请求）；迟到结果不得写入
      const stillMine = () => state.phase === 'revealing' && state.readingStatus !== null;
      try {
        let text;
        if (typeof provider.generateStream === 'function') {
          text = await provider.generateStream(ctx, {
            onToken: (_delta, full) => {
              if (stillMine()) set({ readingStatus: 'ready', readingText: full, readingStreaming: true });
            },
          });
        } else {
          text = await provider.generate(ctx);
        }
        if (!stillMine()) return;
        set({ readingStatus: 'ready', readingText: text, readingStreaming: false });
      } catch {
        if (!stillMine()) return;
        set({ readingStatus: 'error', readingText: '', readingStreaming: false });
      }
    },

    reset() {
      state = initialState(spread);
      for (const fn of listeners) fn(state);
    },
  };
}
