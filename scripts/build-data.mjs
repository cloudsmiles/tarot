// 合并 pipeline 元数据与 pipeline/meanings.js 的正逆位牌义，生成核心牌数据。
// 用法：node scripts/build-data.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pipeline = join(root, 'pipeline');
const outFile = join(root, 'packages/core/src/data/cards.js');

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));

/* 牌义来源：pipeline/meanings.js 是无导出的浏览器风格脚本，vm 沙箱执行后取常量 */
function loadMeanings() {
  const code = readFileSync(join(pipeline, 'meanings.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(`${code}\nthis.__out = { MAJORS, SUITS };`, sandbox, {
    filename: 'pipeline/meanings.js',
  });
  return sandbox.__out;
}

const { MAJORS, SUITS } = loadMeanings();
const legacyMajors = new Map(MAJORS.map(c => [c.file, c]));
const legacySuits = new Map(SUITS.map(s => [s.code, s]));

/* 新花色 -> 旧编码 / 新文件前缀 / 花色序号 */
const SUIT_MAP = {
  wands:     { code: 'wa', prefix: 'w' },
  cups:      { code: 'cu', prefix: 'c' },
  swords:    { code: 'sw', prefix: 's' },
  pentacles: { code: 'pe', prefix: 'p' },
};
const RANK_CODE = { 1: 'ac', 11: 'pa', 12: 'kn', 13: 'qu', 14: 'ki' };
const rankCode = rank => (rank >= 2 && rank <= 10 ? String(rank).padStart(2, '0') : RANK_CODE[rank]);

function metaOf(p) {
  return {
    ornament: p.ornament,
    motif: p.motif,
    mood: p.mood,
    shot: p.shot,
    subject: p.subject,
  };
}

const cards = [];

/* 大阿尔克那：cards.json（no "00".."21"） */
for (const p of readJson(join(pipeline, 'cards.json')).cards) {
  const no = parseInt(p.no, 10);
  const legacy = legacyMajors.get(`ar${p.no}`);
  if (!legacy) throw new Error(`旧牌义缺失：ar${p.no}`);
  cards.push({
    id: `${p.no}_${p.key}`,
    arcana: 'major',
    no,
    key: p.key,
    cn: legacy.name,
    en: p.title,
    img: `${p.no}_${p.key}.jpg`,
    up: legacy.up,
    rev: legacy.rev,
    meta: metaOf(p),
  });
}

/* 小阿尔克那：wands=minor.json，其余同名 */
for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
  const file = suit === 'wands' ? 'minor.json' : `${suit}.json`;
  const group = readJson(join(pipeline, file));
  if (group.suit !== suit) throw new Error(`${file} 的 suit=${group.suit}，期望 ${suit}`);
  const { code, prefix } = SUIT_MAP[suit];
  const legacy = legacySuits.get(code);
  if (!legacy) throw new Error(`旧牌义花色缺失：${code}`);
  const suitCn = legacy.suit;

  const sorted = [...group.cards].sort((a, b) => parseInt(a.no.slice(1), 10) - parseInt(b.no.slice(1), 10));
  for (const p of sorted) {
    const rank = parseInt(p.no.slice(1), 10);
    const pair = legacy.ranks[rankCode(rank)];
    if (!pair) throw new Error(`旧牌义缺失：${code} rank ${rank}`);
    cards.push({
      id: `${prefix}${rank}_${p.key}`,
      arcana: 'minor',
      suit,
      suitCn,
      rank,
      key: p.key,
      cn: p.cn,
      en: p.title,
      img: `${prefix}${rank}_${p.key}.jpg`,
      up: pair[0],
      rev: pair[1],
      meta: metaOf(p),
    });
  }
}

/* 完整性断言 */
if (cards.length !== 78) throw new Error(`牌数应为 78，实际 ${cards.length}`);
const ids = new Set();
for (const c of cards) {
  if (ids.has(c.id)) throw new Error(`重复 id: ${c.id}`);
  ids.add(c.id);
  if (!c.up || !c.rev) throw new Error(`牌义缺失: ${c.id}`);
}
const available = new Set(readdirSync(join(pipeline, 'output')).filter(f => f.endsWith('.jpg')));
for (const c of cards) {
  if (!available.has(c.img)) throw new Error(`pipeline/output 中找不到图片：${c.img}`);
}

writeFileSync(
  outFile,
  `// 由 scripts/build-data.mjs 生成，请勿手改\nexport const CARDS = ${JSON.stringify(cards, null, 2)};\n`,
);
console.log(`生成 ${cards.length} 张牌 -> ${outFile.replace(root + '/', '')}`);
