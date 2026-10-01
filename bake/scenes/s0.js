/**
 * S0「星空开场 · 一封信」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1059-1104 的 S0.render()：
 *
 *   drawSky(navy/purple/purpleLight) → wcWash×2 → drawStars(stars, U.T)
 *   → drawPaperTexture → 浮动信封（translate+scale1.5；未打开态封印+心）
 *
 * ⚠️ 信封是 **runtimePlaced**：原版 update 把 envY 从 -100 lerp 到 h*0.4，
 *    再叠 sin(t*2)*8 的浮动。静态层无法表达，所以烘成一张
 *    「锚点 == 贴图中心」的贴图（工作画布以锚点为中心对称），
 *    运行时按 setCenter 摆位 —— 与 S3 气泡同一套路，但锚点不是 0.5。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER, SEED_STARS } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 信封锚点：update 把 envY lerp 到这里（game.js:1056） */
const ENV_CX = W / 2;
const ENV_CY = H * 0.4;
/** 工作画布边长：以锚点为中心对称 → 贴图中心即锚点 */
const BOX = 200;

export const S0_SPEC = {
  id: 's0',
  overdraw: 0.15,
  anchors: { envX: ENV_CX, envY: ENV_CY },
  notBaked: ['打开后的 sparkle burst（8 点）', '环境 star 粒子（ps.spawn）', '信封浮动 sin(t*2)*8'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '夜空渐变（navy → purple → purpleLight）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.navy, C.purple, C.purpleLight),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '两团薰衣草光晕（r200 / r180）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.3, h * 0.2, 200, C.lavender, 0.15);
        wcWash(ctx, w * 0.7, h * 0.15, 180, C.lavenderDeep, 0.1);
      },
    },
    {
      name: 'stars',
      mode: 'staged',
      parallax: 0.15,
      pad: 4,
      note: '60 颗星（锁种子，闪烁定格在 U.T=0）',
      draw: (ctx, w, h) => drawStars(ctx, S0_SPEC.stars, 0),
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 只乘到 sky + glow + stars 上',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'envelope',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: BOX, h: BOX, originX: ENV_CX - BOX / 2, originY: ENV_CY - BOX / 2 },
      note: '浮动信封（未打开态：阴影 + 信封 + 封印 + 心），锚点即贴图中心',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.translate(w / 2, h * 0.4);
        ctx.scale(1.5, 1.5);
        drawShadow(ctx, 0, 45, 35, 8);
        fRR(ctx, -30, -20, 60, 42, 8, C.cream);
        ctx.fillStyle = C.peach;
        ctx.beginPath();
        ctx.moveTo(-30, -20);
        ctx.lineTo(0, -2);
        ctx.lineTo(30, -20);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.filter = 'blur(1px)';
        fCircle(ctx, 0, -10, 10, C.coral);
        ctx.restore();
        drawHeart(ctx, 0, -12, 0.8, C.cream, 0.9);
        ctx.restore();
      },
    },
    {
      // 「已拆封」态：封印与心消失，信封本体留在原位（原版 game.js:1090-1100
      // 改为在封印处爆 8 个 sparkle）。初始隐藏，命中后显隐切换。
      name: 'envelopeOpen',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: BOX, h: BOX, originX: ENV_CX - BOX / 2, originY: ENV_CY - BOX / 2 },
      note: '信封「已拆封」态（无封印/无心）—— 初始隐藏',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.translate(w / 2, h * 0.4);
        ctx.scale(1.5, 1.5);
        drawShadow(ctx, 0, 45, 35, 8);
        fRR(ctx, -30, -20, 60, 42, 8, C.cream);
        ctx.fillStyle = C.peach;
        ctx.beginPath();
        ctx.moveTo(-30, -20);
        ctx.lineTo(0, -2);
        ctx.lineTo(30, -20);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      },
    },
  ],
};

export function bakeS0(opts) {
  // 星场必须锁种子：真值侧复用同一批（prepTruth），否则位置差会淹没结构差异
  S0_SPEC.stars = withSeed(SEED_STARS, () => makeStars(W, H, 60, 2.5));
  return bakeScene(S0_SPEC, opts);
}
