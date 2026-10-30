import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../packages/core/src/data/cards.js';

/* ============ Task 2: 生成的 78 张牌数据 ============ */

test('牌组总数与大小阿分布：78 = 22 大阿 + 4 花色 × 14', () => {
  assert.equal(CARDS.length, 78);
  assert.equal(CARDS.filter(c => c.arcana === 'major').length, 22);
  assert.equal(CARDS.filter(c => c.arcana === 'minor').length, 56);
  for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
    assert.equal(CARDS.filter(c => c.suit === suit).length, 14, suit);
  }
});

test('id/img 唯一，牌义非空，文件名符合命名规则', () => {
  const ids = new Set();
  const imgs = new Set();
  const re = /^(?:\d{2}|[wcsp]\d{1,2})_[a-z]+\.jpg$/;
  for (const c of CARDS) {
    assert.ok(!ids.has(c.id), `重复 id: ${c.id}`);
    assert.ok(!imgs.has(c.img), `重复 img: ${c.img}`);
    ids.add(c.id);
    imgs.add(c.img);
    assert.match(c.img, re);
    assert.equal(typeof c.up, 'string');
    assert.equal(typeof c.rev, 'string');
    assert.ok(c.up.trim());
    assert.ok(c.rev.trim());
  }
});

test('数组顺序与首尾位置抽查', () => {
  assert.equal(CARDS[0].id, '00_fool');
  assert.equal(CARDS[0].cn, '愚者');
  assert.equal(CARDS[13].id, '13_death');
  assert.ok(CARDS[13].up.startsWith('一个阶段的结束'), CARDS[13].up);
  assert.equal(CARDS[22].id, 'w1_ace');
  assert.equal(CARDS[22].suit, 'wands');
  assert.equal(CARDS[22].suitCn, '权杖');
  assert.equal(CARDS[77].id, 'p14_king');
  assert.equal(CARDS[77].cn, '星币国王');
});

test('花色不错位：宝剑国王/首牌的牌义来自旧 sw 组', () => {
  const king = CARDS.find(c => c.id === 's14_king');
  assert.equal(king.up, '公正与权威，判断有分量');
  assert.equal(king.rev, '武断操控，用规则压人');
  const ace = CARDS.find(c => c.id === 's1_ace');
  assert.equal(ace.up, '清晰的决断，真相划破迷雾');
});

test('逆位牌义抽查：愚者 rev 与旧 ar00 一致', () => {
  assert.equal(CARDS[0].rev, '鲁莽或逃避现实，冲动前需看清脚下');
});

test('每张牌带 pipeline 画面元数据 meta', () => {
  for (const c of CARDS) {
    assert.ok(c.meta, c.id);
    for (const k of ['ornament', 'motif', 'mood', 'shot', 'subject']) {
      assert.equal(typeof c.meta[k], 'string', `${c.id}.meta.${k}`);
      assert.ok(c.meta[k].trim(), `${c.id}.meta.${k} 为空`);
    }
    assert.equal(typeof c.en, 'string');
    assert.ok(c.en.length > 0);
  }
});

/* ============ Task 4: 洗牌 / 牌阵 / 文案 ============ */

import { shuffleDeck } from '../packages/core/src/deck.js';
import { THREE_CARD_SPREAD } from '../packages/core/src/spread.js';
import { PRESET_QUESTIONS } from '../packages/core/src/content.js';

function seededRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test('确定性 rng 下洗牌可复现：同种子同结果（含正逆位），异种子不同', () => {
  const a = shuffleDeck(CARDS, seededRng(12345));
  const b = shuffleDeck(CARDS, seededRng(12345));
  const c = shuffleDeck(CARDS, seededRng(999));
  assert.deepEqual(
    a.map(x => [x.card.id, x.reversed]),
    b.map(x => [x.card.id, x.reversed]),
  );
  const sameAsOther = a.every((x, i) => x.card.id === c[i].card.id && x.reversed === c[i].reversed);
  assert.equal(sameAsOther, false);
});

test('洗牌结果 78 张不重复，reversed 均为布尔值', () => {
  const r = shuffleDeck(CARDS, seededRng(7));
  assert.equal(r.length, 78);
  assert.equal(new Set(r.map(x => x.card.id)).size, 78);
  assert.ok(r.every(x => typeof x.reversed === 'boolean'));
});

test('三牌阵常量：3 个位置 过去/现在/未来', () => {
  assert.equal(THREE_CARD_SPREAD.count, 3);
  assert.deepEqual(THREE_CARD_SPREAD.labels, ['过去', '现在', '未来']);
  assert.equal(THREE_CARD_SPREAD.id, 'past-present-future');
});

test('预设问题为旧原型的 4 个方向', () => {
  assert.deepEqual(PRESET_QUESTIONS, [
    '我们最近的感情关系走向如何？',
    '目前手上的工作／项目发展如何？',
    '近期财务状况需要注意什么？',
    '我现在最需要觉察的内在课题？',
  ]);
});
