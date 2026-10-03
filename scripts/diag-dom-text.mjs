/**
 * 临时诊断：剧情文案元素为什么 getBoundingClientRect = 0×0。
 *
 * 冒烟新加的"用户可见性闸门"报 13 场文案 rect 全为 0，
 * 但 computed opacity=1、textContent 非空 —— 典型症状是
 * **祖先链上有 display:none**（computed display 显示的是元素自身的计算值，
 * 不会因为祖先 none 而变成 none，所以必须逐层向上爬）。
 *
 * 用法：node scripts/diag-dom-text.mjs [sceneId]
 */
import { chromium } from 'playwright';

const sceneId = process.argv[2] ?? 's3';
const b = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto(`http://127.0.0.1:4173/v2/?scene=${sceneId}&capture=1`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__v2 && window.__v2.scene, null, { timeout: 20000 });
await p.waitForTimeout(1200);

const r = await p.evaluate(() => {
  const el = document.querySelector('.scene-text');
  const chain = [];
  let n = el;
  let idx = 0;
  while (n && idx < 12) {
    const cs = getComputedStyle(n);
    const bb = n.getBoundingClientRect();
    chain.push({
      tag: n.tagName,
      cls: n.className,
      id: n.id,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      rect: [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)],
      inline: n.getAttribute('style'),
    });
    n = n.parentElement;
    idx++;
  }
  return {
    chain,
    text: el.textContent,
    offsetSize: [el.offsetWidth, el.offsetHeight],
    clientSize: [el.clientWidth, el.clientHeight],
  };
});

console.log(`scene=${sceneId}  text="${r.text}"  offsetSize=${r.offsetSize}`);
for (const c of r.chain) {
  console.log(
    `  <${c.tag} class="${c.cls}" id="${c.id}"> display=${c.display} vis=${c.visibility} op=${c.opacity} rect=${c.rect} style="${c.inline ?? ''}"`,
  );
}
await b.close();
