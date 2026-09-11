import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * 7afternoon · v2 构建配置（M1）
 *
 * 关键决策与理由：
 * 1. base: './'
 *    自定义域名 home.sjtunix.cn 走根路径，而 GitHub 项目页走 /7afternoon/。
 *    相对 base 让**同一份产物**适配两种托管方式，也天然适配 /v2/ 子路径。
 *    限制：不适用于三级以上嵌套路由 —— 本作是平铺结构，满足。
 *
 * 2. classic/ 不配 rollup input
 *    原版是零构建静态文件，由 scripts/prebuild.mjs 原样拷进 public/，
 *    Vite 只会原封不动搬到 dist/classic/。原版始终可运行，且字节级不变。
 *
 * 3. 根 index.html（转发页）同样不配 input
 *    它是 publicDir 里的静态文件。这样**回滚 = 改那一行常量 + push**，
 *    不需要重新构建 v2 —— 30 秒生效（方案 §4.3）。
 */
export default defineConfig({
  base: './',
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 微信 X5/XWeb 内核普遍 ≥ Chromium 66，es2020 安全
    target: 'es2020',
    // 小于 4KB 的内联，减少微信下的请求数（RTT 比体积更贵）
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        v2: fileURLToPath(new URL('./v2/index.html', import.meta.url)),
      },
    },
  },

  server: {
    // 用 localhost 而非 127.0.0.1：小米管家代理的绕过列表写的是通配符 127.*，
    // 匹配不到 127.0.0.1，会让本地服务 502。localhost 可绕开。
    host: 'localhost',
    port: 5173,
    strictPort: false,
  },
});
