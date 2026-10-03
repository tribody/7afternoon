/**
 * 修复取证：剧情文案是否真的看得见。
 *
 * 背景：2026-10-03 独立验收抓到 v2 的剧情文案**全程不可见** ——
 * `#ui-overlay` 从来没被 `display:block` 点亮。修完之后，
 * 冒烟断言（computed opacity / rect）只能证明"元素在盒模型里",
 * 证明不了"眼睛能看到"。这个脚本产出**整页截图**作为肉眼证据。
 *
 * ⚠️ 本项目的一号坑：`page.screenshot()` 抓不到 WebGL（默认丢绘制缓冲）。
 *    必须带 `?capture=1` 打开 `preserveDrawingBuffer`，画面才进得了截图。
 *
 * 用法：node scripts/shot-verify.mjs
 * 产出：bake-out/verify/*.png
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'bake-out', 'verify');
await mkdir(OUT, { recursive: true });

/** 挑 4 场取证：开场 / 文本最密 / 交互最复杂 / 终局 */
const SHOTS = ['s0', 's3', 's9', 's12'];

const b = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const id of SHOTS) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  await p.goto(`http://127.0.0.1:4173/v2/?scene=${id}&capture=1`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__v2?.scene, null, { timeout: 20000 });
  await p.waitForTimeout(2200); // 过加载屏 800ms 淡出 + 首段文案 800ms 淡入

  // 按各场的原版交互把它点完 —— "完成文案"才是情感落点，也最值得取证
  const tapped = await p.evaluate(async () => {
    const v = window.__v2;
    const s = v.scene;
    const { w, h } = v.viewport();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    if (s.envelopeDesignPosition) {
      const pt = s.envelopeDesignPosition();
      v.tapAt(pt.x, pt.y);
    } else if (s.screenDesignPositions) {
      for (const pt of s.screenDesignPositions()) v.tapAt(pt.x, pt.y);
    } else if (s.heartDesignPosition) {
      const pt = s.heartDesignPosition();
      for (let i = 0; i < 3; i++) {
        v.tapAt(pt.x, pt.y);
        await sleep(30);
      }
    } else if (s.bubbleDesignPositions) {
      for (const bp of s.bubbleDesignPositions()) v.tapAt(bp.x, bp.y);
    } else if (s.actorDesignPositions) {
      const a = s.actorDesignPositions();
      v.tapAt(a.boyX, a.y);
      v.moveAt(a.girlX - 70, a.y);
      v.releaseAt(a.girlX - 70, a.y);
    } else {
      for (let i = 0; i < 8; i++) {
        v.tapAt(w * 0.5, h * 0.4);
        await sleep(20);
      }
    }
    await sleep(60);
  });
  void tapped;

  // 等完成文案真正淡入到位（各场 done 判定不一，统一给足时间）
  await p
    .waitForFunction(
      () => {
        const el = document.querySelector('.scene-text');
        return !!el && Number(getComputedStyle(el).opacity) > 0.99 && (el.textContent ?? '').trim().length > 0;
      },
      null,
      { timeout: 6000 },
    )
    .catch(() => {});
  await p.waitForTimeout(400);

  const label = await p.evaluate(() => {
    const el = document.querySelector('.scene-text');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent ?? '',
      opacity: Number(getComputedStyle(el).opacity),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    };
  });

  await p.screenshot({ path: join(OUT, `${id}.v2.png`) });
  console.log(
    `${id}: "${label?.text}"  opacity=${label?.opacity}  rect=${JSON.stringify(label?.rect)}  errs=${errs.length}`,
  );
  await p.close();
}

await b.close();
console.log(`产出目录：${OUT}`);
