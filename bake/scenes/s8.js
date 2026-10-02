/**
 * S8「自媒体创业 · 补光灯」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1691-1724 的 S8.render()：
 *
 *   drawSky(purpleLight/lavender/cream) → wcWash×2 → drawPaperTexture
 *   → drawGround(h*.72) → 补光灯（光晕 + 描边圆环 + 半透明内胆）+ 灯架
 *   → 相机 → 闪光（全画布白，只在 flashT>0 时出现）→ 女孩（happy+blush）
 *
 * ⚠️ 闪光是**全画布覆盖**：`ctx.fillRect(0,0,w,h)` 且 alpha = flashT*0.6
 *    （game.js:1714-1720）。它不等于任何一层贴图——它是"盖在所有东西之上、
 *    但画在女孩之前"的一层。这是本项目第一处需要**纯粹的全屏遮罩层**，
 *    做法是烘一张纯白满幅贴图，运行时按 flashT 改 opacity 并控显隐。
 *
 *    ⚠️ 注意绘制序：闪光在女孩**之前**（game.js:1714 在 1722 之前），
 *       所以女孩不会被白幕糊掉 —— 层序必须照抄，别顺手把 flash 放到最后。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 补光灯中心（game.js:1700 / 1726） */
const RING_X = W * 0.5;
const RING_Y = H * 0.3;

export const S8_SPEC = {
  id: 's8',
  overdraw: 0.15,
  anchors: { ringX: RING_X, ringY: RING_Y },
  notBaked: ['闪光白幕（运行时全屏遮罩层）', '粒子（sparkle）'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '摄影棚（purpleLight → lavender → cream）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.purpleLight, C.lavender, C.cream),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '冷紫 / 暖蜜两团环境光（r200 / r150）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.3, h * 0.3, 200, C.lavender, 0.12);
        wcWash(ctx, w * 0.7, h * 0.2, 150, C.honey, 0.1);
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
      note: '地面（h*.72 以下，lavenderDeep → purple）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.lavenderDeep, C.purple),
    },
    {
      name: 'ringLight',
      mode: 'staged',
      parallax: 0.55,
      pad: 10,
      note: '补光灯本体 + 金属灯架（含落地脚）',
      draw: (ctx, w, h) => {
        const rx = w * 0.5;
        const ry = h * 0.3;
        wcWash(ctx, rx, ry, 60, C.honey, 0.3);
        sCircle(ctx, rx, ry, 30, C.darkBrown, 4);
        fCircle(ctx, rx, ry, 25, C.rgba(C.honey, 0.3));
        ctx.strokeStyle = C.darkBrown;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(rx, ry + 30);
        ctx.lineTo(rx, h * 0.72);
        ctx.stroke();
        ctx.fillStyle = C.darkBrown;
        ctx.beginPath();
        ctx.moveTo(rx - 15, h * 0.72);
        ctx.lineTo(rx + 15, h * 0.72);
        ctx.lineTo(rx + 10, h * 0.72 + 5);
        ctx.lineTo(rx - 10, h * 0.72 + 5);
        ctx.fill();
      },
    },
    {
      name: 'camera',
      mode: 'staged',
      parallax: 0.7,
      pad: 8,
      note: '相机（机身 fRR + 镜头 navy 圆）',
      draw: (ctx, w, h) => {
        fRR(ctx, w * 0.15 - 20, h * 0.5, 40, 25, 4, C.darkGray);
        fCircle(ctx, w * 0.15, h * 0.55, 10, C.navy);
      },
    },
    {
      name: 'flash',
      mode: 'full',
      parallax: 1,
      runtimePlaced: true,
      note: '纯白满幅遮罩（game.js:1717 的 fillRect）—— 运行时按 flashT*0.6 控 alpha',
      draw: (ctx, w, h) => {
        ctx.fillStyle = C.white;
        ctx.fillRect(0, 0, w, h);
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '女孩（0.55w，happy + blush）—— 画在闪光之后，不会被白幕糊掉',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.3, w / 300);
        drawGirl(ctx, w * 0.55, h * 0.55, sc, { expression: 'happy', blush: true });
      },
    },
  ],
};

export function bakeS8(opts) {
  return bakeScene(S8_SPEC, opts);
}
