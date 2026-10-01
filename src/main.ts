/**
 * 7afternoon · v2 入口（three.js 2.5D 立体绘本重制）
 *
 * ── M1 阶段 ────────────────────────────────────────────────
 * 装配：`Stage`（2.5D 舞台）+ 烘焙贴图 + S3 场景 + 逻辑平面 + 性能埋点。
 *
 * 打开方式：
 *   npm run dev  →  http://localhost:5173/v2/                （S3 场景）
 *   npm run dev  →  http://localhost:5173/v2/?check=color     （色彩链路自检）
 *   npm run dev  →  http://localhost:5173/v2/?debug=1         （性能浮层常显）
 *   npm run dev  →  http://localhost:5173/                    （根转发页 → classic 原版）
 *
 * 后续场景会在这里继续装配，本文件是唯一入口。
 */
import * as THREE from 'three';
import { Stage } from './render/stage';
import { loadScene, type LoadedScene } from './bake/loader';
import { LoadingScreen } from './ui/loading';
import { S0 } from './scenes/s0';
import { S1 } from './scenes/s1';
import { S2 } from './scenes/s2';
import { S3 } from './scenes/s3';
import { S4 } from './scenes/s4';
import { S5 } from './scenes/s5';
import { S6 } from './scenes/s6';
import { S10 } from './scenes/s10';
import { LogicPlane } from './input/logicPlane';
import { FrameStats, MAX_DT, pickTier, TIER_PROFILE, type TierDecision } from './core/loop';
import { PerfOverlay } from './ui/perfOverlay';
import { PALETTE, runColorCheck } from './dev/colorCheck';

const params = new URLSearchParams(location.search);
const mode = params.get('check');

/** 本阶段装配哪个场景（M3 接 SceneManager 后由流转状态机接管） */
const sceneId = params.get('scene') ?? 's3';

/**
 * 场景注册表：M2 的"配置 → 贴图 → 能跑"闭环入口。
 *
 * · logicLayer —— 命中测试的参考层（视差位移补偿用）。S3 选焦点层
 *   bubbles（parallax=1，纹丝不动）；S10 没有焦点层、也没有命中测试，
 *   选最靠前的 actors（parallax=0.8）让手指与画面的偏差最小。
 * · create —— 构造对应的运行时场景实例。
 */
const SCENE_DEFS: Record<
  string,
  {
    logicLayer: string;
    create(stage: Stage, logic: LogicPlane, host: { onText(t: string): void; onHint(h: string): void; onDone(): void }, domLayer: HTMLElement): ActiveScene;
  }
> = {
  s0: { logicLayer: 'envelope', create: (st, lg, host, dom) => new S0(st, lg, host, dom) },
  s1: { logicLayer: 'screens', create: (st, lg, host, dom) => new S1(st, lg, host, dom) },
  s2: { logicLayer: 'heart', create: (st, lg, host, dom) => new S2(st, lg, host, dom) },
  s3: { logicLayer: 'bubbles', create: (st, lg, host, dom) => new S3(st, lg, host, dom) },
  // S4 花瓣层 parallax=1（等于镜头参照系）， LogicPlane 用它做参考层时
  // 位移补偿恒为 0 —— 拖拽对手的是"贴在哪就是哪"的那层，选它最稳。
  s4: { logicLayer: 'heartOutline', create: (st, lg, host, dom) => new S4(st, lg, host, dom) },
  // S5 热区是海浪带，参考层取 waves 本身：镜头漂移时热区跟着可见的海面走
  s5: { logicLayer: 'waves', create: (st, lg, host, dom) => new S5(st, lg, host, dom) },
  s6: { logicLayer: 'catIdle', create: (st, lg, host, dom) => new S6(st, lg, host, dom) },
  s10: { logicLayer: 'actors', create: (st, lg, host, dom) => new S10(st, lg, host, dom) },
};

/** 13 场在主循环里需要的最小公共面（M3 的 SceneManager 将直接复用） */
interface ActiveScene {
  readonly text: string;
  readonly hint: string;
  readonly done: boolean;
  enter(): void;
  update(dt: number): void;
  handlePointerDown(clientX: number, clientY: number): boolean;
  /**
   * 拖动类交互（S4 拼心 / S6 抚摸 / S7 擦泪 / S9 拖到一起）需要 move / up。
   * 原版也是同一套：onDown 抓取 → onMove 跟随/累积 → onUp 结算。
   * ⚠️ 坐标一律是**屏幕 client 像素**，由场景自己 toDesign —— 与 down 一致。
   */
  handlePointerMove?(clientX: number, clientY: number): void;
  handlePointerUp?(clientX: number, clientY: number): void;
  setPointer(nx: number, ny: number): void;
  setCameraEnabled(on: boolean): void;
  /**
   * 保真比对前的"静默"钩子（可选）。
   *
   * 有些场景会自己生成元素（S4 每帧 6% 概率飘花瓣、S7 的雨滴相位），
   * 这些随机物不在烘焙真值里，留着比对就是假失败。实现这个方法的场景
   * 在这里把它们归零/清掉，比对才能反映"与原版是否一致"这一件事。
   */
  freezeForFidelity?(): void;
  /** 命中测试（设计坐标 → 槽位）。无定位热点的场景（S10）恒返回 0 */
  hitTest(x: number, y: number): number;
}

function must<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`缺少必需节点：${sel}`);
  return el;
}

// ══ 色彩自检模式（保留，M1 的既有验收项）══════════════════════
if (mode === 'color') {
  const canvas = must<HTMLCanvasElement>('#game-canvas');
  const loading = document.querySelector('#loading-screen');
  if (loading) loading.classList.add('hidden');

  const rows = runColorCheck(canvas);
  (window as unknown as Record<string, unknown>).__colorCheck = { palette: PALETTE, rows };
} else {
  void boot();
}

// ══ 正式场景 ══════════════════════════════════════════════════
async function boot(): Promise<void> {
  const canvas = must<HTMLCanvasElement>('#game-canvas');
  const loadingEl = must<HTMLElement>('#loading-screen');
  const fillEl = must<HTMLElement>('#loading-fill');
  const bubbleLayer = must<HTMLElement>('#bubble-layer');
  const textEl = must<HTMLElement>('#scene-text');
  const hintEl = must<HTMLElement>('#hint-text');
  const uiOverlay = must<HTMLElement>('#ui-overlay');

  const loading = new LoadingScreen(loadingEl, fillEl);

  // ── 分辨率：按档位夹住 DPR ─────────────────────────────────
  // 原版 classic/game.js:2036 的 DPR **无上限**，DPR3 的手机白烧 2.25×
  // 填充率。这里先按保守档起步，等首 60 帧实测出来再重定档。
  const rawDpr = window.devicePixelRatio || 1;
  let tier: TierDecision = pickTier(null);
  let dpr = Math.min(rawDpr, TIER_PROFILE[tier.tier].maxDpr);

  // 截图模式：开着 preserveDrawingBuffer 才能把 WebGL 帧读回来（详见 Stage 构造函数）
  const stage = new Stage(canvas, dpr, { preserveDrawingBuffer: params.get('capture') === '1' });
  const stats = new FrameStats();
  const overlay = new PerfOverlay(stats, tier);

  overlay.set('dpr', dpr.toFixed(2));
  overlay.set('design', '375×812 @2x');

  let loaded: LoadedScene;
  try {
    loaded = await loadScene(new THREE.TextureLoader(), sceneId, (n, total) =>
      loading.setProgress(0.15 + (n / total) * 0.7),
    );
    loading.setProgress(0.9);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await loading.fallback(`素材加载失败：${msg}`);
    showFault(`素材加载失败：${msg}`);
    return;
  }

  stage.mount(loaded);
  overlay.set('vram', `${stage.estimateTextureMB().toFixed(1)}MB`);
  overlay.set('scene', sceneId);

  // ── 逻辑平面与场景 ────────────────────────────────────────
  const sceneDef = SCENE_DEFS[sceneId];
  if (!sceneDef) {
    const msg = `未知场景「${sceneId}」（可用：${Object.keys(SCENE_DEFS).join(', ')}）`;
    await loading.fallback(msg);
    showFault(msg);
    return;
  }

  const logic = new LogicPlane(stage, sceneDef.logicLayer);
  const scene: ActiveScene = sceneDef.create(stage, logic, {
    onText: (t) => {
      textEl.textContent = t;
    },
    onHint: (h) => {
      hintEl.textContent = h;
      hintEl.style.opacity = h ? '' : '0';
    },
    onDone: () => {
      /* M2 仍不做场景流转（单场试跑）。M3 接 SceneManager。 */
    },
  }, bubbleLayer);

  // ── 尺寸 ──────────────────────────────────────────────────
  const applySize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    stage.setSize(w, h, dpr);
    logic.setViewport(w, h);
  };
  applySize();

  // 微信 X5 / iOS 上 resize 会连发多次，且 orientationchange 后 innerWidth
  // 可能还是旧值 —— 下一帧再量一次是最省事且有效的兜底。
  const relayout = (): void => {
    applySize();
    requestAnimationFrame(applySize);
  };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  window.visualViewport?.addEventListener('resize', relayout);

  // ── 输入 ──────────────────────────────────────────────────
  // 与原版一致：Pointer Events；setPointerCapture 带 try/catch（X5 必需）
  let started = false;

  const onDown = (e: PointerEvent): void => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* X5 上可能抛，忽略 */
    }
    if (!started) {
      started = true;
      uiOverlay.style.display = '';
    }
    scene.handlePointerDown(e.clientX, e.clientY);
  };

  const onMove = (e: PointerEvent): void => {
    scene.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    // 拖动类交互（S4/S6/S7/S9）：原版 onMove 的等价物
    scene.handlePointerMove?.(e.clientX, e.clientY);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', (e) => {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* 同上 */
    }
    // 原版 onUp：结算拖拽（拼心是否放对位置、擦泪是否擦够……）
    scene.handlePointerUp?.(e.clientX, e.clientY);
  });
  // X5 上 pointercancel 比 pointerup 更早、且必然：不接的话拖拽会"卡住"
  canvas.addEventListener('pointercancel', (e) => {
    scene.handlePointerUp?.(e.clientX, e.clientY);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ── WebGL 上下文丢失 / 恢复 ────────────────────────────────
  // 中低端安卓在微信里切后台、内存吃紧时很容易丢上下文。
  // 必须 preventDefault 才有机会拿到 restored，否则直接白屏。
  let contextLostCount = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLostCount += 1;
    overlay.set('ctxLost', String(contextLostCount));
    showFault('画面连接被系统回收，正在恢复...', true);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // 上下文恢复后 GPU 侧资源全部失效，重新上传贴图最稳妥
    for (const [, entry] of loaded.layers) entry.texture.needsUpdate = true;
    hideFault();
  });

  // ── 切后台：停表 + 复位采样 ────────────────────────────────
  // 不做这件事的话，切回来那一帧的 dt 会是几百毫秒，直接把
  // p95 / 最大帧时间污染掉，DoD 就没法判了。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      last = 0;
    } else {
      last = 0;
      stats.reset();
      overlay.set('ctxLost', String(contextLostCount));
    }
  });

  // ── 主循环 ────────────────────────────────────────────────
  let last = 0;
  let rafId = 0;
  let tierSettled = false;
  /** 帧内读回：必须在 render() 之后、同一帧内取，否则缓冲已被合成器取走 */
  let pendingCapture: ((data: string) => void) | null = null;

  const loop = (timestamp: number): void => {
    rafId = requestAnimationFrame(loop);

    if (last === 0) {
      last = timestamp;
      return;
    }
    const dt = Math.min((timestamp - last) / 1000, MAX_DT);
    const dtMs = (timestamp - last) / 1;
    last = timestamp;

    stats.record(dtMs);

    // 首 60 帧到手后重定档一次（三取劣里的实测那一项）
    if (!tierSettled && stats.count >= 60) {
      tierSettled = true;
      const t = pickTier(stats.firstFps(60));
      const nextDpr = Math.min(rawDpr, TIER_PROFILE[t.tier].maxDpr);
      tier = t;
      if (Math.abs(nextDpr - dpr) > 0.01) {
        dpr = nextDpr;
        applySize();
      }
      stage.setParallaxEnabled(TIER_PROFILE[t.tier].parallax);
      overlay.set('dpr', dpr.toFixed(2));
      overlay.set('tier', t.tier);
    }

    try {
      scene.update(dt);
      stage.render();
    } catch (err) {
      cancelAnimationFrame(rafId);
      const msg = err instanceof Error ? err.message : String(err);
      showFault(`渲染出错：${msg}`);
      throw err;
    }

    // 紧贴 render() 读回。默认 preserveDrawingBuffer=false，出这一帧之后
    // 缓冲随时可能被清空 —— Playwright 的 page.screenshot() 就抓不到 WebGL 内容。
    if (pendingCapture) {
      const done = pendingCapture;
      pendingCapture = null;
      done(canvas.toDataURL('image/png'));
    }

    overlay.frame(timestamp);
  };

  const readyStart = performance.now();
  scene.enter();
  rafId = requestAnimationFrame(loop);

  const done = await loading.complete();
  const interactiveMs = performance.now() - readyStart;
  overlay.set('boot', `${interactiveMs.toFixed(0)}ms`);

  // ── 测试 / 自省钩子 ───────────────────────────────────────
  // `scene` 是当前装配的场景实例（?scene= 选择，默认 s3）。
  // bubblePositions 仅 S3 有（S10 无定位热点，返回空数组）。
  const withBubbles = scene as ActiveScene & { bubbleDesignPositions?: () => Array<{ slot: number; x: number; y: number; tapped: boolean }> };
  (window as unknown as Record<string, unknown>).__v2 = {
    stage,
    scene,
    sceneId,
    logic,
    stats,
    overlay,
    loading: done,
    manifest: loaded.manifest,
    interactiveMs,
    /** 命中回归：屏幕坐标 → 设计坐标 → 原版判定 */
    designAt: (x: number, y: number) => logic.toDesign(x, y),
    hitTestAt: (clientX: number, clientY: number) => {
      const d = logic.toDesign(clientX, clientY);
      return { design: d, slot: d.ok ? scene.hitTest(d.x, d.y) : -1 };
    },
    bubblePositions: () => withBubbles.bubbleDesignPositions?.() ?? [],
    tapAt: (clientX: number, clientY: number) => scene.handlePointerDown(clientX, clientY),
    /** 拖拽类场景（S4 拼心 / S7 擦泪 / S9 拖到一起）的 move / up 钩子 */
    moveAt: (clientX: number, clientY: number) => scene.handlePointerMove?.(clientX, clientY),
    releaseAt: (clientX: number, clientY: number) => scene.handlePointerUp?.(clientX, clientY),
    viewport: () => ({ w: window.innerWidth, h: window.innerHeight, dpr }),
    canvasSize: () => ({ w: canvas.width, h: canvas.height }),

    /** 保真排查：整层显隐（消融实验）与镜头冻结 */
    setLayerVisible: (name: string, on: boolean) => stage.setLayerVisible(name, on),
    setCameraEnabled: (on: boolean) => scene.setCameraEnabled(on),
    layerNames: () => stage.layerNames(),

    /**
     * 帧内读回 canvas —— 这是唯一可靠的画面获取方式。
     * page.screenshot() 抓不到 WebGL 内容（缓冲在合成后即被丢弃），
     * 而 A/B 盲测素材、保真比对都依赖这一步。
     */
    captureFrame: () =>
      new Promise<string>((resolve) => {
        pendingCapture = resolve;
      }),

    /** three 的渲染统计：用来区分"没画"和"画了但没抓到" */
    renderInfo: () => ({
      calls: stage.renderer.info.render.calls,
      triangles: stage.renderer.info.render.triangles,
      programs: stage.renderer.info.programs?.length ?? 0,
      textures: stage.renderer.info.memory.textures,
      geometries: stage.renderer.info.memory.geometries,
      sceneChildren: stage.scene.children.length,
    }),
  };
}

// ── 异常兜底（绝不白屏）────────────────────────────────────
function showFault(msg: string, transient = false): void {
  const el = document.querySelector<HTMLElement>('#fault-notice');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.dataset.transient = transient ? '1' : '0';
}

function hideFault(): void {
  const el = document.querySelector<HTMLElement>('#fault-notice');
  if (el) el.hidden = true;
}
