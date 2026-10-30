// 用 macOS 自带 sips 把 pipeline/output 的 78 张原图压到宽 480 / JPEG q65。
// 用法：node scripts/resize-images.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'pipeline/output');
const outDir = join(root, 'packages/h5/public/cards');
// 624/q75 实测 15.4MB、624/q65 实测 12.4MB，均超 8MB 目标；
// 裁定改宽 480/q65（屏上牌面 CSS 宽 ≤160px，覆盖 3x DPR）。
const WIDTH = '480';
const QUALITY = '65';

const files = readdirSync(srcDir).filter(f => f.endsWith('.jpg'));
if (files.length !== 78) throw new Error(`原图应为 78 张，实际 ${files.length}`);

mkdirSync(outDir, { recursive: true });

for (const f of files) {
  execFileSync(
    '/usr/bin/sips',
    ['--resampleWidth', WIDTH, '--setProperty', 'formatOptions', QUALITY, join(srcDir, f), '--out', join(outDir, f)],
    { stdio: 'ignore' },
  );
}

const outs = readdirSync(outDir).filter(f => f.endsWith('.jpg'));
if (outs.length !== 78) throw new Error(`输出应为 78 张，实际 ${outs.length}`);
const total = outs.reduce((sum, f) => sum + statSync(join(outDir, f)).size, 0);
console.log(`输出 ${outs.length} 张，共 ${(total / 1024 / 1024).toFixed(1)} MB -> ${outDir.replace(root + '/', '')}`);
