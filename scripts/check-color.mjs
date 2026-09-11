/**
 * 色彩链路自检 runner（对应验收项 #17「色彩不失真」）
 *
 * 1) 起一个极简静态服务器（根 = dist/，即**真实构建产物**，不是 dev server）
 * 2) Playwright 打开 /v2/?check=color
 * 3) 取 window.__colorCheck 的结构化结果，按路径判定并给退出码
 *
 * 判定规则（三路对照）：
 *   unlit      → 必须全过
 *   tex-srgb   → 必须全过
 *   tex-linear → 必须**全不过**（故意的错误对照组）。
 *                若它反而全过，说明自检自身失效，一律判失败。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = join(root, normalize(pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
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
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`not found: ${e.message}`);
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

let browser;
let launchedWith = '';
try {
  browser = await chromium.launch({
    args: [
      '--no-proxy-server',
      '--force-color-profile=srgb',
      '--enable-unsafe-swiftshader',
    ],
  });
  launchedWith = 'playwright bundled chromium';
} catch (e) {
  console.log(`· 内置 chromium 启动失败（${e.message.split('\n')[0]}），改用系统 Chrome`);
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--force-color-profile=srgb', '--enable-unsafe-swiftshader'],
  });
  launchedWith = 'system chrome (channel)';
}

const page = await browser.newPage({
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 1,
});

page.on('console', (m) => process.stdout.write(m.text() + '\n'));
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

let result;
try {
  await page.goto(`http://127.0.0.1:${port}/v2/?check=color`, { waitUntil: 'load', timeout: 30000 });
  const handle = await page.waitForFunction(() => window.__colorCheck ?? null, null, { timeout: 20000 });
  result = await handle.jsonValue();
} catch (e) {
  console.error('\n✗ 自检页未能产出结果：', e.message.split('\n')[0]);
  await browser.close();
  server.close();
  process.exit(1);
}

await browser.close();
server.close();

const rows = result.rows;

// ── 判定 ─────────────────────────────────────────────
const EXPECT = { unlit: 'all-pass', 'tex-srgb': 'all-pass', 'tex-linear': 'all-fail' };
const byPath = new Map();
for (const r of rows) {
  if (!byPath.has(r.path)) byPath.set(r.path, []);
  byPath.get(r.path).push(r);
}

console.log(`\n浏览器：${launchedWith}`);
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│ 路径         通过/总数   最大偏差   期望       实得        │');
console.log('├────────────────────────────────────────────────────────────┤');

let ok = true;
for (const p of ['unlit', 'tex-srgb', 'tex-linear']) {
  const list = byPath.get(p) ?? [];
  const passed = list.filter((r) => r.pass).length;
  const worst = list.reduce((m, r) => Math.max(m, r.delta), 0);
  const want = EXPECT[p] === 'all-pass' ? '全通过' : '全失败';
  const got = passed === list.length ? '全通过' : passed === 0 ? '全失败' : `${passed} 通过`;
  const good = EXPECT[p] === 'all-pass' ? passed === list.length : passed === 0;
  if (!good) ok = false;
  console.log(
    `│ ${(good ? '✓' : '✗') + p.padEnd(12)} ${String(passed).padStart(2)}/${String(list.length).padEnd(7)} ${String(worst).padStart(6)}     ${want.padEnd(9)} ${got.padEnd(10)}│`,
  );
}
console.log('└────────────────────────────────────────────────────────────┘');

console.log('\n对照组明细（tex-linear，应为错 → 实得错）：');
for (const r of byPath.get('tex-linear') ?? []) {
  console.log(`  ${r.name.padEnd(10)} 期望 ${hex(r.expected)} → 实得 ${hex(r.actual)}   Δ${r.delta}`);
}

console.log('\n正确路径明细（tex-srgb，应与真值吻合）：');
for (const r of byPath.get('tex-srgb') ?? []) {
  console.log(`  ${r.name.padEnd(10)} 期望 ${hex(r.expected)} → 实得 ${hex(r.actual)}   Δ${r.delta}`);
}

if (!ok) {
  console.log('\n❌ 色彩链路自检未通过 —— 检查 outputColorSpace / 贴图 colorSpace / toneMapping');
  process.exit(2);
}
console.log('\n✅ 色彩链路自检通过：正确路径保真，错误对照组按预期失败。');
