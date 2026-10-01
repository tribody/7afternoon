/**
 * S6「养猫 · 抚摸」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1566-1604 的 S6.render()：
 *
 *   drawSky(peachDeep/honey/cream) → wcWash×2 → drawPaperTexture
 *   → drawGround(h*.72) → 猫爬架 → 窗户（blur 2px）
 *   → 猫（expression 随 petting 切 curious/enjoy，purr 抖动）
 *   → 抚摸进度环（petting 时）→ 双人
 *
 * ⚠️ 猫是 runtimePlaced 且**两态**：curious（未摸）与 enjoy（抚摸中）。
 *    两态各烘一层，运行时切显隐 —— 表情是画出来的，没法用 transform 表达。
 *    眨眼 catBlink = sin(t*0.5)>0.95 定格在 false（不闭眼）那一帧。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;
/** 猫的位置（原版 update 里设的，game.js:1562） */
const CAT_X = W * 0.5;
const CAT_Y = H * 0.6;
const CBOX = 200;

export const S6_SPEC = {
  id: 's6',
  overdraw: 0.15,
  anchors: { catX: CAT_X, catY: CAT_Y },
  notBaked: ['抚摸进度与进度环（运行时 DOM 环）', 'purr 抖动（运行时位移）', '眨眼', '粒子（heart/sparkle）'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '暖色室内（peachDeep → honey → cream）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.peachDeep, C.honey, C.cream),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '室内两团暖光（honey r300 / coral r150）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.5, h * 0.3, 300, C.honey, 0.12);
        wcWash(ctx, w * 0.2, h * 0.4, 150, C.coral, 0.08);
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
      note: '木地板（h*.72 以下）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.warmBrown, C.darkBrown),
    },
    {
      name: 'furniture',
      mode: 'staged',
      parallax: 0.5,
      pad: 10,
      note: '猫爬架（柱 + 顶球）+ 窗户（blur 2px）',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.fillStyle = C.warmBrown;
        fRR(ctx, w * 0.8 - 5, h * 0.4, 10, h * 0.32, 3, C.warmBrown);
        fCircle(ctx, w * 0.8, h * 0.4, 18, C.warmBrown);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = C.rgba(C.skyLight, 0.3);
        ctx.filter = 'blur(2px)';
        fRR(ctx, w * 0.1, h * 0.1, w * 0.2, h * 0.3, 10, C.rgba(C.skyLight, 0.3));
        ctx.restore();
      },
    },
    {
      name: 'catIdle',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      box: { w: CBOX, h: CBOX, originX: CAT_X - CBOX / 2, originY: CAT_Y - CBOX / 2 },
      note: '猫「好奇」态（未抚摸，blink=false）',
      draw: (ctx, w, h) => {
        drawCat(ctx, w / 2, h * 0.6, 1.8, { expression: 'curious', blink: false });
      },
    },
    {
      name: 'catEnjoy',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      box: { w: CBOX, h: CBOX, originX: CAT_X - CBOX / 2, originY: CAT_Y - CBOX / 2 },
      note: '猫「享受」态（抚摸中）—— 初始隐藏',
      draw: (ctx, w, h) => {
        drawCat(ctx, w / 2, h * 0.6, 1.8, { expression: 'enjoy', blink: false });
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '男孩（左）+ 女孩（右），happy（女孩 blush）',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.2, w / 320);
        drawBoy(ctx, w * 0.2, h * 0.55, sc, { expression: 'happy' });
        drawGirl(ctx, w * 0.8, h * 0.55, sc, { expression: 'happy', blush: true });
      },
    },
  ],
};

export function bakeS6(opts) {
  return bakeScene(S6_SPEC, opts);
}
