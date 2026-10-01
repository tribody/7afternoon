/**
 * S1「公司初遇 · 两台显示器」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1134-1254 的 S1.render()：
 *
 *   drawSky(grayLight/cream/peachDeep) → 天花板光晕×3 → drawPaperTexture
 *   → drawGround(h*.72) → 天花板灯×3 → 白板（含线框）→ 桌子+桌腿
 *   → 两台显示器（bob ±1.5px，含 PRD/CODE 内容）→ 连接线+心 → 椅子 → 双人
 *
 * 层序纪律：paper 只乘到「天空 + 光晕」上（原版纸纹在地面之前绘制）。
 * 椅子原版画在显示器之后，但两者不重叠，合并进 office 层不影响画面。
 *
 * 两个**状态相关**的东西单独成层（runtimePlaced，运行时显隐/缩放）：
 *   · screenOn —— 单台显示器「已连接」态（珊瑚屏 + 光晕 + badge），两台各摆一个
 *   · link     —— 两屏之间的连线 + 心，按连接进度横向展开（原版是画线动画）
 * 保真比对只用初始态（screens 未连接），这两层不参与。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 显示器基准点（game.js:1130-1131） */
const SX = [W * 0.28, W * 0.72];
const SY = H * 0.48;
/** 单台显示器工作画布（以基准点为锚点，对称） */
const SBOX = 160;

export const S1_SPEC = {
  id: 's1',
  overdraw: 0.15,
  anchors: { screenAX: SX[0], screenBX: SX[1], screenY: SY },
  notBaked: ['bob 抖动 ±1.5px（运行时位移近似）', '连接线生长动画（运行时 scaleX）', '粒子（heart/sparkle）'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '办公室冷白墙（grayLight → cream → peachDeep）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.grayLight, C.cream, C.peachDeep),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '天花板灯的光晕（honey r250 + sky r150 ×2）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.5, h * 0.05, 250, C.honey, 0.12);
        wcWash(ctx, w * 0.25, h * 0.1, 150, C.sky, 0.08);
        wcWash(ctx, w * 0.75, h * 0.1, 150, C.sky, 0.08);
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
      note: '地板（h*.72 以下）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.warmBrown, C.darkBrown),
    },
    {
      name: 'office',
      mode: 'staged',
      parallax: 0.5,
      pad: 6,
      // 天花板灯画在 y=0（贴画布顶边），blur 的溢出部分会被裁掉 →
      // 工作画布向上下各留 24 设计像素，保证灯的完整软边进贴图
      box: { w: W, h: H + 48, originX: 0, originY: -24 },
      note: '天花板灯 + 白板 + 桌子/桌腿 + 椅子（静态陈设）',
      draw: (ctx, w, h) => {
        // 天花板灯板（game.js:1146-1152）
        for (let i = 0; i < 3; i++) {
          const lx = w * (0.2 + i * 0.3);
          ctx.fillStyle = C.rgba(C.cream, 0.4);
          ctx.filter = 'blur(1px)';
          fRR(ctx, lx - 30, 0, 60, 8, 2, C.rgba(C.cream, 0.4));
          ctx.filter = 'none';
        }
        // 白板 + 线框 + 两个小方框（game.js:1154-1169）
        ctx.save();
        fRR(ctx, w * 0.35, h * 0.08, w * 0.3, h * 0.15, 4, C.white);
        ctx.strokeStyle = C.warmBrown;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = C.rgba(C.sky, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w * 0.38, h * 0.12);
        ctx.lineTo(w * 0.45, h * 0.12);
        ctx.moveTo(w * 0.38, h * 0.15);
        ctx.lineTo(w * 0.55, h * 0.15);
        ctx.moveTo(w * 0.38, h * 0.18);
        ctx.lineTo(w * 0.50, h * 0.18);
        ctx.stroke();
        ctx.strokeStyle = C.rgba(C.coral, 0.4);
        ctx.strokeRect(w * 0.48, h * 0.11, 12, 8);
        ctx.strokeRect(w * 0.52, h * 0.11, 12, 8);
        ctx.restore();
        // 桌子 + 桌腿（game.js:1170-1179）
        ctx.fillStyle = C.warmBrown;
        fRR(ctx, w * 0.1, h * 0.58, w * 0.35, 14, 4, C.warmBrown);
        fRR(ctx, w * 0.55, h * 0.58, w * 0.35, 14, 4, C.warmBrown);
        ctx.fillStyle = C.darkBrown;
        ctx.fillRect(w * 0.12, h * 0.58 + 14, 4, h * 0.14);
        ctx.fillRect(w * 0.42, h * 0.58 + 14, 4, h * 0.14);
        ctx.fillRect(w * 0.57, h * 0.58 + 14, 4, h * 0.14);
        ctx.fillRect(w * 0.87, h * 0.58 + 14, 4, h * 0.14);
        // 椅子（game.js:1243-1249）
        ctx.save();
        ctx.fillStyle = C.darkBrown;
        ctx.filter = 'blur(0.5px)';
        fCircle(ctx, w * 0.28, h * 0.72, 14, C.darkBrown);
        fCircle(ctx, w * 0.72, h * 0.72, 14, C.darkBrown);
        ctx.restore();
      },
    },
    {
      name: 'screens',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      note: '两台显示器「未连接」态（含 PRD 线稿 / CODE 文字 + 暗色 label）',
      draw: (ctx, w, h) => {
        const prdLines = [35, 42, 28, 38, 30];
        const labels = ['PRD', 'CODE'];
        for (let i = 0; i < 2; i++) {
          const sx = w * (i === 0 ? 0.28 : 0.72);
          const sy = h * 0.48;
          // 支架 + 机身（game.js:1185-1190）
          ctx.fillStyle = C.darkGray;
          fRR(ctx, sx - 4, sy + 18, 8, 12, 2, C.darkGray);
          fRR(ctx, sx - 12, sy + 28, 24, 4, 2, C.darkGray);
          fRR(ctx, sx - 32, sy - 20, 64, 42, 3, C.darkGray);
          // 屏幕（未连接：skyLight 0.7）
          ctx.fillStyle = C.rgba(C.skyLight, 0.7);
          fRR(ctx, sx - 29, sy - 17, 58, 36, 2, ctx.fillStyle);
          ctx.fillStyle = C.rgba(C.white, 0.6);
          if (i === 0) {
            for (let r = 0; r < prdLines.length; r++) ctx.fillRect(sx - 24, sy - 12 + r * 5, prdLines[r], 2);
          } else {
            ctx.font = '7px monospace';
            ctx.fillText('function', sx - 24, sy - 8);
            ctx.fillText('return', sx - 24, sy + 2);
            ctx.fillText('}', sx - 24, sy + 12);
          }
          // 暗色 label（game.js:1220-1223）
          ctx.fillStyle = C.rgba(C.gray, 0.5);
          ctx.font = `8px ${FB}`;
          ctx.textAlign = 'center';
          ctx.fillText(labels[i], sx, sy - 26);
        }
      },
    },
    {
      name: 'screenOn',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: SBOX, h: SBOX, originX: SX[0] - SBOX / 2, originY: SY - SBOX / 2 },
      note: '单台「已连接」态（珊瑚屏 + 光晕 + badge 底），两台各摆一个 sprite',
      draw: (ctx, w, h) => {
        const sx = w * 0.28;
        const sy = h * 0.48;
        wcWash(ctx, sx, sy, 50, C.coral, 0.25);
        ctx.fillStyle = C.coral;
        // ⚠️ badge 上的 PRD / CODE 文字**刻意不烘**：两台显示器文案不同，
        //    烘死就只能是一份；且 8px 中文/字母进贴图在 3D 里会糊。
        //    文字由运行时 DOM 叠层给（见 src/scenes/s1.ts）
        fRR(ctx, sx - 29, sy - 17, 58, 36, 2, C.coral);
        fRR(ctx, sx - 18, sy - 28, 36, 12, 3, C.coral);
      },
    },
    {
      name: 'link',
      mode: 'staged',
      parallax: 1,
      pad: 8,
      runtimePlaced: true,
      box: { w: 260, h: 120, originX: W / 2 - 130, originY: SY - 60 },
      note: '两屏之间的连线 + 心（原版画线动画，运行时按 scaleX 展开）',
      draw: (ctx, w, h) => {
        const y = h * 0.48;
        ctx.save();
        ctx.strokeStyle = C.rgba(C.coral, 0.5);
        ctx.lineWidth = 3;
        ctx.filter = 'blur(1px)';
        ctx.beginPath();
        ctx.moveTo(w * 0.28 + 32, y);
        ctx.lineTo(w * 0.72 - 32, y);
        ctx.stroke();
        ctx.restore();
        drawHeart(ctx, w / 2, y - 5, 0.8, C.coral, 0.8);
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '男孩（右，shy+blush）+ 女孩（左，shy+blush）',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.72, h * 0.5, sc, { expression: 'shy', blush: true });
        drawGirl(ctx, w * 0.28, h * 0.5, sc, { expression: 'shy', blush: true });
      },
    },
  ],
};

export function bakeS1(opts) {
  return bakeScene(S1_SPEC, opts);
}
