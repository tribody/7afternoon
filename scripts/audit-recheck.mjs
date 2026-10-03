/**
 * 独立复审取证脚本（只读，不改任何源码/配置）
 *
 * 目标：回答四个问题
 *  Q1 叙事文字用户在屏幕上看得见吗？（整页截图 + computed opacity + 祖先链爬升）
 *  Q2 13 场能不能不手动改 URL 从第 1 场玩到第 13 场？
 *  Q3 「看着对、其实没生效」的元素逐个三态判定：代码里 / DOM 里 / 屏幕上真看得见
 *  Q4 新引入问题：报错、白屏、布局溢出；两个移动视口
 *
 * 用法：
 *   export PATH="/c/Users/hcton/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:$PATH"
 *   "C:/Users/hcton/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" scripts/audit-recheck.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'bake-out', 'audit2');
const BASE = 'http://127.0.0.1:4173/v2/';

const SCENES = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];
const VIEWPORTS = [
  { name: '390x844', w: 390, h: 844 },
  { name: '360x780', w: 360, h: 780 },
];

fs.mkdirSync(OUT, { recursive: true });

// ── 页内探针（在浏览器里跑）──────────────────────────────────
const PROBE = `(() => {
  const v = window.__v2;
  const q = (s) => document.querySelector(s);

  // 祖先链爬升：元素自身的 computed display 不会因为祖先 none 而变 none，必须爬
  const chainOf = (el) => {
    const out = [];
    let n = el;
    let guard = 0;
    while (n && n.nodeType === 1 && guard++ < 40) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      out.push({
        tag: n.tagName.toLowerCase(),
        id: n.id || '',
        cls: String(n.className || '').slice(0, 60),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        hidden: n.hasAttribute('hidden'),
        zIndex: cs.zIndex,
        position: cs.position,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      });
      n = n.parentElement;
    }
    return out;
  };

  const elState = (sel) => {
    const el = q(sel);
    if (!el) return { sel, exists: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const chain = chainOf(el);
    const blockers = chain.filter((c) =>
      c.display === 'none' || c.visibility === 'hidden' || c.visibility === 'collapse' || c.hidden || Number(c.opacity) === 0
    );
    return {
      sel,
      exists: true,
      textContent: (el.textContent || '').trim(),
      computed: {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        color: cs.color,
        fontSize: cs.fontSize,
        zIndex: cs.zIndex,
      },
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
      classes: String(el.className || ''),
      childCount: el.children.length,
      chain,
      blockers,
      // 综合判定：屏幕上真看得见
      visible: blockers.length === 0 && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0 &&
               r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
    };
  };

  // WebGL 画面统计：区分「没画」和「画了但没抓到」
  const canvasStats = () => {
    const c = q('#game-canvas');
    if (!c) return null;
    const t = document.createElement('canvas');
    t.width = 64; t.height = 128;
    const g = t.getContext('2d');
    try { g.drawImage(c, 0, 0, 64, 128); } catch (e) { return { error: String(e) }; }
    const d = g.getImageData(0, 0, 64, 128).data;
    let sum = 0, min = 255, max = 0;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += l; if (l < min) min = l; if (l > max) max = l;
      set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
    }
    return { mean: +(sum / (d.length / 4)).toFixed(2), min: +min.toFixed(1), max: +max.toFixed(1), colors: set.size };
  };

  const layout = {
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    docScrollW: document.documentElement.scrollWidth,
    docScrollH: document.documentElement.scrollHeight,
    bodyScrollW: document.body.scrollWidth,
    bodyScrollH: document.body.scrollHeight,
  };
  layout.overflowX = layout.docScrollW > layout.innerW + 1;
  layout.overflowY = layout.docScrollH > layout.innerH + 1;

  return {
    v2Keys: v ? Object.keys(v) : null,
    sceneId: v ? v.sceneId : null,
    sceneText: v && v.scene ? String(v.scene.text ?? '') : null,
    sceneHint: v && v.scene ? String(v.scene.hint ?? '') : null,
    sceneDone: v && v.scene ? Boolean(v.scene.done) : null,
    renderInfo: v && v.renderInfo ? v.renderInfo() : null,
    ui: {
      overlay: elState('#ui-overlay'),
      loading: elState('#loading-screen'),
      sceneText: elState('#scene-text'),
      hintText: elState('#hint-text'),
      progressDots: elState('#progress-dots'),
      musicBtn: elState('#music-btn'),
      fault: elState('#fault-notice'),
      bubbleLayer: elState('#bubble-layer'),
    },
    canvasStats: canvasStats(),
    layout,
    href: location.href,
  };
})()`;

const FIND_HOTSPOT = `(() => {
  const v = window.__v2;
  const W = window.innerWidth, H = window.innerHeight;
  const hits = [];
  for (let fy = 0.12; fy <= 0.92; fy += 0.04) {
    for (let fx = 0.08; fx <= 0.94; fx += 0.04) {
      const x = Math.round(fx * W), y = Math.round(fy * H);
      const r = v.hitTestAt(x, y);
      if (r && r.slot >= 0) hits.push({ x, y, slot: r.slot });
    }
  }
  return hits;
})()`;

// ── 通用交互驱动：点 + 抖动 + 拖向中心，覆盖 tap / 按住累积 / 拖拽三类 ──
async function drive(page, hits, W, H) {
  const cx = Math.round(W / 2), cy = Math.round(H / 2);
  const picks = [];
  if (hits.length) {
    const bySlot = new Map();
    for (const h of hits) {
      if (!bySlot.has(h.slot)) bySlot.set(h.slot, h);
    }
    picks.push(...[...bySlot.values()].slice(0, 6));
  }
  picks.push({ x: cx, y: cy, slot: 0 });
  picks.push({ x: Math.round(W * 0.5), y: Math.round(H * 0.45), slot: 0 });

  for (const p of picks) {
    // A. 点按
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.waitForTimeout(40);
      await page.mouse.up();
      await page.waitForTimeout(80);
    }
    // B. 原地抖动（按住累积类：S6 抚摸 / S7 擦泪）
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 4;
      await page.mouse.move(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
    await page.waitForTimeout(60);
    // C. 拖向中心（拖拽类：S4 拼心 / S9 拖到一起）
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      await page.mouse.move(Math.round(p.x + (cx - p.x) * t), Math.round(p.y + (cy - p.y) * t));
      await page.waitForTimeout(14);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 4;
      await page.mouse.move(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
}

async function runViewport(browser, vp) {
  const results = [];
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  for (const sid of SCENES) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

    const url = `${BASE}?scene=${sid}&capture=1`;
    const rec = { scene: sid, viewport: vp.name, url };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('window.__v2 !== undefined', null, { timeout: 30000 });
      // 800ms 点亮 UI + 400ms 换字 + 800ms 淡入
      await page.waitForTimeout(2200);

      rec.start = await page.evaluate(PROBE);
      const shotStart = path.join(OUT, `${sid}-${vp.name}-start.png`);
      await page.screenshot({ path: shotStart, fullPage: true });
      rec.shotStart = `bake-out/audit2/${path.basename(shotStart)}`;

      // 找热点并驱动交互
      const hits = await page.evaluate(FIND_HOTSPOT);
      rec.hotspotCount = hits.length;
      rec.hotspotSample = hits.slice(0, 3);
      await drive(page, hits, vp.w, vp.h);
      await page.waitForTimeout(1800);

      rec.after = await page.evaluate(PROBE);
      const shotAfter = path.join(OUT, `${sid}-${vp.name}-after.png`);
      await page.screenshot({ path: shotAfter, fullPage: true });
      rec.shotAfter = `bake-out/audit2/${path.basename(shotAfter)}`;

      // Q2：完成后场景是否自动流转
      rec.progression = await page.evaluate(() => {
        const v = window.__v2;
        return {
          sceneIdBefore: v.sceneId,
          href: location.href,
          hasNextFn: Object.keys(v).filter((k) => /next|goto|advance|transit|switch/i.test(k)),
        };
      });
      await page.waitForTimeout(1500);
      rec.progressionAfter = await page.evaluate(() => ({
        sceneId: window.__v2.sceneId,
        href: location.href,
        done: Boolean(window.__v2.scene.done),
      }));
    } catch (e) {
      rec.error = String(e && e.message ? e.message : e);
    }
    rec.consoleErrors = consoleErrors.slice(0, 12);
    rec.pageErrors = pageErrors.slice(0, 12);
    await page.close();
    results.push(rec);
    console.error(`  · ${sid} @${vp.name} done=${rec.after?.sceneDone ?? '?'} textVis=${rec.after?.ui?.sceneText?.visible ?? '?'}`);
  }

  await ctx.close();
  return results;
}

// ── Q3：音乐按钮专项（真实点击 + 监听器探测）──────────────────
async function musicProbe(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?scene=s0&capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__v2 !== undefined', null, { timeout: 30000 });
  await page.waitForTimeout(2200);

  const out = {};
  out.before = await page.evaluate(() => {
    const b = document.querySelector('#music-btn');
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      exists: !!b,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, opacity: cs.opacity, visibility: cs.visibility, pointerEvents: cs.pointerEvents,
      classes: b.className,
      // 顶层命中测试：这个点上真正能接到事件的是谁
      elementAtPoint: (() => {
        const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        return el ? `${el.tagName.toLowerCase()}#${el.id}.${String(el.className)}` : null;
      })(),
      // 有没有 audio / 音乐 API
      audioEls: document.querySelectorAll('audio').length,
      audioCtxInV2: window.__v2 ? Object.keys(window.__v2).filter((k) => /audio|music|sound|bgm/i.test(k)) : [],
    };
  });

  // 真机点击：先看有没有任何可观测变化
  await page.mouse.click(
    out.before.rect.x + out.before.rect.w / 2,
    out.before.rect.y + out.before.rect.h / 2,
  );
  await page.waitForTimeout(400);
  out.afterClick = await page.evaluate(() => {
    const b = document.querySelector('#music-btn');
    return { classes: b.className, audioEls: document.querySelectorAll('audio').length };
  });
  await page.screenshot({ path: path.join(OUT, 'q3-musicbtn-390x844.png'), fullPage: true });

  // 源码里到底有没有绑定（查 __v2 与全局）：用 CDP 拿不到，改为看元素上有没有 React 式属性 + 页面里有没有 addEventListener 证据
  out.listenerEvidence = await page.evaluate(() => {
    // 通过临时劫持判断：重新派发一次 click，看是否有任何 JS 副作用（无法直接枚举监听器）
    return { note: '无法从运行时枚举 addEventListener 监听器；结论以静态搜索 src/ 为准' };
  });

  // 进度点专项
  out.dots = await page.evaluate(() => {
    const d = document.querySelector('#progress-dots');
    const r = d.getBoundingClientRect();
    return {
      exists: !!d,
      childCount: d.children.length,
      innerHTML: d.innerHTML,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });

  await ctx.close();
  return out;
}

// ── main ──────────────────────────────────────────────────────
const browser = await chromium.launch();
const report = { generatedAt: new Date().toISOString(), base: BASE, viewports: {} };

for (const vp of VIEWPORTS) {
  console.error(`=== ${vp.name} ===`);
  report.viewports[vp.name] = await runViewport(browser, vp);
}

console.error('=== Q3 music/dots ===');
report.music = await musicProbe(browser);

await browser.close();

fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(report, null, 2), 'utf8');
console.error('written: ' + path.join(OUT, 'evidence.json'));
