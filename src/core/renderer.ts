import * as THREE from 'three';

/**
 * 色彩管理（方案 §5.4 —— 列为「最关键，最容易毁掉整个项目」的一条链）
 *
 *  1) outputColorSpace = SRGBColorSpace  → 唯一正确的输出出口
 *  2) 颜色贴图必须显式设 SRGBColorSpace  → 漏设 = 整体变暗发灰，**本项目第一大坑**
 *  3) 纸纹 / 噪声 / mask 用 NoColorSpace → 它们不是颜色，不该被 sRGB 解码
 *  4) toneMapping = NoToneMapping        → ACESFilmic 会把 #FF8B7B / #FFC857
 *                                          去饱和 + 压暗，正好毁掉暖色水彩
 *
 * 另有两条同样来自 §5.4 的铁律：
 *  - alpha 统一 premultiplied（非预乘会在软边留白 / 黑 halo）
 *  - 背景用原版纸底 #FBF6EE，禁纯黑
 */

/** 原版纸底 —— 摘自 classic/game.js 第 11 行 `paper: '#FBF6EE'` */
export const PAPER_BG = '#FBF6EE';

export interface RendererOptions {
  /** 色彩自检需要回读像素，必须开 preserveDrawingBuffer（仅自检页用，正常渲染别开） */
  readonly preserveDrawingBuffer?: boolean;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  opts: RendererOptions = {},
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // 水彩软边对 AA 不敏感，关掉省带宽（方案 §5.4）
    antialias: false,
    alpha: false,
    premultipliedAlpha: true,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer === true,
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(PAPER_BG), 1);

  return renderer;
}

/** 颜色贴图（烘焙出来的水彩层）→ sRGB 解码 */
export function asColorTexture(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 数据贴图（纸张纤维 / 噪声 / mask）→ 不做 sRGB 解码 */
export function asDataTexture(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
