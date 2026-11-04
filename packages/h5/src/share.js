const W = 750;
const PAD = 48;
const CONTENT_W = W - PAD * 2;

const C = {
  bgTop: '#1b1b20',
  bgBottom: '#0d0d0f',
  gold: '#c4a878',
  ink: '#eceae5',
  dim: '#8a8780',
  cardBg: '#0d1028',
  cardBorder: '#45454d',
};

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const NO_LINE_START = new Set('。，、；：！？）】」』·…—');

const BODY_FONT = '17px "PingFang SC", sans-serif';
const BODY_BOLD = '700 17px "PingFang SC", sans-serif';

function parseChars(paragraph) {
  const chars = [];
  paragraph.split(/(\*\*[^*]+\*\*)/g).forEach(seg => {
    if (!seg) return;
    const bold = seg.startsWith('**') && seg.endsWith('**');
    const text = bold ? seg.slice(2, -2) : seg;
    for (const ch of text) chars.push({ ch, bold });
  });
  return chars;
}

function mergeRuns(chars) {
  const runs = [];
  for (const { ch, bold } of chars) {
    const last = runs[runs.length - 1];
    if (last && last.bold === bold) last.text += ch;
    else runs.push({ text: ch, bold });
  }
  return runs;
}

function wrapLines(ctx, text, maxWidth, fonts = {}) {
  const regularFont = fonts.regular || BODY_FONT;
  const boldFont = fonts.bold || BODY_BOLD;
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push([]); continue; }
    let line = [];
    let lineW = 0;
    for (const { ch, bold } of parseChars(paragraph)) {
      ctx.font = bold ? boldFont : regularFont;
      const w = ctx.measureText(ch).width;
      if (lineW + w > maxWidth && line.length && !NO_LINE_START.has(ch)) {
        lines.push(mergeRuns(line));
        line = [];
        lineW = 0;
      }
      line.push({ ch, bold });
      lineW += w;
    }
    if (line.length) lines.push(mergeRuns(line));
  }
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function buildShareCanvas({ question, spread, picks, readingText }) {
  const measure = document.createElement('canvas').getContext('2d');

  const QUESTION_FONT = '600 24px "PingFang SC", sans-serif';
  const QUESTION_BOLD = '700 24px "PingFang SC", sans-serif';
  measure.font = QUESTION_FONT;
  const questionLines = wrapLines(measure, `「${question}」`, CONTENT_W - 40, {
    regular: QUESTION_FONT,
    bold: QUESTION_BOLD,
  });
  const bodyLines = wrapLines(measure, readingText.trim(), CONTENT_W);

  const CARD_W = 150;
  const CARD_H = Math.round(CARD_W * 178 / 104);
  const cardGap = (CONTENT_W - CARD_W * 3) / 2;

  const headerH = 150;
  const questionH = questionLines.length * 36;
  const cardsH = CARD_H + 92;
  const readingH = bodyLines.length * 30;
  const footerH = 90;
  const H = Math.ceil(
    PAD + headerH + questionH + 36 + cardsH + 44 + readingH + 40 + footerH + PAD,
  );

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(1, C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  let y = PAD;

  ctx.textAlign = 'center';
  ctx.fillStyle = C.gold;
  ctx.font = '30px Georgia, serif';
  ctx.fillText('☾', cx, y + 30);
  y += 52;
  ctx.font = '600 21px "PingFang SC", sans-serif';
  ctx.fillStyle = C.ink;
  ctx.fillText('静 心 · 问 卜', cx, y);
  y += 34;
  ctx.font = '14px "PingFang SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(`三牌阵 · ${spread.name}（${spread.desc}）`, cx, y);
  y += 54;

  ctx.font = QUESTION_FONT;
  ctx.fillStyle = C.gold;
  ctx.textAlign = 'left';
  for (const line of questionLines) {
    const lineW = line.reduce((w, run) => {
      ctx.font = run.bold ? QUESTION_BOLD : QUESTION_FONT;
      return w + ctx.measureText(run.text).width;
    }, 0);
    let x = cx - lineW / 2;
    for (const run of line) {
      ctx.font = run.bold ? QUESTION_BOLD : QUESTION_FONT;
      ctx.fillText(run.text, x, y + 24);
      x += ctx.measureText(run.text).width;
    }
    y += 36;
  }
  ctx.textAlign = 'center';
  y += 18;

  const imgs = await Promise.all(
    picks.map(p => loadImage(`${location.origin}${import.meta.env.BASE_URL}cards/${p.card.img}?v=20261104`)),
  );

  picks.forEach((p, i) => {
    const x = PAD + i * (CARD_W + cardGap);
    roundRectPath(ctx, x, y, CARD_W, CARD_H, 10);
    ctx.fillStyle = C.cardBg;
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, x, y, CARD_W, CARD_H, 10);
    ctx.clip();
    const img = imgs[i];
    if (img) {
      if (p.reversed) {
        ctx.save();
        ctx.translate(x + CARD_W / 2, y + CARD_H / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, CARD_W, CARD_H);
      }
    }
    ctx.restore();
    ctx.strokeStyle = C.cardBorder;
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y + 0.5, CARD_W - 1, CARD_H - 1, 10);
    ctx.stroke();

    ctx.font = '500 15px "PingFang SC", sans-serif';
    ctx.fillStyle = C.gold;
    ctx.fillText(spread.labels[i], x + CARD_W / 2, y + CARD_H + 28);
    ctx.font = '600 17px "PingFang SC", sans-serif';
    ctx.fillStyle = C.ink;
    ctx.fillText(p.card.cn, x + CARD_W / 2, y + CARD_H + 54);
    ctx.font = '13px "PingFang SC", sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText(p.reversed ? '逆位' : '正位', x + CARD_W / 2, y + CARD_H + 76);
  });
  y += cardsH + 26;

  ctx.strokeStyle = 'rgba(196,168,120,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 30;

  ctx.textAlign = 'left';
  for (const line of bodyLines) {
    if (!line.length) { y += 16; continue; }
    let x = PAD;
    for (const run of line) {
      ctx.font = run.bold ? BODY_BOLD : BODY_FONT;
      ctx.fillStyle = run.bold ? '#e6cf9f' : C.ink;
      ctx.fillText(run.text, x, y);
      x += ctx.measureText(run.text).width;
    }
    y += 30;
  }

  const date = new Date();
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  ctx.textAlign = 'center';
  ctx.font = '13px "PingFang SC", sans-serif';
  ctx.fillStyle = C.dim;
  ctx.fillText(`AI 解读仅供自我觉察参考 · ${dateStr}`, cx, H - PAD - 8);

  return canvas;
}
