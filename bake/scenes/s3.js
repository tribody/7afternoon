/**
 * S3（除夕夜聊天）的分层烘焙脚本
 *
 * 逐行对应 classic/game.js 第 1327–1398 行 S3.render() 的原始绘制序。
 * 复用的全是原版全局函数（drawSky / drawStars / makeStars / wcWash /
 * drawBoy / drawPaperTexture / fRR / C），**一个字都没改**。
 *
 * ══════════════════════════════════════════════════════════════
 * 坐标系 —— 全管线最容易搞错、也最贵的一处，务必看明白
 * ══════════════════════════════════════════════════════════════
 *
 * 存在三套坐标，必须分清：
 *
 *  ① 设计坐标（design）—— **375 × 812 CSS 像素**
 *     原版真正用的坐标系（`Game.resize()` 里 g.w / g.h 就是 CSS 尺寸）。
 *     所有绘制调用、所有百分比布局、以及 `U.dist(x,y,b.x,b.y) < 50`
 *     的命中阈值，**全部以它为单位**。
 *
 *  ② 烘焙坐标（canvas）—— 设计 × `SCALE`(=2)
 *     只为让贴图在 DPR2 手机上不糊。**不该参与任何逻辑**。
 *
 *  ③ 归一化坐标（normalized, 0..1）—— 3D 舞台用
 *     归一化后用正交相机铺满视口，贴图自动适配真实机型尺寸。
 *
 * 两条纪律，都是踩过坑换来的：
 *
 *  A. **调用原版函数时永远喂设计坐标**，放大交给 sink 的 scale 变换。
 *     曾经直接 `drawSky(ctx, 750, 1624)`，结果 `makeStars(w,h,40,1.5)` 的
 *     40 颗星被摊到 4 倍面积上 —— 星空稀疏了一半；`drawPaperTexture` 的
 *     300 个颗粒点同理。
 *
 *  B. **出血不能用放大画布解决**。曾把画布开到 750×1868 再喂原函数，
 *     分块比对顶部三块 Δ105/255 —— `drawSky` 的渐变按 h 计算，h 从 812
 *     变到 1878 后渐变公式整个变了。正确做法：**按设计尺寸烘焙**，视差出血
 *     交给 3D 侧把 quad 放大 `OVERDRAW`、靠 `ClampToEdgeWrapping` 延边
 *     （对垂直渐变恰好是精确的梯度外推），贴图反而更小。
 *
 *  C. **不要手推图层矩形**。`drawBoy` 的锚点、包围盒与 scale 的关系不是
 *     一句 `min(1.3, w/300)` 能算清的；手推的结果是角色层画布只装得下
 *     半个男孩，合成图里人被切。改为：**先在大画布上画 → 量紧致包围盒
 *     → 按包围盒 + 余量裁剪**，让几何自标定。
 *     同理，气泡那次把原版的 `100×36` 误当成设备像素折半，画出来只有
 *     50×18，文字全部溢出气泡。
 */
import {
  createSink,
  sinkFromCanvas,
  tightBBox,
  withSeed,
  SEED_STARS,
  SEED_PAPER,
} from '../layerSink.js';

/** 设计坐标（= 原版 CSS 像素系的基准机型 iPhone X） */
export const DESIGN = { w: 375, h: 812 };

/** 烘焙倍率：贴图按 2× 出，喂原函数时仍用设计坐标 */
export const SCALE = 2;

/** 3D 侧 quad 的放大比例（视差出血），**不影响烘焙尺寸** */
export const OVERDRAW = 0.15;

/**
 * 「大画布画 → 量 → 裁」。
 *
 * @param {object} spec
 * @param {number} spec.canvasW  工作画布宽（canvas 像素）
 * @param {number} spec.canvasH  工作画布高
 * @param {number} spec.originX  工作画布左上角对应的设计坐标 X
 * @param {number} spec.originY  同上 Y
 * @param {number} spec.scale    设计 → canvas 的缩放
 * @param {(ctx) => void} spec.draw
 * @param {number} spec.pad      裁剪时四周留的设计像素（给软阴影 / blur）
 * @param {string} spec.label    报错用
 */
function stageSink({ canvasW, canvasH, originX, originY, scale, draw, pad, label }) {
  const full = createSink({ w: canvasW, h: canvasH, originX, originY, scale });
  full.on();
  draw(full.ctx);
  full.off();

  const bb = tightBBox(full.canvas);
  if (!bb) throw new Error(`${label}：整张画布全透明，绘制函数可能没生效`);

  const p = Math.round(pad * scale);
  const x = Math.max(0, bb.x - p);
  const y = Math.max(0, bb.y - p);
  const cw = Math.min(full.canvas.width - x, bb.w + 2 * p);
  const ch = Math.min(full.canvas.height - y, bb.h + 2 * p);

  // 内容贴到工作画布边缘 = 可能被切，必须报出来而不是默默裁掉
  const touchesEdge =
    bb.x <= 0 || bb.y <= 0 || bb.x + bb.w >= full.canvas.width || bb.y + bb.h >= full.canvas.height;

  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  c.getContext('2d').drawImage(full.canvas, x, y, cw, ch, 0, 0, cw, ch);

  return {
    sink: sinkFromCanvas(c, { originX: originX + x / scale, originY: originY + y / scale, scale }),
    bbox: bb,
    crop: { x, y, w: cw, h: ch },
    touchesEdge,
    workCanvas: { w: canvasW, h: canvasH },
  };
}

/**
 * @param {object} [opts]
 * @param {number} [opts.w]        设计宽
 * @param {number} [opts.h]        设计高
 * @param {number} [opts.scale]    烘焙倍率
 * @param {number} [opts.overdraw] 3D 侧视差出血比例
 */
export function bakeS3(opts = {}) {
  const w = opts.w ?? DESIGN.w;
  const h = opts.h ?? DESIGN.h;
  const sc = opts.scale ?? SCALE;
  const overdraw = opts.overdraw ?? OVERDRAW;

  // ── 角色锚点：与 classic/game.js:1385-1386 完全一致 ──────────
  const boyX = w * 0.5;
  const boyY = h * 0.62;
  const boyScale = Math.min(1.3, w / 300);

  const timings = {};
  const time = (name, fn) => {
    const t0 = performance.now();
    const r = fn();
    timings[name] = +(performance.now() - t0).toFixed(2);
    return r;
  };

  const notes = {};
  const diagnostics = [];

  // ══ L0 远景：夜空 + 星星 ════════════════════════════════════
  // 对应 game.js:1348 drawSky(ctx,w,h,C.navy,…) + :1353 drawStars(ctx,this.stars,U.T)
  // 全幅层，不裁（它本来就要铺满，且要参与视差）
  // 星星锁种子：真值侧复用同一批星（result.stars），否则两次随机的位置差
  // 会盖住真正的结构性问题
  const stars = withSeed(SEED_STARS, () => makeStars(w, h, 40, 1.5));
  const skySink = createSink({ w: Math.round(w * sc), h: Math.round(h * sc), originX: 0, originY: 0, scale: sc });
  time('sky', () => {
    skySink.on();
    drawSky(skySink.ctx, w, h, C.navy, C.navyLight, C.purple);
    drawStars(skySink.ctx, stars, 0);
    skySink.off();
  });
  notes.sky = '夜空渐变 + 40 颗星（t=0 定格，动态化留给 M2 的 shader uv 呼吸）';

  // ══ L1 中景：手机屏幕光晕 ══════════════════════════════════
  // 对应 game.js:1350 wcWash(ctx, w/2, h/2, 200, C.sky, 0.15)
  // 半径 200 的径向渐变，可见范围实测半径 ≈182 设计单位，裁掉大片空白
  const mid = time('mid', () =>
    stageSink({
      canvasW: Math.round(w * sc),
      canvasH: Math.round(h * sc),
      originX: 0,
      originY: 0,
      scale: sc,
      draw: (ctx) => wcWash(ctx, w / 2, h * 0.5, 200, C.sky, 0.15),
      pad: 4,
      label: 'mid',
    }),
  );
  notes.mid = '手机屏幕光晕（径向渐变，实测可见半径 ≈182 设计单位）';

  // ══ L2 角色：手机暗条 + 男孩 ════════════════════════════════
  // 对应 game.js:1379-1386
  //   ctx.globalAlpha=0.3; fRR(ctx, w/2-40, h*0.7, 80, 14, 4, C.darkBrown)
  //   drawBoy(ctx, w*0.5, h*0.62, sc, {expression:'surprised', blush:true})
  const actors = time('actors', () =>
    stageSink({
      canvasW: Math.round(w * sc),
      canvasH: Math.round(h * sc),
      originX: 0,
      originY: 0,
      scale: sc,
      draw: (ctx) => {
        ctx.save();
        ctx.globalAlpha = 0.3;
        fRR(ctx, w / 2 - 40, h * 0.7, 80, 14, 4, C.darkBrown);
        ctx.restore();
        drawBoy(ctx, boyX, boyY, boyScale, { expression: 'surprised', blush: true });
      },
      pad: 8,
      label: 'actors',
    }),
  );
  notes.actors = '手机暗条 + 男孩（surprised / blush）';

  // ══ 气泡底图（只烘形状）════════════════════════════════════
  // 对应 game.js:1365-1368
  //   bc = C.rgba(C.cream, 0.8); ctx.globalAlpha = alpha(=1)
  //   ctx.filter='blur(0.5px)'; fRR(ctx, b.x-50, b.y-18, 100, 36, 12, bc)
  // ⚠️ 100×36 是**设计单位（CSS 像素）**，不是设备像素
  // ⚠️ 0.8 的 alpha 必须烘进去，否则气泡会明显偏白偏实
  // 以气泡自身原点 (0,0) 为中心开画布，供运行时按位置摆放
  const BUBBLE_W = 100;
  const BUBBLE_H = 36;
  const bubbles = time('bubbles', () =>
    stageSink({
      canvasW: Math.round((BUBBLE_W + 24) * sc),
      canvasH: Math.round((BUBBLE_H + 24) * sc),
      originX: -BUBBLE_W / 2 - 12,
      originY: -BUBBLE_H / 2 - 12,
      scale: sc,
      draw: (ctx) => {
        ctx.globalAlpha = 0.8;
        fRR(ctx, -BUBBLE_W / 2, -BUBBLE_H / 2, BUBBLE_W, BUBBLE_H, 12, C.cream);
      },
      pad: 4,
      label: 'bubbles',
    }),
  );
  notes.bubbles = '气泡底（奶油白 @0.8，运行时按位置摆放 / tapped 走 shader 灰化）';

  // ══ 纸纹（独立一张，末端 multiply 叠加）══════════════════════
  // 对应 game.js:1351 drawPaperTexture(ctx, w, h)
  // 按设计尺寸喂，保证 300 点的**视觉密度与原版一致**
  const paperSink = createSink({ w: Math.round(w * sc), h: Math.round(h * sc), originX: 0, originY: 0, scale: sc });
  time('paper', () => {
    paperSink.on();
    withSeed(SEED_PAPER, () => drawPaperTexture(paperSink.ctx, w, h));
    paperSink.off();
  });
  notes.paper = '纸张纤维（稀疏点纹理，被拉伸铺满）';

  // ── 汇编 ────────────────────────────────────────────────
  const layerDefs = [
    { name: 'sky', sink: skySink, blend: 'normal', fullCover: true, overdraw, parallax: 0.2, staged: null },
    { name: 'mid', ...pick(mid), blend: 'normal', fullCover: false, overdraw: 0, parallax: 0.35 },
    { name: 'actors', ...pick(actors), blend: 'normal', fullCover: false, overdraw: 0, parallax: 0.7 },
    { name: 'bubbles', ...pick(bubbles), blend: 'normal', fullCover: false, overdraw: 0, parallax: 1 },
    { name: 'paper', sink: paperSink, blend: 'multiply', fullCover: false, overdraw: 0, parallax: 0, staged: null },
  ];

  for (const d of layerDefs) {
    if (d.touchesEdge) {
      diagnostics.push(
        `${d.name}：内容贴到了工作画布边缘，包围盒可能不完整（需加大工作画布）`,
      );
    }
  }

  return {
    design: { w, h },
    scale: sc,
    overdraw,
    /** 3D 侧 quad 放大后的设计矩形（装配端要用） */
    overdrawRect: {
      x: -((w * overdraw) / 2),
      y: -((h * overdraw) / 2),
      w: w * (1 + overdraw),
      h: h * (1 + overdraw),
    },
    anchors: { boyX, boyY, boyScale },
    /** 星场：真值参考图复用同一批，否则随机差异会盖住真问题 */
    stars,
    diagnostics,
    /** 各层 canvas（不可序列化，只在页面内用） */
    sinks: Object.fromEntries(layerDefs.map((d) => [d.name, d.sink])),
    /** 各层纯元数据（可序列化）—— 坐标全部用**设计单位** */
    specs: layerDefs.map((d) => ({
      name: d.name,
      blend: d.blend,
      fullCover: d.fullCover,
      overdraw: d.overdraw,
      parallax: d.parallax,
      note: notes[d.name],
      // 归一化矩形：3D 舞台直接可用
      nx: d.sink.originX / w,
      ny: d.sink.originY / h,
      nw: d.sink.canvas.width / sc / w,
      nh: d.sink.canvas.height / sc / h,
      // 设计单位矩形（换算 / 断言用）
      dx: d.sink.originX,
      dy: d.sink.originY,
      dw: d.sink.canvas.width / sc,
      dh: d.sink.canvas.height / sc,
    })),
    timings,
    /**
     * 刻意**不烘焙**的东西（烘了就是错）：
     *   · 4 条中文气泡文字 —— 14px 烘进贴图在 3D 缩放后会糊，且无法调字体
     *   · 粒子（烟花 + 点击 sparkle）—— 每帧位置与寿命
     *   · 气泡的位置 / alpha / tapped 状态 —— 运行时状态
     *   · 转场黑场 —— 走 DOM/CSS opacity
     *   · 相机视差本身
     */
    notBaked: ['bubble-text(中文)', 'particles', 'bubble-state', 'fade-black', 'parallax'],
  };
}

/** 从 stageSink 的返回值里取出汇编需要的字段 */
function pick(r) {
  return { sink: r.sink, bbox: r.bbox, crop: r.crop, touchesEdge: r.touchesEdge };
}
