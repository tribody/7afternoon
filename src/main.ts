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
import { S3 } from './scenes/s3';
import { LogicPlane } from './input/logicPlane';
import { FrameStats, MAX_DT, pickTier, TIER_PROFILE, type TierDecision } from './core/loop';
import { PerfOverlay } from './ui/perfOverlay';
import { PALETTE, runColorCheck } from './dev/colorCheck';

const params = new URLSearchParams(location.search);
const mode = params.get('check');

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
    loaded = await loadScene(new THREE.TextureLoader(), 's3', (n, total) =>
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

  // ── 逻辑平面与场景 ────────────────────────────────────────
  const logic = new LogicPlane(stage, 'bubbles');
  const s3 = new S3(stage, logic, {
    onText: (t) => {
      textEl.textContent = t;
    },
    onHint: (h) => {
      hintEl.textContent = h;
      hintEl.style.opacity = h ? '' : '0';
    },
    onDone: () => {
      /* M1 试点只跑 S3 一场，不做场景流转。M3 接 SceneManager。 */
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
    s3.handlePointerDown(e.clientX, e.clientY);
  };

  const onMove = (e: PointerEvent): void => {
    s3.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', (e) => {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* 同上 */
    }
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
      s3.update(dt);
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
  s3.enter();
  rafId = requestAnimationFrame(loop);

  const done = await loading.complete();
  const interactiveMs = performance.now() - readyStart;
  overlay.set('boot', `${interactiveMs.toFixed(0)}ms`);

  // ── 测试 / 自省钩子 ───────────────────────────────────────
  (window as unknown as Record<string, unknown>).__v2 = {
    stage,
    s3,
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
      return { design: d, slot: d.ok ? s3.hitTest(d.x, d.y) : -1 };
    },
    bubblePositions: () => s3.bubbleDesignPositions(),
    tapAt: (clientX: number, clientY: number) => s3.handlePointerDown(clientX, clientY),
    viewport: () => ({ w: window.innerWidth, h: window.innerHeight, dpr }),
    canvasSize: () => ({ w: canvas.width, h: canvas.height }),

    /** 保真排查：整层显隐（消融实验）与镜头冻结 */
    setLayerVisible: (name: string, on: boolean) => stage.setLayerVisible(name, on),
    setCameraEnabled: (on: boolean) => s3.setCameraEnabled(on),
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
