/**
 * S0「星空开场 · 一封信」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1052-1115。
 *
 * 分层与运行时元素的分工：
 *   · 静态：夜空 / 光晕 / 60 颗星 / 纸纹（s0.manifest.json）
 *   · runtimePlaced：信封两态（未拆封 / 已拆封），按 envY 浮动摆位，
 *     必须走 addSpriteAt 的**锚点摆位** —— 贴图是裁剪包围盒，锚点不在中心
 *   · 打开后的 8 点 sparkle 环绕不进本阶段（notBaked 已记录），用 DOM 涟漪 + 闪光代替
 */
import type { SpriteHandle } from '../render/stage';
import type { Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S0_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1053 / 1110 —— 文案一个字都不能改 */
const HINT_ENTER = '轻触星空，开启我们的故事';
const TEXT_OPENED = '一封信，开始了我们的故事';

/** 设计基准（与烘焙一致）：归一化换算用 */
const DH = 812;
/** 信封锚点（原版 translate 到的点，game.js:1068） */
const ENV_ANCHOR = { x: 0.5, y: 0.4 };
/** envY 起始：原版 enter 里是 -100（设计像素） */
const NY_START = -100 / DH;
/** 命中半径（game.js:1107） */
const HIT_RADIUS = 60;

export interface S0Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S0 {
  text = '';
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private envNy = NY_START;
  private opened = false;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  private envelope: SpriteHandle;
  private envelopeOpen: SpriteHandle;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S0Host,
    private domLayer: HTMLElement,
  ) {
    this.envelope = stage.addSpriteAt('envelope', ENV_ANCHOR, { x: ENV_ANCHOR.x, y: NY_START });
    this.envelopeOpen = stage.addSpriteAt('envelopeOpen', ENV_ANCHOR, {
      x: ENV_ANCHOR.x,
      y: NY_START,
    });
    this.envelopeOpen.setVisible(false);
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.envNy = NY_START;
    this.opened = false;
    this.done = false;
    this.text = '';
    this.hint = HINT_ENTER;
    this.envelope.setVisible(true);
    this.envelope.setOpacity(1);
    this.envelopeOpen.setVisible(false);
    this.host.onText('');
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1056 —— envY 向 h*0.4 收敛（归一化后与视口无关）
    this.envNy = U.lerp(this.envNy, ENV_ANCHOR.y, Math.min(dt * 2, 1));

    // 原版 game.js:1069 —— 浮动 sin(t*2)*8（设计像素 → 归一化）
    const float = (Math.sin(this.t * 2) * 8) / DH;
    const ny = this.envNy + float;
    this.envelope.setCenter(ENV_ANCHOR.x, ny);
    this.envelopeOpen.setCenter(ENV_ANCHOR.x, ny);

    // 原版 game.js:1057
    if (this.opened && this.t > 1.5 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S0_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S0_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S0_CAMERA.pointerGain;
    this.stage.setCameraOffset(script.x + px, script.y + py);
  }

  setPointer(nx: number, ny: number): void {
    this.pointer.x = nx;
    this.pointer.y = ny;
  }

  setCameraEnabled(on: boolean): void {
    this.cameraEnabled = on;
    if (!on) this.stage.setCameraOffset(0, 0);
  }

  handlePointerDown(clientX: number, clientY: number): boolean {
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return false;
    return this.onDown(d.x, d.y, clientX, clientY);
  }

  /** ⬇️ 与原版 classic/game.js:1105-1114 逐行对应 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    // 原版：U.dist(x, y, this.g.w/2, this.envY) < 60 && !this.opened
    if (U.dist(x, y, vw / 2, this.envNy * vh) < HIT_RADIUS && !this.opened) {
      this.opened = true;
      this.hint = '';
      this.text = TEXT_OPENED;
      this.host.onHint('');
      this.host.onText(this.text);
      // 两态切换 + 拆封闪光（原版此处 spawn sparkle×20 + heart×8）
      this.envelope.setVisible(false);
      this.envelopeOpen.setVisible(true);
      this.burst(screenX, screenY);
      return true;
    }
    return false;
  }

  /** 拆封闪光（粒子系统不进本阶段的表现层替代） */
  private burst(screenX: number, screenY: number): void {
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'spark-burst';
      el.style.left = `${screenX}px`;
      el.style.top = `${screenY}px`;
      el.style.setProperty('--a', `${(i / 8) * 360}deg`);
      this.domLayer.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
    const ring = document.createElement('div');
    ring.className = 'tap-ripple';
    ring.style.left = `${screenX}px`;
    ring.style.top = `${screenY}px`;
    this.domLayer.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  get tapCount(): number {
    return this.opened ? 1 : 0;
  }

  private get hitPoint(): { x: number; y: number } {
    return { x: 0.5, y: this.envNy };
  }

  /** 命中测试（回归测试用）：信封中心半径 60 设计像素内 */
  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    const p = this.hitPoint;
    return U.dist(x, y, p.x * vw, p.y * vh) < HIT_RADIUS ? 0 : -1;
  }

  /** 信封当前设计坐标（回归测试用） */
  envelopeDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: 0.5 * vw, y: this.envNy * vh };
  }
}
