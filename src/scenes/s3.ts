/**
 * S3「除夕夜聊天」的 2.5D 实现。
 *
 * ══════════════════════════════════════════════════════════════
 * 这是 M1 的试点场景，选它的理由：它是全片**最平、文本最密**的一场。
 * 天然有纵深可用的场景（星空、海边）"不验证也成立"；只有把最平的一场
 * 立起来，剩下 12 场才全部有解。
 * ══════════════════════════════════════════════════════════════
 *
 * 设计纪律（锚点 2：「设计不变、实现重写」）：
 *   · 剧情文本、微交互、判定、节奏 **100% 沿用** classic/game.js:1327-1398
 *   · 变的是**实现**：位置从"屏幕像素"改为"归一化坐标"（视口无关，与原版
 *     按百分比布局的语义等价），命中测试从"直接比屏幕坐标"改为
 *     "屏幕 → raycast → 归一化 → CSS 像素"再套原版那行 `U.dist(...) < 50`
 *   · 气泡文字**不进 3D**：14px 的中文烘进贴图在 3D 缩放后会糊，且 tapped
 *     时要改颜色。走 DOM 叠层，字最清楚、改色零成本。
 *
 * 一处**显式表现层变更**（已记入计划）：原版绘制序里男孩压在气泡之上；
 * 进 3D 后气泡必须在更靠前的 z 上才可能与光标相交，因此气泡浮在男孩之前。
 * 这是有意的，不是 bug。
 */
import * as THREE from 'three';
import { Stage, type SpriteHandle } from '../render/stage';
import { LogicPlane, U, BUBBLE_HIT_RADIUS } from '../input/logicPlane';
import { S3_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版台词，game.js:1330 —— 一个字都不能改 */
const MESSAGES = ['在吗？', '有没有女朋友？', '...其实', '我也喜欢你'];

/** 原版 game.js:1333-1341 的布局常数 */
const NX_BASE = 0.25;
const NX_STEP = 0.17;
const NY_BASE = 0.25;
const NY_STEP = 0.12;
/** 气泡初始 y（原版是 -40 设计像素，812 高 → 归一化） */
const NY_START = -40 / 812;
/** 气泡生成间隔（原版 game.js:1338） */
const SPAWN_INTERVAL = 0.8;

const COLOR_TEXT = '#8B6F5C'; // C.darkBrown
const COLOR_TEXT_TAPPED = '#B8AFA6'; // C.gray 近似值，tapped 后灰化

interface Bubble {
  slot: number;
  text: string;
  tapped: boolean;
  life: number;
  /** 归一化位置（0..1），与原版"百分比布局"语义等价 */
  nx: number;
  ny: number;
  sprite: SpriteHandle;
  dom: HTMLElement;
}

export interface S3Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S3 {
  /** 与原版 Scene 基类同名的字段，便于对照 */
  text = '除夕夜，屏幕那头的你问我有没有女朋友';
  hint = '轻触消息气泡';
  done = false;
  t = 0;

  private tapped = 0;
  private readonly maxTaps = 4;
  private bubbles: Bubble[] = [];

  private cameraT = 0;
  private pointer = new THREE.Vector2(0.5, 0.5);
  /** 调试开关：关掉后镜头停在 home 位，画面可与烘焙真值逐块比对 */
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S3Host,
    private domLayer: HTMLElement,
  ) {}

  // ── 生命周期：对应原版 Scene.enter() ─────────────────────
  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.tapped = 0;
    this.done = false;
    this.bubbles = [];

    // 原版 game.js:1328
    this.text = '除夕夜，屏幕那头的你问我有没有女朋友';
    this.hint = '轻触消息气泡';
    this.host.onText(this.text);
    this.host.onHint(this.hint);

    this.spawnBubble(); // 原版 enter() 里就 genBubble 了第一句
  }

  exit(): void {
    for (const b of this.bubbles) b.dom.remove();
    this.bubbles = [];
  }

  /** 对应原版 genBubble()，game.js:1329-1335 */
  private spawnBubble(): void {
    if (this.bubbles.length >= MESSAGES.length) return;

    const slot = this.bubbles.length;
    const spec = this.stage.normSizeOf('bubbles');

    const dom = document.createElement('div');
    dom.className = 'bubble-text';
    dom.textContent = MESSAGES[slot];
    this.domLayer.appendChild(dom);

    const sprite = this.stage.addSprite('bubbles', 0, 0);

    this.bubbles.push({
      slot,
      text: MESSAGES[slot],
      tapped: false,
      life: 0,
      // 原版：x = g.w*(0.25+slot*0.17)，归一化后与视口无关
      nx: NX_BASE + slot * NX_STEP,
      // 原版：y 从 -40 起，lerp 到 g.h*(0.25+index*0.12)
      ny: NY_START,
      sprite,
      dom,
    });

    void spec;
  }

  // ── 每帧：对应原版 Scene.update(dt) ──────────────────────
  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1338
    if (this.t > this.bubbles.length * SPAWN_INTERVAL && this.bubbles.length < MESSAGES.length) {
      this.spawnBubble();
    }

    // 原版 game.js:1339-1342
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.life += dt;
      b.ny = U.lerp(b.ny, NY_BASE + i * NY_STEP, Math.min(dt * 2, 1));
      this.paintBubble(b, i);
    }

    // 原版 game.js:1343
    if (this.tapped >= this.maxTaps && this.t > 1) {
      if (!this.done) {
        this.done = true;
        this.host.onDone();
      }
    }

    this.updateCamera(dt);
  }

  private paintBubble(b: Bubble, index: number): void {
    // 原版 game.js:1361  alpha = U.clamp(b.life*2, 0, 1)
    const alpha = U.clamp(b.life * 2, 0, 1);
    // 原版 game.js:1363  tapped 时降到 0.4 倍不透明度
    const shown = b.tapped ? alpha * 0.4 : alpha;

    b.sprite.setCenter(b.nx, b.ny);
    b.sprite.setOpacity(shown);
    if (b.tapped) b.sprite.setTint(0xb8afa6);

    const p = this.logic.normToScreen(b.nx, b.ny);
    const st = b.dom.style;
    st.left = `${p.x}px`;
    st.top = `${p.y}px`;
    // 文字不随 tapped 一起变淡 —— 原版里文字用的是 alpha 而不是 alpha*0.4
    st.opacity = String(alpha);
    st.color = b.tapped ? COLOR_TEXT_TAPPED : COLOR_TEXT;
    void index;
  }

  /**
   * 关掉镜头运动（调试 / 保真比对用）。
   * 镜头一动，层就带视差位移，画面和烘焙真值对不上 —— 比对前必须冻结。
   */
  setCameraEnabled(on: boolean): void {
    this.cameraEnabled = on;
    if (!on) this.stage.setCameraOffset(0, 0);
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S3_CAMERA, this.cameraT);

    // 指针微视差：手指位置本身给一点位移，让画面"活"起来
    const px = (this.pointer.x - 0.5) * S3_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S3_CAMERA.pointerGain;

    this.stage.setCameraOffset(script.x + px, script.y + py);
  }

  setPointer(nx: number, ny: number): void {
    this.pointer.set(nx, ny);
  }

  /**
   * 指针按下。参数是**屏幕 client 像素**（与真实事件一致）。
   *
   * 这里完成"表现层重写"里最关键的一步：把屏幕坐标反算回原版语义的
   * 设计坐标，然后原封不动地跑原版 game.js:1389-1396 的判定。
   */
  handlePointerDown(clientX: number, clientY: number): boolean {
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return false;
    return this.onDown(d.x, d.y);
  }

  /** ⬇️ 以下与原版 classic/game.js:1388-1397 逐行对应 ⬇️ */
  private onDown(x: number, y: number): boolean {
    let hit = false;
    const { w: vw, h: vh } = this.logic.viewport;

    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      // 原版：b.x = g.w*(0.25+slot*0.17)、b.y 为当前 lerp 值
      const bx = b.nx * vw;
      const by = b.ny * vh;

      if (!b.tapped && U.dist(x, y, bx, by) < BUBBLE_HIT_RADIUS) {
        b.tapped = true;
        this.tapped += 1;
        hit = true;
        // 原版此处 spawn 6 个 sparkle 粒子（fx 层，M2 接）；M1 用精灵弹一下代替
        this.popBubble(b);

        if (this.tapped >= this.maxTaps) {
          this.hint = '';
          this.text = '新年的钟声里，一切都有了答案';
          this.t = 0;
          this.host.onHint('');
          this.host.onText(this.text);
        }
      }
    }
    return hit;
  }

  /** M1 的即时反馈替代品：命中时精灵短暂放大（原版是粒子爆开） */
  private popBubble(b: Bubble): void {
    const el = b.dom;
    el.classList.remove('bubble-pop');
    void el.offsetWidth; // 强制重排，让动画能重播
    el.classList.add('bubble-pop');
  }

  get tapCount(): number {
    return this.tapped;
  }

  /** 命中测试（纯函数，回归测试用）—— 给定设计 CSS 坐标返回命中的槽位 */
  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (!b.tapped && U.dist(x, y, b.nx * vw, b.ny * vh) < BUBBLE_HIT_RADIUS) return i;
    }
    return -1;
  }

  /** 气泡的当前设计坐标（回归测试与 DOM 定位用） */
  bubbleDesignPositions(): Array<{ slot: number; x: number; y: number; tapped: boolean }> {
    const { w: vw, h: vh } = this.logic.viewport;
    return this.bubbles.map((b) => ({ slot: b.slot, x: b.nx * vw, y: b.ny * vh, tapped: b.tapped }));
  }
}
