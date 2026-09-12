/**
 * 手机端"打不开"诊断。
 *
 * 怀疑对象：classic/index.html 里 Google Fonts 的 <link rel="stylesheet">。
 * 它是**渲染阻塞**资源 —— 中国大陆不可达时请求会挂起，浏览器不会渲染 body，
 * body 末尾的 game.js 也不会执行。而 game.js 的入口写在
 * `window.addEventListener('load', ...)` 里，load 又要等所有资源。
 * 表现就是：页面停在 loading 动画上，一动不动。
 *
 * 三种网络条件对照：
 *   ok    —— fonts 可达（模拟器/翻墙环境）
 *   hang  —— fonts 黑洞，请求挂起永不响应（**大陆真实形态**）
 *   abort —— fonts 立即失败（快速失败，作为修复后的对照组）
 *
 * 用法：node scripts/diag-mobile.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

// --live：打线上（必须绕开本机 DNS —— 本机 DNS 是 fe80::1，不可信）
// 默认：打本地 dist
const LIVE = process.argv.includes('--live');
const HOST = 'home.sjtunix.cn';
const PAGES_IP = '185.199.108.153';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = join(dist, normalize(pathname));
    if (!file.startsWith(dist)) return void res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(file, 'index.html');
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = LIVE ? `https://${HOST}` : `http://127.0.0.1:${server.address().port}`;

const FONT_RE = /fonts\.(googleapis|gstatic)\.com/;
const BUDGET_MS = 30000; // 手机用户等 30 秒 = 已经判死刑
const TICK = 250;

const WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002832) NetType/WIFI Language/zh_CN';

async function run(label, mode, path) {
  const browser = await chromium.launch(
    LIVE ? { args: [`--host-resolver-rules=MAP ${HOST} ${PAGES_IP}`] } : {},
  );
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: WECHAT_UA,
  });

  const pending = new Map();
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (FONT_RE.test(url)) {
      pending.set(url, Date.now());
      // ok：本机真去连 googleapis 也会挂，所以直接伪造一个可达的响应
      if (mode === 'ok') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '/* stub */' });
      }
      if (mode === 'hang') return; // 永不响应 —— 模拟黑洞
      return route.abort('connectionfailed'); // 立即失败
    }
    return route.continue();
  });

  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = {};
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfinished', (r) => pending.delete(r.url()));
  page.on('requestfailed', (r) => pending.delete(r.url()));

  let gameBooted = false;

  try {
    await page.goto(base + path, { waitUntil: 'commit', timeout: 15000 });
  } catch (e) {
    marks.gotoError = e.message.split('\n')[0];
  }

  while (Date.now() - t0 < BUDGET_MS) {
    const s = await page
      .evaluate(() => {
        const ls = document.getElementById('loading-screen');
        const ui = document.getElementById('ui-overlay');
        const cv = document.getElementById('game-canvas');
        return {
          ready: document.readyState,
          lsExists: !!ls,
          // hideLoading() 先加 .hidden，800ms 后才 display:none —— 加 class 即代表 init 跑过了
          lsHiding: ls ? ls.classList.contains('hidden') : null,
          lsGone: ls ? getComputedStyle(ls).display === 'none' : null,
          uiShown: ui ? getComputedStyle(ui).display !== 'none' : null,
          // canvas 默认 300×150，被 JS 设过宽高说明 resize() 执行了
          canvasSized: cv ? cv.width !== 300 && cv.width > 0 : false,
        };
      })
      .catch(() => null);

    if (s) {
      const t = Date.now() - t0;
      if (s.lsExists && marks.firstPaint == null) marks.firstPaint = t;
      if (s.ready === 'complete' && marks.load == null) marks.load = t;
      if (s.canvasSized && marks.canvasSized == null) marks.canvasSized = t;
      if (s.lsHiding === true && marks.loadingHiding == null) marks.loadingHiding = t;
      if (s.lsGone === true && marks.loadingGone == null) marks.loadingGone = t;
      if (s.uiShown === true && marks.uiShown == null) marks.uiShown = t;
      // init() 跑起来的铁证：canvas 被 resize 过
      if (s.canvasSized) gameBooted = true;
    }
    if (gameBooted && marks.uiShown != null) break;
    await new Promise((r) => setTimeout(r, TICK));
  }

  const elapsed = Date.now() - t0;
  const stuckFonts = [...pending.keys()].filter((u) => FONT_RE.test(u));

  console.log(`\n── ${label} ──`);
  console.log(`  结果：${gameBooted ? '✅ 起来了' : '❌ 卡住（' + BUDGET_MS / 1000 + 's 内 Game.init 未执行）'}`);
  console.log(`  loading 屏出现：  ${marks.firstPaint ?? '—'}ms`);
  console.log(`  load 事件：       ${marks.load ?? '未触发 ← 卡在这'}ms`);
  console.log(`  canvas 被 resize：${marks.canvasSized ?? '未执行'}ms`);
  console.log(`  loading 开始隐藏：${marks.loadingHiding ?? '—'}ms`);
  console.log(`  UI 就绪：         ${marks.uiShown ?? '—'}ms`);
  console.log(`  实际耗时：${elapsed}ms`);
  if (stuckFonts.length) console.log(`  ⚠ 仍挂起的字体请求：${stuckFonts.length} 个`);
  if (errors.length) console.log(`  pageerror：${errors.slice(0, 2).join(' | ')}`);

  await browser.close();
  return { label, booted: gameBooted, ms: elapsed, marks };
}

const results = [];

if (LIVE) {
  console.log(`▶ 线上实测：${base}（Chromium host-resolver 直连 ${PAGES_IP}，绕开本机 DNS）`);
  console.log('  网络条件：fonts 黑洞（中国大陆真实形态）\n');
  results.push(await run('线上 · 根路径（含转发页跳转）', 'hang', '/'));
  results.push(await run('线上 · 直达 /classic/', 'hang', '/classic/'));
} else {
  console.log('▶ 手机端入口诊断（微信 UA / 390×844 @3x / 本地 dist 服务）');
  console.log('  怀疑：classic/index.html 的 Google Fonts 阻塞样式表\n');
  results.push(await run('A · fonts 可达（对照）', 'ok', '/classic/'));
  results.push(await run('B · fonts 黑洞（大陆真实形态）', 'hang', '/classic/'));
  results.push(await run('C · fonts 立即失败（修复后形态）', 'abort', '/classic/'));
  results.push(await run('D · v2 产物页（fonts 黑洞）', 'hang', '/v2/'));
}

server.close();

console.log('\n═══ 结论 ═══');
for (const r of results) {
  console.log(`${r.booted ? '✅' : '❌'} ${r.label.padEnd(32)} ${String(r.ms).padStart(6)}ms`);
}
