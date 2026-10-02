/**
 * S11「加班晚归 · 点亮回家的灯」的分层烘焙配置
 *
 * 逐行对应 classic/game.js:1837-1886 的 S11.render()：
 *
 *   drawSky(navy/navyLight/purple) → drawStars(50 颗, U.T) → drawPaperTexture
 *   → drawGround(h*.72) → 房身+屋顶 → 窗（灭/亮）→ wash → 门 → 光锥
 *   → 女孩 → 猫（lit>0 才画）→ 男孩（灯亮瞬间表情 sad→happy，位置向门口 lerp）
 *
 * ⚠️ 这一场是**状态切换型**：灯灭/灯亮是两幅完全不同的画。烘焙策略是
 *    「灭态烘足、亮态做增量」——真值与冒烟保真都定格在灯灭态
 *    （lightsOn=false），亮灯后的四样增量（亮窗 / wash 光晕 / 光锥 / 女孩+猫）
 *    各烘一张 runtimePlaced 贴图，运行时按 lit 控显隐与透明度。
 *
 * ⚠️ 增量层的显隐行为必须逐项对齐原版：
 *    · 窗体是**跳变**（game.js:1857 `lit > 0 ? honey : navyLight`）→ setVisible(lit>0)
 *    · wash 是 0.3*lit 渐变（game.js:1859）→ 贴图烘 alpha 0.3，运行时 setOpacity(lit)
 *    · 光锥是 0.4*lit 渐变（game.js:1866）→ 贴图烘 alpha 0.4，运行时 setOpacity(lit)
 *    所以窗体（跳变）与 wash（渐变）必须拆成两层，合并就会把跳变画成淡入。
 *
 * ⚠️ 门单独一层：原版绘制序是 wash 在门**之前**（game.js:1859 门在 1864 光锥之前），
 *    若把门并进 house，windowGlow 画在 house 之后就会盖到门上 —— 原版里
 *    门只有光锥会盖（0.4 alpha），wash 不盖门。
 *
 * ⚠️ 男孩烘两态：sad 定格在起点（0.1w，灯灭常显）；happy 同一起点烘出，
 *    灯亮后 setVisible + setCenter 向 hx-40 行走（原版是一帧一画，v2 用
 *    位移贴图表达，中间帧是插值而非重绘 —— 已记入 notBaked）。
 */
import { bakeScene, DESIGN } from './_lib.js';
import { withSeed, SEED_PAPER, SEED_STARS } from '../layerSink.js';

const { w: W, h: H } = DESIGN;

/** 房子中心（game.js:1846） */
const HX = W * 0.5;
const HY = H * 0.45;
/** 窗光/光锥的共同原点（game.js:1859/1870 的 (hx, hy+30)） */
const WIN_X = HX;
const WIN_Y = HY + 30;
/** 亮窗 + wash 光晕的工作画布：窗矩形 40×35 ⊕ wash r60，各留 blur 余量 */
const WBOX = 140;
/** 光锥工作画布：三角 (hx,hy+30)→(hx±80, .72h)，blur(10px) 各向余量 */
const CONE_W = 180;
const CONE_H = 212;
const CONE_X = WIN_X - 90;
const CONE_Y = WIN_Y - 10;
/** 男孩（game.js:1883-1885） */
const BOY_X0 = W * 0.1;
const BOY_X1 = HX - 40;
const BOY_Y = H * 0.58;
/** 门口的女孩与猫（game.js:1879-1881） */
const GIRL_X = HX;
const GIRL_Y = HY + 65;
const CAT_X = HX + 30;
const CAT_Y = HY + 70;

export const S11_SPEC = {
  id: 's11',
  overdraw: 0.15,
  anchors: {
    hx: HX, hy: HY, winX: WIN_X, winY: WIN_Y,
    boyX0: BOY_X0, boyX1: BOY_X1, boyY: BOY_Y,
    girlX: GIRL_X, girlY: GIRL_Y, catX: CAT_X, catY: CAT_Y,
  },
  notBaked: [
    '灯亮 sparkle 粒子（ps.spawn 12 颗，game.js:1892）',
    '男孩行走的中间帧（运行时 lerp 位移表达，非逐帧重绘）',
    '星星闪烁（U.T 时变，定格 t=0）',
  ],
  layers: [
    {
      name: 'sky',
      mode: 'full',
      parallax: 0.2,
      note: '夜空渐变（navy → navyLight → purple）',
      draw: (ctx, w, h) => drawSky(ctx, w, h, C.navy, C.navyLight, C.purple),
    },
    {
      name: 'stars',
      mode: 'staged',
      parallax: 0.15,
      pad: 4,
      note: '50 颗小星（锁种子，闪烁定格在 U.T=0）',
      draw: (ctx, w, h) => drawStars(ctx, S11_SPEC.extra.stars, 0),
    },
    {
      name: 'paper',
      mode: 'full',
      blend: 'multiply',
      parallax: 0,
      note: '纸纹（锁种子）—— 只乘到 sky + stars（原版在 ground 之前）',
      draw: (ctx, w, h) => withSeed(SEED_PAPER, () => drawPaperTexture(ctx, w, h)),
    },
    {
      name: 'ground',
      mode: 'staged',
      parallax: 0.45,
      pad: 4,
      note: '地面（h*.72 以下，purple → navy）',
      draw: (ctx, w, h) => drawGround(ctx, w, h, h * 0.72, C.purple, C.navy),
    },
    {
      name: 'house',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      note: '房身（warmBrown 120×80）+ 屋顶（darkBrown 三角）+ 灭窗（navyLight）—— 不含门',
      draw: (ctx, w, h) => {
        const hx = w * 0.5, hy = h * 0.45;
        fRR(ctx, hx - 60, hy, 120, 80, 5, C.warmBrown);
        ctx.fillStyle = C.darkBrown;
        ctx.beginPath();
        ctx.moveTo(hx - 70, hy);
        ctx.lineTo(hx, hy - 40);
        ctx.lineTo(hx + 70, hy);
        ctx.closePath();
        ctx.fill();
        fRR(ctx, hx - 20, hy + 15, 40, 35, 3, C.navyLight);
      },
    },
    {
      name: 'windowLit',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      runtimePlaced: true,
      box: { w: WBOX, h: WBOX, originX: WIN_X - WBOX / 2, originY: WIN_Y - WBOX / 2 },
      note: '亮窗（honey 40×35）—— 灯亮瞬间跳变出现（game.js:1857），初始隐藏',
      // ⚠️ box 层的 draw 一律用**全画布设计坐标**（w/h 参数是整幅 375×812，
      //    transform 已把 box 原点平移掉）—— 用贴图内坐标会画到画布外
      draw: (ctx) => {
        fRR(ctx, HX - 20, HY + 15, 40, 35, 3, C.honey);
      },
    },
    {
      name: 'windowGlow',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      runtimePlaced: true,
      box: { w: WBOX, h: WBOX, originX: WIN_X - WBOX / 2, originY: WIN_Y - WBOX / 2 },
      note: '窗光 wash（honey r60，alpha 0.3）—— 运行时 setOpacity(lit) 渐变（game.js:1859）',
      draw: (ctx) => wcWash(ctx, WIN_X, WIN_Y, 60, C.honey, 0.3),
    },
    {
      name: 'door',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      note: '门（darkBrown 24×38）—— 单独一层：原版 wash 画在门之前，光锥画在门之后',
      draw: (ctx, w, h) => {
        const hx = w * 0.5, hy = h * 0.45;
        fRR(ctx, hx - 12, hy + 42, 24, 38, 2, C.darkBrown);
      },
    },
    {
      name: 'lightCone',
      mode: 'staged',
      parallax: 1,
      pad: 6,
      runtimePlaced: true,
      box: { w: CONE_W, h: CONE_H, originX: CONE_X, originY: CONE_Y },
      note: '窗光锥（honey 三角，blur 10px，alpha 0.4）—— 运行时 setOpacity(lit)（game.js:1864-1876）',
      draw: (ctx) => {
        // 全画布设计坐标：三角顶点 (WIN_X, WIN_Y)，底边 h*0.72
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = C.honey;
        ctx.filter = 'blur(10px)';
        ctx.beginPath();
        ctx.moveTo(WIN_X, WIN_Y);
        ctx.lineTo(WIN_X - 80, H * 0.72);
        ctx.lineTo(WIN_X + 80, H * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      },
    },
    {
      name: 'friends',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '门口的女孩（happy+blush, sc*0.7）+ 猫（enjoy, sc*0.4）—— lit>0 才出现（game.js:1879-1881）',
      draw: (ctx, w, h) => {
        const sc = Math.min(1.1, w / 350);
        drawGirl(ctx, GIRL_X, GIRL_Y, sc * 0.7, { expression: 'happy', blush: true });
        drawCat(ctx, CAT_X, CAT_Y, sc * 0.4, { expression: 'enjoy' });
      },
    },
    {
      name: 'boySad',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '男孩「未归」态（sad）—— 定格在 0.1w 起点，灯灭常显',
      draw: (ctx, w, h) => drawBoy(ctx, BOY_X0, BOY_Y, Math.min(1.1, w / 350), { expression: 'sad' }),
    },
    {
      name: 'boyHappy',
      mode: 'staged',
      parallax: 1,
      pad: 10,
      runtimePlaced: true,
      note: '男孩「归家」态（happy）—— 同起点烘出，灯亮后向 hx-40 行走（game.js:1883-1885）',
      draw: (ctx, w, h) => drawBoy(ctx, BOY_X0, BOY_Y, Math.min(1.1, w / 350), { expression: 'happy' }),
    },
  ],
};

export function bakeS11(opts) {
  // 星场锁种子：真值侧用同一批（prepTruth 覆盖 scene.stars），与 s0/s7 同套路
  S11_SPEC.extra = { stars: withSeed(SEED_STARS, () => makeStars(W, H, 50, 1.5)) };
  return bakeScene(S11_SPEC, opts);
}
