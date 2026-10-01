/**
 * S4「春暖花开 · 拼一颗心」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1421-1461 的 S4.render()：
 *
 *   drawSky(skyLight/sky/mint) → wcWash×2 → drawPaperTexture
 *   → drawGround(h*.75) → 两棵樱花树 → 目标心轮廓（placed<max 时）
 *   → 已放置花瓣（环形排列）→ 下落花瓣（椭圆，size 8-14）→ 双人
 *
 * ⚠️ 纸纹在**地面之前**（原版 1427 行），所以 paper 只乘天空 + 光晕。
 *
 * 三个 runtimePlaced 层（位置/显隐由运行时状态决定）：
 *   heartOutline —— 目标心轮廓，放满 5 片后隐藏
 *   petalPlaced  —— 单片已放置花瓣，运行时按 (i/max)*2π 环形摆 5 个
 *   petalFall    —— 下落花瓣，贴图取中等 size，运行时 setScale 出 8–14 的差
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 目标心（原版 update 里设的，game.js:1408） */
const TARGET_X = W / 2;
const TARGET_Y = H * 0.42;
/** 单花瓣工作画布（以花瓣自身中心为锚点） */
const PBOX = 60;
/** 下落花瓣中位 size（运行时按 8–14 缩放） */
const PETAL_MID = 11;

export const S4_SPEC = {
  id: 's4',
  overdraw: 0.15,
  anchors: { targetX: TARGET_X, targetY: TARGET_Y },
  notBaked: ['花瓣拖拽状态', '花瓣下落物理', '粒子（heart）', '环境花瓣自动生成'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '春日天空（skyLight → sky → mint）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.skyLight, C.sky, C.mint),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '樱花粉 / 蜜色两团光',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.3, h * 0.2, 200, C.sakura, 0.12);
        wcWash(ctx, w * 0.7, h * 0.25, 180, C.honey, 0.08);
      },
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 只乘到 sky + glow（原版在地面之前）',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'ground',
      mode: 'staged',
      parallax: 0.45,
      pad: 4,
      note: '草地（h*.75 以下）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.75, C.mint, C.mintDeep),
    },
    {
      name: 'trees',
      mode: 'staged',
      parallax: 0.5,
      pad: 8,
      note: '左右两棵樱花树（×1.5）',
      draw: (ctx, w, h) => {
        drawTree(ctx, w * 0.15, h * 0.6, 1.5, C.sakura);
        drawTree(ctx, w * 0.85, h * 0.6, 1.5, C.sakura);
      },
    },
    {
      name: 'heartOutline',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: 200, h: 200, originX: TARGET_X - 100, originY: TARGET_Y - 100 },
      note: '目标心轮廓（alpha 0.2），放满后隐藏',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.globalAlpha = 0.2;
        drawHeart(ctx, w / 2, h * 0.42, 2, C.sakuraDeep, 0.3);
        ctx.restore();
      },
    },
    {
      name: 'petalPlaced',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      runtimePlaced: true,
      box: { w: PBOX, h: PBOX, originX: TARGET_X - PBOX / 2, originY: TARGET_Y - PBOX / 2 },
      note: '单片「已放置」花瓣（运行时按环形角度摆 5 个）',
      draw: (ctx, w, h) => {
        drawHeart(ctx, w / 2, h * 0.42, 0.6, C.sakuraDeep, 0.8);
      },
    },
    {
      name: 'petalFall',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      runtimePlaced: true,
      box: { w: PBOX, h: PBOX, originX: TARGET_X - PBOX / 2, originY: TARGET_Y - PBOX / 2 },
      note: `下落花瓣（椭圆，中位 size ${PETAL_MID}，运行时按 8–14 缩放 + 旋转）`,
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.translate(w / 2, h * 0.42);
        ctx.fillStyle = C.sakura;
        ctx.beginPath();
        ctx.ellipse(0, 0, PETAL_MID * 0.6, PETAL_MID, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '男孩（左）+ 女孩（右），happy + blush',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.4, w / 280);
        drawBoy(ctx, w * 0.35, h * 0.58, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.65, h * 0.58, sc, { expression: 'happy', blush: true });
      },
    },
  ],
};

export function bakeS4(opts) {
  return bakeScene(S4_SPEC, opts);
}
