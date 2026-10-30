const core = require('../../core/index.js');

const CHIP_LABELS = ['感情关系', '事业发展', '财务状况', '自我觉察'];

Page({
  data: {
    phase: 'idle',
    question: '',
    presets: core.PRESET_QUESTIONS,
    chipLabels: CHIP_LABELS,
    labels: core.THREE_CARD_SPREAD.labels,
    river: [],
    pickedCount: 0,
    canConfirm: false,
    canRead: false,
    flipped: [false, false, false],
    picks: [],
    readingStatus: '',
    readingParagraphs: [],
  },

  onLoad() {
    this.baseUrl = getApp().globalData.cardBaseUrl;
    this.provider = core.createLocalReadingProvider({
      wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    });
    this.session = core.createSession();
    this.riverSent = false;
    this.pickSignature = '';
    this.imgErrors = {};
    this.unsubscribe = this.session.subscribe(state => this.applyState(state));
    this.applyState(this.session.getState());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
  },

  applyState(st) {
    const patch = {
      phase: st.phase,
      pickedCount: st.picks.length,
      canConfirm: st.phase === 'picking' && st.picks.length === 3,
      canRead: st.phase === 'revealing' && st.flipped.every(Boolean) && !st.readingStatus,
      flipped: st.flipped.slice(),
      readingStatus: st.readingStatus || '',
    };

    if (st.phase === 'idle') {
      this.riverSent = false;
      this.pickSignature = '';
      this.imgErrors = {};
      patch.river = [];
      patch.picks = [];
      patch.readingParagraphs = [];
    }

    if ((st.phase === 'shuffling' || st.phase === 'picking') && !this.riverSent && st.river.length) {
      this.riverSent = true;
      patch.river = st.river.map((_, i) => ({
        idx: i,
        picked: false,
        delay: Math.min(i * 8, 600),
      }));
    }

    if (st.phase === 'shuffling' || st.phase === 'picking') {
      const signature = st.picks.map(p => p.riverIndex).join(',');
      if (signature !== this.pickSignature) {
        this.pickSignature = signature;
        patch.river = st.river.map((_, i) => ({
          idx: i,
          picked: st.picks.some(p => p.riverIndex === i),
          delay: Math.min(i * 8, 600),
        }));
      }
    }

    if (st.phase === 'revealing') {
      patch.picks = st.picks.map((p, i) => ({
        cn: p.card.cn,
        imgUrl: this.baseUrl + p.card.img,
        reversed: p.reversed,
        label: core.THREE_CARD_SPREAD.labels[i],
        imgError: !!this.imgErrors[i],
      }));
      if (st.readingStatus === 'ready') {
        patch.readingParagraphs = st.readingText.split('\n');
      } else if (st.readingStatus === 'loading') {
        patch.readingParagraphs = ['正在凝神连结牌意…'];
      } else if (st.readingStatus === 'error') {
        patch.readingParagraphs = ['牌意连结被迷雾打断了，请点下方按钮重试。'];
      }
    }

    this.setData(patch);
  },

  onPreset(e) {
    const q = e.currentTarget.dataset.q;
    this.setData({ question: q });
  },

  onQuestionInput(e) {
    this.setData({ question: e.detail.value });
  },

  onStart() {
    const q = this.data.question.trim();
    if (!q) return;
    this.session.setQuestion(q);
    this.session.start();
    if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
    this.shuffleTimer = setTimeout(() => this.session.finishShuffle(), 800);
  },

  onCardTap(e) {
    if (this.session.getState().phase !== 'picking') return;
    const idx = Number(e.currentTarget.dataset.idx);
    const picked = this.pickSignature.split(',').includes(String(idx));
    if (picked) this.session.unpick(idx);
    else this.session.pick(idx);
  },

  onConfirm() {
    if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
    if (this.session.getState().phase === 'shuffling') this.session.finishShuffle();
    this.session.confirmPicks();
  },

  onSlotTap(e) {
    this.session.flip(Number(e.currentTarget.dataset.pos));
  },

  onAi() {
    this.session.requestReading(this.provider);
  },

  onRetry() {
    this.session.requestReading(this.provider);
  },

  onAgain() {
    if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
    this.setData({ question: '' });
    this.session.reset();
  },

  onImgError(e) {
    const pos = e.currentTarget.dataset.pos;
    this.imgErrors[pos] = true;
    this.setData({ [`picks[${pos}].imgError`]: true });
  },
});
