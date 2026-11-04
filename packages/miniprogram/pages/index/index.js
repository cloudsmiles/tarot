const core = require('../../core/index.js');

const CHIP_LABELS = ['感情关系', '事业发展', '财务状况', '自我觉察'];

function mapRiver(st) {
  const n = st.river.length;
  const order = new Map(st.picks.map((p, i) => [p.riverIndex, i + 1]));
  const list = [];
  // 三份拷贝支撑双向无缝循环；idx 对 n 取模，对应真实牌
  for (let rep = 0; rep < 3; rep++) {
    for (let i = 0; i < n; i++) {
      list.push({ key: rep * n + i, idx: i, pickNo: order.get(i) || 0, pre: '', dealDelay: 0 });
    }
  }
  return list;
}

Page({
  data: {
    phase: 'idle',
    question: '',
    presets: core.PRESET_QUESTIONS,
    chipLabels: CHIP_LABELS,
    labels: core.THREE_CARD_SPREAD.labels,
    river: [],
    scrollLeft: 0,
    pickedCount: 0,
    canConfirm: false,
    canRead: false,
    flipped: [false, false, false],
    picks: [],
    readingStatus: '',
    readingParagraphs: [],
    dealHidden: false,
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
    this.lastPhase = 'idle';
    this.unsubscribe = this.session.subscribe(state => this.applyState(state));
    this.applyState(this.session.getState());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
    if (this.dealTimer) clearTimeout(this.dealTimer);
  },

  applyState(st) {
    const enteringPicking = st.phase === 'picking' && this.lastPhase === 'shuffling';
    const patch = {
      phase: st.phase,
      pickedCount: st.picks.length,
      canConfirm: st.phase === 'picking' && st.picks.length === 3,
      canRead: st.phase === 'revealing' && st.flipped.every(Boolean) && !st.readingStatus,
      flipped: st.flipped.slice(),
      readingStatus: st.readingStatus || '',
    };
    if (enteringPicking) patch.dealHidden = true;

    if (st.phase === 'idle') {
      this.riverSent = false;
      this.pickSignature = '';
      this.imgErrors = {};
      this.cycleSpan = 0;
      patch.river = [];
      patch.picks = [];
      patch.readingParagraphs = [];
      patch.dealHidden = false;
      patch.scrollLeft = 0;
    }

    if ((st.phase === 'shuffling' || st.phase === 'picking') && !this.riverSent && st.river.length) {
      this.riverSent = true;
      patch.river = mapRiver(st);
    }

    if (st.phase === 'shuffling' || st.phase === 'picking') {
      const signature = st.picks.map(p => p.riverIndex).join(',');
      if (signature !== this.pickSignature) {
        this.pickSignature = signature;
        patch.river = mapRiver(st);
      }
    }

    if (st.phase === 'revealing') {
      patch.picks = st.picks.map((p, i) => ({
        cn: p.card.cn,
        imgUrl: this.baseUrl + p.card.img + "?v=20261104",
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

    this.lastPhase = st.phase;
    this.setData(patch, () => {
      if (enteringPicking) this.dealCards();
    });
  },

  dealCards() {
    const query = wx.createSelectorQuery();
    query.selectAll('.mini-card').boundingClientRect();
    query.select('.river').fields({ rect: true, size: true, scrollOffset: true });
    query.exec(res => {
      const rects = res && res[0];
      const riverRect = res && res[1];
      if (!this.deckCenter || !rects || !rects.length || !riverRect) {
        this.setData({ dealHidden: false });
        return;
      }
      const total = rects.length;
      const n = total / 3;
      const span = rects[n].left - rects[0].left;
      this.cycleSpan = span;
      // 初始让中间份的中间牌居中
      const centerRect = rects[n + (n >> 1)];
      const centerInContent = centerRect.left - riverRect.left + (riverRect.scrollLeft || 0);
      const scrollLeft = Math.round(centerInContent - riverRect.width / 2);

      const o = this.deckCenter;
      const picks = this.session.getState().picks;
      const river = rects.map((r, t) => {
        const rep = Math.floor(t / n);
        const i = t % n;
        const pickNo = picks.findIndex(p => p.riverIndex === i) + 1;
        // 两侧副本直接就位，只动画中间份
        if (rep !== 1) {
          return { key: t, idx: i, pickNo: pickNo > 0 ? pickNo : 0, pre: '', dealDelay: 0 };
        }
        return {
          key: t,
          idx: i,
          pickNo: pickNo > 0 ? pickNo : 0,
          dealDelay: Math.min(i * 14, 700),
          pre: `transform:translate(${Math.round(o.x - (r.left + r.width / 2))}px,${Math.round(o.y - (r.top + r.height / 2))}px) scale(0.55);opacity:0;`,
        };
      });
      this.setData({ river, scrollLeft, dealHidden: true }, () => {
        if (this.dealTimer) clearTimeout(this.dealTimer);
        this.dealTimer = setTimeout(() => {
          this.setData({
            dealHidden: false,
            river: this.data.river.map(c => ({ ...c, pre: '', dealDelay: 0 })),
          });
        }, 40);
      });
    });
  },

  // 滚出中间份范围时折回一个副本宽度，内容相同故视觉无跳转
  onRiverScroll(e) {
    const span = this.cycleSpan;
    if (!span || this.wrapping) return;
    const sl = e.detail.scrollLeft;
    let next = 0;
    if (sl < span) next = sl + span;
    else if (sl > span * 2) next = sl - span;
    else return;
    this.wrapping = true;
    this.setData({ scrollLeft: Math.round(next) }, () => { this.wrapping = false; });
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
    if (this.dealTimer) clearTimeout(this.dealTimer);
    this.shuffleTimer = setTimeout(() => this.session.finishShuffle(), 1200);
    setTimeout(() => {
      wx.createSelectorQuery()
        .select('.shuffle-deck')
        .boundingClientRect()
        .exec(res => {
          const r = res && res[0];
          if (r) this.deckCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
    }, 80);
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
    const pos = Number(e.currentTarget.dataset.pos);
    const st = this.session.getState();
    if (st.phase !== 'revealing' || !st.flipped[pos]) {
      this.session.flip(pos);
      return;
    }
    if (this.imgErrors[pos]) return;
    const urls = st.picks
      .filter((_, i) => st.flipped[i])
      .map(p => this.baseUrl + p.card.img + "?v=20261104");
    wx.previewImage({ current: this.baseUrl + st.picks[pos].card.img + "?v=20261104", urls });
  },

  onAi() {
    this.session.requestReading(this.provider);
  },

  onRetry() {
    this.session.requestReading(this.provider);
  },

  onAgain() {
    if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
    if (this.dealTimer) clearTimeout(this.dealTimer);
    this.setData({ question: '' });
    this.session.reset();
  },

  onImgError(e) {
    const pos = e.currentTarget.dataset.pos;
    this.imgErrors[pos] = true;
    this.setData({ [`picks[${pos}].imgError`]: true });
  },
});
