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
// 画布 = CSS 视口 × 实际 DPR。DPR 由 pickTier 三取劣自适应（deviceMemory /
// hardwareConcurrency / 首 60 帧实测 fps），headless 在机器负载高时会掉到
// mid 档（DPR 1.5）—— 这是**设计行为**，不是 bug。断言只要求"视口被
// 整倍放大"（DPR 生效），并把实际档位报告出来。
{
  const { w, h } = meta.canvas;
  const sx = w / 375;
  const sy = h / 812;
  const dpr = Number(sx.toFixed(2));
  check(
    '画布分辨率 = 视口 × 自适应 DPR（375×812 整倍放大）',
    Math.abs(sx - sy) < 0.02 && [1, 1.5, 2].includes(dpr),
    `${w}×${h}（DPR ${dpr}，${dpr === 2 ? 'high' : dpr === 1.5 ? 'mid' : 'low'} 档）`,
  );
}

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
    tapped: v.scene.tapCount,
    done: v.scene.done,
    text: v.scene.text,
    hint: v.scene.hint,
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
const doneState = await page.evaluate(() => ({ done: window.__v2.scene.done }));
check('全部点完后 1.3s 内场景判定 done', doneState.done === true);

// ── 4b. M2 各场景闭环（?scene=<id>）─────────────────────────
// 每场跑同样的三段：装配 → 保真 → 交互。差异只在"交互怎么点、期望什么文案"。
// 这是 M2 量产的核心验收：一个模板能不能在 13 场上都立住。
//
// ⚠️ 保真比对前把 scene.t 设回 3：S0 的信封浮动是 sin(t*2)*8，
//    而烘焙真值是在 animate 推进 3 秒后定格的那一帧。不对齐 t，
//    信封会整体偏移几像素，被算成"结构性差异"（假失败）。
//    其余场次 render 里没有随 t 变化的静态元素，设了也无副作用。
const CLOSURES = [
  {
    id: 's10',
    layers: 7,
    note: '无命中测试，任意点按计数，点满 6 次换文案（game.js:1798-1831）',
    expectText: '余生很长，请多指教',
    expectTaps: 6,
    doneWaitMs: 1700,
  },
  {
    id: 's2',
    layers: 7,
    note: '连点心跳 3 次（50px 圆形判定，game.js 同 S3 的 U.dist<50），连点后 t>1 判 done',
    expectText: '心动，是藏不住的秘密',
    expectTaps: 3,
    doneWaitMs: 1600,
  },
  {
    id: 's0',
    layers: 6,
    note: '信封中心 60px 内命中一次，拆封后 t>1.5 判 done（game.js:1105-1114）',
    expectText: '一封信，开始了我们的故事',
    expectTaps: 1,
    doneWaitMs: 1800,
  },
  {
    id: 's1',
    layers: 9,
    note: '两台显示器各 35px 内命中，全连上换文案、t>1 判 done（game.js:1255-1268）',
    expectText: '产品与开发，缘分就这样开始了...',
    expectTaps: 2,
    doneWaitMs: 1400,
  },
  {
    id: 's4',
    layers: 9,
    note: '唯一真正的拖拽场：抓 25px 内花瓣 → 拖到目标心 60px 内吸附 → 放满 5 片（game.js:1462-1480）',
    expectText: '从今天起，你是我的了',
    expectTaps: 5,
    doneWaitMs: 1700,
  },
  {
    id: 's5',
    layers: 10,
    note: '海浪带 y∈(0.45h,0.7h) 只判 y，点 5 次换文案，t>1.5 判 done（game.js:1547-1554）',
    expectText: '和你在一起的每一天都是蜜月',
    expectTaps: 5,
    doneWaitMs: 1700,
  },
  {
    id: 's6',
    layers: 8,
    note: '按住累积 petProgress（0.5/s → 需 2s），松手时若满 1 才换文案（game.js:1605-1612）',
    expectText: '小家伙也很喜欢你们的小家',
    expectTaps: 1,
    doneWaitMs: 200,
  },
  {
    id: 's7',
    layers: 8,
    note: '按住 + 在脸 50px 内移动累积 tearWipe（0.03/次 → 约 34 次），擦满松手换文案（game.js:1673-1685）',
    expectText: '别哭，有我在',
    expectTaps: 1,
    doneWaitMs: 1700,
  },
  {
    id: 's8',
    layers: 8,
    note: '补光灯 45px 内点 4 次，每次触发全屏闪光，t>1.5 判 done（game.js:1725-1733）',
    expectText: '你认真的样子，真的很美',
    expectTaps: 4,
    doneWaitMs: 1700,
  },
  {
    id: 's9',
    layers: 8,
    note: '抓住男孩（40px）拖近女孩（间距 ≥60），|boyX-girlX|<90 判和好，merged 后 t>2 判 done（game.js:1774-1794）',
    expectText: '和好如初，再也不放手',
    expectTaps: 1,
    doneWaitMs: 2300,
    // 距离虚线走 DOM（非贴图）：s9.ts:14 有理由说明，合并后会 display:none
    expectDom: '.gap-line',
  },
  {
    id: 's11',
    layers: 12,
    note: '窗 (hx, hy+30) 40px 内点一次点灯：窗体跳变、wash/光锥渐变、女孩猫出现、男孩走向门口，lightT>2 判 done（game.js:1887-1894）',
    expectText: '加班到很晚回家，你和仙姑都在等我',
    expectTaps: 1,
    doneWaitMs: 2200,
  },
  {
    id: 's12',
    layers: 7,
    note: '任意点按计数（无 hit test），满 8 次 ended：换文案 + 大心出现并以 sin(t*3) 脉冲（game.js:1933-1939）',
    expectText: '七夕快乐，未来的每一天都在一起',
    expectTaps: 8,
    // ⚠️ 原版 S12 永不 done（终局定格在心脉冲画面，game.js 无 done=true 路径）
    expectDone: false,
  },
];

for (const sc of CLOSURES) {
  console.log(`\n════════ ${sc.id} 闭环（?scene=${sc.id}）════════`);
  console.log(`  ${sc.note}`);

  const p = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const errs = [];
  const cons = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') cons.push(m.text());
  });

  await p.goto(`${base}/v2/?scene=${sc.id}`, { waitUntil: 'load', timeout: 30000 });
  let booted = true;
  try {
    await p.waitForFunction(() => window.__v2 != null, null, { timeout: 25000 });
  } catch {
    booted = false;
  }

  check(`${sc.id}: 页面无 pageerror`, errs.length === 0, errs.slice(0, 2).join(' | '));
  check(`${sc.id}: 控制台无 error`, cons.length === 0, cons.slice(0, 2).join(' | '));
  check(`${sc.id}: 运行时完成装配`, booted);

  if (!booted) {
    await p.close();
    continue;
  }

  const meta = await p.evaluate(() => {
    const v = window.__v2;
    return {
      id: v.sceneId,
      layers: v.manifest.layers.map((l) => l.name),
      stage: v.layerNames(),
      vram: v.stage.estimateTextureMB(),
    };
  });
  check(`${sc.id}: 装配的是 ${sc.id}`, meta.id === sc.id, String(meta.id));
  check(
    `${sc.id}: 清单 / 舞台均装配 ${sc.layers} 层`,
    meta.layers.length === sc.layers && meta.stage.length === sc.layers,
    `清单 ${meta.layers.length} / 舞台 ${meta.stage.length}：${meta.stage.join(',')}`,
  );
  check(`${sc.id}: 纹理显存 ≤ 96MB 预算`, meta.vram <= 96, `${meta.vram.toFixed(2)}MB`);

  // 保真：冻结镜头 + 对齐 t → 帧内读回 → 与烘焙合成图分块比对
  await p.evaluate(() => {
    window.__v2.setCameraEnabled(false);
    if (typeof window.__v2.scene?.t === 'number') window.__v2.scene.t = 3;
    // 自生成元素（S4 花瓣 / 将来 S7 雨滴）不在烘焙真值里，先归零
    window.__v2.scene?.freezeForFidelity?.();
  });
  await p.waitForTimeout(140);
  const frame = await p.evaluate(() => window.__v2.captureFrame());
  const fb64 = frame.slice(frame.indexOf(',') + 1);
  await writeFile(join(outDir, `v2.${sc.id}.frame.png`), Buffer.from(fb64, 'base64'));

  const ref = (await readFile(join(outDir, `${sc.id}.composite.png`))).toString('base64');
  const fid = await p.evaluate(compareFn, { liveB64: fb64, refB64: ref });
  check(
    `${sc.id}: 画面平均差 ≤ 8/255（vs 烘焙合成）`,
    fid.meanAll <= 8,
    `全部块 ${fid.meanAll}  最差 Δ${fid.worstOutside.d}@(${fid.worstOutside.bx},${fid.worstOutside.by})`,
  );

  // ── DOM 叠层自证（交互前：部分元素完成后会被隐藏）────────
  // 有些元素是**刻意**走 DOM 而非贴图的 —— S9 的距离虚线若烘成贴图，
  // 间距变化时 scaleX 会把虚线段本身拉伸变形（见 s9.ts 文件头注释）。
  // canvas 帧读回里看不到 DOM 叠层，必须单独断言，否则会被误判成"这层缺失"
  // （2026-10-03 独立验收代理就据此报了 S9 虚线缺失，实为 canvas/DOM 取样口径差异）。
  if (sc.expectDom) {
    const dom = await p.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        found: true,
        display: cs.display,
        borderTop: cs.borderTopStyle,
        opacity: Number(cs.opacity),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }, sc.expectDom);
    check(
      `${sc.id}: DOM 叠层 ${sc.expectDom} 存在且可见`,
      dom.found === true && dom.display !== 'none' && dom.opacity > 0 && dom.w > 0,
      JSON.stringify(dom),
    );
  }

  // 交互：按各场的原版判定点完
  const after = await runInteract(p, sc);

  check(`${sc.id}: 点按计数 = ${sc.expectTaps}`, after.taps === sc.expectTaps, `实得 ${after.taps}`);
  check(`${sc.id}: 完成文案与原版一致`, after.text === sc.expectText, `"${after.text}"`);
  check(`${sc.id}: 提示文案已清空`, after.hint === '', `"${after.hint}"`);

  if (sc.expectDone === false) {
    // 终局定格场（S12）：没有 done 可等，改为断言"ended 后大心已出现"
    const heart = await p.evaluate(() => window.__v2.scene.heartVisible?.() ?? null);
    check(`${sc.id}: ended 后大心已出现（终局定格，永不 done）`, heart === true, String(heart));
  } else {
    await p.waitForTimeout(sc.doneWaitMs);
    const done = await p.evaluate(() => window.__v2.scene.done);
    check(`${sc.id}: 完成条件满足后场景判定 done`, done === true, `等待 ${sc.doneWaitMs}ms`);
  }

  // ── 用户可见性闸门 ────────────────────────────────────────
  // ⚠️ 这一组断言的不是 JS 属性，而是「用户真的能看见」。
  //    2026-10-03 的教训：main.ts 的 onText 漏加 `.show` class →
  //    CSS 里 .scene-text 默认 opacity:0 → 13 场叙事文字一个字都看不到，
  //    而当时 148 项冒烟全绿 —— 因为它断言的是 scene.text 这个属性值。
  //    **属性值对了 ≠ 画面上有**。必须查 computed style + 几何包围盒。
  //    文案是这故事的全部情感载体，这条比任何渲染指标都重要。
  // 原版 setSceneText 的节奏是「淡出 → 400ms 换字 → 淡入」，而 .scene-text
  // 的 transition 是 0.8s —— 固定 sleep 会卡在淡入中途读到 opacity=0.8 这种
  // 中间值（s6 就踩了）。改成轮询等稳定，既准确又不白等。
  await p.waitForTimeout(450); // 先让 400ms 的换字时机过去
  await p
    .waitForFunction(
      () => {
        const el = document.querySelector('.scene-text');
        if (!el) return false;
        return el.classList.contains('show') && Number(getComputedStyle(el).opacity) > 0.99;
      },
      null,
      { timeout: 3000 },
    )
    .catch(() => {
      /* 等不到就让下面的断言如实报错，这里不吞失败 */
    });
  const vis = await p.evaluate(() => {
    const el = document.querySelector('.scene-text');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      found: true,
      text: el.textContent ?? '',
      opacity: Number(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      within:
        r.width > 0 &&
        r.height > 0 &&
        r.left >= 0 &&
        r.top >= 0 &&
        r.right <= vw &&
        r.bottom <= vh,
    };
  });
  check(`${sc.id}: 剧情文案 DOM 存在`, vis.found === true);
  // 判据用 ≥0.99 而不是 ===1：CSS transition 的终值是渐近逼近的，
  // 卡等到绝对 1 会随机 flaky；0.99 的视觉差异人眼无法分辨，够了。
  check(
    `${sc.id}: 剧情文案真实可见（不是 opacity:0）`,
    vis.opacity >= 0.99 && vis.visibility === 'visible' && vis.display !== 'none',
    `opacity=${vis.opacity} visibility=${vis.visibility} display=${vis.display}`,
  );
  check(`${sc.id}: 剧情文案非空`, (vis.text ?? '').trim().length > 0, `"${vis.text}"`);
  check(
    `${sc.id}: 剧情文案完整落在视口内`,
    vis.within === true,
    `rect=${JSON.stringify(vis.rect)}`,
  );

  await p.close();
}

/**
 * 在页面里执行该场的交互脚本。
 *
 * ⚠️ Playwright 的 page.evaluate 不能直接传函数体（会被序列化掉闭包），
 *    所以按 id 分发 —— 用字符串描述"点哪里、点几次"，保持可读。
 */
async function runInteract(p, sc) {
  return p.evaluate(async (id) => {
    const v = window.__v2;
    const { w, h } = v.viewport();
    const s = v.scene;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    if (id === 's10') {
      for (let i = 0; i < 6; i++) v.tapAt(w * (0.2 + 0.1 * i), h * 0.4);
    } else if (id === 's0') {
      const pt = s.envelopeDesignPosition();
      v.tapAt(pt.x, pt.y);
    } else if (id === 's1') {
      for (const pt of s.screenDesignPositions()) v.tapAt(pt.x, pt.y);
    } else if (id === 's2') {
      const pt = s.heartDesignPosition();
      for (let i = 0; i < 3; i++) v.tapAt(pt.x, pt.y);
    } else if (id === 's4') {
      // 拖拽四步：生成花瓣 → down 抓住 → move 到目标 → up 落下吸附
      const t = s.targetDesignPosition();
      for (let i = 0; i < 5; i++) {
        const px = w * (0.15 + 0.14 * i);
        const py = h * 0.75;
        s.spawnPetalAt(px, py);
        v.tapAt(px, py);
        v.moveAt(t.x, t.y);
        v.releaseAt(t.x, t.y);
      }
    } else if (id === 's5') {
      const band = s.waveBandDesign();
      const y = (band.y0 + band.y1) / 2;
      for (let i = 0; i < 5; i++) v.tapAt(w * (0.2 + 0.15 * i), y);
    } else if (id === 's6') {
      // 按住累积：petProgress 每秒 +0.5，必须按满 2 秒；松手才换文案
      const pt = s.catDesignPosition();
      v.tapAt(pt.x, pt.y);
      await sleep(2400);
      v.releaseAt(pt.x, pt.y);
    } else if (id === 's7') {
      // 擦泪：按住 + 在 50px 内来回移动 40 次（0.03/次 → 1.2 ≥ 1），松手换文案
      const pt = s.faceDesignPosition();
      v.tapAt(pt.x, pt.y);
      for (let i = 0; i < 40; i++) v.moveAt(pt.x + Math.sin(i * 0.9) * 20, pt.y + Math.cos(i * 1.3) * 15);
      v.releaseAt(pt.x, pt.y);
    } else if (id === 's8') {
      const pt = s.ringDesignPosition();
      for (let i = 0; i < 4; i++) v.tapAt(pt.x, pt.y);
    } else if (id === 's9') {
      // 拖到一起：抓住男孩，拖到 girlX-70（间距 70 < 90 → 和好），松手
      const a = s.actorDesignPositions();
      v.tapAt(a.boyX, a.y);
      v.moveAt(a.girlX - 70, a.y);
      v.releaseAt(a.girlX - 70, a.y);
    } else if (id === 's11') {
      // 点灯：窗心 40px 内点一次（game.js:1889），done 在 lightT>2 后
      const pt = s.windowDesignPosition();
      v.tapAt(pt.x, pt.y);
    } else if (id === 's12') {
      // 许愿：任意点 8 次（无 hit test）。ended 在下一帧 update 里判定，
      // 点完等一拍再返回，否则读到的 text 还是空串（game.js:1904 在 update 里）
      for (let i = 0; i < 8; i++) v.tapAt(w * (0.2 + 0.08 * i), h * 0.3);
      await sleep(150);
    }
    return { taps: s.tapCount, text: s.text, hint: s.hint, done: s.done };
  }, sc.id);
}

// ── 5. 帧统计（仅报告：headless 是软件光栅，不代表真机）──────
const perf = await page.evaluate(() => window.__v2.overlay.snapshot());

console.log('\n════════ 帧统计（headless 软件光栅，仅作连通性参考）════════');
console.log(`帧数 ${perf.frames}  平均 ${perf.avgFps?.toFixed(1)} fps  p95 ${perf.p95Ms?.toFixed(1)}ms  档位 ${perf.tier}`);
console.log(`档位依据：${perf.tierReason}`);

// ── 5.5 UI 控件：看得见，并且真的有反应 ──────────────────────
// 「DOM 里有」和「点得动」是两回事 —— 2026-10-03 独立验收抓到
// 音乐按钮可见可点却零事件绑定、进度点容器永远空白。
// 这里对每个控件都走「存在 → 可见（含祖先链）→ 操作 → 状态真的变了」。
// ⚠️ 祖先链检查不能省：元素自身的 computed display 不会因为祖先 none 而变成 none，
//    只查元素自己会得出「可见」的错误结论（本次 UI 层缺失就是这么漏掉的）。
console.log('\n════════ UI 控件（可见性与响应）════════');
{
  const p3 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p3.goto(`${base}/v2/?scene=s3`, { waitUntil: 'load' });
  await p3.waitForFunction(() => window.__v2?.scene, null, { timeout: 20000 });
  // 加载屏淡出 0.8s 后 UI 层才点亮 —— 等它自动亮，不靠点击兜底
  const autoLit = await p3
    .waitForFunction(
      () => {
        const el = document.querySelector('#ui-overlay');
        return !!el && getComputedStyle(el).display !== 'none';
      },
      null,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false);
  check('UI 层在加载结束后自动点亮（无需用户先点一下）', autoLit === true);

  const ui = await p3.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false, visible: false, blockedBy: null, size: [0, 0] };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      let blockedBy = null;
      let n = el;
      while (n && !blockedBy) {
        const c = getComputedStyle(n);
        if (c.display === 'none' || c.visibility === 'hidden') blockedBy = n.id || n.className || n.tagName;
        n = n.parentElement;
      }
      return {
        found: true,
        visible: !blockedBy && Number(cs.opacity) > 0.5 && r.width > 0 && r.height > 0,
        blockedBy,
        size: [Math.round(r.width), Math.round(r.height)],
      };
    };
    return { overlay: probe('#ui-overlay'), music: probe('#music-btn'), dots: probe('#progress-dots') };
  });
  check('UI 层根节点可见且祖先链无阻挡', ui.overlay.visible === true, `blockedBy=${ui.overlay.blockedBy}`);
  check('音乐按钮可见（未被祖先 display:none 吞掉）', ui.music.found && ui.music.visible, JSON.stringify(ui.music));
  // ⚠️ 只断言"容器存在"：里面的点还没生成。进度点的语义是"当前在第几场"，
  //    而单场试跑模式（?scene=sN）没有"当前索引"这个概念 —— 生成逻辑
  //    必须与 M3 的 SceneManager 一起做，否则只会得到 13 个恒暗的点。
  check('进度点容器存在（点待 M3 流转落地后生成）', ui.dots.found === true, JSON.stringify(ui.dots));

  // 音乐：首次手势里起 AudioContext → 按钮点一下进静音态
  await p3.click('#game-canvas', { position: { x: 60, y: 760 } });
  await p3.waitForTimeout(180);
  const started = await p3.evaluate(() => ({ started: window.__v2.music?.started === true }));
  check('首次用户手势后音频上下文已创建（自动播放策略）', started.started === true, JSON.stringify(started));

  await p3.click('#music-btn');
  await p3.waitForTimeout(150);
  const muted = await p3.evaluate(() => ({
    cls: document.querySelector('#music-btn')?.classList.contains('muted') ?? null,
    inst: window.__v2.music?.isMuted ?? null,
  }));
  check('音乐按钮点击后按钮进入静音样式', muted.cls === true, JSON.stringify(muted));
  check('音乐按钮的静音态真的作用到音频模块', muted.inst === true, JSON.stringify(muted));

  await p3.close();
}

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
