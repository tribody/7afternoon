/**
 * 保真残差定位：把 v2 实时帧与烘焙合成图的分块差打成热力图，看差异到底在哪。
 *
 * 还会**逐层翻转贴图 flipY** 做 A/B —— 用来判"整幅画面被投影矩阵上下翻转"
 * 这个假设：如果某个层翻了之后差值反而下降，说明这一层的贴图方向本来是错的。
 *
 * 用法：node scripts/diag-diff.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const outDir = join(root, 'bake-out');
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
await page.waitForTimeout(3200);
await page.evaluate(() => window.__v2.setCameraEnabled(false));
await page.waitForTimeout(150);

await mkdir(outDir, { recursive: true });
const refB64 = (await readFile(join(outDir, 's3.composite.png'))).toString('base64');

// 页面内 helper：抓帧 → 与基准比对 → 返回热力图与最差块
await page.evaluate((ref) => {
  window.__cmp = async (maskBubbles) => {
    const url = await window.__v2.captureFrame();
    const live = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; });
    const refIm = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${ref}`; });

    const W = 750, H = 1624;
    const px = (im) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0, W, H);
      return g.getImageData(0, 0, W, H).data;
    };
    const A = px(live), B = px(refIm);
    const N = 16, bw = Math.floor(W / N), bh = Math.floor(H / N);
    const BUB = [[0.25, 0.25], [0.42, 0.37], [0.59, 0.49], [0.76, 0.61]];
    const inBub = (bx, by) => {
      const cx = ((bx + 0.5) * bw) / W, cy = ((by + 0.5) * bh) / H;
      return BUB.some((b) => Math.abs(cx - b[0]) < 0.17 && Math.abs(cy - b[1]) < 0.05);
    };

    const map = [];
    let sum = 0, n = 0, worst = { d: 0, bx: 0, by: 0 };
    for (let by = 0; by < N; by++) {
      const row = [];
      for (let bx = 0; bx < N; bx++) {
        let sa = 0, sb = 0;
        for (let y = by * bh; y < (by + 1) * bh; y++) {
          for (let x = bx * bw; x < (bx + 1) * bw; x++) {
            const i = (y * W + x) * 4;
            sa += (A[i] + A[i + 1] + A[i + 2]) / 3;
            sb += (B[i] + B[i + 1] + B[i + 2]) / 3;
          }
        }
        const d = Math.abs(sa / (bw * bh) - sb / (bw * bh));
        row.push(+d.toFixed(1));
        if (!(maskBubbles && inBub(bx, by))) {
          sum += d; n++;
          if (d > worst.d) worst = { d: +d.toFixed(1), bx, by };
        }
      }
      map.push(row);
    }

    // 同时产出一张放大 8 倍的差异图，肉眼可读
    const dc = document.createElement('canvas');
    dc.width = W; dc.height = H;
    const dg = dc.getContext('2d');
    const img = dg.createImageData(W, H);
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.min(255, Math.abs(A[i] - B[i]) * 6);
      img.data[i] = d; img.data[i + 1] = d; img.data[i + 2] = d; img.data[i + 3] = 255;
    }
    dg.putImageData(img, 0, 0);

    return {
      mean: +(sum / n).toFixed(2),
      worst,
      map,
      diffDataUrl: dc.toDataURL('image/png'),
    };
  };
}, refB64);

const base0 = await page.evaluate(() => window.__cmp(true));
const ramp = ' .:-=+*#%@';
console.log(`\n=== 分块差热力图（16×16，剔气泡后平均 ${base0.mean}/255）===`);
console.log('   ' + Array.from({ length: 16 }, (_, i) => String(i % 10)).join(' '));
base0.map.forEach((row, i) => {
  const line = row.map((d) => ramp[Math.min(9, Math.floor(d / 5))]).join(' ');
  console.log(String(i).padStart(2) + ' ' + line + '   max ' + Math.max(...row).toFixed(1));
});
console.log(`最差块 Δ${base0.worst.d} @ (${base0.worst.bx},${base0.worst.by})  →  归一化 x≈${base0.worst.bx / 16} y≈${base0.worst.by / 16}`);
await writeFile(join(outDir, 'diff.png'), Buffer.from(base0.diffDataUrl.split(',')[1], 'base64'));

// ── flipY A/B：整幅画面是不是被上下翻转了 ────────────────────
console.log('\n=== flipY 逐层 A/B（翻转后差值下降 = 该层贴图方向本来是错的）===');
console.log(`基准：${base0.mean}`);
for (const name of ['sky', 'mid', 'paper', 'actors', 'bubbles']) {
  await page.evaluate((n) => {
    const v = window.__v2;
    const tex = v.stage.textures?.get?.(n);
    if (!tex) return;
    tex.flipY = !tex.flipY;
    tex.needsUpdate = true;
  }, name);
  await page.waitForTimeout(120);
  const r = await page.evaluate(() => window.__cmp(true));
  const delta = base0.mean - r.mean;
  console.log(`  ${name.padEnd(8)} 翻转后 ${String(r.mean).padStart(7)}   ${delta > 0.05 ? `↓${delta.toFixed(2)} ⬅ 本来反了` : delta < -0.05 ? `↑${(-delta).toFixed(2)} ⬅ 本来就对` : '—'}`);
  await page.evaluate((n) => {
    const v = window.__v2;
    const tex = v.stage.textures?.get?.(n);
    if (!tex) return;
    tex.flipY = !tex.flipY;
    tex.needsUpdate = true;
  }, name);
  await page.waitForTimeout(80);
}

await browser.close();
server.close();
