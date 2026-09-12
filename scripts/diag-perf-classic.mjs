/**
 * classic（原版）在手机上的帧耗时-pr-填充率诊断。
 *
 * 怀疑：game.js:2036 的 DPR 无上限。手机 DPR=3 时 canvas 变成
 * (390×3)×(844×3) = 2.96M 像素，而每帧要重画：
 *   drawSky 全屏渐变 + wcWash×2（自带 blur filter 的大圆）+ drawStars 60 颗
 *   + drawPaperTexture 300 个颗粒点 + 信封
 * 若帧耗时与像素数成正比，则瓶颈是**填充率**，clamp DPR 必然有效。
 *
 * ⚠️ headless 是软件光栅（SwiftShader），**绝对毫秒数不可用于任何手机结论**。
 *    看的是 DPR 变化时的**相对趋势** —— 那个趋势与光栅方式无关。
 *
 * 用法：node scripts/diag-perf-classic.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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

const WECHAT_UA =
  'Mozilla/5.0 (Linux; Android 11; SM-A125F Build/RP1A.200720.012) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.105 Mobile Safari/537.36 ' +
  'MicroMessenger/8.0.40(0x28002832)';

async function measure(label, dpr, cpuRate) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: WECHAT_UA,
  });
  const page = await ctx.newPage();

  if (cpuRate > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }

  await page.goto(base + '/classic/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000); // 过掉 loading，让游戏跑起来

  const r = await page.evaluate(
    () =>
      new Promise((res) => {
        const ts = [];
        const tick = (t) => {
          ts.push(t);
          if (ts.length < 60) requestAnimationFrame(tick);
          else {
            const d = [];
            for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
            d.sort((a, b) => a - b);
            res({
              frames: d.length,
              median: d[Math.floor(d.length / 2)],
              p95: d[Math.floor(d.length * 0.95)],
              max: d[d.length - 1],
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );

  const canvasPx = await page.evaluate(() => {
    const cv = document.getElementById('game-canvas');
    return cv ? cv.width * cv.height : 0;
  });

  await browser.close();
  return { label, dpr, cpuRate, canvasPx, ...r };
}

console.log('▶ classic 帧耗时 vs 填充率（headless 软件光栅：只信趋势，不信绝对值）\n');

const rows = [];
for (const dpr of [1, 2, 3]) {
  rows.push(await measure(`DPR ${dpr}`, dpr, 1));
}
rows.push(await measure('DPR 3 + CPU 4× 减速（模拟中端安卓）', 3, 4));

console.log('┌────────────────────────────────┬──────┬────────────┬────────────┬──────────┐');
console.log('│ 情形                           │ DPR  │ canvas 像素 │ 帧耗时中位 │ p95      │');
console.log('├────────────────────────────────┼──────┼────────────┼────────────┼──────────┤');
for (const r of rows) {
  console.log(
    `│ ${r.label.padEnd(30)} │  ${r.dpr}   │ ${(r.canvasPx / 1e6).toFixed(2)}M`.padEnd(43) +
      `│ ${r.median.toFixed(1).padStart(8)}ms │ ${r.p95.toFixed(1).padStart(7)}ms │`,
  );
}
console.log('└────────────────────────────────┴──────┴────────────┴────────────┴──────────┘');

// 线性检验：帧耗时 / 像素数
console.log('\n每百万像素的帧耗时（常数 = 填充率主导）：');
const per = rows.filter((r) => r.cpuRate === 1);
const ref = per[0];
for (const r of per) {
  const pxm = r.canvasPx / 1e6;
  const ratio = r.median / ref.median;
  const pxRatio = pxm / (ref.canvasPx / 1e6);
  console.log(
    `  ${r.label}: ${(r.median / pxm).toFixed(1)} ms/Mpx   ` +
      `帧耗时 ×${ratio.toFixed(2)} vs 像素 ×${pxRatio.toFixed(2)}`,
  );
}

server.close();
