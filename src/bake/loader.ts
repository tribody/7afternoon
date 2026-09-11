/**
 * 运行时加载器：读清单 + 拉贴图。
 *
 * 贴图基址用 `import.meta.env.BASE_URL`，这样既能在 GitHub Pages 的
 * 自定义域名根路径下工作，也能在 `/7afternoon/` 子路径下工作。
 */
import * as THREE from 'three';
import { asColorTexture, asDataTexture } from '../core/renderer';
import type { BakeManifest, BakedLayer } from './manifest';

export interface LoadedLayer {
  spec: BakedLayer;
  texture: THREE.Texture;
}

export interface LoadedScene {
  manifest: BakeManifest;
  layers: Map<string, LoadedLayer>;
}

/**
 * 素材基址。
 *
 * ⚠️ 不能直接用 `import.meta.env.BASE_URL`：vite.config 里 base 是 `'./'`，
 * 拼出来是 `./bake/…`，会被解析成**相对当前文档**的 `/v2/bake/…` —— 404。
 *
 * `bake/` 与 `v2/` 是同级目录（都在产物根下），所以从文档位置往上走一级
 * 才是对的。这样在三种部署形态下都成立：
 *   · dev            http://host/v2/            → /bake/
 *   · Pages 自定义域  http://host/v2/            → /bake/
 *   · Pages 子路径    http://host/7afternoon/v2/ → /7afternoon/bake/
 */
export function assetUrl(path: string): string {
  return new URL(`../bake/${path}`, location.href).href;
}

/**
 * 纸纹是**数据贴图**（乘算叠加），不做 sRGB 解码；
 * 其余层是颜色贴图，必须设 SRGBColorSpace —— 漏设会把暖色水彩整体提亮发白。
 */
function colorSpaceFor(name: string): (t: THREE.Texture) => THREE.Texture {
  return name === 'paper' ? asDataTexture : asColorTexture;
}

export function loadTexture(loader: THREE.TextureLoader, spec: BakedLayer): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      assetUrl(spec.file),
      (tex) => {
        colorSpaceFor(spec.name)(tex);

        // 视差出血靠 ClampToEdge 做边缘外推（对垂直渐变是精确的梯度延边），
        // 所以绝不能是 Repeat。
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;

        // ⚠️ flipY = false —— 与 Stage 里那台"y 轴向下"的正交相机配套。
        //
        // three 默认 flipY = true：把图片首行放到 UV 的 v=1（顶端），配合
        // **y 轴向上**的相机正好是正的。但本项目为了拿到原生"y 向下"的设计
        // 坐标（命中链路要靠它），把正交相机的 top/bottom 取了负值，
        // 投影矩阵 y 缩放变成 -2 —— 整幅画面被上下翻转。
        //
        // 单看画面很难发现：全屏渐变还像那么回事，只有画到具体角色才露馅
        // （男孩是倒着的）。实测把 sky 的 flipY 一翻，保真差 9.35 → 2.26，
        // 才确认是全局性的方向问题，不是某一层的错位。
        //
        // 层位置不受影响（网格中心是 0.5 对称的，映射后位置恰好不变），
        // 所以"位置对、内容反"这个组合本身就是这个坑的指纹。
        tex.flipY = false;

        // 层是 1:1 贴上去的（贴图 2× 设计，屏上 2× 设备像素），
        // 只为视差做极小的放大，用线性过滤即可，不上 mipmap（省 33% 显存）。
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        // 乘算层（纸纹）按**预乘 alpha** 上传 —— three 的 MultiplyBlending 要求
        // material.premultipliedAlpha = true，贴图侧必须同步，否则边缘算错。
        // 其余层保持 straight alpha（canvas 直出的语义），配合 NormalBlending。
        tex.premultiplyAlpha = spec.blend === 'multiply';
        tex.anisotropy = 1;
        tex.needsUpdate = true;

        resolve(tex);
      },
      undefined,
      () => reject(new Error(`贴图加载失败：${spec.file}`)),
    );
  });
}

export async function loadScene(
  loader: THREE.TextureLoader,
  sceneId: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<LoadedScene> {
  const res = await fetch(assetUrl(`${sceneId}.manifest.json`), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`清单加载失败：${sceneId}.manifest.json（HTTP ${res.status}）`);
  const manifest = (await res.json()) as BakeManifest;

  const total = manifest.layers.length;
  let loaded = 0;

  const entries = await Promise.all(
    manifest.layers.map(async (spec) => {
      const texture = await loadTexture(loader, spec);
      loaded += 1;
      onProgress?.(loaded, total);
      return [spec.name, { spec, texture }] as const;
    }),
  );

  return { manifest, layers: new Map(entries) };
}
