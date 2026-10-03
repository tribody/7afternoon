/**
 * 连播取证：把整个故事从头玩到尾，沿途拍几张。
 *
 * 冒烟只能证明"状态机跳对了"，证明不了"看起来像在看故事"。
 * 这个脚本产出**整页截图**，肉眼能确认：画面在换、文案在换、
 * 右侧进度点在一格一格往前走。
 *
 * ⚠️ 本项目一号坑：`page.screenshot()` 抓不到 WebGL（默认丢绘制缓冲）。
 *    必须带 `?capture=1` 打开 preserveDrawingBuffer。
 * ⚠️ 每一幕都要等 `flowState === 'playing'` 再动手 —— 过场期间点按会被
 *    SceneManager 吞掉（照抄原版只在 playing 态转发的语义）。
 *
 * 用法：node scripts/shot-flow.mjs [端口]
 * 产出：bake-out/flow/
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { playScene } from './scene-interact.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'bake-out', 'flow');
await mkdir(OUT, { recursive: true });

const BASE = `http://127.0.0.1:${process.argv[2] ?? 4173}`;
/** 这几幕停下来拍照：开场 / 心动 / 蜜月 / 失业 / 终局 */
const SHOT_AT = new Set([0, 2, 5, 7, 12]);

const b = await chromium.launch({
  args: ['--no-proxy-server', '--force-color-profile=srgb', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});

await p.goto(`${BASE}/v2/?capture=1`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__v2?.scene, null, { timeout: 20000 });

for (let guard = 0; guard < 16; guard++) {
  await p.waitForFunction(() => window.__v2.flowState === 'playing', null, { timeout: 15000 });

  const cur = await p.evaluate(() => ({
    id: window.__v2.sceneId,
    idx: window.__v2.sceneIndex,
    total: window.__v2.sceneOrder.length,
  }));

  if (SHOT_AT.has(cur.idx)) {
    // 等入场动画展开 + 首段文案淡入，再拍 —— 拍到的是"正在讲的那一刻"
    await p.waitForTimeout(2800);
    const text = await p.evaluate(() => document.querySelector('.scene-text')?.textContent ?? '');
    await p.screenshot({ path: join(OUT, `${String(cur.idx).padStart(2, '0')}-${cur.id}.png`) });
    console.log(`[${cur.idx + 1}/${cur.total}] ${cur.id}  "${text}"`);
  }

  if (cur.idx >= cur.total - 1) break;

  await p.waitForTimeout(2800); // 让入场动画走完（S3 的气泡要 2.4s 才齐）
  await p.evaluate(playScene, cur.id);

  await p
    .waitForFunction(() => window.__v2.scene?.done === true, null, { timeout: 10000 })
    .catch(() => {});
  const moved = await p
    .waitForFunction((prev) => window.__v2.sceneIndex > prev, cur.idx, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!moved) {
    console.log(`⚠️ 第 ${cur.idx + 1} 幕 ${cur.id} 没能流转，停在原地`);
    break;
  }
}

// 终幕：点满 8 次出大心，拍最后一张
await p.evaluate(playScene, 's12');
await p.waitForTimeout(1400);
const final = await p.evaluate(() => ({
  text: document.querySelector('.scene-text')?.textContent ?? '',
  heart: window.__v2.scene?.heartVisible?.() ?? null,
}));
await p.screenshot({ path: join(OUT, `13-s12.ending.png`) });
console.log(`[13/13] s12 终幕  "${final.text}"  大心=${final.heart}`);
console.log(`\n产出目录：${OUT}   报错 ${errs.length} 条${errs.length ? `：${errs[0]}` : ''}`);

await b.close();
