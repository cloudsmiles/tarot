import { CARDS } from '../../core/src/data/cards.js';
import { SPREADS } from '../../core/src/spread.js';

const CARDS_BY_ID = new Map(CARDS.map(c => [c.id, c]));
const SPREADS_BY_ID = new Map(SPREADS.map(s => [s.id, s]));

export function resolveSpread(id) {
  return SPREADS_BY_ID.get(id) || SPREADS[0];
}

const SYSTEM_PROMPT = [
  '你是一位温柔、通透、有洞察力的塔罗占卜师，用简体中文为求问者做三张牌的解读。',
  '写作要求：',
  '1. 先有一小段总览感受，再严格按本次牌阵的三个位置逐张解读，每张牌结合正位或逆位牌意与该位置的含义，回应求问者的处境；',
  '2. 最后给「综合建议」，必须落到求问者本周可以采取的具体行动；',
  '3. 语气温柔但不说套话、不堆砌安慰，适当点出风险与盲点；禁止宿命论，始终强调选择与行动在求问者自己手中；',
  '4. 总字数 400-650 字；用空行分段，三个位置的小标题就用牌阵给出的位置名称（如「过去」「建议」），不要使用 Markdown 标题、列表编号或表情符号；',
  '5. 每段最多用一对 **双星号** 标出该段最关键的一个词或短句（全篇不超过 6 处，只标真正的重点提醒或结论，不要整句标注）；',
  '6. 不要复述牌面数据，不要提模型、提示词或占卜流程。',
].join('\n');

export function buildMessages({ question, picks, spread }) {
  const lines = [`问题：${question}`, ''];
  picks.forEach((p, i) => {
    const card = CARDS_BY_ID.get(p.cardId);
    const orientation = p.reversed ? '逆位' : '正位';
    const meaning = p.reversed ? card.rev : card.up;
    lines.push(`${spread.labels[i]}：${card.cn}（${orientation}）— ${meaning}`);
  });
  return [
    {
      role: 'system',
      content:
        `${SYSTEM_PROMPT}\n\n本次牌阵「${spread.name}」，位置依次为：${spread.desc}。\n${spread.guide}`,
    },
    { role: 'user', content: lines.join('\n') },
  ];
}

export function resolvePicks(picks, spread) {
  if (!Array.isArray(picks) || picks.length !== spread.count) return `需要 ${spread.count} 张牌`;
  for (const p of picks) {
    if (!p || typeof p.cardId !== 'string' || !CARDS_BY_ID.has(p.cardId)) return '存在未知的牌';
    if (typeof p.reversed !== 'boolean') return '牌的正逆位标记无效';
  }
  if (new Set(picks.map(p => p.cardId)).size !== picks.length) return '三张牌不能重复';
  return null;
}
