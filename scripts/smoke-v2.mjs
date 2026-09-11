/**
 * v2 端到端冒烟测试（M1 验收）。
 *
 * 覆盖五件事，每件都是能客观判定的：
 *
 *  1. **起得来**：dist 产物在真实浏览器里能跑通，无 pageerror、无 console error。
 *  2. **清单完整性**：5 层齐备、倍率 2、首屏 ≤3s、显存不超预算。
 *  3. **命中迁移正确**（本阶段最核心的一条）：
 *     把 4 个气泡的**设计坐标投影回屏幕**，在那一点上"点一下"，
 *     必须命中对应的气泡。这直接验证了
 *     `屏幕 → raycast → 归一化 → CSS 像素 → 原版 U.dist<50` 这条链。
 *     原版是屏幕像素圆形判定，进 3D 后这条链是全新的，不测就是裸奔。
 *  4. **画面保真**：帧内读回 canvas，与烘焙合成图分块比对。
 *  5. **交互可完成**：依次点掉 4 个气泡后，场景必须判定 done。
 *
 * ⚠️ 两个必须知道的坑（都踩过，别再踩）：
 *
 *  · **page.screenshot() 抓不到 WebGL 内容**。默认 `preserveDrawingBuffer=false`，
 *    缓冲在合成后即被丢弃，截图出来是一片空白 —— 表现为"画面平均差 175/255"
 *    这种看着像渲染全挂了的假失败。唯一可靠的取图方式是 `window.__v2.captureFrame()`：
 *    在 render() 之后的同一帧里 `canvas.toDataURL()`。
 *
 *  · **保真比对必须在点击前做**。原版里 tapped 的气泡会降到 0.4 倍不透明度并
 *    换成灰色，一点击画面就与真值分家了。顺序错了就是自己给自己挖坑。
 *    同理镜头也要冻结（`setCameraEnabled(false)`），否则层带视差位移。
 *
 * 用法：node scripts/smoke-v2.mjs
 * 前置：npm run build（要 dist/）
 */
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const outDir = join(root, 'bake-out');

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
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const fails = [];
const pass = [];
const check = (name, ok, detail = '') => {
  (ok ? pass : fails).push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await chromium.launch({
  args: ['--no-proxy-server', '--force-color-profile=srgb', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  // 基准机型 iPhone X 的 CSS 尺寸；DPR 2 → 画布正好 750×1624，与烘焙基准对齐
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

// ── 1. 起得来 ───────────────────────────────────────────────
await page.goto(`${base}/v2/`, { waitUntil: 'load', timeout: 30000 });

let booted = true;
try {
  await page.waitForFunction(() => window.__v2 != null, null, { timeout: 25000 });
} catch {
  booted = false;
}

check('页面无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
check('控制台无 error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
check('v2 运行时完成装配', booted);

if (!booted) {
  await browser.close();
  server.close();
  console.log('\n✗ 装配失败，后续断言跳过');
  process.exit(1);
}

const meta = await page.evaluate(() => {
  const v = window.__v2;
  return {
    layers: v.manifest.layers.map((l) => l.name),
    scale: v.manifest.scale,
    design: v.manifest.design,
    interactiveMs: v.interactiveMs,
    loading: v.loading,
    viewport: v.viewport(),
    canvas: v.canvasSize(),
    vramMB: v.stage.estimateTextureMB(),
    stageLayers: v.layerNames(),
  };
});

check('清单含 5 层', meta.layers.length === 5, meta.layers.join(','));
check('舞台实际装配 5 层', meta.stageLayers.length === 5, meta.stageLayers.join(','));
check('烘焙倍率 = 2', meta.scale === 2, String(meta.scale));
check(
  '首屏可交互 ≤ 3000ms',
  meta.interactiveMs <= 3000,
  `${meta.interactiveMs.toFixed(0)}ms（含 ${meta.loading.elapsedMs.toFixed(0)}ms 最低展示时长）`,
);
check('纹理显存 ≤ 96MB 预算', meta.vramMB <= 96, `${meta.vramMB.toFixed(2)}MB`);
check(
  '画布分辨率 = 750×1624（DPR 已生效）',
  meta.canvas.w === 750 && meta.canvas.h === 1624,
  `${meta.canvas.w}×${meta.canvas.h}`,
);

// ── 2. 命中迁移回归：40 点 ──────────────────────────────────
// 等气泡全部生成并收敛（原版 4 句台词按 0.8s 间隔出现，第 4 句 t>2.4s）
await page.waitForTimeout(3600);

const hitReport = await page.evaluate(() => {
  const v = window.__v2;
  const { w, h } = v.viewport();

  // (a) 屏幕↔归一化的线性一致性：正交相机铺满视口时必须是精确线性映射
  let maxNormErr = 0;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 37) % 100) / 100 * w;
    const y = ((i * 61) % 100) / 100 * h;
    const n = v.stage.screenToNorm(x, y);
    maxNormErr = Math.max(maxNormErr, Math.abs(n.x - x / w), Math.abs(n.y - y / h));
  }

  // (b) 气泡中心投影 → 在屏幕上那一点点击 → 必须命中对应气泡
  const positions = v.bubblePositions();
  const results = positions.map((p) => {
    const r = v.hitTestAt(p.x, p.y);
    return { slot: p.slot, x: +p.x.toFixed(2), y: +p.y.toFixed(2), hitSlot: r.slot, ok: r.slot === p.slot };
  });

  // (c) 偏移量检查：偏离中心 49px 应命中，51px 应落空（原版阈值就是 50）
  const b0 = positions[0];
  const inside = v.hitTestAt(b0.x + 49, b0.y).slot === 0;
  const outside = v.hitTestAt(b0.x + 51, b0.y).slot !== 0;

  return { count: positions.length, maxNormErr, results, inside, outside, positions };
});

check('4 个气泡全部生成', hitReport.count === 4, `实得 ${hitReport.count}`);
check(
  '屏幕↔归一化线性误差 < 1e-9',
  hitReport.maxNormErr < 1e-9,
  `maxErr=${hitReport.maxNormErr.toExponential(2)}`,
);
check(
  '气泡中心点击全部命中',
  hitReport.results.every((r) => r.ok),
  hitReport.results.map((r) => `#${r.slot}→${r.hitSlot}`).join(' '),
);
check('49px 处命中（阈值内）', hitReport.inside);
check('51px 处落空（阈值外）', hitReport.outside);

// ── 3. 画面保真（必须在点击之前：tapped 会改外观；镜头必须冻结）──
await mkdir(outDir, { recursive: true });

await page.evaluate(() => {
  window.__v2.setCameraEnabled(false);
});
await page.waitForTimeout(120); // 让冻结后的两帧真正画出来

const frameDataUrl = await page.evaluate(() => window.__v2.captureFrame());
const frameB64 = frameDataUrl.slice(frameDataUrl.indexOf(',') + 1);
await writeFile(join(outDir, 'v2.frame.png'), Buffer.from(frameB64, 'base64'));

// 先自证"读回来的不是空白"。这一步单独做，是因为读空白的表象是
// 「画面平均差 ~177/255」，和渲染全挂长得一模一样，极易误诊。
const frameHealth = await page.evaluate(async (b64) => {
  const im = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('读回图无法解码'));
    i.src = `data:image/png;base64,${b64}`;
  });
  const c = document.createElement('canvas');
  c.width = 750;
  c.height = 1624;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 750, 1624);
  const d = g.getImageData(0, 0, 750, 1624).data;
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4 * 37) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += l;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const n = Math.ceil(d.length / (4 * 37));
  const mean = sum / n;
  let vsum = 0;
  for (let i = 0; i < d.length; i += 4 * 37) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    vsum += (l - mean) ** 2;
  }
  return { mean: +mean.toFixed(1), min, max, std: +Math.sqrt(vsum / n).toFixed(1) };
}, frameB64);

check(
  '帧读回非空白（有真实画面）',
  frameHealth.std > 8,
  `亮度 mean=${frameHealth.mean} min=${frameHealth.min} max=${frameHealth.max} std=${frameHealth.std}`,
);
if (frameHealth.std <= 8) {
  console.log('  ⚠ 读回图近乎纯色 —— 检查 ?capture=1 是否生效（preserveDrawingBuffer）');
}

const refComposite = (await readFile(join(outDir, 's3.composite.png'))).toString('base64');
const refOriginal = (await readFile(join(outDir, 's3.original.png'))).toString('base64');

/** 页面侧比对：把两张图都拉到 750×1624，算 16×16 分块亮度均值差 */
const compareFn = async (payload) => {
  const load = (src) =>
    new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('图加载失败'));
      im.src = src;
    });

  const W = 750;
  const H = 1624;
  const crop = (im) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d').drawImage(im, 0, 0, W, H);
    return c.getContext('2d').getImageData(0, 0, W, H).data;
  };

  const A = crop(await load(`data:image/png;base64,${payload.liveB64}`));
  const B = crop(await load(`data:image/png;base64,${payload.refB64}`));

  const blocks = 16;
  const bw = Math.floor(W / blocks);
  const bh = Math.floor(H / blocks);

  // 气泡区屏蔽：v2 的气泡收敛程度与真值那一帧不同，且气泡文字走 DOM
  // （v2 canvas 里根本没文字），这块差异属预期。
  const BUBBLES = [
    { x: 0.25, y: 0.25 },
    { x: 0.42, y: 0.37 },
    { x: 0.59, y: 0.49 },
    { x: 0.76, y: 0.61 },
  ];
  const inBubble = (bx, by) => {
    const cx = ((bx + 0.5) * bw) / W;
    const cy = ((by + 0.5) * bh) / H;
    return BUBBLES.some((b) => Math.abs(cx - b.x) < 0.17 && Math.abs(cy - b.y) < 0.05);
  };

  let sumAll = 0;
  let nAll = 0;
  let sumOut = 0;
  let nOut = 0;
  let worst = { d: 0, bx: 0, by: 0 };

  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) {
      let sa = 0;
      let sb = 0;
      for (let y = by * bh; y < (by + 1) * bh; y++) {
        for (let x = bx * bw; x < (bx + 1) * bw; x++) {
          const i = (y * W + x) * 4;
          sa += (A[i] + A[i + 1] + A[i + 2]) / 3;
          sb += (B[i] + B[i + 1] + B[i + 2]) / 3;
        }
      }
      const n = bw * bh;
      const d = Math.abs(sa / n - sb / n);
      sumAll += d;
      nAll++;
      if (!inBubble(bx, by)) {
        sumOut += d;
        nOut++;
        if (d > worst.d) worst = { d: +d.toFixed(1), bx, by };
      }
    }
  }

  return {
    meanAll: +(sumAll / nAll).toFixed(2),
    meanOutsideBubbles: +(sumOut / nOut).toFixed(2),
    worstOutside: worst,
    blocksMasked: nAll - nOut,
  };
};

const fidComposite = await page.evaluate(compareFn, { liveB64: frameB64, refB64: refComposite });
const fidOriginal = await page.evaluate(compareFn, { liveB64: frameB64, refB64: refOriginal });

console.log('\n════════ 画面保真（v2 实时渲染 vs 烘焙基准）════════');
console.log(`vs 分层合成图  全部块 ${fidComposite.meanAll}  剔气泡 ${fidComposite.meanOutsideBubbles}  最差块 Δ${fidComposite.worstOutside.d}@(${fidComposite.worstOutside.bx},${fidComposite.worstOutside.by})`);
console.log(`vs 原版直出图  全部块 ${fidOriginal.meanAll}  剔气泡 ${fidOriginal.meanOutsideBubbles}  最差块 Δ${fidOriginal.worstOutside.d}@(${fidOriginal.worstOutside.bx},${fidOriginal.worstOutside.by})`);
console.log(`（屏蔽 ${fidComposite.blocksMasked} 块气泡区；气泡文字 v2 走 DOM 不进 canvas，差异属预期）`);

// 超阈值时自动做逐层消融，直接指出是哪一层出了问题
if (fidComposite.meanOutsideBubbles > 8) {
  console.log('\n── 逐层消融诊断（关掉某层后的差值，变小 = 该层是元凶）──');
  const base = fidComposite.meanOutsideBubbles;
  console.log(`全开：${base}`);
  for (const name of ['sky', 'mid', 'paper', 'actors', 'bubbles']) {
    await page.evaluate((n) => window.__v2.setLayerVisible(n, false), name);
    await page.waitForTimeout(90);
    const d = await page.evaluate(() => window.__v2.captureFrame());
    const r = await page.evaluate(compareFn, {
      liveB64: d.slice(d.indexOf(',') + 1),
      refB64: refComposite,
    });
    await page.evaluate((n) => window.__v2.setLayerVisible(n, true), name);
    const delta = base - r.meanOutsideBubbles;
    console.log(
      `  关掉 ${name.padEnd(8)} → ${String(r.meanOutsideBubbles).padStart(6)}` +
        `   ${delta > 1 ? `↓${delta.toFixed(1)}  ⬅ 元凶` : delta < -1 ? `↑${(-delta).toFixed(1)}` : '—'}`,
    );
  }
}

check('非气泡区画面平均差 ≤ 8/255（vs 分层合成）', fidComposite.meanOutsideBubbles <= 8, `${fidComposite.meanOutsideBubbles}/255`);

// ── 3b. paper 层实效探针 ────────────────────────────────────
// 分块均值**永远测不出**纸纹：300 个 1.5×1.5 的点在 750×1624 上占 0.11%，
// 每点只暗化 ~1.1%，落到块均值上是 1e-4 量级。所以必须单独做逐像素探针，
// 否则"纸纹其实没生效"这个 bug 会一路蒙混过关。
//
// 探针同时能识别**混合语义写错**：若 WebGL 的 multiply 被误当成
// `Cb × Cs × αs`（α=0.025 时系数仅 0.0136），每个点会黑成 ~0，
// maxDelta 会飙到 250 左右，而不是应有的个位数。
const paperProbe = await (async () => {
  const shot = async (visible) => {
    await page.evaluate((v) => window.__v2.setLayerVisible('paper', v), visible);
    await page.waitForTimeout(90);
    const d = await page.evaluate(() => window.__v2.captureFrame());
    return d.slice(d.indexOf(',') + 1);
  };
  const on = await shot(true);
  const off = await shot(false);
  await page.evaluate(() => window.__v2.setLayerVisible('paper', true));

  return page.evaluate(
    async ({ a, b }) => {
      const load = (src) =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = `data:image/png;base64,${src}`;
        });
      const px = async (src) => {
        const c = document.createElement('canvas');
        c.width = 750;
        c.height = 1624;
        const g = c.getContext('2d');
        g.drawImage(await load(src), 0, 0, 750, 1624);
        return g.getImageData(0, 0, 750, 1624).data;
      };
      const A = await px(a);
      const B = await px(b);
      let changed = 0;
      let maxD = 0;
      let sumD = 0;
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.abs((A[i] + A[i + 1] + A[i + 2]) / 3 - (B[i] + B[i + 1] + B[i + 2]) / 3);
        if (d > 0.5) {
          changed++;
          sumD += d;
          if (d > maxD) maxD = d;
        }
      }
      return { changed, maxD: +maxD.toFixed(1), meanD: changed ? +(sumD / changed).toFixed(1) : 0 };
    },
    { a: on, b: off },
  );
})();

check(
  'paper 层确实生效（像素级）',
  paperProbe.changed > 300 && paperProbe.maxD > 0.5 && paperProbe.maxD < 40,
  `改动 ${paperProbe.changed} px，单点最大 Δ${paperProbe.maxD}，均值 Δ${paperProbe.meanD}`,
);

// ── 4. 交互可完成 ───────────────────────────────────────────
const completion = await page.evaluate(() => {
  const v = window.__v2;
  const pos = v.bubblePositions().filter((p) => !p.tapped);
  const hits = pos.map((p) => v.tapAt(p.x, p.y));
  return {
    hits,
    tapped: v.s3.tapCount,
    done: v.s3.done,
    text: v.s3.text,
    hint: v.s3.hint,
  };
});

check('依次点击 4 个气泡全部生效', completion.tapped === 4, `命中 ${completion.hits.filter(Boolean).length}/4`);
check(
  '完成文案与原版一致',
  completion.text === '新年的钟声里，一切都有了答案',
  `"${completion.text}"`,
);
check('提示文案已清空', completion.hint === '', `"${completion.hint}"`);

// 原版 game.js:1394 在最后一次命中时把 this.t 归零，而 game.js:1343 要求
// this.t > 1 才置 done —— 所以点完必须再等 1 秒以上才能判 done。
// 这不是 bug，是原版的节奏设计（留一拍给"钟声"落定）。
await page.waitForTimeout(1300);
const doneState = await page.evaluate(() => ({ done: window.__v2.s3.done }));
check('全部点完后 1.3s 内场景判定 done', doneState.done === true);

// ── 5. 帧统计（仅报告：headless 是软件光栅，不代表真机）──────
const perf = await page.evaluate(() => window.__v2.overlay.snapshot());

console.log('\n════════ 帧统计（headless 软件光栅，仅作连通性参考）════════');
console.log(`帧数 ${perf.frames}  平均 ${perf.avgFps?.toFixed(1)} fps  p95 ${perf.p95Ms?.toFixed(1)}ms  档位 ${perf.tier}`);
console.log(`档位依据：${perf.tierReason}`);

// ── 6. 部署形态（转发页 + 原版冻结副本）──────────────────────
// 这三样和 v2 一起上线，坏了照样是白屏。尤其转发页：它是唯一的入口，
// 一行 TARGET 写错就是线上 404。
console.log('\n════════ 部署形态 ════════');

const dep = await page.evaluate(async (b) => {
  const grab = async (p) => {
    const r = await fetch(`${b}${p}`, { cache: 'no-store' });
    return { status: r.status, text: await r.text() };
  };
  const root = await grab('/');
  const classic = await grab('/classic/');
  const cname = await grab('/CNAME');
  return {
    rootStatus: root.status,
    rootTarget: (root.text.match(/var\s+TARGET\s*=\s*'([^']+)'/) ?? [])[1] ?? null,
    classicStatus: classic.status,
    classicRefsGame: classic.text.includes('game.js'),
    cname: cname.text.trim(),
  };
}, base);

check('根转发页 200 且开关指向 classic', dep.rootStatus === 200 && dep.rootTarget === './classic/', `TARGET=${dep.rootTarget}`);
check('原版冻结副本可访问且引用 game.js', dep.classicStatus === 200 && dep.classicRefsGame);
check('CNAME 已随产物分发', dep.cname === 'home.sjtunix.cn', dep.cname);

// 真的跳一次：X5 里 location.replace 会不会被拦是未知数，本机先钉住行为
{
  const p2 = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(`${base}/`, { waitUntil: 'load' });
  await p2.waitForTimeout(1200);
  const landed = new URL(p2.url()).pathname;
  const hasGame = await p2.evaluate(() => typeof window.Game === 'function' || !!document.querySelector('canvas'));
  await p2.close();
  check('根路径自动转发到 /classic/', landed === '/classic/', `落到 ${landed}`);
  check('原版页面加载后无 pageerror', errs.length === 0, errs.slice(0, 1).join(''));
  check('原版运行时已就位（canvas 或 Game 存在）', hasGame);
}

// ── 汇总 ────────────────────────────────────────────────────
console.log('\n════════ 结算 ════════');
console.log(`通过 ${pass.length} 项，失败 ${fails.length} 项`);
for (const f of fails) console.log(`  ✗ ${f}`);
console.log('\n产物：bake-out/v2.frame.png（v2 实时帧）、bake-out/s3.composite.png（分层合成基准）、bake-out/s3.original.png（原版直出）');

await browser.close();
server.close();
process.exit(fails.length === 0 ? 0 : 1);
