export const SPREADS = [
  {
    id: 'past-present-future',
    name: '时间流',
    desc: '过去 · 现在 · 未来',
    count: 3,
    labels: ['过去', '现在', '未来'],
    guide:
      '三张牌按时间展开：「过去」看导致现状的成因与过往脉络，「现在」看当下处境与核心矛盾，「未来」看若按现状自然发展的近期趋势。解读时讲清三者的因果流动。',
  },
  {
    id: 'mind-body-spirit',
    name: '身心灵',
    desc: '现状 · 内心 · 精神',
    count: 3,
    labels: ['现状', '内心', '精神'],
    guide:
      '三张牌从三个层面照见求问者：「现状」看客观现实处境与正在发生的事，「内心」看情绪、关系动力与真实渴求，「精神」看更高层面的功课、天赋与需要聆听的内在声音。',
  },
  {
    id: 'situation-advice-outcome',
    name: '行动流',
    desc: '现状 · 建议 · 结果',
    count: 3,
    labels: ['现状', '建议', '结果'],
    guide:
      '三张牌服务于一个具体决定：「现状」客观描述局面与可用资源，「建议」给出本周可以采取的具体行动，「结果」说明若依此行动最可能走向的结果，同时点明其中的不确定性。',
  },
];

export const THREE_CARD_SPREAD = SPREADS[0];

export function getSpread(id) {
  return SPREADS.find(s => s.id === id) || null;
}
