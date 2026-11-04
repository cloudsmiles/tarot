import { defineConfig } from 'vite';

export default defineConfig({
  // 部署在服务器 /tarot/ 子路径下
  base: '/tarot/',
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/tarot/api': {
        target: 'http://localhost:8787',
        rewrite: p => p.replace(/^\/tarot/, ''),
      },
    },
  },
});
