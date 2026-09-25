/**
 * S10「夕阳下山和小梁都释然了」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1805-1824 的 S10.render()：
 *
 *   drawSky(w,h, sunset/honey/coral)
 *   wcWash(w*.5, h*.25, 300, honey, .2)
 *   wcWash(w*.3, h*.4,  200, coral, .1)
 *   drawPaperTexture(w,h)
 *   drawGround(w,h, h*.72, sunsetDeep, darkBrown)
 *   wcWash(sx,sy,120, honey,.3) + fCircle(sx,sy,40, honeyDeep)   ← 夕阳
 *   drawCloud(w*.2,h*.15,1.2, coralLight) / drawCloud(w*.8,h*.2,1,honey)
 *   drawBoy(w*.42,h*.55) + drawGirl(w*.58,h*.55)  happy/blush
 *
 * ⚠️ multiply 层的**绘制序**不能动：drawPaperTexture 在原版里位于两团 Wash
 *    之后、地面之前，所以 paper 只乘到「天空 + 光晕」上，地面与角色要压在
 *    它上面。层的顺序就是这个乘法顺序，别乱挪。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

export const S10_SPEC = {
  id: 's10',
  overdraw: 0.15,
  anchors: {
    boyX: W * 0.42,
    boyY: H * 0.55,
    girlX: W * 0.58,
    girlY: H * 0.55,
    charScale: Math.min(1.3, W / 300),
  },
  notBaked: ['particles(sparkle/heart)', 'tap-state', 'fade-black', 'parallax'],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '夕阳渐变天空（ sunset / honey / coral ）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.sunset, C.honey, C.coral),
    },
    {
      name: 'glow',
      mode: 'staged',
      parallax: 0.3,
      pad: 6,
      note: '两团大范围暖光晕（半径 300 / 200）',
      draw: (ctx, w, h) => {
        wcWash(ctx, w * 0.5, h * 0.25, 300, C.honey, 0.2);
        wcWash(ctx, w * 0.3, h * 0.4, 200, C.coral, 0.1);
      },
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸张纤维（300 点，锁种子）—— 只乘到 sky + glow 上',
      draw: (ctx, w, h) => {
        // ⚠️ 必须锁种子：真值侧同样锁，否则 300 个随机点会淹没结构性差异
        withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h));
      },
    },
    {
      name: 'ground',
      mode: 'staged',
      parallax: 0.45,
      pad: 4,
      note: '地面（h*.72 以下）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.sunsetDeep, C.darkBrown),
    },
    {
      name: 'sun',
      mode: 'staged',
      parallax: 0.25,
      pad: 6,
      note: '夕阳本体 + 外围光晕',
      draw: (ctx, w, h) => {
        const sx = w * 0.5;
        const sy = h * 0.35;
        wcWash(ctx, sx, sy, 120, C.honey, 0.3);
        fCircle(ctx, sx, sy, 40, C.honeyDeep);
      },
    },
    {
      name: 'clouds',
      mode: 'staged',
      parallax: 0.5,
      pad: 8,
      note: '两朵云（blur(3px)，留足 pad 给软边）',
      draw: (ctx, w, h) => {
        drawCloud(ctx, w * 0.2, h * 0.15, 1.2, C.coralLight);
        drawCloud(ctx, w * 0.8, h * 0.2, 1, C.honey);
      },
    },
    {
      name: 'actors',
      mode: 'staged',
      parallax: 0.8,
      pad: 10,
      note: '男孩 + 女孩（happy / blush）肩并肩',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.42, h * 0.55, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.58, h * 0.55, sc, { expression: 'happy', blush: true });
      },
    },
  ],
};

export function bakeS10(opts) {
  return bakeScene(S10_SPEC, opts);
}
