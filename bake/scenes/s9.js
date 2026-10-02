/**
 * S9「争吵 · 把他们拖到一起」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1748-1773 的 S9.render()：
 *
 *   drawSky(navy/navyLight/purple) → wcWash×2 → drawPaperTexture
 *   → drawGround(h*.72) → 距离虚线（仅未和好时）→ 男孩 → 女孩
 *
 * ⚠️ 这一场的两个角色要**分别拖动**，而且表情随 merged 在 sad / happy+blush
 *    之间切换 —— 表情是画出来的，没法用 transform 表达，所以四个态各烘一层：
 *    boySad / girlSad / boyHappy / girlHappy，运行时两两切显隐。
 *    四张贴图都是同一个角色函数烘的，差别只在 expression / blush 两个参数。
 *
 * ⚠️ 距离虚线横跨两人（game.js:1757-1763），长度随拖动变化。不烘：
 *    烘出来的固定长度会被 scaleX 拉伸虚线间距（视觉失真），改走 DOM
 *    （border-top dashed + 动态宽度），既是矢量的又不占显存。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 初值与站点（game.js:1742-1745） */
const BOY_X = W * 0.2;
const GIRL_X = W * 0.8;
const ACT_Y = H * 0.52;

export const S9_SPEC = {
  id: 's9',
  overdraw: 0.15,
  anchors: { boyX: BOY_X, girlX: GIRL_X, actY: ACT_Y, targetX: W * 0.5 },
  notBaked: ['拖拽与靠拢动画', '距离虚线（运行时 DOM）', '和好后的 heart 粒子'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '冷蓝（navy → navyLight → purple）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.navy, C.navyLight, C.purple),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '左右两团各自的光（navy r200 / purple r200）—— 各站一头，中间是空的',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.3, h * 0.3, 200, C.navy, 0.08);
        wcWash(ctx, w * 0.7, h * 0.3, 200, C.purple, 0.08);
      },
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 只乘到 sky + glow',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'ground',
      mode: 'staged',
      parallax: 0.45,
      pad: 4,
      note: '地面（h*.72 以下，purple → navy）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.purple, C.navy),
    },
    {
      name: 'boySad',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '男孩「沉默」态（sad，无腮红）—— 初值 0.2w',
      draw: (ctx, w, h) => drawBoy(ctx, w * 0.2, h * 0.52, Math.min(1.2, w / 320), { expression: 'sad' }),
    },
    {
      name: 'girlSad',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '女孩「沉默」态（sad，无腮红）—— 初值 0.8w',
      draw: (ctx, w, h) => drawGirl(ctx, w * 0.8, h * 0.52, Math.min(1.2, w / 320), { expression: 'sad' }),
    },
    {
      name: 'boyHappy',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '男孩「和好」态（happy + blush）—— 初始隐藏',
      draw: (ctx, w, h) =>
        drawBoy(ctx, w * 0.2, h * 0.52, Math.min(1.2, w / 320), { expression: 'happy', blush: true }),
    },
    {
      name: 'girlHappy',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '女孩「和好」态（happy + blush）—— 初始隐藏',
      draw: (ctx, w, h) =>
        drawGirl(ctx, w * 0.8, h * 0.52, Math.min(1.2, w / 320), { expression: 'happy', blush: true }),
    },
  ],
};

export function bakeS9(opts) {
  return bakeScene(S9_SPEC, opts);
}
