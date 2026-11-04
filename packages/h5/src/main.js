import { PRESET_QUESTIONS, SPREADS, CARDS, getSpread, createSession, createRemoteReadingProvider } from '@tarot/core';
import { buildShareCanvas } from './share.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const AI_ENABLED = false;

// 关闭真实 AI 时使用的本地模拟解读：不请求后端，逐段吐出含加粗标记的文本
function createMockReadingProvider() {
  return {
    async generateStream(ctx, { onToken = null } = {}) {
      const cards = ctx.picks
        .map((p, i) => {
          const orientation = p.reversed ? '逆位' : '正位';
          return `【${ctx.spread.labels[i]}｜${p.card.cn}·${orientation}】${p.reversed ? p.card.rev : p.card.up}`;
        })
        .join('\n');
      const text = [
        `针对你的问题「${ctx.question}」，三张牌呈现出这样的流动（此为演示文本，未连接 AI）：`,
        '',
        cards,
        '',
        '综合来看，当下最需要的是**看清自己真正的处境**，而不是急着向外寻找答案。',
        '牌面提醒你，行动之前先稳住情绪，**把注意力收回到可以掌控的小事上**。',
        '最后的方向指向一次温柔但坚定的选择：**诚实面对，并迈出具体的第一步**。',
      ].join('\n');
      const chunks = text.match(/[^]*?(?:。|！|？|】|\n)/g) || [text];
      let full = '';
      for (const chunk of chunks) {
        await new Promise(r => setTimeout(r, 24));
        full += chunk;
        onToken?.(chunk, full);
      }
      return text;
    },
  };
}

const activeProvider = AI_ENABLED ? createRemoteReadingProvider() : createMockReadingProvider();

const session = createSession();

function readingHtml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*\*/g, '');
}

let question = '';
let revealBuilt = false;
let shuffleTimer = null;

const screens = {
  idle: 'screen-ask',
  shuffling: 'screen-draw',
  picking: 'screen-draw',
  revealing: 'screen-reveal',
};

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
}

/* ---------- 问卜页 ---------- */

let selectedSpread = SPREADS[0];

const spreadOptionsEl = $('#spreadOptions');
spreadOptionsEl.innerHTML = '';
SPREADS.forEach((s, i) => {
  const opt = document.createElement('button');
  opt.type = 'button';
  opt.className = 'spread-opt' + (i === 0 ? ' is-sel' : '');
  opt.dataset.id = s.id;
  opt.innerHTML = `<span class="spread-opt-name">${s.name}</span><span class="spread-opt-desc">${s.desc}</span>`;
  spreadOptionsEl.appendChild(opt);
});
spreadOptionsEl.addEventListener('click', e => {
  const opt = e.target.closest('.spread-opt');
  if (!opt) return;
  selectedSpread = getSpread(opt.dataset.id);
  $$('.spread-opt').forEach(o => o.classList.toggle('is-sel', o === opt));
});

const CHIP_LABELS = ['感情关系', '事业发展', '财务状况', '自我觉察'];
const chipsEl = $('#chips');
chipsEl.innerHTML = '';
PRESET_QUESTIONS.forEach((q, i) => {
  const btn = document.createElement('button');
  btn.className = 'chip';
  btn.type = 'button';
  btn.textContent = CHIP_LABELS[i];
  btn.dataset.q = q;
  chipsEl.appendChild(btn);
});
chipsEl.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('.chip').forEach(c => c.classList.toggle('is-sel', c === chip));
  $('#questionInput').value = chip.dataset.q;
  question = chip.dataset.q;
  $('#startBtn').disabled = false;
});

$('#questionInput').addEventListener('input', e => {
  question = e.target.value.trim();
  $$('.chip').forEach(c => c.classList.remove('is-sel'));
  $('#startBtn').disabled = !question;
});

$('#startBtn').addEventListener('click', () => {
  session.setQuestion(question);
  session.setSpread(selectedSpread);
  session.start();
  riverEl.innerHTML = '';
  revealBuilt = false;
  $('#drawQuestion').textContent = `「${question}」`;
  $('#revealQuestion').textContent = `「${question}」`;
  clearTimeout(shuffleTimer);
  shuffleTimer = setTimeout(() => session.finishShuffle(), 1200);
});

/* ---------- 牌河 ---------- */

const riverEl = $('#river');

let cycleSpan = 0;

function buildRiver(origin) {
  riverEl.innerHTML = '';
  const { river } = session.getState();
  const n = river.length;
  // 三份拷贝支撑双向无缝循环；data-idx 取模映射回真实牌
  for (let rep = 0; rep < 3; rep++) {
    for (let i = 0; i < n; i++) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mini-card';
      card.dataset.idx = String(i);
      card.innerHTML = '<span class="mini-back"></span>';
      riverEl.appendChild(card);
    }
  }
  cycleSpan = riverEl.children[n].offsetLeft - riverEl.children[0].offsetLeft;
  // 初始让中间份的中间牌位于屏幕中央
  const centerCard = riverEl.children[n + (n >> 1)];
  riverEl.scrollLeft = centerCard.offsetLeft + centerCard.offsetWidth / 2 - riverEl.clientWidth / 2;
  if (origin) dealFrom(origin, n);
  updateRiverFocus();
}

// 滚出中间份范围时瞬时跳到对应副本，视觉位置不变，形成无限循环
function wrapCycle() {
  const left = riverEl.scrollLeft;
  if (left < cycleSpan) riverEl.scrollLeft = left + cycleSpan;
  else if (left > cycleSpan * 2) riverEl.scrollLeft = left - cycleSpan;
}

function updateRiverFocus() {
  const cx = riverEl.getBoundingClientRect().left + riverEl.clientWidth / 2;
  riverEl.querySelectorAll('.mini-card').forEach(el => {
    if (el.classList.contains('is-picked')) {
      el.style.transform = '';
      el.style.zIndex = '';
      el.classList.remove('is-nearest');
      return;
    }
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const lift = Math.exp(-((dx / 130) ** 2));
    el.style.transform = `translateY(${(-lift * 22).toFixed(1)}px) scale(${(1 + lift * 0.16).toFixed(3)})`;
    el.style.zIndex = String(Math.round(lift * 10));
    el.classList.toggle('is-nearest', lift > 0.97);
  });
}

let rafPending = false;
riverEl.addEventListener('scroll', () => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    wrapCycle();
    updateRiverFocus();
  });
});
riverEl.addEventListener(
  'wheel',
  e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    riverEl.scrollLeft += e.deltaY;
  },
  { passive: false },
);

function dealFrom(origin, n) {
  const anims = [];
  [...riverEl.children].forEach((el, i) => {
    if (i < n || i >= n * 2) return; // 只动画中间份，两侧副本直接就位
    const r = el.getBoundingClientRect();
    const dx = origin.x - (r.left + r.width / 2);
    const dy = origin.y - (r.top + r.height / 2);
    anims.push(el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0.2 },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration: 420,
        delay: Math.min((i - n) * 14, 700),
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        fill: 'backwards',
      },
    ));
  });
  Promise.all(anims.map(a => a.finished.catch(() => {}))).then(updateRiverFocus);
}

riverEl.addEventListener('click', e => {
  if (session.getState().phase !== 'picking') return;
  const card = e.target.closest('.mini-card');
  if (!card) return;
  const idx = Number(card.dataset.idx);
  if (card.classList.contains('is-picked')) session.unpick(idx);
  else session.pick(idx);
});

$('#confirmBtn').addEventListener('click', () => {
  clearTimeout(shuffleTimer);
  if (session.getState().phase === 'shuffling') session.finishShuffle();
  session.confirmPicks();
});

/* ---------- 揭示页 ---------- */

$('#slots').addEventListener('click', e => {
  const slot = e.target.closest('.slot');
  if (!slot) return;
  const pos = Number(slot.dataset.pos);
  const st = session.getState();
  if (st.phase !== 'revealing' || !st.flipped[pos]) {
    session.flip(pos);
    return;
  }
  if (slot.querySelector('.card-front').classList.contains('img-error')) return;
  openPreview(st, pos);
});

const lightbox = $('#lightbox');
const lightboxImg = $('#lightboxImg');

function openPreview(state, pos) {
  const pick = state.picks[pos];
  lightboxImg.src = `/cards/${pick.card.img}?v=20261104`;
  lightboxImg.classList.toggle('reversed', pick.reversed);
  const spread = getSpread(state.spreadId);
  $('#lightboxCap').textContent =
    `${spread.labels[pos]} · ${pick.card.cn} · ${pick.reversed ? '逆位' : '正位'}`;
  lightbox.hidden = false;
}

lightbox.addEventListener('click', () => {
  lightbox.hidden = true;
  lightboxImg.src = '';
});

let waitingTimer = null;
function startWaitingHint() {
  clearInterval(waitingTimer);
  const t0 = Date.now();
  waitingTimer = setInterval(() => {
    if (session.getState().readingStatus !== 'loading') {
      clearInterval(waitingTimer);
      return;
    }
    const sec = Math.floor((Date.now() - t0) / 1000);
    $('#readingText').textContent =
      sec >= 12 ? `牌意正在慢慢浮现，请耐心等待… ${sec}s` : '正在凝神连结牌意…';
  }, 500);
}

$('#aiBtn').addEventListener('click', () => { startWaitingHint(); session.requestReading(activeProvider); });
$('#retryBtn').addEventListener('click', () => { startWaitingHint(); session.requestReading(activeProvider); });

/* ---------- 分享长图 ---------- */

const shareOverlay = $('#shareOverlay');
const shareImg = $('#shareImg');
const shareStatus = $('#shareStatus');
const shareActions = $('#shareActions');
const shareTip = $('#shareTip');
let shareBlobUrl = null;
let shareUrl = null;
let shareLinkPromise = null;

function ensureShareLink(st) {
  if (shareUrl) return Promise.resolve(shareUrl);
  shareLinkPromise ||= (async () => {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: st.question,
        spreadId: st.spreadId,
        picks: st.picks.map(p => ({ cardId: p.card.id, reversed: p.reversed })),
        readingText: st.readingText,
      }),
    });
    if (!res.ok) throw new Error('share create failed');
    const { id } = await res.json();
    shareUrl = `${location.origin}${location.pathname}?r=${id}`;
    return shareUrl;
  })();
  return shareLinkPromise;
}

$('#shareBtn').addEventListener('click', async () => {
  const st = session.getState();
  if (st.readingStatus !== 'ready' || st.readingStreaming) return;
  shareOverlay.hidden = false;
  shareImg.hidden = true;
  shareActions.hidden = true;
  shareTip.hidden = true;
  shareStatus.hidden = false;
  shareStatus.textContent = '正在生成分享链接与长图…';
  const linkTask = ensureShareLink(st).catch(() => null);
  try {
    const [url, canvas] = await Promise.all([
      linkTask,
      buildShareCanvas({
        question: st.question,
        spread: getSpread(st.spreadId),
        picks: st.picks,
        readingText: st.readingText,
      }),
    ]);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (shareBlobUrl) URL.revokeObjectURL(shareBlobUrl);
    shareBlobUrl = URL.createObjectURL(blob);
    shareImg.src = shareBlobUrl;
    shareImg.hidden = false;
    shareActions.hidden = false;
    shareTip.hidden = false;
    shareStatus.hidden = true;
    const hasLink = !!url;
    $('#shareSysBtn').hidden = !(hasLink && typeof navigator.share === 'function');
    $('#shareLinkBtn').hidden = !hasLink;
    shareImg._blob = blob;
  } catch {
    shareStatus.textContent = '分享内容生成失败，请重试';
  }
});

$('#shareCloseBtn').addEventListener('click', () => { shareOverlay.hidden = true; });
shareOverlay.addEventListener('click', e => {
  if (e.target === shareOverlay) shareOverlay.hidden = true;
});

$('#shareSaveBtn').addEventListener('click', () => {
  if (!shareBlobUrl) return;
  const a = document.createElement('a');
  a.href = shareBlobUrl;
  a.download = `塔罗占卜-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
});

$('#shareSysBtn').addEventListener('click', async () => {
  const st = session.getState();
  try {
    const url = await ensureShareLink(st);
    await navigator.share({ title: '我的塔罗占卜', text: `「${st.question}」`, url });
  } catch {
    // 用户取消或分享失败：静默，保留复制链接与保存图片入口
  }
});

$('#shareLinkBtn').addEventListener('click', async e => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(shareUrl);
    const old = btn.textContent;
    btn.textContent = '链接已复制 ✓';
    setTimeout(() => { btn.textContent = old; }, 1800);
  } catch {
    window.prompt('复制这个链接分享：', shareUrl);
  }
});

$('#againBtn').addEventListener('click', () => {
  clearTimeout(shuffleTimer);
  question = '';
  $('#questionInput').value = '';
  riverEl.innerHTML = '';
  lightbox.hidden = true;
  shareOverlay.hidden = true;
  lightboxImg.src = '';
  lightboxImg.classList.remove('reversed');
  $$('.slot').forEach(slot => {
    slot.querySelectorAll('.slot-card').forEach(n => n.remove());
    slot.classList.remove('is-flipped');
  });
  revealBuilt = false;
  shareUrl = null;
  shareLinkPromise = null;
  session.reset();
});

function buildReveal(picks) {
  $$('.slot').forEach((slot, pos) => {
    if (slot.querySelector('.slot-card')) return;
    const wrap = document.createElement('div');
    wrap.className = 'slot-card';
    wrap.innerHTML =
      '<div class="card3d">' +
      '<div class="card-face card-back"></div>' +
      '<div class="card-face card-front"><img class="card-img" alt=""></div>' +
      '</div>';
    const img = wrap.querySelector('.card-img');
    const pick = picks[pos];
    img.alt = pick.card.cn;
    slot.querySelector('.slot-name').innerHTML =
      `${pick.card.cn}<small>${pick.reversed ? '逆位' : '正位'}</small>`;
    img.addEventListener('error', () => wrap.querySelector('.card-front').classList.add('img-error'), { once: true });
    slot.appendChild(wrap);
  });
  revealBuilt = true;
}

/* ---------- 状态渲染 ---------- */

function render(state) {
  $('#startBtn').disabled = state.phase !== 'idle' || !question.trim();

  showScreen(screens[state.phase]);

  let dealOrigin = null;
  if (state.phase === 'picking' && riverEl.children.length === 0) {
    const stage = $('#shuffleStage');
    if (getComputedStyle(stage).display !== 'none') {
      const r = stage.querySelector('.shuffle-deck').getBoundingClientRect();
      dealOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  $('#screen-draw').classList.toggle('is-shuffling', state.phase === 'shuffling');

  if (state.phase === 'shuffling' || state.phase === 'picking') {
    if (state.phase === 'picking' && riverEl.children.length === 0) buildRiver(dealOrigin);
    $('#pickCount').textContent = String(state.picks.length);
    const order = new Map(state.picks.map((p, i) => [p.riverIndex, i + 1]));
    riverEl.querySelectorAll('.mini-card').forEach(el => {
      const pickedOrder = order.get(Number(el.dataset.idx));
      el.classList.toggle('is-picked', !!pickedOrder);
      el.dataset.pick = pickedOrder ? String(pickedOrder) : '';
    });
    $$('.tray-slot').forEach((slot, i) => slot.classList.toggle('is-filled', i < state.picks.length));
    updateRiverFocus();
    $('#confirmBtn').hidden = !(state.phase === 'picking' && state.picks.length === 3);
    $('#drawHint').textContent =
      state.phase === 'shuffling'
        ? '正在洗牌，请默想你的问题…'
        : `左右滑动浏览牌堆，依次为「${getSpread(state.spreadId).desc.replaceAll(' · ', '』「')}」各选一张（再点可取消）`;
  }

  if (state.phase === 'revealing') {
    const spread = getSpread(state.spreadId);
    $$('.slot-label').forEach((el, i) => { el.textContent = spread.labels[i]; });
    if (!revealBuilt) buildReveal(state.picks);
    state.picks.forEach((pick, pos) => {
      const slot = $(`.slot[data-pos="${pos}"]`);
      if (state.flipped[pos] && !slot.classList.contains('is-flipped')) {
        slot.classList.add('is-flipped');
        const front = slot.querySelector('.card-front');
        if (pick.reversed) front.classList.add('reversed');
        front.querySelector('.card-img').src = `/cards/${pick.card.img}?v=20261104`;
      }
    });

    const allFlipped = state.flipped.every(Boolean);
    $('#aiBtn').hidden = !(allFlipped && !state.readingStatus);

    const reading = $('#reading');
    if (state.readingStatus) {
      reading.hidden = false;
      $('#retryBtn').hidden = state.readingStatus !== 'error';
      $('#shareBtn').hidden = state.readingStatus !== 'ready' || state.readingStreaming;
      if (state.readingStatus === 'loading') $('#readingText').textContent = '正在凝神连结牌意…';
      else if (state.readingStatus === 'error') $('#readingText').textContent = '牌意连结被迷雾打断了，请再试一次。';
      else $('#readingText').innerHTML = readingHtml(state.readingText);
      requestAnimationFrame(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight }));
    } else {
      reading.hidden = true;
      $('#readingText').textContent = '';
    }
  }
}

/* ---------- 分享链接落地页 ---------- */

const CARDS_BY_ID = new Map(CARDS.map(c => [c.id, c]));

async function initShared(id) {
  showScreen('screen-shared');
  const slotsEl = $('#sharedSlots');
  slotsEl.innerHTML = '';
  $('#sharedSpread').textContent = '正在读取牌面…';
  $('#sharedQuestion').textContent = '';
  $('#sharedReading').hidden = true;
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error();
    const rec = await res.json();
    const spread = getSpread(rec.spreadId);
    if (!spread) throw new Error();
    const picks = rec.picks.map(p => ({ card: CARDS_BY_ID.get(p.cardId), reversed: !!p.reversed }));
    if (picks.some(p => !p.card)) throw new Error();

    $('#sharedSpread').textContent = `三牌阵 · ${spread.name}（${spread.desc}）`;
    $('#sharedQuestion').textContent = `「${rec.question}」`;
    picks.forEach((pick, pos) => {
      const slot = document.createElement('div');
      slot.className = 'slot shared-slot';
      slot.dataset.pos = String(pos);
      slot.innerHTML =
        '<span class="slot-label"></span>' +
        '<div class="slot-card"><div class="card-face card-front">' +
        '<img class="card-img" alt=""></div></div>' +
        '<span class="slot-name"></span>';
      slot.querySelector('.slot-label').textContent = spread.labels[pos];
      const img = slot.querySelector('.card-img');
      img.src = `/cards/${pick.card.img}?v=20261104`;
      img.alt = pick.card.cn;
      slot.querySelector('.slot-name').innerHTML =
        `${pick.card.cn}<small>${pick.reversed ? '逆位' : '正位'}</small>`;
      if (pick.reversed) slot.querySelector('.card-front').classList.add('reversed');
      slotsEl.appendChild(slot);
    });
    $('#sharedText').innerHTML = readingHtml(rec.readingText);
    $('#sharedReading').hidden = false;
    slotsEl.addEventListener('click', e => {
      const slot = e.target.closest('.shared-slot');
      if (!slot) return;
      const pos = Number(slot.dataset.pos);
      const pick = picks[pos];
      lightboxImg.src = `/cards/${pick.card.img}?v=20261104`;
      lightboxImg.classList.toggle('reversed', pick.reversed);
      $('#lightboxCap').textContent =
        `${spread.labels[pos]} · ${pick.card.cn} · ${pick.reversed ? '逆位' : '正位'}`;
      lightbox.hidden = false;
    });
  } catch {
    $('#sharedSpread').textContent = '这组牌意已经散入风中';
    $('#sharedQuestion').textContent = '链接可能已失效，请朋友重新分享一次。';
    $('#sharedCta').textContent = '✦ 我自己占一次';
  }
}

$('#sharedCta').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  showScreen('screen-ask');
});

/* ---------- 启动 ---------- */

const sharedId = new URLSearchParams(location.search).get('r');
if (sharedId) {
  initShared(sharedId);
} else {
  session.subscribe(render);
  render(session.getState());
}
