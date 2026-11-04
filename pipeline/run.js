#!/usr/bin/env node
/**
 * 塔罗牌批量生成流水线
 * 用法：
 *   node run.js                 # 生成全部（跳过已有产物）
 *   node run.js --only fool,10  # 只生成指定 key（或编号）
 *   node run.js --limit 4       # 只跑前 N 张待生成的
 *   node run.js --force wheel   # 强制重生成（覆盖已有）
 * 生成失败不自动重试，避免重复扣费。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HERE = __dirname;
const GEN = path.join(os.homedir(), '.claude/skills/byted-ark-seedream-skill/scripts/generate.js');
const RAW_DIR = path.join(HERE, '.raw');
const OUT_DIR = path.join(HERE, 'output');
const LOG_DIR = path.join(HERE, 'logs');
const DESKTOP_IMG = path.join(os.homedir(), 'Desktop/Seedream-Images/2026-10-29');
for (const d of [RAW_DIR, OUT_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });

const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const only = getArg('--only')?.split(',').map((s) => s.trim());
const forceList = getArg('--force')?.split(',').map((s) => s.trim()) ?? [];
const limit = Number(getArg('--limit')) || Infinity;
const dataFile = getArg('--data') || 'cards.json';
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, dataFile), 'utf8'));

function apiKey() {
  if (process.env.ARK_API_KEY) return process.env.ARK_API_KEY;
  const zshrc = fs.readFileSync(path.join(os.homedir(), '.zshrc'), 'utf8');
  const m = zshrc.match(/export ARK_API_KEY=(ark-[A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}
const KEY = apiKey();
if (!KEY) {
  console.error('未找到 ARK_API_KEY');
  process.exit(1);
}

function buildPrompt(card) {
  const s = DATA.style;
  return [
    s.base,
    `【构图】${card.shot}`,
    `【画面故事】${card.subject}`,
    s.background.replace('{{motif}}', card.motif),
    `【氛围】${card.mood}`,
    s.format.replace('{{ornament}}', card.ornament).replace('{{title}}', card.title),
    s.negative,
  ].join('\n');
}

function selected(card) {
  if (!only) return true;
  return only.includes(card.key) || only.includes(card.no) || only.includes(card.cn) || only.includes(card.title);
}

function reuseExisting(card) {
  const src = path.join(DESKTOP_IMG, card.reuse);
  const dst = path.join(OUT_DIR, `${card.no}_${card.key}.jpg`);
  if (!fs.existsSync(src)) return { ok: false, error: `复用源文件不存在: ${card.reuse}` };
  fs.copyFileSync(src, dst);
  return { ok: true, reused: true, path: dst };
}

function generate(card) {
  const prompt = buildPrompt(card);
  const args = [
    GEN,
    '--offline-models',
    '--model', 'flash',
    '--size', '2K',
    '--optimize', 'false',
    '--watermark', 'false',
    '--prompt', prompt,
  ];
  const res = spawnSync('node', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: { ...process.env, ARK_API_KEY: KEY, ARK_SEEDREAM_SAVE_PATH: RAW_DIR },
  });
  const out = res.stdout || '';
  fs.writeFileSync(path.join(LOG_DIR, `${card.no}_${card.key}.stdout.txt`), out + '\n---STDERR---\n' + (res.stderr || ''));
  const idx = out.search(/\{\s*"success"/);
  if (idx < 0) return { ok: false, error: '无法解析输出 JSON', stdoutTail: out.slice(-500) };
  let json;
  try {
    json = JSON.parse(out.slice(idx));
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + e.message };
  }
  if (!json.success) return { ok: false, error: json.error || '生成失败', metadata: json.metadata };
  const metaPath = json.metadata?.metadata_path;
  if (!metaPath) return { ok: false, error: '缺少 metadata_path', json };
  const jpg = metaPath.replace(/_metadata\.json$/, '_1.jpg');
  if (!fs.existsSync(jpg)) return { ok: false, error: `图片文件不存在: ${jpg}` };
  const dst = path.join(OUT_DIR, `${card.no}_${card.key}.jpg`);
  fs.copyFileSync(jpg, dst);
  fs.writeFileSync(path.join(LOG_DIR, `${card.no}_${card.key}.json`), JSON.stringify(json, null, 2));
  return { ok: true, path: dst, model: json.metadata?.model, time: json.metadata?.generation_time };
}

(async () => {
  let ran = 0;
  for (const card of DATA.cards) {
    if (!selected(card)) continue;
    const dst = path.join(OUT_DIR, `${card.no}_${card.key}.jpg`);
    const exists = fs.existsSync(dst);
    const force = forceList.includes(card.key) || forceList.includes(card.no);
    if (exists && !force) {
      console.log(`⏭  ${card.no} ${card.cn} 已存在，跳过`);
      continue;
    }
    if (ran >= limit) break;
    ran++;
    console.log(`🎨 ${card.no} ${card.cn} (${card.title}) 生成中…`);
    const t0 = Date.now();
    const result = card.reuse && !force ? reuseExisting(card) : generate(card);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (result.ok) {
      console.log(`✅ ${card.no} ${card.cn} ${result.reused ? '复用' : ''} ${sec}s -> ${path.basename(result.path)}${result.time ? ` (model ${result.model}, ${result.time}s)` : ''}`);
    } else {
      console.log(`❌ ${card.no} ${card.cn} 失败: ${result.error}`);
      fs.writeFileSync(path.join(LOG_DIR, `${card.no}_${card.key}.ERROR.json`), JSON.stringify(result, null, 2));
    }
  }
  const present = DATA.cards.filter((c) =>
    fs.existsSync(path.join(OUT_DIR, `${c.no}_${c.key}.jpg`))).length;
  console.log(`\n完成：${dataFile} 成套 ${present}/${DATA.cards.length} 张`);
})();
