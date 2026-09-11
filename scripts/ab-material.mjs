/**
 * A/B 盲测素材生成 —— 行动清单第 1 项的输入。
 *
 * 为什么需要单独一个脚本：`captureFrame()` 只读 canvas，而 v2 的气泡文字走 DOM，
 * 所以 `v2.frame.png` 上的气泡是**空的**。拿它去做盲测，被试会直接判"新版坏了"，
 * 测出来的结论毫无意义。
 *
 * 这里把 canvas 帧与文字合到一张图上，得到与真值同规格（750×1624）的成品：
 *
 *   bake-out/ab/1.png   一侧（顺序随机）
 *   bake-out/ab/2.png   另一侧
 *   bake-out/ab/答案.txt  哪张是哪个 + 盲测协议
 *
 * 用法：node scripts/ab-material.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const outRoot = join(root, 'bake-out');
const outDir = join(outRoot, 'ab');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

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
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('nf');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-proxy-server', '--force-color-profile=srgb', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${base}/v2/?capture=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__v2 != null, null, { timeout: 25000 });
await page.waitForTimeout(3400); // 等 4 句台词全部生成并收敛
await page.evaluate(() => window.__v2.setCameraEnabled(false)); // 冻结镜头，与真值同视角
await page.waitForTimeout(150);

const dataUrl = await page.evaluate(() => window.__v2.captureFrame());

// 合成：canvas 帧（750×1624）+ 气泡文字（按设计坐标 ×2 落笔）
const composed = await page.evaluate(async (url) => {
  const v = window.__v2;
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; });

  const c = document.createElement('canvas');
  c.width = 750;
  c.height = 1624;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 750, 1624);

  // 与原版 game.js:1373-1376 对齐：字色 darkBrown、居中、基线在 y+2（设计单位）
  g.font = '28px "Noto Serif SC", "Songti SC", "SimSun", serif';
  g.textAlign = 'center';
  g.fillStyle = '#8B6F5C';
  const texts = v.s3.bubbleDesignPositions().map((p, i) => ({
    text: ['在吗？', '有没有女朋友？', '...其实', '我也喜欢你'][p.slot] ?? '',
    x: p.x * 2,
    y: p.y * 2 + 4,
  }));
  for (const t of texts) g.fillText(t.text, t.x, t.y);

  return c.toDataURL('image/png');
}, dataUrl);

await mkdir(outDir, { recursive: true });

// 随机决定左右顺序，让"哪张是新的"在被试看来没有暗示
const v2IsOne = Math.random() < 0.5;
const v2Png = Buffer.from(composed.split(',')[1], 'base64');

await writeFile(join(outDir, v2IsOne ? '1.png' : '2.png'), v2Png);
await copyFile(join(outRoot, 's3.original.png'), join(outDir, v2IsOne ? '2.png' : '1.png'));

await writeFile(
  join(outDir, '答案.txt'),
  [
    '7afternoon · S3「除夕夜聊天」A/B 盲测素材',
    '════════════════════════════════════════════',
    '',
    `1.png = ${v2IsOne ? '【新版 · three.js 2.5D】' : '【原版 · Canvas 2D】'}`,
    `2.png = ${v2IsOne ? '【原版 · Canvas 2D】' : '【新版 · three.js 2.5D】'}`,
    '',
    '两张都是 750×1624，同一台设备同样视角，同一次会话里生成。',
    '差别只在：新版是分层贴片进 3D 空间后的实时渲染，原版是 Canvas 2D 一次画完。',
    '',
    '── 盲测协议（照做，不要加戏）────────────────',
    '',
    '被试：3 个朋友，**不是妻子**（她那次"第一次"不可再生）。',
    '',
    '流程：',
    '  1. 先给被试看 1.png，问："往下想象一下，这故事接下来会怎么样？"',
    '  2. 再给看 2.png，问同样的问题。',
    '  3. 最后只问一句："哪一版你更想继续看下去？"',
    '',
    '不要解释技术、不要说哪版是新版、不要问"哪个更好看"。',
    '',
    '判定：',
    '  · 3 人里 ≥2 人选新版 → 锚点 1（2.5D 立体绘本）成立，继续按方案推进。',
    '  · 否则 → 立刻改走"Canvas 2D + 伪视差"，省下 16 周。',
    '',
    '⚠️ 单张静态图只能测"第一眼吸引力"。',
    '   视差与镜头运镜是**动的**，静态图天然吃亏 —— 这一点在解读结果时必须记账。',
    '   若想更公平，用手机录屏各 6 秒再给被试看（新版需先把镜头运镜调成可见幅度）。',
    '',
    '── 已知的、两张图都会有的缺陷 ──────────────',
    '',
    '· 气泡文字用的是 Google Fonts 的 Noto Serif SC，本机没有该字体，',
    '  两张图都回退到了系统衬线体。线上微信大陆同样取不到这个 CDN',
    '  （原版就有这个问题），所以这里"一起错"反而更接近真实观感。',
    '· 新版这张是"冻结镜头"后抓的，没有体现视差与运镜。',
    '',
  ].join('\n'),
);

console.log(`✓ A/B 素材已生成：bake-out/ab/`);
console.log(`  1.png = ${v2IsOne ? '新版（2.5D）' : '原版（Canvas 2D）'}`);
console.log(`  2.png = ${v2IsOne ? '原版（Canvas 2D）' : '新版（2.5D）'}`);
console.log(`  答案.txt 含盲测协议`);

await browser.close();
server.close();
