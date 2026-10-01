/**
 * S5「海南蜜月 · 海浪」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1487-1546 的 S5.render()：
 *
 *   drawSky(skyLight/sky/sand) → wcWash(0.7,0.15,honey) → 太阳（wash+fCircle）
 *   → 海洋（线性渐变矩形，0.45h–0.7h）→ 3 条波浪线（waveT 驱动）
 *   → drawGround(h*.7, sand/sandDeep) → drawPaperTexture → 棕榈树
 *   → 冲浪板 → 双人
 *
 * ⚠️ 纸纹在**沙滩之后**（原版 1516 行）—— 与 S4 相反。层序照抄原版，
 *    别按"惯例"把 paper 提到前面：那样沙滩就不会被纸纹乘到，整块偏亮。
 *
 * ⚠️ 波浪形状随 waveT 变化（sin 相位），静态层只能定格 waveT=0 那一帧。
 *    运行时的近似做法是整层上下浮动 —— 视觉上"水在动"，但波形不精确，
 *    已记入 notBaked。要精确就得把波浪做成运行时绘制的 overlay 层（M3 议题）。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;
/** 海平面（game.js:1497） */
const OCEAN_Y = H * 0.45;
const BEACH_Y = H * 0.7;

export const S5_SPEC = {
  id: 's5',
  overdraw: 0.15,
  // waveAnchor = 波浪层工作画布的原点（运行时与对拍都按它摆位）
  anchors: { oceanY: OCEAN_Y, beachY: BEACH_Y, waveAnchorX: 0, waveAnchorY: OCEAN_Y - 10 },
  notBaked: ['波浪相位动画（运行时整层浮动近似）', '粒子（splash）'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '热带天空（skyLight → sky → sand）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.skyLight, C.sky, C.sand),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '右上一团蜜色暖光（r150）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.7, h * 0.15, 150, C.honey, 0.2);
      },
    },
    {
      name: 'sun',
      mode: 'staged',
      parallax: 0.35,
      pad: 8,
      note: '太阳（光晕 r80 + 本体 r30）',
      draw: (ctx, w, h) => {
        const sx = w * 0.75;
        const sy = h * 0.2;
        wcWash(ctx, sx, sy, 80, C.honey, 0.3);
        fCircle(ctx, sx, sy, 30, C.honeyDeep);
      },
    },
    {
      name: 'ocean',
      mode: 'staged',
      parallax: 0.25,
      pad: 2,
      note: '海面（oceanLight → ocean 线性渐变，0.45h–0.7h）',
      draw: (ctx, w, h) => {
        const og = ctx.createLinearGradient(0, OCEAN_Y, 0, BEACH_Y);
        og.addColorStop(0, C.oceanLight);
        og.addColorStop(1, C.ocean);
        ctx.fillStyle = og;
        ctx.fillRect(0, OCEAN_Y, w, h * 0.25);
      },
    },
    {
      name: 'waves',
      mode: 'staged',
      parallax: 0.3,
      pad: 8,
      runtimePlaced: true,
      box: { w: W, h: 120, originX: 0, originY: OCEAN_Y - 10 },
      note: '3 条波浪线（waveT=0 定格，运行时整层浮动）',
      draw: (ctx, w, h) => {
        ctx.strokeStyle = C.rgba(C.white, 0.3);
        ctx.lineWidth = 2;
        for (let layer = 0; layer < 3; layer++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 5) {
            const wy = OCEAN_Y + 10 + layer * 15 + Math.sin(x * 0.02 + layer) * 6;
            if (x === 0) ctx.moveTo(x, wy);
            else ctx.lineTo(x, wy);
          }
          ctx.stroke();
        }
      },
    },
    {
      name: 'beach',
      mode: 'staged',
      parallax: 0.45,
      pad: 4,
      note: '沙滩（h*.7 以下，sand → sandDeep）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, BEACH_Y, C.sand, C.sandDeep),
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 原版在沙滩之后，所以天空/海/沙滩都被乘到',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'palm',
      mode: 'staged',
      parallax: 0.6,
      pad: 10,
      note: '左侧棕榈树（树干二次曲线 + 5 片叶）',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.translate(w * 0.1, h * 0.7);
        ctx.fillStyle = C.warmBrown;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.quadraticCurveTo(-15, -40, -8, -80);
        ctx.lineTo(0, -80);
        ctx.quadraticCurveTo(-5, -40, 3, 0);
        ctx.fill();
        for (let i = 0; i < 5; i++) {
          const la = (i / 5) * Math.PI - Math.PI / 2;
          ctx.save();
          ctx.translate(0, -80);
          ctx.rotate(la);
          ctx.fillStyle = C.leaf;
          ctx.beginPath();
          ctx.ellipse(20, 0, 25, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      },
    },
    {
      name: 'surfboard',
      mode: 'staged',
      parallax: 0.8,
      pad: 8,
      note: '沙滩上的冲浪板（blur 0.5px）',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.fillStyle = C.coral;
        ctx.filter = 'blur(0.5px)';
        fRR(ctx, w * 0.4, h * 0.66, w * 0.2, 6, 3, C.coral);
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
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.3, h * 0.58, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.7, h * 0.58, sc, { expression: 'happy', blush: true });
      },
    },
  ],
};

export function bakeS5(opts) {
  return bakeScene(S5_SPEC, opts);
}
