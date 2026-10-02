/**
 * S12「星空终局 · 许愿」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1911-1932 的 S12.render()：
 *
 *   drawSky(navy/purple/purpleLight) → wcWash×2 → drawStars(80 颗, U.T)
 *   → drawPaperTexture → 月亮（wash + 实心圆）→ 男孩女孩（happy+blush）
 *   → 大心（ended 后 pulse = 1 + sin(t*3)*0.1）
 *
 * ⚠️ 大心是 runtimePlaced：ended 前完全不存在，ended 后以场景累计时间 t
 *    做脉冲缩放（game.js:1928-1931）。scale 是 transform，运行时 setScale
 *    表达 —— 贴图按 pulse=1（基准态）烘，box 以心中心对称，锚点即中心，
 *    setScale 时不会偏移。**心画在角色之后**（盖在两人之间），层序表里排最后。
 *
 * ⚠️ 原版 S12 永不 done（没有 done=true 的路径）：ended 后停在心脉冲 +
 *    环境粒子的画面上直到最后。这是终局的正确行为，v2 照抄 —— 场景类
 *    不调 host.onDone()，冒烟的 done 断言对本场跳过（expectDone: false）。
 *
 * ⚠️ 环境粒子（8% star / 5% heart 概率 spawn，ended 后 30 颗 heart burst）
 *    是 ps.spawn 的运行时物，不在 render() 静态画面里 → notBaked。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER, SEED_STARS } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 月亮（game.js:1920） */
const MX = W * 0.8;
const MY = H * 0.15;
const MBOX = 130;
/** 大心（game.js:1930，scale=2 基准态） */
const HEART_X = W * 0.5;
const HEART_Y = H * 0.5;
const HBOX = 260;

export const S12_SPEC = {
  id: 's12',
  overdraw: 0.15,
  anchors: {
    moonX: MX, moonY: MY, heartX: HEART_X, heartY: HEART_Y,
    boyX: W * 0.42, girlX: W * 0.58, actY: H * 0.58,
  },
  notBaked: [
    '环境 star/heart 粒子（8%/5% 概率 spawn，game.js:1902-1903）',
    'ended 后的 30 颗 heart burst（game.js:1908）',
    '星星闪烁（U.T 时变，定格 t=0）',
  ],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '终局夜空（navy → purple → purpleLight）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.navy, C.purple, C.purpleLight),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '两团薰衣草光晕（r200 0.12 / r180 0.1）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.3, h * 0.2, 200, C.lavender, 0.12);
        wcWash(ctx, w * 0.7, h * 0.15, 180, C.lavenderDeep, 0.1);
      },
    },
    {
      name: 'stars',
      mode: 'staged',
      parallax: 0.15,
      pad: 4,
      note: '80 颗星（锁种子，闪烁定格在 U.T=0）',
      draw: (ctx, w, h) => drawStars(ctx, S12_SPEC.extra.stars, 0),
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 只乘到 sky + glow + stars（原版在月亮之前）',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'moon',
      mode: 'staged',
      parallax: 0.4,
      box: { w: MBOX, h: MBOX, originX: MX - MBOX / 2, originY: MY - MBOX / 2 },
      note: '月亮（cream wash r50 0.2 + 实心圆 r25）—— 常显静态，无需 runtimePlaced',
      // ⚠️ box 层的 draw 用全画布设计坐标（transform 已平移掉 box 原点）
      draw: (ctx) => {
        wcWash(ctx, MX, MY, 50, C.cream, 0.2);
        fCircle(ctx, MX, MY, 25, C.cream);
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      note: '男孩（0.42w）+ 女孩（0.58w），都 happy+blush，sc=min(1.3, w/300)',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.42, h * 0.58, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.58, h * 0.58, sc, { expression: 'happy', blush: true });
      },
    },
    {
      name: 'heart',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: HBOX, h: HBOX, originX: HEART_X - HBOX / 2, originY: HEART_Y - HBOX / 2 },
      note: '大心（coral，scale=2 基准，alpha 0.8）—— ended 后 setScale(1+sin(t*3)*0.1) 脉冲',
      // ⚠️ box 层的 draw 用全画布设计坐标 —— 别用 w/2/h/2 碰运气
      draw: (ctx) => drawHeart(ctx, HEART_X, HEART_Y, 2, C.coral, 0.8),
    },
  ],
};

export function bakeS12(opts) {
  // 星场锁种子：真值侧用同一批（prepTruth 覆盖 scene.stars）
  S12_SPEC.extra = { stars: withSeed(SEED_STARS, () => makeStars(W, H, 80, 2.5)) };
  return bakeScene(S12_SPEC, opts);
}
