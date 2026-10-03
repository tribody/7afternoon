/**
 * 独立验收脚本（audit-indep.mjs）—— 由验收代理编写，不依赖开发方脚本的任何结论。
 *
 * 覆盖：
 *   A. 13 场逐个加载，记录 pageerror / console error / requestfailed
 *   B. 每场帧内读回（?capture=1 + __v2.captureFrame()），量化"非背景像素占比"
 *   C. 真实鼠标（page.mouse）驱动交互，交互前后状态 + 画面双重取证
 *   D. classic 原版逐场截屏（运行时跳场，不改源码），与 v2 并排 + 数值比对
 *   E. 390×844 与 360×780 两种视口的布局溢出/裁切/字号检查
 *   F. 记录 interactiveMs 与帧统计（headless 软件光栅，不做任何性能结论）
 *
 * 用法：node scripts/audit-indep.mjs   （前置：4173 preview 已起、dist/ 已构建）
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bake-out', 'audit');
const FRAMES = join(OUT, 'frames');
const COMPARE = join(OUT, 'compare');
const MOBILE = join(OUT, 'mobile');
const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
const SCENES = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveB64 = async (dir, name, dataUrl) => {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  await writeFile(join(dir, name), buf);
  return buf.length;
};

const log = (...a) => console.log(...a);
const findings = { A: [], B: [], C: [], D: [], E: [], F: [], G: [] };

// ───────────────────────── 页面内取证函数（注入用） ─────────────────────────

/** 帧像素分析：主色占比 / 非背景占比 / 独立色数 / 亮度统计 / 内容包围盒 / 边缘密度 */
const FN_ANALYZE = async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = 240;
  const H = Math.max(1, Math.round((W * img.height) / img.width));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const total = W * H;
  const hist = new Map();
  let sumL = 0, sumL2 = 0, transparent = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) { transparent++; continue; }
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    hist.set(key, (hist.get(key) ?? 0) + 1);
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sumL += l; sumL2 += l * l;
  }
  let modalKey = -1, modalN = 0;
  for (const [k, n] of hist) if (n > modalN) { modalN = n; modalKey = k; }
  const mr = ((modalKey >> 8) & 15) * 16 + 8;
  const mg = ((modalKey >> 4) & 15) * 16 + 8;
  const mb = (modalKey & 15) * 16 + 8;
  let nonBg = 0, edge = 0;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (Math.max(Math.abs(r - mr), Math.abs(gg - mg), Math.abs(b - mb)) > 16) {
        nonBg++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (x + 1 < W) {
        const j = i + 4;
        if (Math.abs(r - d[j]) + Math.abs(gg - d[j + 1]) + Math.abs(b - d[j + 2]) > 30) edge++;
      }
    }
  }
  const meanL = sumL / total;
  return {
    sampleW: W, sampleH: H,
    uniqueColors: hist.size,
    modalColorRgb: [mr, mg, mb],
    modalRatio: +(modalN / total).toFixed(4),
    nonBgRatio: +(nonBg / total).toFixed(4),
    transparentRatio: +(transparent / total).toFixed(4),
    meanLum: +meanL.toFixed(1),
    stdLum: +Math.sqrt(Math.max(0, sumL2 / total - meanL * meanL)).toFixed(1),
    edgeRatio: +(edge / total).toFixed(4),
    contentBBox: maxX < 0 ? null : { x: minX / W, y: minY / H, w: (maxX - minX + 1) / W, h: (maxY - minY + 1) / H },
  };
};

/** 场景内可观察状态快照 */
const FN_STATE = () => {
  const v = window.__v2;
  const s = v.scene;
  const txt = (sel) => document.querySelector(sel)?.textContent ?? null;
  return {
    text: s.text ?? null,
    hint: s.hint ?? null,
    done: s.done ?? null,
    tapCount: typeof s.tapCount === 'number' ? s.tapCount : null,
    domText: txt('#scene-text'),
    domHint: txt('#hint-text'),
    domBubbles: [...document.querySelectorAll('#bubble-layer > *')].map((e) => e.textContent),
    fault: (() => { const f = document.querySelector('#fault-notice'); return f && !f.hidden ? f.textContent : null; })(),
  };
};

/** 热区网格扫描（只用 __v2.hitTestAt，不读场景内部私有字段） */
const FN_SCAN = (step) => {
  const v = window.__v2;
  const { w, h } = v.viewport();
  const pts = [];
  for (let y = 2; y < h; y += step) {
    for (let x = 2; x < w; x += step) {
      let r;
      try { r = v.hitTestAt(x, y); } catch { continue; }
      if (r && r.slot >= 0) pts.push({ x, y, slot: r.slot });
    }
  }
  // 聚到 slot 桶，取每桶质心与点数
  const bySlot = new Map();
  for (const p of pts) {
    const a = bySlot.get(p.slot) ?? { n: 0, x: 0, y: 0 };
    a.n++; a.x += p.x; a.y += p.y;
    bySlot.set(p.slot, a);
  }
  return {
    w, h, total: pts.length,
    clusters: [...bySlot.entries()].map(([slot, a]) => ({ slot, n: a.n, x: +(a.x / a.n).toFixed(1), y: +(a.y / a.n).toFixed(1) })),
  };
};

/** 两帧数值比对（16×16 块均值差） */
const FN_DIFF = async ([aUrl, bUrl]) => {
  const load = async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    return img;
  };
  const [ia, ib] = await Promise.all([load(aUrl), load(bUrl)]);
  const W = 195, H = Math.round((W * ia.height) / ia.width);
  const ca = document.createElement('canvas'); ca.width = W; ca.height = H;
  const cb = document.createElement('canvas'); cb.width = W; cb.height = H;
  ca.getContext('2d').drawImage(ia, 0, 0, W, H);
  cb.getContext('2d').drawImage(ib, 0, 0, W, H);
  const da = ca.getContext('2d').getImageData(0, 0, W, H).data;
  const db = cb.getContext('2d').getImageData(0, 0, W, H).data;
  const BX = 13, BY = Math.ceil(H / 16);
  const blocks = [];
  let sum = 0;
  for (let by = 0; by < BY; by++) {
    for (let bx = 0; bx < BX; bx++) {
      let s = 0, n = 0;
      for (let y = by * 16; y < Math.min(H, by * 16 + 16); y++) {
        for (let x = bx * 16; x < Math.min(W, bx * 16 + 16); x++) {
          const i = (y * W + x) * 4;
          s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
          n++;
        }
      }
      const m = s / n / 3;
      sum += m;
      blocks.push({ bx, by, d: +m.toFixed(1) });
    }
  }
  blocks.sort((p, q) => q.d - p.d);
  return { mean: +(sum / blocks.length).toFixed(2), worst: blocks.slice(0, 5) };
};

/** 布局取证（移动端视口） */
const FN_LAYOUT = () => {
  const de = document.documentElement;
  const vw = window.innerWidth, vh = window.innerHeight;
  const sels = ['#game-canvas', '#ui-overlay', '#scene-text', '#hint-text', '#bubble-layer', '#loading-screen', '#music-btn', '#progress-dots', '#fault-notice'];
  const els = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    els[sel] = {
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      fontSize: cs.fontSize, color: cs.color, display: cs.display, opacity: cs.opacity,
      clippedH: +(Math.max(0, r.bottom - vh)).toFixed(1),
      clippedRight: +(Math.max(0, r.right - vw)).toFixed(1),
      textOverflowPx: el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth - el.clientWidth : 0,
    };
  }
  const bubbles = [...document.querySelectorAll('#bubble-layer > *')].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fontSize: cs.fontSize, text: el.textContent };
  });
  const canvas = els['#game-canvas'];
  return {
    vw, vh,
    dpr: window.devicePixelRatio,
    docScrollW: de.scrollWidth, docScrollH: de.scrollHeight,
    bodyScrollW: document.body.scrollWidth,
    horizOverflow: de.scrollWidth > vw + 1,
    canvasFills: canvas ? Math.abs(canvas.w - vw) < 1 && Math.abs(canvas.h - vh) < 1 : null,
    els, bubbles,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ args: ['--no-proxy-server', '--force-color-profile=srgb', '--enable-unsafe-swiftshader'] });

// ═════════════════ A/B/C/F：390×844 主通道（加载 + 取帧 + 交互） ═════════════════
log('\n════════ A/B/C/F · 390×844 逐场加载 + 取帧 + 交互 ════════');
const ctxMain = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const audit = {};

for (const id of SCENES) {
  log(`\n──── ${id} ────`);
  const page = await ctxMain.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', msg: e.message.slice(0, 300) }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ kind: 'console.error', msg: m.text().slice(0, 300) }); });
  page.on('requestfailed', (r) => errors.push({ kind: 'requestfailed', msg: `${r.url()} ${r.failure()?.errorText ?? ''}`.slice(0, 300) }));

  const rec = { id, errors };
  try {
    await page.goto(`${BASE}/v2/?scene=${id}&capture=1`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__v2 != null, null, { timeout: 25000 });
    await page
      .waitForFunction(() => {
        const el = document.querySelector('#loading-screen');
        return el && (el.classList.contains('hidden') || getComputedStyle(el).display === 'none');
      }, null, { timeout: 25000 })
      .catch(() => rec.loadingNeverHidden = true);
    await sleep(600);

    rec.meta = await page.evaluate(() => {
      const v = window.__v2;
      return {
        hookKeys: Object.keys(v),
        sceneId: v.sceneId,
        interactiveMs: Math.round(v.interactiveMs),
        manifestLayers: v.manifest.layers.map((l) => l.name),
        stageLayers: v.layerNames(),
        renderInfo: v.renderInfo(),
        vramMB: +v.stage.estimateTextureMB().toFixed(1),
        viewport: v.viewport(),
        canvas: v.canvasSize(),
      };
    });

    // 冻结镜头取"净帧"
    await page.evaluate(() => window.__v2.setCameraEnabled(false));
    await sleep(250);
    const f0 = await page.evaluate(() => window.__v2.captureFrame());
    rec.frame0Bytes = await saveB64(FRAMES, `${id}.v2.png`, f0);
    rec.px0 = await page.evaluate(FN_ANALYZE, f0);

    // F：帧统计（仅记录）
    rec.perf = await page.evaluate(() => {
      const s = window.__v2.overlay.snapshot();
      return { frames: s.frames, avgFps: s.avgFps == null ? null : +s.avgFps.toFixed(1), p95Ms: s.p95Ms == null ? null : +s.p95Ms.toFixed(1), tier: s.tier ?? null };
    });

    // ── C：真实鼠标交互 ──
    const before = await page.evaluate(FN_STATE);
    const scan = await page.evaluate(FN_SCAN, 8);
    rec.scan = scan;
    await page.evaluate(() => window.__v2.setCameraEnabled(true));

    const inter = await runInteraction(page, id, scan);
    rec.interaction = inter;

    await sleep(300);
    await page.evaluate(() => window.__v2.setCameraEnabled(false));
    await sleep(250);
    const f1 = await page.evaluate(() => window.__v2.captureFrame());
    rec.frame1Bytes = await saveB64(FRAMES, `${id}.v2.after.png`, f1);
    rec.px1 = await page.evaluate(FN_ANALYZE, f1);
    rec.frameDiff = await page.evaluate(FN_DIFF, [f0, f1]);
    const after = await page.evaluate(FN_STATE);
    rec.state = { before, after };

    const stateChanged =
      before.text !== after.text || before.hint !== after.hint || before.done !== after.done ||
      (before.tapCount !== after.tapCount) || (before.domBubbles.join('|') !== after.domBubbles.join('|'));
    rec.stateChanged = stateChanged;
    log(`  状态变化: ${stateChanged}  taps ${before.tapCount}→${after.tapCount}  text "${(before.text ?? '').slice(0, 12)}"→"${(after.text ?? '').slice(0, 12)}"`);
    log(`  画面差(前后帧): mean ${rec.frameDiff.mean}  worst ${JSON.stringify(rec.frameDiff.worst[0])}`);
  } catch (e) {
    rec.fatal = String(e).slice(0, 400);
    log(`  ✗ 致命: ${rec.fatal}`);
  }
  audit[id] = rec;
  await page.close();
}

// ═════════════════ D：classic 原版逐场 + 并排比对 ═════════════════
log('\n════════ D · classic 原版逐场截屏 + 与 v2 并排 ════════');
const ctxCls = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await ctxCls.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const orig = Game.prototype.init;
      Game.prototype.init = function () { window.__game = this; return orig.call(this); };
    } catch (e) { window.__gameError = String(e); }
  });
});
const clsPage = await ctxCls.newPage();
const clsErrors = [];
clsPage.on('pageerror', (e) => clsErrors.push(e.message.slice(0, 200)));
await clsPage.goto(`${BASE}/classic/`, { waitUntil: 'load', timeout: 30000 });
await clsPage.waitForTimeout(3600);
const clsReady = await clsPage.evaluate(() => ({ hasGame: !!window.__game, err: window.__gameError ?? null, w: window.__game?.w, h: window.__game?.h }));
log('classic 引导:', JSON.stringify(clsReady), 'pageerror:', clsErrors.length);
findings.D.push({ classicBoot: clsReady, classicPageErrors: clsErrors });

// 交叉验证：S0 用"自然首屏"直接截屏，作为跳场可靠性的锚点
await clsPage.screenshot({ path: join(FRAMES, 'classic.s0.natural.png') }).catch(() => {});

for (let i = 0; i < 13; i++) {
  const id = `s${i}`;
  try {
    await clsPage.evaluate((idx) => {
      const g = window.__game;
      if (!g) return;
      g.scenes[g.currentScene]?.exit?.();
      g.currentScene = idx;
      g.completionTimer = -1;
      g.completionHandled = false;
      g.fadeAlpha = 0;
      g.state = 'playing';
      g.scenes[idx].enter();
      g.updateUI?.();
      g.ps?.clear?.();
    }, i);
    await sleep(1100);
    await clsPage.screenshot({ path: join(FRAMES, `classic.${id}.png`) });
    log(`  classic.${id}.png ✓`);
  } catch (e) {
    log(`  classic ${id} ✗ ${String(e).slice(0, 120)}`);
    findings.D.push({ classicJumpFail: id, err: String(e).slice(0, 200) });
  }
}

// 并排图 + 数值块差（v2 帧 vs classic 截屏）
log('生成并排对比图…');
const imgPage = await ctxCls.newPage();
await imgPage.goto('about:blank');
for (const id of SCENES) {
  try {
    const v2b64 = (await readFile(join(FRAMES, `${id}.v2.png`))).toString('base64');
    const clb64 = (await readFile(join(FRAMES, `classic.${id}.png`))).toString('base64');
    const res = await imgPage.evaluate(async ({ a, b, id }) => {
      const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = `data:image/png;base64,${src}`; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const W = 300, H = Math.round((W * ib.height) / ib.width);
      // 统一尺度
      const norm = (im) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(im, 0, 0, W, H);
        return c;
      };
      const ca = norm(ia), cb = norm(ib);
      // 数值块差
      const da = ca.getContext('2d').getImageData(0, 0, W, H).data;
      const db = cb.getContext('2d').getImageData(0, 0, W, H).data;
      let sum = 0; const blocks = [];
      for (let by = 0; by < 13; by++) {
        for (let bx = 0; bx < 6; bx++) {
          let s = 0, n = 0;
          for (let y = by * Math.floor(H / 13); y < Math.min(H, (by + 1) * Math.floor(H / 13)); y++) {
            for (let x = bx * 50; x < Math.min(W, bx * 50 + 50); x++) {
              const i = (y * W + x) * 4;
              s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
              n++;
            }
          }
          const m = s / n / 3; sum += m;
          blocks.push({ bx, by, d: +m.toFixed(1) });
        }
      }
      blocks.sort((p, q) => q.d - p.d);
      // 并排画布
      const out = document.createElement('canvas');
      out.width = W * 2 + 12; out.height = H + 26;
      const g = out.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
      g.drawImage(cb, 0, 26); g.drawImage(ca, W + 12, 26);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText(`classic (${id})`, 8, 18);
      g.fillText(`v2 (${id})`, W + 20, 18);
      return { dataUrl: out.toDataURL('image/png'), mean: +(sum / blocks.length).toFixed(2), worst: blocks.slice(0, 5) };
    }, { a: v2b64, b: clb64, id });
    await saveB64(COMPARE, `${id}.sidebyside.png`, res.dataUrl);
    audit[id].compare = { meanDiff: res.mean, worst: res.worst };
    log(`  ${id}: 并排图 ✓  块均差 ${res.mean}`);
  } catch (e) {
    log(`  ${id} 并排失败: ${String(e).slice(0, 160)}`);
  }
}
await imgPage.close();
await clsPage.close();

// ═════════════════ E：移动端双视口布局 ═════════════════
log('\n════════ E · 390×844 / 360×780 布局取证 ════════');
const VPS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x780', width: 360, height: 780 },
];
const mobile = {};
for (const vp of VPS) {
  const ctxM = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  mobile[vp.name] = {};
  for (const id of SCENES) {
    const page = await ctxM.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
    try {
      await page.goto(`${BASE}/v2/?scene=${id}&capture=1`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => window.__v2 != null, null, { timeout: 25000 });
      await sleep(500);
      const layout = await page.evaluate(FN_LAYOUT);
      await page.evaluate(() => window.__v2.setCameraEnabled(false));
      await sleep(200);
      const f = await page.evaluate(() => window.__v2.captureFrame());
      await saveB64(MOBILE, `${id}.${vp.name}.png`, f);
      layout.pageErrors = errs;
      mobile[vp.name][id] = layout;
    } catch (e) {
      mobile[vp.name][id] = { fatal: String(e).slice(0, 200) };
    }
    await page.close();
  }
  await ctxM.close();
  log(`  ${vp.name} 完成`);
}

// ═════════════════ G：静态检查（只读源码与产物） ═════════════════
log('\n════════ G · 静态检查 ════════');
const g = { distFiles: [], distTotalMB: 0 };
async function walk(dir, acc) {
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else {
      const s = await stat(p);
      acc.push({ file: relative(ROOT, p), kb: +(s.size / 1024).toFixed(1) });
    }
  }
}
await walk(join(ROOT, 'dist'), g.distFiles);
g.distFiles.sort((a, b) => b.kb - a.kb);
g.distTotalMB = +(g.distFiles.reduce((s, f) => s + f.kb, 0) / 1024).toFixed(2);
g.distTop = g.distFiles.slice(0, 12);
log(`dist 总量 ${g.distTotalMB}MB，文件 ${g.distFiles.length} 个`);

// 场景注册表 / 层序表 / 冒烟覆盖 交叉点数
const mainSrc = await readFile(join(ROOT, 'src', 'main.ts'), 'utf8');
const manifestSrc = await readFile(join(ROOT, 'src', 'bake', 'manifest.ts'), 'utf8');
const smokeSrc = await readFile(join(ROOT, 'scripts', 'smoke-v2.mjs'), 'utf8');
const bakeSrc = await readFile(join(ROOT, 'scripts', 'bake.mjs'), 'utf8');
const sceneFiles = (await readdir(join(ROOT, 'src', 'scenes'))).filter((f) => /^s\d+\.ts$/.test(f)).sort();

const regIds = [...mainSrc.matchAll(/^\s{2}(s\d+):\s*{.*create:/gm)].map((m) => m[1]);
const runtimeIds = [...manifestSrc.matchAll(/^\s{2}(s\d+):\s*{/gm)].map((m) => m[1]);
const closureIds = [...smokeSrc.matchAll(/^\s{4}id:\s*'(s\d+)'/gm)].map((m) => m[1]);
const bakeMatch = bakeSrc.match(/const SCENES = \[([^\]]+)\]/);
const bakeIds = bakeMatch ? bakeMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')) : [];
const layerZKeys = [...manifestSrc.matchAll(/^\s{2}([a-zA-Z]+):\s*-\d/gm)].map((m) => m[1]);
const orderLayers = [
  ...[...manifestSrc.matchAll(/^\s+'([a-zA-Z]+)',?\s*$/gm)].map((m) => m[1]),
  ...[...manifestSrc.matchAll(/LAYER_ORDER = \[([^\]]+)\]/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/['"]/g, ''))),
];
const missingZ = [...new Set(orderLayers.filter((l) => !layerZKeys.includes(l)))];

g.static = {
  sceneFiles, regIds, runtimeIds, closureIds, bakeIds, missingZ,
  regCount: regIds.length, runtimeCount: runtimeIds.length, closureCount: closureIds.length,
  notInClosure: SCENES.filter((s) => !closureIds.includes(s)),
};
log('注册表:', regIds.length, '层序表:', runtimeIds.length, '冒烟CLOSURES:', closureIds.length, 'bake SCENES:', bakeIds.length);
log('CLOSURES 缺席:', g.static.notInClosure.join(','));
log('层序表缺 LAYER_Z 的层:', missingZ.join(',') || '（无）');

// public/bake manifest 计数
const bakeManifests = (await readdir(join(ROOT, 'public', 'bake'))).filter((f) => f.endsWith('.manifest.json'));
g.bakeManifestCount = bakeManifests.length;
const distBakeManifests = (await readdir(join(ROOT, 'dist', 'bake'))).filter((f) => f.endsWith('.manifest.json'));
g.distBakeManifestCount = distBakeManifests.length;

await writeFile(join(OUT, 'audit-raw.json'), JSON.stringify({ audit, mobile, g, findings }, null, 2), 'utf8');
log('\n原始数据已写入 bake-out/audit/audit-raw.json');
await browser.close();

// ═════════════════ 交互驱动（真实鼠标） ═════════════════
async function runInteraction(page, id, scan) {
  const cl = (slot) => scan.clusters.find((c) => c.slot === slot) ?? null;
  const anyCl = () => scan.clusters[0] ?? null;
  const rec = { plan: id, attempts: [] };

  const tap = async (x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const taps = async (x, y, n, gap = 160) => { for (let i = 0; i < n; i++) { await tap(x, y); await sleep(gap); } };

  try {
    if (['s0', 's2', 's5', 's8', 's10', 's11'].includes(id)) {
      // 点按 / 连点型：用扫描热区（s10/s12 无定位热区则用画面中带）
      const c = cl(0) ?? anyCl() ?? { x: scan.w / 2, y: scan.h * 0.45 };
      const n = { s0: 1, s2: 3, s5: 5, s8: 4, s10: 6, s11: 1 }[id];
      rec.plan = `tap×${n} @ (${c.x},${c.y})`;
      await taps(c.x, c.y, n);
    } else if (id === 's1') {
      const c0 = cl(0), c1 = cl(1);
      rec.plan = `tap 屏0(${c0?.x},${c0?.y}) + 屏1(${c1?.x},${c1?.y})`;
      if (c0) await taps(c0.x, c0.y, 1);
      await sleep(300);
      if (c1) await taps(c1.x, c1.y, 1);
    } else if (id === 's12') {
      rec.plan = 'tap×8（无定位热区，沿画面点按）';
      for (let i = 0; i < 8; i++) await tap(scan.w * (0.25 + 0.07 * i), scan.h * 0.35);
    } else if (id === 's3') {
      // 等气泡出齐（最多 4 个，0.8s/个）
      let cur = scan;
      for (let t = 0; t < 20 && (cur.clusters.length < 4); t++) { await sleep(700); cur = await page.evaluate(FN_SCAN, 8); }
      rec.plan = `tap 气泡 ×${cur.clusters.length}`;
      for (const c of cur.clusters) { await tap(c.x, c.y); await sleep(200); }
      rec.scanFinal = cur;
    } else if (id === 's4') {
      // 拖拽花瓣 → 心心（目标取源码常量 0.5,0.42，由验收方独立读码获得）
      const tx = scan.w * 0.5, ty = scan.h * 0.42;
      rec.plan = `drag petal→(${tx},${ty}) ×5`;
      let placedTotal = 0;
      for (let k = 0; k < 5; k++) {
        let cur = await page.evaluate(FN_SCAN, 6);
        let petal = null;
        for (let t = 0; t < 24 && !petal; t++) {
          petal = cur.clusters.find((c) => c.n >= 2) ?? cur.clusters[0] ?? null;
          if (!petal) { await sleep(700); cur = await page.evaluate(FN_SCAN, 6); }
        }
        if (!petal) { rec.attempts.push({ k, fail: 'no petal hotspot' }); continue; }
        await page.mouse.move(petal.x, petal.y);
        await page.mouse.down();
        await page.mouse.move(tx, ty, { steps: 12 });
        await sleep(80);
        await page.mouse.up();
        await sleep(250);
        const st = await page.evaluate(() => window.__v2.scene.tapCount);
        rec.attempts.push({ k, petal, placed: st });
        if (st > placedTotal) placedTotal = st;
        if (st >= 5) break;
      }
    } else if (id === 's6') {
      // 长按抚摸 2.4s（0.5/s → 需 ≥2s）
      const c = cl(0) ?? anyCl() ?? { x: scan.w * 0.5, y: scan.h * 0.5 };
      rec.plan = `hold 2.5s @ (${c.x},${c.y})`;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(2500);
      await page.mouse.up();
    } else if (id === 's7') {
      // 按住 + 50px 内往复 44 次（0.03/次 → 需 ≥34 次）
      const c = cl(0) ?? anyCl() ?? { x: scan.w * 0.55, y: scan.h * 0.5 };
      rec.plan = `wipe @ (${c.x},${c.y}) ×44`;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      for (let i = 0; i < 44; i++) {
        await page.mouse.move(c.x + Math.sin(i * 0.9) * 18, c.y + Math.cos(i * 1.3) * 14, { steps: 1 });
        await sleep(18);
      }
      await page.mouse.up();
    } else if (id === 's9') {
      // 抓男孩(slot0) 拖到女孩(slot1) 左侧 70px（MERGE_GAP=90）
      const boy = cl(0), girl = cl(1);
      if (!boy || !girl) { rec.plan = 'FAIL: 未扫到双角色热区'; return rec; }
      const tx = girl.x - 70, ty = girl.y;
      rec.plan = `drag boy(${boy.x},${boy.y}) → (${tx},${ty})`;
      await page.mouse.move(boy.x, boy.y);
      await page.mouse.down();
      await page.mouse.move(tx, ty, { steps: 14 });
      await sleep(80);
      await page.mouse.up();
    }
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  }
  return rec;
}
