/**
 * S7「失业 · 雨天擦泪」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1619-1672 的 S7.render()：
 *
 *   drawSky(navyLight/gray/grayLight) → wcWash(navy 0.1) → drawPaperTexture
 *   → drawRaindrops → drawGround(h*.72) → 伞（两片椭圆）+ 伞柄
 *   → 女孩（0.55w, sad）→ 男孩（0.4w, sad，sc*0.85，画在女孩之上）
 *   → 泪珠（3 颗，数量随 tearWipe 递减）→ 擦拭进度弧
 *
 * ⚠️ 雨滴必须锁种子：80 条的 x/y/speed/len 全走 U.rand（game.js:1617），
 *    两次随机出来的分布不同会造成结构性差异 → 放进 extra.drops 透传。
 *
 * ⚠️ 雨是**每滴不同速度**在动（200–400 px/s，game.js:958 的 % (maxY+100)），
 *    静态贴图表达不了。运行时用"整层向下滚动 + 复制一张补上空档"近似，
 *    实际差异是"雨滴速度不再有差别"。已记入 notBaked。
 *
 * ⚠️ 泪珠按 i<3-floor(tearWipe*3) 逐颗消失（game.js:1654），所以只烘
 *    **一颗**泪珠，运行时实例化 3 份各自控显隐 —— 同一张贴图，零额外显存。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER, SEED_STARS } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 女孩脸（原版命中/泪珠/进度弧的中心，game.js:1650/1668/1674） */
const GIRL_CX = W * 0.55;
const FACE_Y = H * 0.5;
/** 第 0 颗泪珠的位置（tearY = h*0.5 + sin(t*2)*3，定格 t=0 即 h*0.5） */
const TEAR0_X = GIRL_CX - 10;
const TEAR0_Y = FACE_Y + 20;
const TBOX = 40;

export const S7_SPEC = {
  id: 's7',
  overdraw: 0.15,
  anchors: { girlCX: GIRL_CX, faceY: FACE_Y, tear0X: TEAR0_X, tear0Y: TEAR0_Y },
  notBaked: [
    '雨滴各自的速度差（运行时用整层滚动近似）',
    '擦拭动画与 sparkle 粒子',
    '进度弧（运行时 DOM 圆环，同 S6 的做法）',
  ],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '雨天的灰蓝（navyLight → gray → grayLight）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.navyLight, C.gray, C.grayLight),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '正中一团压低的冷光（navy r250）',
      draw: (ctx, w, h) => wcWash(ctx, w * 0.5, h * 0.4, 250, C.navy, 0.1),
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 只乘到 sky + glow（原版在雨和地面之前）',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'rain',
      mode: 'full',
      parallax: 0.15,
      runtimePlaced: true,
      note: '雨幕（80 条，锁种子，U.T=0 定格）',
      draw: (ctx, w, h) => drawRaindrops(ctx, S7_SPEC.extra.drops, 0),
    },
    {
      name: 'ground',
      mode: 'staged',
      parallax: 0.45,
      pad: 4,
      note: '湿地面（h*.72 以下，gray → darkGray）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.gray, C.darkGray),
    },
    {
      name: 'umbrella',
      mode: 'staged',
      parallax: 0.5,
      pad: 10,
      note: '伞面（coral 上半椭圆 + coralDeep 内衬）+ 伞柄',
      draw: (ctx, w, h) => {
        const ux = w / 2;
        const uy = h * 0.35;
        ctx.save();
        ctx.filter = 'blur(1px)';
        ctx.fillStyle = C.coral;
        ctx.beginPath();
        ctx.ellipse(ux, uy, 80, 30, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = C.coralDeep;
        ctx.beginPath();
        ctx.ellipse(ux, uy, 80, 10, 0, Math.PI, 0);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = C.warmBrown;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ux, uy);
        ctx.lineTo(ux, uy + 50);
        ctx.stroke();
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '女孩（0.55w, sad）+ 男孩（0.4w, sad, sc*0.85）—— 男孩后画压在女孩上',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.3, w / 300);
        drawGirl(ctx, w * 0.55, h * 0.52, sc, { expression: 'sad' });
        drawBoy(ctx, w * 0.4, h * 0.54, sc * 0.85, { expression: 'sad' });
      },
    },
    {
      name: 'tear',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      runtimePlaced: true,
      box: { w: TBOX, h: TBOX, originX: TEAR0_X - TBOX / 2, originY: TEAR0_Y - TBOX / 2 },
      note: '单颗泪珠（运行时实例化 3 份，随 tearWipe 逐颗消失）',
      draw: (ctx, w, h) => {
        ctx.save();
        ctx.fillStyle = C.rgba(C.sky, 0.5);
        ctx.filter = 'blur(0.5px)';
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, 2, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    },
  ],
};

export function bakeS7(opts) {
  // 雨滴锁种子：真值侧用同一批（prepTruth 覆盖 scene.drops）
  S7_SPEC.extra = {
    drops: withSeed(SEED_STARS, () =>
      Array.from({ length: 80 }, () => ({
        // ⚠️ 照抄原版：**无视视口宽度**地撒 x∈[0,800]（375 宽的屏幕上有一半落在屏外）
        x: U.rand(0, 800),
        y: U.rand(0, 600),
        speed: U.rand(200, 400),
        len: U.rand(10, 20),
        maxY: H,
      })),
    ),
  };
  return bakeScene(S7_SPEC, opts);
}
