export function createLocalReadingProvider({ wait = null, delay = 1500 } = {}) {
  return {
    async generate(ctx) {
      if (wait) await wait(delay);
      const lines = [
        `针对你的问题「${ctx.question}」，三张牌诉说着这样的流动：`,
        '',
        ...ctx.picks.map((p, i) => {
          const label = ctx.spread.labels[i];
          const orientation = p.reversed ? '逆位' : '正位';
          const meaning = p.reversed ? p.card.rev : p.card.up;
          return `【${label}｜${p.card.cn}·${orientation}】${meaning}`;
        }),
        '',
        '综合来看，牌面邀请你正视当下的处境，并把觉察化为下一步的具体行动。',
        '',
        '（以上为原型占位解读）',
      ];
      return lines.join('\n');
    },
  };
}
