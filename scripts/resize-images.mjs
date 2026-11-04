// 从 pipeline/output 的 1664px 原图生成前端用压缩图到 packages/h5/public/cards。
// 原图在 pipeline 完整留档，前端只保留压缩版；分发只走本脚本。
// 用法：node scripts/resize-images.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'pipeline/output');
const outDir = join(root, 'packages/h5/public/cards');
// 牌槽 CSS 宽 ≤160px，全屏 lightbox 大图受高度约束；624/q70 下单张约 160K。
const WIDTH = '624';
const QUALITY = '70';
const FACE_RE = /^(?:\d\d_|[wcsp]\d+_).*\.jpg$/;

const faces = readdirSync(srcDir).filter(f => FACE_RE.test(f));
if (faces.length !== 78) throw new Error(`正面原图应为 78 张，实际 ${faces.length}`);
if (!readdirSync(srcDir).includes('back.jpg')) throw new Error('缺少 back.jpg');
const files = [...faces, 'back.jpg'];

mkdirSync(outDir, { recursive: true });

for (const f of files) {
  execFileSync(
    '/usr/bin/sips',
    ['--resampleWidth', WIDTH, '--setProperty', 'formatOptions', QUALITY, join(srcDir, f), '--out', join(outDir, f)],
    { stdio: 'ignore' },
  );
}

const outs = readdirSync(outDir).filter(f => f.endsWith('.jpg'));
if (outs.length !== 79) throw new Error(`输出应为 79 张（78 正面 + back），实际 ${outs.length}`);
const total = outs.reduce((sum, f) => sum + statSync(join(outDir, f)).size, 0);
console.log(`输出 ${outs.length} 张，共 ${(total / 1024 / 1024).toFixed(1)} MB -> ${outDir.replace(root + '/', '')}`);
