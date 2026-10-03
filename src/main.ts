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
import { LoadingScreen } from './ui/loading';
import { Music } from './ui/music';
import { S0 } from './scenes/s0';
import { S1 } from './scenes/s1';
import { S2 } from './scenes/s2';
import { S3 } from './scenes/s3';
import { S4 } from './scenes/s4';
import { S5 } from './scenes/s5';
import { S6 } from './scenes/s6';
import { S7 } from './scenes/s7';
import { S8 } from './scenes/s8';
import { S9 } from './scenes/s9';
import { S10 } from './scenes/s10';
import { S11 } from './scenes/s11';
import { S12 } from './scenes/s12';
import { FrameStats, MAX_DT, pickTier, TIER_PROFILE, type TierDecision } from './core/loop';
import { SceneManager, type ActiveScene, type SceneDef } from './core/sceneManager';
import { PerfOverlay } from './ui/perfOverlay';
import { PALETTE, runColorCheck } from './dev/colorCheck';

const params = new URLSearchParams(location.search);
const mode = params.get('check');

/**
 * ── M3 起 sceneId 的语义 ─────────────────────────────────────
 *
 * 不带 `?scene=`：**线性连播**，从 s0 一路走到 s12（终局定格）。
 * 带 `?scene=sN`：**单场试跑**，完成不流转 —— 这是开发/验收用的口子，
 * 冒烟的 13 场逐场闭环就走这条路（否则没法单独取证某一场）。
 */
const startScene = params.get('scene');
const linearMode = startScene === null;

/**
 * 13 场的播放顺序 —— 就是故事顺序。
 * 原版 game.js:2003-2008 是 new S0..new S12 的数组，这里与之逐一对应。
 */
const SCENE_ORDER = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];

/**
 * 场景注册表：M2 的"配置 → 贴图 → 能跑"闭环入口。
 *
 * · logicLayer —— 命中测试的参考层（视差位移补偿用）。S3 选焦点层
 *   bubbles（parallax=1，纹丝不动）；S10 没有焦点层、也没有命中测试，
 *   选最靠前的 actors（parallax=0.8）让手指与画面的偏差最小。
 * · create —— 构造对应的运行时场景实例。
 */
const SCENE_DEFS: Record<string, SceneDef> = {
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
  // S7 热区是女孩的脸（tear 层 parallax=1 → 位移补偿恒为 0）
  s7: { logicLayer: 'tear', create: (st, lg, host, dom) => new S7(st, lg, host, dom) },
  // S8 的命中对象是补光灯本体（非焦点层），镜头漂移时热区跟着灯走
  s8: { logicLayer: 'ringLight', create: (st, lg, host, dom) => new S8(st, lg, host, dom) },
  s9: { logicLayer: 'boySad', create: (st, lg, host, dom) => new S9(st, lg, host, dom) },
  s10: { logicLayer: 'actors', create: (st, lg, host, dom) => new S10(st, lg, host, dom) },
  // S11 的命中对象是 house 上的窗（house parallax=1 → 位移补偿恒为 0）
  s11: { logicLayer: 'house', create: (st, lg, host, dom) => new S11(st, lg, host, dom) },
  // S12 无定位热点（任意点按），参考层取 actors（parallax=1）与 S10 同理
  s12: { logicLayer: 'actors', create: (st, lg, host, dom) => new S12(st, lg, host, dom) },
};

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
  const music = new Music();

  // ── 音乐开关 ──────────────────────────────────────────────
  // 照抄原版 setupUI（classic/game.js:2149-2155）：
  //   pointerdown → stopPropagation（别让这张点透到 canvas 变成场景交互）
  //   + preventDefault + toggleMute + 切 .muted 样式。
  // ⚠️ 这里必须 preventDefault：音乐按钮叠在 canvas 之上，不拦的话
  //    点按钮会同时触发场景里的点按判定（原版同一处也这么写）。
  const musicBtn = document.querySelector<HTMLElement>('#music-btn');
  musicBtn?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const muted = music.toggleMute();
    musicBtn.classList.toggle('muted', muted);
  });

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

  // ── SceneManager（M3）：13 场线性推进 ─────────────────────
  // 流转状态机、目标管理、贴图滚动预取与回收全在里面，本文件只做接线。
  const sm = new SceneManager({
    stage,
    defs: SCENE_DEFS,
    order: SCENE_ORDER,
    domLayer: bubbleLayer,
    fadeEl: document.querySelector<HTMLElement>('#scene-fade'),
    dotsEl: document.querySelector<HTMLElement>('#progress-dots'),
    loader: new THREE.TextureLoader(),
    linear: linearMode,
    /**
     * ⚠️ 必须加/删 `.show` class —— CSS 里 `.scene-text` 默认 `opacity:0`，
     * 只有挂上 `.show` 才显示。只写 textContent 的话，13 场的叙事文字
     * 一个字都看不见（2026-10-03 独立验收抓到：computed opacity 恒为 0）。
     *
     * 节奏照抄原版 setSceneText（game.js:2172-2178）：先淡出 → 400ms 后换字再淡入。
     * 换场时文字是淡退后浮出来的，不是硬切。
     */
    onText: (t) => {
      textEl.classList.remove('show');
      window.setTimeout(() => {
        textEl.textContent = t || '';
        if (t) textEl.classList.add('show');
      }, 400);
    },
    onHint: (h) => {
      hintEl.textContent = h;
      hintEl.style.opacity = h ? '' : '0';
    },
    // 每装配一幕就刷一次浮层：vram 是**当前场**的占用，换场后必须重算
    onSceneMounted: (id) => {
      overlay.set('scene', id);
      overlay.set('vram', `${stage.estimateTextureMB().toFixed(1)}MB`);
    },
  });

  try {
    await sm.start(startScene ?? 's0', (n, total) => loading.setProgress(0.15 + (n / total) * 0.7));
    loading.setProgress(0.9);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await loading.fallback(`素材加载失败：${msg}`);
    showFault(`素材加载失败：${msg}`);
    return;
  }

  // ── 尺寸 ──────────────────────────────────────────────────
  const applySize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    stage.setSize(w, h, dpr);
    sm.applyViewport(w, h);
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
    // 原版 game.js:2126：首次用户手势里起播（浏览器自动播放策略要求）。
    // play() 幂等，之后每次点按调都无害。
    music.play();
    sm.handlePointerDown(e.clientX, e.clientY);
  };

  const onMove = (e: PointerEvent): void => {
    sm.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    // 拖动类交互（S4/S6/S7/S9）：原版 onMove 的等价物
    sm.handlePointerMove(e.clientX, e.clientY);
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
    sm.handlePointerUp(e.clientX, e.clientY);
  });
  // X5 上 pointercancel 比 pointerup 更早、且必然：不接的话拖拽会"卡住"
  canvas.addEventListener('pointercancel', (e) => {
    sm.handlePointerUp(e.clientX, e.clientY);
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
    sm.markTexturesDirty();
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
      sm.update(dt);
      music.update(dt);
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
  rafId = requestAnimationFrame(loop);

  const done = await loading.complete();
  const interactiveMs = performance.now() - readyStart;
  overlay.set('boot', `${interactiveMs.toFixed(0)}ms`);

  // ── 点亮 UI 层 ────────────────────────────────────────────
  // 照抄原版 hideLoading（game.js:2077-2083）：加载屏 add hidden →
  // 等 0.8s 淡出走完（CSS .loading-screen 的 transition 就是 0.8s）→
  // loading display:none + overlay display:block。
  //
  // ⚠️ 这一步漏不得：#ui-overlay 在 index.html 里默认 display:none，
  //    不点亮的话剧情文案 / 提示 / 进度点 / 音乐按钮**一个都看不见**。
  //    这是 2026-10-03 独立验收抓到的阻断级问题的**总根因** ——
  //    当时 148 项冒烟全绿却没发现，因为断言的是 JS 属性值，不是用户能不能看见。
  // ⚠️ 也不能提前点亮：文案会浮在还没淡出的加载屏上。
  window.setTimeout(() => {
    loadingEl.style.display = 'none';
    uiOverlay.style.display = 'block';
  }, 800);

  // ── 测试 / 自省钩子 ───────────────────────────────────────
  // `scene` 是当前装配的场景实例；不带 ?scene= 时从 s0 起线性连播。
  // bubblePositions 仅 S3 有（S10 无定位热点，返回空数组）。
  //
  // ⚠️ scene / sceneId / logic / manifest 一律写成 **getter**：
  //    M3 之后换场会**替换掉**这些对象，写成快照的话测试钩子会永远指着
  //    已经退场的第一幕 —— 症状是"点了没反应"但画面明明在动，极难察觉。
  (window as unknown as Record<string, unknown>).__v2 = {
    stage,
    get scene() {
      return sm.scene;
    },
    get sceneId() {
      return sm.sceneId;
    },
    get logic() {
      return sm.logicPlane;
    },
    get manifest() {
      return sm.manifest;
    },
    /** 流转状态：playing / fadeOut / waiting / fadeIn */
    get flowState() {
      return sm.flowState;
    },
    get sceneIndex() {
      return sm.sceneIndex;
    },
    sceneOrder: SCENE_ORDER,
    /** 是否为线性连播（false = ?scene=sN 单场试跑） */
    linear: linearMode,
    manager: sm,
    stats,
    overlay,
    music,
    loading: done,
    interactiveMs,
    /** 命中回归：屏幕坐标 → 设计坐标 → 原版判定 */
    designAt: (x: number, y: number) => {
      const lg = sm.logicPlane;
      return lg ? lg.toDesign(x, y) : { ok: false, x: 0, y: 0 };
    },
    hitTestAt: (clientX: number, clientY: number) => {
      const lg = sm.logicPlane;
      if (!lg) return { design: { ok: false, x: 0, y: 0 }, slot: -1 };
      const d = lg.toDesign(clientX, clientY);
      return { design: d, slot: d.ok ? (sm.scene?.hitTest(d.x, d.y) ?? -1) : -1 };
    },
    bubblePositions: () =>
      (sm.scene as (ActiveScene & { bubbleDesignPositions?: () => Array<{ slot: number; x: number; y: number; tapped: boolean }> }) | null)?.bubbleDesignPositions?.() ??
      [],
    tapAt: (clientX: number, clientY: number) => sm.handlePointerDown(clientX, clientY),
    /** 拖拽类场景（S4 拼心 / S7 擦泪 / S9 拖到一起）的 move / up 钩子 */
    moveAt: (clientX: number, clientY: number) => {
      sm.handlePointerMove(clientX, clientY);
    },
    releaseAt: (clientX: number, clientY: number) => {
      sm.handlePointerUp(clientX, clientY);
    },
    viewport: () => ({ w: window.innerWidth, h: window.innerHeight, dpr }),
    canvasSize: () => ({ w: canvas.width, h: canvas.height }),

    /** 保真排查：整层显隐（消融实验）与镜头冻结 */
    setLayerVisible: (name: string, on: boolean) => stage.setLayerVisible(name, on),
    setCameraEnabled: (on: boolean) => {
      sm.scene?.setCameraEnabled(on);
    },
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
