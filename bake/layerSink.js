/**
 * 层输出重定向器 —— 烘焙管线的地基一（方案 §5.3）
 *
 * 目标：**不改动 classic/game.js 里任何一个绘制函数**，把它们的输出
 * 按层分流到不同的离屏 canvas。
 *
 * 做法：给每层造一个 canvas，然后用 Proxy 包住它的 2d context。
 * 原绘制函数拿到的永远是普通 ctx 对象，照常调用；Proxy 决定这次绘制
 * 到底落到哪一层，还是被丢弃。
 *
 * 三个必须处理的坑：
 *  1. 工厂方法（createLinearGradient / createRadialGradient / createPattern）
 *     在**非活动层也可能被调用**，因为原代码会写
 *     `ctx.fillStyle = ctx.createLinearGradient(...)`。
 *     若直接返回 undefined，调用方立刻抛错。必须照常造一个合法对象。
 *  2. save / restore 必须记账。原函数里成对出现，但跨层切换时会失衡，
 *     一旦失衡后面所有绘制全部错位。off() 负责把欠的 restore 补齐。
 *  3. 切层时要**重置变换矩阵**并套上该层的基准变换（偏移 + 缩放），
 *     否则上一层的 translate/scale 会污染下一层。
 */

const FACTORY = new Set([
  'createLinearGradient',
  'createRadialGradient',
  'createPattern',
  'createConicGradient',
]);

/**
 * @param {object} spec
 * @param {number} spec.w        画布宽（像素）
 * @param {number} spec.h        画布高（像素）
 * @param {number} [spec.originX] 画布左上角对应的**设计坐标** X。默认 0
 * @param {number} [spec.originY] 画布左上角对应的**设计坐标** Y。默认 0
 * @param {number} [spec.scale]   设计坐标 → 画布像素的缩放。默认 1
 */
export function createSink({ w, h, originX = 0, originY = 0, scale = 1 }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);

  const real = canvas.getContext('2d', { willReadFrequently: true });
  // 非活动层的兜底工厂：只为造出合法的 gradient/pattern 对象，永远不会被绘制
  const scratch = document.createElement('canvas').getContext('2d');

  let active = false;
  let saveDepth = 0;

  const applyBase = () => {
    real.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);
  };

  const proxy = new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop);

      if (typeof value !== 'function') return value;

      if (typeof prop === 'string' && FACTORY.has(prop)) {
        return (...args) =>
          active ? value.apply(target, args) : scratch[prop](...args);
      }

      if (prop === 'save') {
        return () => {
          if (!active) return;
          value.call(target);
          saveDepth++;
        };
      }

      if (prop === 'restore') {
        return () => {
          if (!active || saveDepth === 0) return;
          value.call(target);
          saveDepth--;
        };
      }

      return (...args) => {
        if (active) value.apply(target, args);
      };
    },

    set(target, prop, value) {
      if (active) Reflect.set(target, prop, value);
      return true;
    },
  });

  return {
    canvas,
    /** 传给原绘制函数的 ctx */
    ctx: proxy,
    /** 画布尺寸（像素），烘焙脚本要拿来喂原函数 */
    w: canvas.width,
    h: canvas.height,

    /** 切到本层：重置变换 + 套基准变换 */
    on() {
      if (!active) {
        applyBase();
        active = true;
      }
    },

    /** 离开本层：补齐欠账的 restore，然后停写 */
    off() {
      if (!active) return;
      while (saveDepth > 0) {
        real.restore();
        saveDepth--;
      }
      active = false;
    },

    /** 该层 canvas 左上角在设计坐标里的位置与缩放，供装配端换算 */
    originX,
    originY,
    scale,

    /**
     * 自省：把运行时真实状态读回来。
     * 起因：气泡层的实测包围盒只有画布尺寸的一半（100×36 on 200×72），
     * 与"scale=2 应铺满"的推导矛盾。不猜了，直接把变换矩阵读出来。
     */
    probe() {
      return {
        w: canvas.width,
        h: canvas.height,
        originX,
        originY,
        scale,
        rect: (() => {
          const m = real.getTransform();
          return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
        })(),
      };
    },
  };
}

/**
 * 确定性随机 —— 让「真值「与「烘焙」两侧拿到**逐点相同**的星星与纸纹。
 *
 * 原版有两处静态层的随机源：
 *   game.js:930  makeStars()            40 颗星
 *   game.js:154  drawPaperTexture()     300 个颗粒点
 * 它们都走 Math.random，两次调用必然不同。若不锁种子，真值 vs 合成的
 * 分块比对会被这些"本来就该不一样"的像素淹没，把结构性错误盖过去
 * —— 实测这一项贡献了平均差里的大头。
 *
 * 注意：drawBoy / drawSky / wcWash 全部是确定性的，不需要锁。
 */
export const SEED_STARS = 0x5a17c0de;
export const SEED_PAPER = 0x9e3779b9;

/** mulberry32 —— 32 位种子，够用且短 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在 fn 执行期间把 Math.random 换成固定序列 */
export function withSeed(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/**
 * 从一个已有的 canvas 造一个"只读 sink"（烘焙完裁剪之后用）。
 * 不提供 ctx 代理 —— 裁剪后不再绘制，只需要尺寸与原点信息。
 */
export function sinkFromCanvas(canvas, { originX = 0, originY = 0, scale = 1 } = {}) {
  const real = canvas.getContext('2d', { willReadFrequently: true });
  return {
    canvas,
    w: canvas.width,
    h: canvas.height,
    originX,
    originY,
    scale,
    probe() {
      const m = real.getTransform();
      return {
        w: canvas.width,
        h: canvas.height,
        originX,
        originY,
        scale,
        rect: { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f },
      };
    },
  };
}

/**
 * 扫描非透明像素，求紧致包围盒（画布坐标系）。
 * 用来把"我猜角色多大"变成"我量了角色多大"。
 */
export function tightBBox(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas
    .getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[(row + x) * 4 + 3] > 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
