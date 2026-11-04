export function createRemoteReadingProvider({
  endpoint = '/api/reading',
  fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
} = {}) {
  return {
    async generateStream(ctx, { onToken = null } = {}) {
      if (!fetchImpl) throw new Error('当前环境不支持 fetch');
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: ctx.question,
          spreadId: ctx.spread?.id,
          picks: ctx.picks.map(p => ({ cardId: p.card.id, reversed: p.reversed })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`reading HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (msg.type === 'token') {
            text += msg.text;
            onToken?.(msg.text, text);
          } else if (msg.type === 'error') {
            throw new Error(msg.message || 'reading failed');
          }
        }
      }
      if (!text) throw new Error('empty reading');
      return text;
    },
  };
}

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
