/**
 * S2「剧本杀 · 心跳藏不住」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1281-1317 的 S2.render()：
 *
 *   drawSky(navy/purple/purpleLight) → wcWash×2 → drawPaperTexture
 *   → drawGround(h*.72) → 5 张卡牌（随机 rot）→ 心跳光晕 + 双层心 → 双人
 *
 * ⚠️ 两张随机牌必须锁种子：卡牌 rot 走 U.rand(-0.2, 0.2)，真值侧要复用
 *    同一批（prepTruth），否则 5 张半透明牌的旋转差会变成结构性差异。
 *    → 放进 spec.extra.cards，透传给真值侧。
 *
 * ⚠️ 心跳是 runtimePlaced：heartScale = 1 + sin(beatT*4)*0.15（game.js:1277），
 *    烘的是 scale=1 那一帧，运行时按同一公式缩放整层（光晕随之缩放，与原版一致）。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER, SEED_STARS } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 心跳锚点（game.js:1303） */
const HX = W / 2;
const HY = H * 0.42;
const HBOX = 200;

export const S2_SPEC = {
  id: 's2',
  overdraw: 0.15,
  anchors: { heartX: HX, heartY: HY },
  notBaked: ['心跳缩放 sin(beatT*4)*0.15（运行时复现）', '粒子（heart/sparkle）'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '昏暗戏剧氛围（navy → purple → purpleLight）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.navy, C.purple, C.purpleLight),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '两团氛围光（coral r250 / lavender r150）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.5, h * 0.4, 250, C.coral, 0.12);
        wcWash(ctx, w * 0.2, h * 0.3, 150, C.lavender, 0.1);
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
      note: '桌面（h*.72 以下，purpleLight → navy）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.purpleLight, C.navy),
    },
    {
      name: 'cards',
      mode: 'staged',
      parallax: 0.5,
      pad: 8,
      note: '桌上 5 张剧本卡（旋转锁种子）',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.fillStyle = C.rgba(C.cream, 0.15);
        for (let i = 0; i < S2_SPEC.extra.cards.length; i++) {
          const cd = S2_SPEC.extra.cards[i];
          ctx.save();
          ctx.translate(w * cd.x, h * 0.78);
          ctx.rotate(cd.rot);
          fRR(ctx, -15, -20, 30, 40, 3, C.rgba(C.cream, 0.15));
          ctx.restore();
        }
        ctx.restore();
      },
    },
    {
      name: 'heart',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: HBOX, h: HBOX, originX: HX - HBOX / 2, originY: HY - HBOX / 2 },
      note: '心跳光晕 + 双层心（scale=1 定格，锚点即中心）',
      draw: (ctx, w, h) => {
        const hx = w / 2;
        const hy = h * 0.42;
        wcWash(ctx, hx, hy, 80, C.coral, 0.25);
        drawHeart(ctx, hx, hy, 1.5, C.coral, 0.8);
        drawHeart(ctx, hx, hy, 0.9, C.honey, 0.5);
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '男孩（左，shy+blush）+ 女孩（右，happy+blush）',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.4, w / 280);
        drawBoy(ctx, w * 0.3, h * 0.52, sc, { expression: 'shy', blush: true });
        drawGirl(ctx, w * 0.7, h * 0.52, sc, { expression: 'happy', blush: true });
      },
    },
  ],
};

export function bakeS2(opts) {
  // 卡牌旋转锁种子：真值侧用同一批（prepTruth 覆盖 scene.cards[i].rot）
  S2_SPEC.extra = {
    cards: withSeed(SEED_STARS, () =>
      Array.from({ length: 5 }, (_, i) => ({ x: 0.2 + i * 0.15, rot: U.rand(-0.2, 0.2) })),
    ),
  };
  return bakeScene(S2_SPEC, opts);
}
