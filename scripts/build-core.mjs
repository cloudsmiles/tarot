// 把 @tarot/core 打包成单个 CJS bundle，供微信小程序 require。
// 用法：node scripts/build-core.mjs [--watch]
import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [join(root, 'packages/core/src/index.js')],
  outfile: join(root, 'packages/miniprogram/core/index.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  banner: { js: '// 由 scripts/build-core.mjs 生成，请勿手改' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
