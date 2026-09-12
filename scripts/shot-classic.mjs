/**
 * 截 classic 在手机上的真实首屏，用于确认字体降级后的观感。
 *
 * 用法：node scripts/shot-classic.mjs [--withfont]
 *   --withfont  放行 fonts.googleapis.com（本机可达时），对照"有书法体"的样子
 */
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const outDir = join(root, 'bake-out');
const withFont = process.argv.includes('--withfont');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = join(dist, normalize(p));
    if ((await stat(file).catch(() => null))?.isDirectory?.()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002832) NetType/WIFI Language/zh_CN',
});

if (!withFont) {
  // 模拟大陆：字体域名黑洞，请求挂起
  await ctx.route('**/*', (route) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(route.request().url())) return;
    return route.continue();
  });
}

const page = await ctx.newPage();
// 带 ?fps=1：顺带验证那个真机诊断开关本身是不是好的
await page.goto(base + '/classic/?fps=1', { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(5000); // 等过 2.7s 假加载 + 800ms 隐藏动画

const buf = await page.screenshot();
const name = withFont ? 'classic-mobile-withfont.png' : 'classic-mobile.png';
await writeFile(join(outDir, name), buf);

const info = await page.evaluate(() => {
  const cv = document.getElementById('game-canvas');
  const st = document.getElementById('scene-text');
  const hint = document.getElementById('hint-text');
  return {
    canvas: cv ? `${cv.width}×${cv.height}` : null,
    sceneText: st?.textContent?.slice(0, 60) ?? '',
    hint: hint?.textContent?.slice(0, 40) ?? '',
    loadingDisplay: getComputedStyle(document.getElementById('loading-screen')).display,
    fpsMeter: document.getElementById('fps-meter')?.textContent ?? null,
  };
});

console.log(`✓ ${name}`);
console.log('  canvas:', info.canvas, ' loading display:', info.loadingDisplay);
console.log('  场景文案:', info.sceneText || '(空)');
console.log('  提示文案:', info.hint || '(空)');
console.log(
  '  ?fps=1 浮层:',
  info.fpsMeter === null ? '✗ 未出现（开关无效！）' : '✓ ' + info.fpsMeter.replace(/\n/g, ' | '),
);

await browser.close();
server.close();
