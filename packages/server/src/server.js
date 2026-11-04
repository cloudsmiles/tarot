import http from 'node:http';
import { buildMessages, resolvePicks, resolveSpread } from './prompt.js';
import { SPREADS } from '../../core/src/spread.js';
import { createShare, getShare } from './store.js';
import { config } from './config.js';

const PORT = config.port;
const ARK_URL = `${config.ark.baseUrl.replace(/\/$/, '')}/chat/completions`;
const ARK_MODEL = config.ark.model;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limit = 8 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > limit) {
        rejectBody(Object.assign(new Error('payload too large'), { httpStatus: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => resolveBody(raw));
    req.on('error', rejectBody);
  });
}

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function handleReading(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return sendJson(res, 400, { error: '请求体不是合法 JSON' });
  }

  const question = String(payload.question ?? '').trim();
  if (!question) return sendJson(res, 400, { error: '问题不能为空' });
  if (question.length > 80) return sendJson(res, 400, { error: '问题过长' });
  if (payload.spreadId != null && !SPREADS.some(s => s.id === payload.spreadId)) {
    return sendJson(res, 400, { error: '未知的牌阵' });
  }
  const spread = resolveSpread(payload.spreadId ?? null);
  const pickError = resolvePicks(payload.picks, spread);
  if (pickError) return sendJson(res, 400, { error: pickError });

  if (!config.ark.apiKey) return sendJson(res, 500, { error: '服务端缺少 ark.apiKey 配置' });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(ARK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ark.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        stream: true,
        messages: buildMessages({ question, picks: payload.picks, spread }),
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) return;
    console.error('ark fetch error:', e.message);
    return sendJson(res, 502, { error: '解读服务暂时无法连结' });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('ark error:', upstream.status, detail.slice(0, 500));
    return sendJson(res, 502, { error: '解读服务返回异常' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const heartbeat = setInterval(() => sse(res, { type: 'ping' }), 5000);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          sse(res, { type: 'token', text: delta });
        }
      }
    }
    sse(res, { type: 'done' });
  } catch (e) {
    if (!controller.signal.aborted) {
      console.error('stream error:', e.message);
      sse(res, { type: 'error', message: '解读连结中断，请重试' });
    }
  } finally {
    clearInterval(heartbeat);
    reader.releaseLock();
    res.end();
  }
}

async function handleShareCreate(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, 16 * 1024)) || '{}');
  } catch {
    return sendJson(res, 400, { error: '请求体不是合法 JSON' });
  }
  const question = String(payload.question ?? '').trim();
  if (!question || question.length > 80) return sendJson(res, 400, { error: '问题无效' });
  if (!SPREADS.some(s => s.id === payload.spreadId)) return sendJson(res, 400, { error: '未知的牌阵' });
  const spread = resolveSpread(payload.spreadId);
  const pickError = resolvePicks(payload.picks, spread);
  if (pickError) return sendJson(res, 400, { error: pickError });
  const readingText = String(payload.readingText ?? '').trim();
  if (readingText.length < 20 || readingText.length > 5000) {
    return sendJson(res, 400, { error: '解读内容无效' });
  }
  const id = createShare({
    question,
    spreadId: spread.id,
    picks: payload.picks.map(p => ({ cardId: p.cardId, reversed: !!p.reversed })),
    readingText,
  });
  sendJson(res, 200, { id });
}

function handleShareGet(req, res, id) {
  const record = getShare(id);
  if (!record) return sendJson(res, 404, { error: '分享不存在或已失效' });
  sendJson(res, 200, record);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true });
  const shareGet = url.pathname.match(/^\/api\/share\/([A-Za-z0-9_-]+)$/);
  if (req.method === 'GET' && shareGet) return handleShareGet(req, res, shareGet[1]);
  if (req.method === 'POST' && url.pathname === '/api/share') {
    return handleShareCreate(req, res).catch(e => {
      console.error('share error:', e);
      sendJson(res, 500, { error: '服务异常' });
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/reading') {
    return handleReading(req, res).catch(e => {
      console.error('handler error:', e);
      if (!res.headersSent) sendJson(res, e.httpStatus || 500, { error: '服务异常' });
      else { sse(res, { type: 'error', message: '解读中断，请重试' }); res.end(); }
    });
  }
  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`tarot reading server on http://localhost:${PORT}`);
  console.log(`data dir: ${config.dataDir}`);
  console.log(`config: ${config.configPath}`);
  if (!config.ark.apiKey) console.warn('warning: ark.apiKey 未配置，解读接口不可用');
});
