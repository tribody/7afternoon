/**
 * 烘焙产物清单 —— 构建期（scripts/bake.mjs）与运行时之间的唯一契约。
 *
 * 由 bake 写出 `public/bake/<scene>.manifest.json`，v2 在启动时读取。
 * 所有坐标**分两套**，用途不同，不要混：
 *   · nx/ny/nw/nh —— 归一化（0..1），3D 舞台摆位用
 *   · dx/dy/dw/dh —— 设计坐标（= 原版 CSS 像素，基准 375×812），逻辑与命中测试用
 *   · w/h         —— 贴图像素（= 设计 × scale），显存与 mipmap 用
 */

export interface BakedLayer {
  name: string;
  file: string;
  /** 贴图像素尺寸 */
  w: number;
  h: number;
  /** 设计单位矩形（CSS 像素系），命中测试 / 换算用 */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** 归一化矩形，3D 舞台摆位用 */
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  blend: 'normal' | 'add' | 'multiply';
  /** 视差系数：0 = 完全跟随镜头（远景），1 = 完全不动（焦点层） */
  parallax: number;
  /** 该层 quad 的放大比例（只有满幅远景层需要，用于视差出血） */
  overdraw: number;
  note: string;
  bytes: number;
  sha256: string;
  vramMB: number;
  bakeMs: number | null;
}

export interface BakeManifest {
  scene: string;
  design: { w: number; h: number };
  /** 烘焙倍率：贴图像素 = 设计 × scale */
  scale: number;
  /** 3D 侧 quad 放大比例（视差出血） */
  overdraw: number;
  overdrawRect: { x: number; y: number; w: number; h: number };
  anchors: { boyX: number; boyY: number; boyScale: number };
  timings: Record<string, number>;
  notBaked: string[];
  layers: BakedLayer[];
}

/** 清单里各层的绘制次序（从后到前），与 classic/game.js 的绘制序对齐 */
export const LAYER_ORDER = ['sky', 'mid', 'paper', 'actors', 'bubbles'] as const;

/** 每层的深度（归一化舞台里的 z）。气泡必须排在男孩之前，才可能被命中 */
export const LAYER_Z: Record<string, number> = {
  sky: -8,
  mid: -6,
  paper: -5,
  actors: -4,
  bubbles: -2,
};

export function layerOf(m: BakeManifest, name: string): BakedLayer {
  const l = m.layers.find((x) => x.name === name);
  if (!l) throw new Error(`清单里没有层「${name}」`);
  return l;
}
