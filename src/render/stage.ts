/**
 * 2.5D 舞台 —— 把烘焙出来的层贴片摆进一个归一化正交空间。
 *
 * ── 空间约定（务必先读，三个数字的约定全在这里）───────────────
 *
 * 世界空间就是**归一化设计空间**：x / y ∈ [0,1]，y 向下（与设计坐标一致），
 * 用一台 1×1 的正交相机铺满视口 → 贴图自动拉伸适配任何机型尺寸。
 *
 * 代价要说清楚：原版是按百分比自适应布局的，拉伸后**宽高比会随机型变化**，
 * 布局与原版不再逐像素一致。M1 接受这点（375–390 主流宽度下偏差很小），
 * M2 若要严格保真，改为按 375:812 做 letterbox 再让可见区取子矩形。
 *
 * ── 视差 ────────────────────────────────────────────────────
 *
 * 正交相机移动**不会**产生视差（没有透视），所以视差只能靠"让层以不同速度
 * 反向位移"来伪造。参考零点取**焦点层**（`parallax === 1`，本场景是气泡）：
 *
 *     层位移 = (item.parallax - 1) × 镜头偏移
 *
 * 焦点层纹丝不动，背景层向反方向走。若直接用 `parallax × 镜头偏移`，
 * 焦点层会跟着跑，命中测试与画面就分家了。
 *
 * ── 深度 ────────────────────────────────────────────────────
 *
 * **不用深度缓冲**（depthTest = false），层序完全由 `renderOrder` 决定。
 * 2.5D 贴片堆栈里深度缓冲只带来 z-fighting 与额外状态切换，没有收益。
 * 但 z 坐标仍按 LAYER_Z 设置，因为 raycast 命中测试要靠它。
 */
import * as THREE from 'three';
import { createRenderer, PAPER_BG } from '../core/renderer';
import { LAYER_ORDER, LAYER_Z } from '../bake/manifest';
import type { LoadedScene } from '../bake/loader';
import type { BakedLayer } from '../bake/manifest';

/** 舞台上的一张贴片 */
interface Item {
  id: string;
  layerName: string;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** 未经视差位移的基准位置（归一化） */
  baseX: number;
  baseY: number;
  parallax: number;
  renderOrder: number;
}

const BLEND: Record<string, THREE.Blending> = {
  normal: THREE.NormalBlending,
  add: THREE.AdditiveBlending,
  multiply: THREE.MultiplyBlending,
};

/** 视差参考层：本层不动，其余层相对它位移 */
const PARALLAX_REF = 1;

export interface SpriteHandle {
  /** 设置中心（归一化） */
  setCenter(x: number, y: number): void;
  setOpacity(a: number): void;
  /** 灰化用（tapped 状态） */
  setTint(color: THREE.ColorRepresentation): void;
  readonly mesh: THREE.Mesh;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private camOffset = new THREE.Vector2(0, 0);
  private parallaxEnabled = true;

  private items: Item[] = [];
  private byLayer = new Map<string, BakedLayer>();
  private textures = new Map<string, THREE.Texture>();
  private disposables: Array<{ dispose(): void }> = [];
  private seq = 0;

  private raycaster = new THREE.Raycaster();
  private logicPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private hitPoint = new THREE.Vector3();

  /**
   * ⚠️ `preserveDrawingBuffer` 只在**截图模式**下开（`?capture=1`）。
   *
   * 默认 false 时，画布内容在合成后即被丢弃：`canvas.toDataURL()` 拿回来的
   * 是**只剩清屏色的一片空白**（实测 750×1624 全 #FBF6EE），
   * 而且逐层显隐做消融实验时差值纹丝不动 —— 看着像"渲染全挂"，
   * 其实场景画得好好的。headless Chromium 里尤其稳定复现。
   *
   * 它确实有代价（每帧多一次缓冲拷贝），所以生产路径绝不开。
   */
  constructor(canvas: HTMLCanvasElement, dpr: number, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.renderer = createRenderer(canvas, { preserveDrawingBuffer: opts.preserveDrawingBuffer === true });
    this.renderer.setPixelRatio(dpr);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAPER_BG);

    // ⚠️ 正交相机的 left/right/top/bottom 是**以相机位置为原点的局部坐标**，
    //    不是世界坐标。相机摆在 (0.5, 0.5, 10)，所以：
    //      left/right = ∓0.5  →  可视世界 x ∈ [0, 1]
    //      top/bottom = ∓0.5  →  可视世界 y ∈ [0, 1]，且 top 取负值让 y 轴**倒置**
    //    （three 里 NDC y=+1 对应 `top`；要让设计坐标 y=0 落在屏幕顶部，
    //      就得让 top = -0.5，这时 world y=0 映射到 NDC +1）
    //
    //    踩过的坑：一开始按世界坐标写成 (0, 1, 0, 1)，可视区实际是
    //    x ∈ [0.5, 1.5]、y 还上下颠倒 —— 现象是**画面全空**（所有层都被推出
    //    视锥），以及"屏幕↔归一化"的系统性 0.5 偏差。两个症状同一个根因。
    //
    //    近远平面也一并规范化成正值：near=0.1 / far=100，层在 world z ∈ [-8, -2]，
    //    相机 z=10 → 相机空间 z ∈ [-18, -12]，稳稳落在视锥内。
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, -0.5, 0.5, 0.1, 100);
    this.camera.position.set(0.5, 0.5, 10);
    this.camera.lookAt(0.5, 0.5, 0);
  }

  /** 装配一个已加载的场景（替换掉旧的） */
  mount(loaded: LoadedScene): void {
    this.clear();

    for (const name of LAYER_ORDER) {
      const entry = loaded.layers.get(name);
      if (!entry) continue;
      this.byLayer.set(name, entry.spec);
      this.textures.set(name, entry.texture);

      // 只对"满幅层"自动铺一张；气泡这类需要多实例的层交给场景自己 addSprite
      if (name === 'bubbles') continue;

      const { spec, texture } = entry;
      // 满幅层按 overdraw 放大，才够视差位移时"边缘不露底"
      const grow = spec.overdraw > 0 ? 1 + spec.overdraw : 1;

      this.makeItem({
        layerName: name,
        texture,
        spec: { ...spec, nw: spec.nw * grow, nh: spec.nh * grow },
        cx: spec.nx + spec.nw / 2,
        cy: spec.ny + spec.nh / 2,
        renderOrder: LAYER_ORDER.indexOf(name as (typeof LAYER_ORDER)[number]),
      });
    }

    this.applyParallax();
  }

  private makeItem(args: {
    layerName: string;
    texture: THREE.Texture;
    spec: BakedLayer;
    cx: number;
    cy: number;
    renderOrder: number;
  }): Item {
    const { layerName, texture, spec, cx, cy, renderOrder } = args;

    const geo = new THREE.PlaneGeometry(spec.nw, spec.nh);
    // three 强制要求：MultiplyBlending 必须配 premultipliedAlpha = true，
    // 否则每次渲染都会刷一条告警，而且乘算结果在软边处是错的。
    // 乘算层（纸纹）因此按预乘上传，其余层保持 straight alpha。
    const isMultiply = spec.blend === 'multiply';
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: BLEND[spec.blend] ?? THREE.NormalBlending,
      // ⚠️ 必须双面。本项目为了拿到"y 轴向下"的设计坐标，把正交相机的
      //    top/bottom 取了负值（见构造函数），代价是**投影矩阵 y 缩放为 -2**；
      //    行列式为负 ⇒ 三角形绕序被整体翻转 ⇒ three 默认对 FrontSide 开的
      //    背面剔除会把**每一个正对相机的贴片都剔掉**。
      //
      //    症状极具迷惑性：renderer.info 报 8 个 drawcall / 16 三角形、
      //    贴图全在、相机矩阵正确、命中链路一切正常，但画面只剩清屏色 ——
      //    看着像"渲染管线整体挂掉"，实际是几何在光栅化前就被丢了。
      //    排查路数：改清屏色能反映 → 读回活着；塞裸平面仍不出 → 不是贴图问题；
      //    raw GL 全屏三角形出得来 → 帧缓冲没问题；最后查 cullFace/frontFace 才破案。
      //
      //    这里用 DoubleSide 而非把相机改回去：贴片全是正对相机的平面，
      //    双面渲染不增加任何绘制成本，却能保住那条已经验证过
      //    （归一化误差 2.78e-17）的屏幕→设计坐标换算链。
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: isMultiply,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, LAYER_Z[layerName] ?? 0);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    const item: Item = {
      id: `i${this.seq++}`,
      layerName,
      mesh,
      material: mat,
      baseX: cx,
      baseY: cy,
      parallax: spec.parallax,
      renderOrder,
    };
    this.items.push(item);
    this.disposables.push(geo, mat);
    return item;
  }

  /**
   * 从某层的贴图派生一个可独立摆放的实例（气泡要 4 个）。
   * 尺寸取该层的归一化矩形——注意气泡层的贴图原点就是气泡中心，
   * 所以 nw/nh 就是气泡本身的尺寸，不是偏移量。
   */
  addSprite(layerName: string, centerX: number, centerY: number): SpriteHandle {
    const spec = this.byLayer.get(layerName);
    const texture = this.textures.get(layerName);
    if (!spec || !texture) throw new Error(`层「${layerName}」尚未装配`);

    const item = this.makeItem({
      layerName,
      texture,
      spec,
      cx: centerX,
      cy: centerY,
      // 同层内用自增的 renderOrder 保证叠放顺序（都在焦点层 z 上，不会互相遮错）
      renderOrder: LAYER_ORDER.indexOf(layerName as (typeof LAYER_ORDER)[number]) + this.seq * 0.001,
    });

    return {
      mesh: item.mesh,
      setCenter(x: number, y: number) {
        item.baseX = x;
        item.baseY = y;
      },
      setOpacity(a: number) {
        item.material.opacity = a;
        item.material.transparent = true;
      },
      setTint(color: THREE.ColorRepresentation) {
        item.material.color.set(color);
      },
    };
  }

  /** 某一层贴图的归一化尺寸（气泡精灵用） */
  normSizeOf(layerName: string): { nw: number; nh: number } {
    const s = this.byLayer.get(layerName);
    if (!s) throw new Error(`层「${layerName}」尚未装配`);
    return { nw: s.nw, nh: s.nh };
  }

  clear(): void {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    this.byLayer.clear();
    this.textures.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  setParallaxEnabled(on: boolean): void {
    this.parallaxEnabled = on;
    this.applyParallax();
  }

  /**
   * 整层显隐 —— 保真排查用的"消融实验"开关。
   *
   * 分块比对一旦超阈值，光看总数没法定位是哪一层错了。逐层关掉再看差值，
   * 一层一层排除，比盯着画面猜快得多。
   */
  setLayerVisible(layerName: string, visible: boolean): void {
    for (const it of this.items) {
      if (it.layerName === layerName) it.mesh.visible = visible;
    }
  }

  /** 舞台上所有层的名字（测试自检用） */
  layerNames(): string[] {
    return [...new Set(this.items.map((i) => i.layerName))];
  }

  /** 镜头偏移（归一化单位，量级一般 ±0.03） */
  setCameraOffset(x: number, y: number): void {
    this.camOffset.set(x, y);
    this.applyParallax();
  }

  getCameraOffset(): THREE.Vector2 {
    return this.camOffset.clone();
  }

  private applyParallax(): void {
    for (const it of this.items) {
      if (!this.parallaxEnabled) {
        it.mesh.position.set(it.baseX, it.baseY, it.mesh.position.z);
        continue;
      }
      const k = it.parallax - PARALLAX_REF;
      it.mesh.position.set(it.baseX + this.camOffset.x * k, it.baseY + this.camOffset.y * k, it.mesh.position.z);
    }
  }

  /** 某层当前的实际位移（归一化）。命中测试要扣掉它才能拿回设计坐标 */
  layerOffset(name: string): THREE.Vector2 {
    const spec = this.byLayer.get(name);
    if (!spec || !this.parallaxEnabled) return new THREE.Vector2(0, 0);
    const k = spec.parallax - PARALLAX_REF;
    return new THREE.Vector2(this.camOffset.x * k, this.camOffset.y * k);
  }

  /**
   * 屏幕坐标（clientX/clientY）→ 归一化设计坐标。
   *
   * 走 raycast 而非手算仿射映射：一是将来换成透视相机不用改；
   * 二是"命中测试必须走一条与渲染同源的路径"本身就是 M1 的验收要求
   * （原版是屏幕像素圆形判定，进 3D 后必须重做）。
   */
  screenToNorm(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    const hit = this.raycaster.ray.intersectPlane(this.logicPlane, this.hitPoint);
    if (!hit) return { x: NaN, y: NaN };
    return { x: hit.x, y: hit.y };
  }

  setSize(cssW: number, cssH: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** 显存占用估算（MB），浮层上核对预算用 */
  estimateTextureMB(): number {
    let mb = 0;
    for (const s of this.byLayer.values()) mb += (s.w * s.h * 4) / 1024 / 1024;
    return mb;
  }

  dispose(): void {
    this.clear();
    this.renderer.dispose();
  }
}
