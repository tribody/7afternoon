/**
 * 场景烘焙公共库 —— M2 量产的地基
 *
 * M1 把 S3 跑通之后，剩下 12 场不需要写 12 套渲染器：扫描结果
 * （node scripts/scan-scenes.mjs）显示 13 场的结构**完全同构**：
 *
 *     drawSky + drawGround + drawPaperTexture + wcWash×1..4 + drawBoy/drawGirl(/drawCat)
 *
 * 差别只在：调色板、Wash 的位置半径、角色站位与表情、云/家具等少量点缀、
 * 以及交互热点。所以把"按下述顺序把若干次绘制调用写进若干张离屏画布"
 * 这件事参数化，剩下每场就只是一份**配置**。
 *
 * ══════════════════════════════════════════════════════════════
 * 沿用 S3 血换来的三条纪律（详见 bake/scenes/s3.js 文件头）
 * ══════════════════════════════════════════════════════════════
 *   A. 调用原版函数永远喂**设计坐标**（375×812），放大交给 sink 的 scale
 *   B. 出血不要用放大画布解决 —— 按设计尺寸烘，3D 侧放大 quad + ClampToEdge
 *   C. 不要手推图层矩形 —— 「大画布画 → 量紧致包围盒 → 裁剪」自标定
 */
import { createSink, sinkFromCanvas, tightBBox } from '../layerSink.js';

/** 设计坐标（= 原版 CSS 像素系的基准机型 iPhone X） */
export const DESIGN = { w: 375, h: 812 };

/** 烘焙倍率：贴图按 2× 出，喂原函数时仍用设计坐标 */
export const SCALE = 2;

/** 3D 侧默认视差出血比例（**不影响烘焙尺寸**） */
export const OVERDRAW = 0.15;

/**
 * 「大画布画 → 量紧致包围盒 → 裁剪」。
 *
 * @param {object} p
 * @param {number} p.canvasW  工作画布宽（canvas 像素）
 * @param {number} p.canvasH  工作画布高
 * @param {number} p.originX  工作画布左上角对应的设计坐标 X
 * @param {number} p.originY  同上 Y
 * @param {number} p.scale    设计 → canvas 缩放
 * @param {(ctx: CanvasRenderingContext2D) => void} p.draw
 * @param {number} p.pad      裁剪余量（设计像素，给 blur / 软边留空间）
 * @param {string} p.label    报错用
 * @returns {{sink, bbox, crop, touchesEdge, workCanvas}}
 */
export function stageSink({ canvasW, canvasH, originX, originY, scale, draw, pad, label }) {
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

  // 内容贴到工作画布边缘 = 可能被切；必须报出来而不是默默裁掉
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
 * 按场景配置烘焙分层贴图。
 *
 * @param {object} spec 场景规格
 * @param {string} spec.id        场景 id（'s3' / 's10' …）
 * @param {number} [spec.overdraw]
 * @param {Array}  spec.layers    层的**绘制顺序**（后画的在上；multiply 层按此顺序作用于其下所有层）
 * @param {object} [spec.anchors] 场景锚点（角色坐标等），供运行时断言用
 * @param {Array}  [spec.stars]   星场（有星的场景由调用方锁种子生成后传入）
 * @param {Array}  [spec.notBaked]刻意不烘焙的东西，写进元数据留痕
 * @param {object} [opts]
 */
export function bakeScene(spec, opts = {}) {
  const w = opts.w ?? DESIGN.w;
  const h = opts.h ?? DESIGN.h;
  const sc = opts.scale ?? SCALE;
  const overdraw = opts.overdraw ?? spec.overdraw ?? OVERDRAW;

  const timings = {};
  const diagnostics = [];
  const time = (name, fn) => {
    const t0 = performance.now();
    const r = fn();
    timings[name] = +(performance.now() - t0).toFixed(2);
    return r;
  };

  const fullCanvas = { w: Math.round(w * sc), h: Math.round(h * sc) };

  /** 各层产出：{ name, sink, note, blend, parallax, fullCover, overdraw, touchesEdge, bbox, crop } */
  const built = spec.layers.map((L) => {
    const name = L.name;
    const blend = L.blend ?? 'normal';
    const parallax = L.parallax ?? 1;
    const pad = L.pad ?? 6;

    if (L.mode === 'full') {
      // 全幅层：自身就是整张设计尺寸，不裁剪（要铺满并参与视差）
      const sink = createSink({ w: fullCanvas.w, h: fullCanvas.h, originX: 0, originY: 0, scale: sc });
      time(name, () => {
        sink.on();
        L.draw(sink.ctx, w, h);
        sink.off();
      });
      return {
        name,
        sink,
        blend,
        parallax,
        fullCover: true,
        overdraw: L.overdraw ?? overdraw,
        touchesEdge: null,
        note: L.note ?? '',
      };
    }

    // 裁剪层：给出工作画布（**设计单位**），内部自标定包围盒
    const box = L.box ?? { w, h, originX: 0, originY: 0 };
    const r = time(name, () =>
      stageSink({
        canvasW: Math.round(box.w * sc),
        canvasH: Math.round(box.h * sc),
        originX: box.originX,
        originY: box.originY,
        scale: sc,
        draw: (ctx) => L.draw(ctx, w, h),
        pad,
        label: `${spec.id}/${name}`,
      }),
    );
    if (r.touchesEdge) {
      diagnostics.push(
        `${spec.id}/${name}：内容贴到工作画布边缘，包围盒可能不完整（加大 box 或缩小包内容）`,
      );
    }
    return {
      name,
      sink: r.sink,
      blend,
      parallax,
      fullCover: false,
      overdraw: 0,
      touchesEdge: r.touchesEdge,
      bbox: r.bbox,
      crop: r.crop,
      note: L.note ?? '',
    };
  });

  return {
    id: spec.id,
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
    anchors: spec.anchors ?? {},
    stars: spec.stars ?? null,
    diagnostics,
    sinks: Object.fromEntries(built.map((d) => [d.name, d.sink])),
    /** 纯元数据（可序列化）—— 坐标全部用**设计单位** */
    specs: built.map((d) => ({
      name: d.name,
      blend: d.blend,
      fullCover: d.fullCover,
      overdraw: d.overdraw,
      parallax: d.parallax,
      runtimePlaced: !!d.runtimePlaced, // 运行时按坐标摆放的素材层（合成对照时跳过）
      note: d.note,
      nx: d.sink.originX / w,
      ny: d.sink.originY / h,
      nw: d.sink.canvas.width / sc / w,
      nh: d.sink.canvas.height / sc / h,
      dx: d.sink.originX,
      dy: d.sink.originY,
      dw: d.sink.canvas.width / sc,
      dh: d.sink.canvas.height / sc,
    })),
    timings,
    notBaked: spec.notBaked ?? [],
  };
}

/** 从 stageSink 结果取汇编字段（老脚本兼容用） */
export function pick(r) {
  return { sink: r.sink, bbox: r.bbox, crop: r.crop, touchesEdge: r.touchesEdge };
}
