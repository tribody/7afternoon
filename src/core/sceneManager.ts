/**
 * M3 · SceneManager —— 13 场线性推进的状态机。
 *
 * ── 照抄原版 Game.update 的流转（classic/game.js:2194-2229）─────────
 *
 *   playing → scene.update(dt)
 *             场景 done 且不是最后一幕 → 起 completionTimer
 *             completionTimer 累计到 2.0s → state=fadeOut, fadeAlpha=0
 *   fadeOut → fadeAlpha += dt/0.6
 *             到 1 → 旧场景 exit → index++ → 新场景 enter → updateUI
 *                    （进度点重建 + 文案切换）→ state=fadeIn
 *   fadeIn  → **新场景也在 update**（重要，别以为过场就该冻结）
 *             fadeAlpha -= dt/0.6；到 0 → state=playing
 *
 *   最后一幕 S12 的 done 恒为 false ⇒ timer 永不启动 ⇒ 永远停在 playing。
 *   这不是 bug，是**终局定格**：故事停在大心脉冲上，由观众自己退场。
 *   v2 照抄，不自作主张加"重玩"按钮。
 *
 * ── v2 必须解决的新问题：贴图是异步加载的 ──────────────────────────
 *
 *   原版是同步 Canvas2D 绘制，切场景是瞬时的；v2 要 await loadScene。
 *   解法是**滚动预取**：进入第 N 场时就把第 N+1 场的贴图在后台拉好，
 *   于是 fadeOut 走黑的那 0.6s 里可以直接同步 mount，零等待。
 *   预取窗口 = 完成后的 2.0s + fadeOut 的 0.6s = 2.6s，带宽再差也够。
 *
 *   万一还是没到位：加了一个 'waiting' 态，停在全黑等它 ——
 *   宁可多黑半秒，也不带着半成品画面进 fadeIn。
 *
 * ── 显存：为什么不能"全加载 + 永不释放" ───────────────────────────
 *
 *   ⚠️ `Stage.clear()` 只 dispose 几何体与材质，**完全不管贴图**。
 *      所以贴图必须由本模块自己回收，换 13 场才会一路泄漏 GPU 纹理。
 *   策略：只保留「当前 + 下一场」两份，切走的那份立刻 texture.dispose()。
 *   峰值显存 ≈ 两场 ≈ 5MB（单场约 2.4MB），远低于 96MB 预算。
 *   顺序有讲究：**先 stage.mount(新) 再 dispose(旧)** —— mount 内部会
 *   clear() 掉引用旧贴图的材质，反过来的话有一瞬间处于半释放状态。
 */
import * as THREE from 'three';
import { Stage } from '../render/stage';
import { LogicPlane } from '../input/logicPlane';
import { loadScene, type LoadedScene } from '../bake/loader';

export interface SceneHost {
  onText(t: string): void;
  onHint(h: string): void;
  /** 本场完成。SceneManager 据此启动换场倒计时（原版 scenes[i].done 的等价物） */
  onDone(): void;
}

/** 13 场在主循环里需要的最小公共面 */
export interface ActiveScene {
  readonly text: string;
  readonly hint: string;
  readonly done: boolean;
  enter(): void;
  exit?(): void;
  update(dt: number): void;
  handlePointerDown(clientX: number, clientY: number): boolean;
  /**
   * 拖动类交互（S4 拼心 / S6 抚摸 / S7 擦泪 / S9 拖到一起）需要 move / up。
   * ⚠️ 坐标一律是**屏幕 client 像素**，由场景自己 toDesign —— 与 down 一致。
   */
  handlePointerMove?(clientX: number, clientY: number): void;
  handlePointerUp?(clientX: number, clientY: number): void;
  setPointer(nx: number, ny: number): void;
  setCameraEnabled(on: boolean): void;
  /** 保真比对前的"静默"钩子：把随机自生成元素（花瓣/雨滴相位）归零 */
  freezeForFidelity?(): void;
  /** 命中测试（设计坐标 → 槽位）。无定位热点的场景（S10/S12）恒返回 0 */
  hitTest(x: number, y: number): number;
}

export interface SceneDef {
  logicLayer: string;
  create(stage: Stage, logic: LogicPlane, host: SceneHost, domLayer: HTMLElement): ActiveScene;
}

/** 原版 fadeDur = 0.6s、完成后等 2.0s —— 逐字照抄，这两个数是节奏本身 */
const FADE_DUR = 0.6;
const COMPLETE_WAIT = 2.0;

export type FlowState = 'playing' | 'fadeOut' | 'waiting' | 'fadeIn';

export interface SceneManagerOpts {
  stage: Stage;
  defs: Record<string, SceneDef>;
  /** 线性推进顺序。常规（国外）情况下就是 s0..s12 */
  order: readonly string[];
  domLayer: HTMLElement;
  fadeEl: HTMLElement | null;
  dotsEl: HTMLElement | null;
  loader: THREE.TextureLoader;
  /** 是否线性连播。false = 单场试跑模式（?scene=sN），完成不流转 */
  linear: boolean;
  onText(t: string): void;
  onHint(h: string): void;
  /** 每装配完一幕就回调一次（浮层的 scene / vram 之类的外币要跟着换） */
  onSceneMounted?(id: string, index: number): void;
}

export class SceneManager {
  private readonly opts: SceneManagerOpts;
  private readonly cache = new Map<string, LoadedScene>();
  private readonly preloading = new Map<string, Promise<LoadedScene>>();

  private index = 0;
  private current: ActiveScene | null = null;
  private logic: LogicPlane | null = null;
  private loadedNow: LoadedScene | null = null;

  private state: FlowState = 'playing';
  private fadeAlpha = 0;
  private completionTimer = -1;
  private completionHandled = false;
  private swapping = false;

  constructor(opts: SceneManagerOpts) {
    this.opts = opts;
  }

  // ── 对外只读状态 ──────────────────────────────────────────
  get scene(): ActiveScene | null {
    return this.current;
  }
  get sceneId(): string {
    return this.opts.order[this.index] ?? '';
  }
  get flowState(): FlowState {
    return this.state;
  }
  get sceneIndex(): number {
    return this.index;
  }
  get logicPlane(): LogicPlane | null {
    return this.logic;
  }
  get manifest(): LoadedScene['manifest'] | null {
    return this.loadedNow?.manifest ?? null;
  }
  /** 走完全流程（停在最后一幕且它永不 done）时为 true */
  get finished(): boolean {
    return this.index >= this.opts.order.length - 1 && this.state === 'playing' && this.completionTimer < 0;
  }

  /** 装配首幕。贴图在这一步拉，加载屏的进度也走这里。 */
  async start(sceneId: string, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const idx = this.opts.order.indexOf(sceneId);
    this.index = idx >= 0 ? idx : 0;

    const loaded = await this.fetch(this.sceneId, onProgress);
    this.mountScene(this.sceneId, loaded);
    this.renderProgress();
    this.prefetchNext();
  }

  /** resize / orientationchange 后重设逻辑平面视口 */
  applyViewport(w: number, h: number): void {
    this.logic?.setViewport(w, h);
  }

  /**
   * WebGL 上下文恢复后调用：GPU 侧资源全部失效，贴图要重新标脏上传。
   * 中低端安卓切后台很容易走到这条路，不接就是白屏。
   */
  markTexturesDirty(): void {
    if (!this.loadedNow) return;
    for (const [, e] of this.loadedNow.layers) e.texture.needsUpdate = true;
  }

  // ── 主循环 ────────────────────────────────────────────────
  update(dt: number): void {
    const scene = this.current;
    if (!scene) return;

    if (this.state === 'playing') {
      scene.update(dt);

      if (scene.done && !this.completionHandled) {
        this.completionHandled = true;
        // 原版 game.js:2199-2201：只有**还有下一场**才启动换场倒计时。
        // 最后一幕的 done 若为 false，连 timer 都不会起 —— 这就是终局定格。
        if (this.opts.linear && this.index < this.opts.order.length - 1) {
          this.completionTimer = 0;
        }
      }

      if (this.completionTimer >= 0) {
        this.completionTimer += dt;
        if (this.completionTimer >= COMPLETE_WAIT) {
          this.completionTimer = -1;
          this.state = 'fadeOut';
          this.fadeAlpha = 0;
        }
      }
    } else if (this.state === 'fadeOut') {
      this.fadeAlpha = Math.min(1, this.fadeAlpha + dt / FADE_DUR);
      if (this.fadeAlpha >= 1 && !this.swapping) void this.swapScene();
    } else if (this.state === 'waiting') {
      // 等号下一幕的贴图还没到位：维持全黑等着。
      // swapScene 完成后会自行切到 fadeIn。
    } else if (this.state === 'fadeIn') {
      // ⚠️ 原版在这一步也在跑新场景的 update（game.js:2224），照抄：
      //    新场景的入场动画本来就该在淡入的同时展开。
      scene.update(dt);
      this.fadeAlpha = Math.max(0, this.fadeAlpha - dt / FADE_DUR);
      if (this.fadeAlpha <= 0) {
        this.fadeAlpha = 0;
        this.state = 'playing';
      }
    }

    this.applyFade();
  }

  // ── 输入转发 ──────────────────────────────────────────────
  // ⚠️ 照抄原版 onPointer（game.js:2118-2121）：**只有 playing 态**才把
  //    点按交给场景。过场期间在黑幕上乱点不该被下一幕记账。
  handlePointerDown(clientX: number, clientY: number): boolean {
    if (this.state !== 'playing' || !this.current) return false;
    return this.current.handlePointerDown(clientX, clientY);
  }
  handlePointerMove(clientX: number, clientY: number): void {
    if (this.state !== 'playing') return;
    this.current?.handlePointerMove?.(clientX, clientY);
  }
  handlePointerUp(clientX: number, clientY: number): void {
    if (this.state !== 'playing') return;
    this.current?.handlePointerUp?.(clientX, clientY);
  }
  setPointer(nx: number, ny: number): void {
    this.current?.setPointer(nx, ny);
  }

  // ── 内部：换场 ────────────────────────────────────────────
  private async swapScene(): Promise<void> {
    const nextId = this.opts.order[this.index + 1];
    if (!nextId) {
      this.state = 'playing';
      return;
    }
    this.swapping = true;
    this.state = 'waiting';

    let loaded: LoadedScene;
    try {
      loaded = await this.fetch(nextId);
    } catch {
      // 贴图拉取失败：退回当前幕继续播，绝不黑屏卡死
      this.state = 'fadeIn';
      this.swapping = false;
      return;
    }

    // 旧幕退场。注意顺序：**先 exit、再清 DOM**，因为场景的 exit 只能清理
    // 它自己记得住的东西，而兜底清理（replaceChildren）会把漏网的 DOM 元素
    // （S7 进度环、S9 距离虚线那类）一并带走。
    this.current?.exit?.();
    this.opts.domLayer.replaceChildren();

    const oldLoaded = this.loadedNow;
    this.mountScene(nextId, loaded);
    // ⚠️ mount 之后才 dispose 旧贴图：mount 内部的 clear() 会先把引用着
    //    它们的材质 dispose 掉，反过来做会有一瞬间的半释放状态。
    if (oldLoaded && oldLoaded !== loaded) disposeTextures(oldLoaded);

    this.completionHandled = false;
    this.renderProgress();
    this.prefetchNext();

    this.swapping = false;
    this.state = 'fadeIn';
  }

  private mountScene(id: string, loaded: LoadedScene): void {
    const def = this.opts.defs[id];
    if (!def) throw new Error(`未知场景「${id}」`);

    this.opts.stage.mount(loaded);

    const logic = new LogicPlane(this.opts.stage, def.logicLayer);
    logic.setViewport(window.innerWidth, window.innerHeight);

    const host: SceneHost = {
      onText: (t) => this.opts.onText(t),
      onHint: (h) => this.opts.onHint(h),
      onDone: () => {
        /* 留给 update() 用 scene.done 判，这里只做兼容占位 */
      },
    };

    const scene = def.create(this.opts.stage, logic, host, this.opts.domLayer);
    this.current = scene;
    this.logic = logic;
    this.loadedNow = loaded;
    this.index = this.opts.order.indexOf(id);

    // enter() 里通常会调 host.onText 写入场文案 —— 所以要在 update 之前
    scene.enter();
    this.opts.onSceneMounted?.(id, this.index);
  }

  // ── 内部：素材滚动缓存 ────────────────────────────────────
  private fetch(id: string, onProgress?: (loaded: number, total: number) => void): Promise<LoadedScene> {
    const hit = this.cache.get(id);
    if (hit) return Promise.resolve(hit);

    const pending = this.preloading.get(id);
    if (pending) return pending;

    const p = loadScene(this.opts.loader, id, onProgress)
      .then((ls) => {
        this.cache.set(id, ls);
        this.preloading.delete(id);
        return ls;
      })
      .catch((e) => {
        this.preloading.delete(id);
        throw e;
      });
    this.preloading.set(id, p);
    return p;
  }

  /** 后台预取下一幕 —— 让 fadeOut 结束时能同步 mount */
  private prefetchNext(): void {
    if (!this.opts.linear) return;
    const nid = this.opts.order[this.index + 1];
    if (!nid) return;
    void this.fetch(nid).catch(() => {
      /* 预取失败没关系，swapScene 会重试；届时才会停在黑幕等 */
    });
  }

  // ── 内部：进度点 ──────────────────────────────────────────
  /**
   * 照抄原版 updateUI（game.js:2160-2167）：i < currentScene 标 done，
   * i === currentScene 标 active。CSS 里 .progress-dot/.done/.active 早已写好。
   *
   * 只在线性模式下渲染：单场试跑（?scene=sN）没有"玩到第几场"的语义，
   * 画一排点只是在误导自己。
   */
  private renderProgress(): void {
    const el = this.opts.dotsEl;
    if (!el) return;
    el.replaceChildren();
    if (!this.opts.linear) return;

    for (let i = 0; i < this.opts.order.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      if (i < this.index) dot.classList.add('done');
      if (i === this.index) dot.classList.add('active');
      el.appendChild(dot);
    }
  }

  private applyFade(): void {
    if (this.opts.fadeEl) this.opts.fadeEl.style.opacity = String(this.fadeAlpha);
  }
}

function disposeTextures(ls: LoadedScene): void {
  for (const [, e] of ls.layers) e.texture.dispose();
}
