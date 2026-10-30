import { PRESET_QUESTIONS, THREE_CARD_SPREAD, createSession, createLocalReadingProvider } from '@tarot/core';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const session = createSession();
const provider = createLocalReadingProvider({
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
});

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

function buildRiver() {
  riverEl.innerHTML = '';
  const { river } = session.getState();
  river.forEach((_, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mini-card';
    card.dataset.idx = String(i);
    card.style.animationDelay = `${Math.min(i * 8, 600)}ms`;
    card.innerHTML = '<span class="mini-back"><span class="back-emblem">☾</span></span>';
    riverEl.appendChild(card);
  });
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
  lightboxImg.src = `/cards/${pick.card.img}`;
  lightboxImg.classList.toggle('reversed', pick.reversed);
  $('#lightboxCap').textContent =
    `${THREE_CARD_SPREAD.labels[pos]} · ${pick.card.cn} · ${pick.reversed ? '逆位' : '正位'}`;
  lightbox.hidden = false;
}

lightbox.addEventListener('click', () => {
  lightbox.hidden = true;
  lightboxImg.src = '';
});

$('#aiBtn').addEventListener('click', () => session.requestReading(provider));
$('#retryBtn').addEventListener('click', () => session.requestReading(provider));

$('#againBtn').addEventListener('click', () => {
  clearTimeout(shuffleTimer);
  question = '';
  $('#questionInput').value = '';
  riverEl.innerHTML = '';
  lightbox.hidden = true;
  lightboxImg.src = '';
  lightboxImg.classList.remove('reversed');
  $$('.slot').forEach(slot => {
    slot.querySelectorAll('.slot-card').forEach(n => n.remove());
    slot.classList.remove('is-flipped');
  });
  revealBuilt = false;
  session.reset();
});

function buildReveal(picks) {
  $$('.slot').forEach((slot, pos) => {
    if (slot.querySelector('.slot-card')) return;
    const wrap = document.createElement('div');
    wrap.className = 'slot-card';
    wrap.innerHTML =
      '<div class="card3d">' +
      '<div class="card-face card-back"><span class="back-emblem">☾</span></div>' +
      '<div class="card-face card-front"><img class="card-img" alt=""></div>' +
      '</div>';
    const img = wrap.querySelector('.card-img');
    const pick = picks[pos];
    img.alt = pick.card.cn;
    img.addEventListener('error', () => wrap.querySelector('.card-front').classList.add('img-error'), { once: true });
    slot.appendChild(wrap);
  });
  revealBuilt = true;
}

/* ---------- 状态渲染 ---------- */

function render(state) {
  $('#startBtn').disabled = state.phase !== 'idle' || !question.trim();

  showScreen(screens[state.phase]);
  $('#screen-draw').classList.toggle('is-shuffling', state.phase === 'shuffling');

  if (state.phase === 'shuffling' || state.phase === 'picking') {
    if (state.phase === 'picking' && riverEl.children.length === 0) buildRiver();
    $('#pickCount').textContent = String(state.picks.length);
    const order = new Map(state.picks.map((p, i) => [p.riverIndex, i + 1]));
    riverEl.querySelectorAll('.mini-card').forEach(el => {
      const pickedOrder = order.get(Number(el.dataset.idx));
      el.classList.toggle('is-picked', !!pickedOrder);
      el.dataset.pick = pickedOrder ? String(pickedOrder) : '';
    });
    $$('.tray-slot').forEach((slot, i) => slot.classList.toggle('is-filled', i < state.picks.length));
    $('#confirmBtn').hidden = !(state.phase === 'picking' && state.picks.length === 3);
    $('#drawHint').textContent =
      state.phase === 'shuffling'
        ? '正在洗牌，请默想你的问题…'
        : '左右滑动浏览牌堆，凭直觉选择 3 张牌（再点一次可取消）';
  }

  if (state.phase === 'revealing') {
    if (!revealBuilt) buildReveal(state.picks);
    state.picks.forEach((pick, pos) => {
      const slot = $(`.slot[data-pos="${pos}"]`);
      if (state.flipped[pos] && !slot.classList.contains('is-flipped')) {
        slot.classList.add('is-flipped');
        const front = slot.querySelector('.card-front');
        if (pick.reversed) front.classList.add('reversed');
        front.querySelector('.card-img').src = `/cards/${pick.card.img}`;
      }
    });

    const allFlipped = state.flipped.every(Boolean);
    $('#aiBtn').hidden = !(allFlipped && !state.readingStatus);

    const reading = $('#reading');
    if (state.readingStatus) {
      reading.hidden = false;
      $('#retryBtn').hidden = state.readingStatus !== 'error';
      if (state.readingStatus === 'loading') $('#readingText').textContent = '正在凝神连结牌意…';
      else if (state.readingStatus === 'error') $('#readingText').textContent = '牌意连结被迷雾打断了，请再试一次。';
      else $('#readingText').textContent = state.readingText;
    } else {
      reading.hidden = true;
      $('#readingText').textContent = '';
    }
  }
}

session.subscribe(render);
render(session.getState());
