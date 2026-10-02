/**
 * S7「失业 · 雨天擦泪」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1616-1685。这是全片**第二个按住型交互**：
 *   onDown 命中女孩（0.55w, 0.5h 的 50px）→ wiping = true
 *   onMove 只要还在 50px 内就 +0.03 → 需要约 34 次移动才擦完
 *   onUp 擦满才换文案；done 由 update 判（tearWipe≥1 && t>1.5）
 *
 * 运行时元素（都不进烘焙）：
 *   · 雨幕 —— 由两张**同一贴图**的实例首尾相接向下滚动。原版是 80 条各自
 *     以 200–400 px/s 下落（game.js:958），各自的速度差没法用贴图表达，
 *     统一按 300 px/s 卷动，够像雨。已记入 notBaked。
 *   · 泪珠 —— 一颗贴图实例化 3 份，按 i < 3 - floor(tearWipe*3) 逐颗消失，
 *     整体跟着 sin(t*2)*3 上下浮动（game.js:1650）。
 *   · 进度弧 —— 走 DOM SVG（与 S6 的抚摸环同一套：改 dashoffset）。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S7_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1617 / 1684 */
const TEXT_ENTER = '那天下了很大的雨，你很难过';
const HINT_ENTER = '轻轻擦去她的眼泪';
const TEXT_DONE = '别哭，有我在';

const DW = 375;
const DH = 812;
/** 女孩脸的位置（game.js:1650/1668/1674 用的同一个点） */
const GIRL_NX = 0.55;
const FACE_NY = 0.5;
/** 命中半径（game.js:1674 / 1678） */
const HIT_RADIUS = 50;
/** 每次 move 的擦拭增量（game.js:1679） */
const WIPE_STEP = 0.03;
/** 第 0 颗泪珠的基准位置（= tearY + 20，game.js:1656） */
const TEAR_NX = GIRL_NX - 10 / DW;
const TEAR_NY = FACE_NY + 20 / DH;
/** 雨幕卷动速度（设计像素/秒）—— 原版是 200–400 的随机值，取中位 */
const RAIN_SPEED = 300;
/** 进度弧半径（game.js:1668） */
const RING_PX = 35;

export interface S7Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S7 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private wiping = false;
  private tearWipe = 0;
  private rainT = 0;
  private rainA: SpriteHandle;
  private rainB: SpriteHandle;
  private tears: SpriteHandle[] = [];
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;
  private frozen = false;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S7Host,
    private domLayer: HTMLElement,
  ) {
    // 雨幕：两张同贴图实例，一张铺当前画面、一张吊在它正上方补滚动空档
    const center = { x: 0.5, y: 0.5 };
    this.rainA = stage.addSprite('rain', center.x, center.y);
    this.rainB = stage.addSprite('rain', center.x, -0.5);

    const anchor = { x: TEAR_NX, y: TEAR_NY };
    for (let i = 0; i < 3; i++) {
      this.tears.push(stage.addSpriteAt('tear', anchor, anchor));
    }

    this.ring = document.createElement('div');
    this.ring.className = 'wipe-ring';
    this.ring.innerHTML =
      '<svg viewBox="0 0 72 72" width="72" height="72">' +
      `<circle cx="36" cy="36" r="${RING_PX}" fill="none" stroke="rgba(255,139,123,0.25)" stroke-width="3"/>` +
      `<circle class="wipe-ring-arc" cx="36" cy="36" r="${RING_PX}" fill="none" stroke="#FF8B7B" ` +
      'stroke-width="3" stroke-linecap="round" transform="rotate(-90 36 36)"/></svg>';
    this.ring.style.display = 'none';
    this.domLayer.appendChild(this.ring);
    this.ringArc = this.ring.querySelector('.wipe-ring-arc') as SVGCircleElement;
    const CIRC = 2 * Math.PI * RING_PX;
    this.ringArc.style.strokeDasharray = `${CIRC}`;
    this.ringArc.style.strokeDashoffset = `${CIRC}`;
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.wiping = false;
    this.tearWipe = 0;
    this.rainT = 0;
    this.frozen = false;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.applyRain();
    this.applyTears();
    this.ring.style.display = 'none';
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    if (!this.frozen) {
      this.rainT += dt;
      this.applyRain();
    }
    this.applyTears();
    this.paintRing();

    // 原版 game.js:1618
    if (this.tearWipe >= 1 && this.t > 1.5 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  /** 雨幕：整像素滚动，周期 = 1 个画幅高 */
  private applyRain(): void {
    const p = ((this.rainT * RAIN_SPEED) / DH) % 1;
    this.rainA.setCenter(0.5, 0.5 + p);
    this.rainB.setCenter(0.5, -0.5 + p);
  }

  /** ⬇️ 原版 game.js:1649-1660 ⬇️ */
  private applyTears(): void {
    const float = (Math.sin(this.t * 2) * 3) / DH;
    const left = 3 - Math.floor(this.tearWipe * 3);
    for (let i = 0; i < this.tears.length; i++) {
      const sp = this.tears[i];
      sp.setVisible(i < left);
      sp.setCenter(TEAR_NX + (i * 10) / DW, TEAR_NY + (i * 5) / DH + float);
    }
  }

  /** ⬇️ 原版 game.js:1661-1671 ⬇️ */
  private paintRing(): void {
    if (!this.wiping || this.tearWipe >= 1) {
      this.ring.style.display = 'none';
      return;
    }
    const p = this.logic.normToScreen(GIRL_NX, FACE_NY);
    this.ring.style.display = '';
    this.ring.style.left = `${p.x}px`;
    this.ring.style.top = `${p.y}px`;
    const CIRC = 2 * Math.PI * RING_PX;
    this.ringArc.style.strokeDashoffset = `${CIRC * (1 - U.clamp(this.tearWipe, 0, 1))}`;
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S7_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S7_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S7_CAMERA.pointerGain;
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

  /**
   * 保真比对前的静默：雨幕在真值里是 U.T=0 那一帧，运行时却在每帧滚动，
   * 留着跑就等于拿滚动了三秒的雨去比静止的雨。冻结卷动并归位。
   */
  freezeForFidelity(): void {
    this.frozen = true;
    this.rainT = 0;
    this.applyRain();
  }

  handlePointerDown(clientX: number, clientY: number): boolean {
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return false;
    return this.onDown(d.x, d.y, clientX, clientY);
  }

  /** ⬇️ 原版 game.js:1673-1675 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    if (U.dist(x, y, GIRL_NX * vw, FACE_NY * vh) < HIT_RADIUS) {
      this.wiping = true;
      this.ripple(screenX, screenY);
      return true;
    }
    return false;
  }

  /** ⬇️ 原版 game.js:1676-1683：只有仍在 50px 内移动才累积 ⬇️ */
  handlePointerMove(clientX: number, clientY: number): void {
    if (!this.wiping) return;
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return;
    const { w: vw, h: vh } = this.logic.viewport;
    if (U.dist(d.x, d.y, GIRL_NX * vw, FACE_NY * vh) < HIT_RADIUS) {
      this.tearWipe = Math.min(1, this.tearWipe + WIPE_STEP);
    }
  }

  /** ⬇️ 原版 game.js:1684 ⬇️ */
  handlePointerUp(): void {
    this.wiping = false;
    if (this.tearWipe >= 1) {
      this.hint = '';
      this.text = TEXT_DONE;
      this.t = 0;
      this.host.onHint('');
      this.host.onText(this.text);
    }
  }

  private ripple(screenX: number, screenY: number): void {
    const el = document.createElement('div');
    el.className = 'tap-ripple splash-ripple';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.domLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /** 擦拭进度（0..1）—— 回归测试用 */
  get progress(): number {
    return this.tearWipe;
  }

  get tapCount(): number {
    return this.tearWipe >= 1 ? 1 : 0;
  }

  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    return U.dist(x, y, GIRL_NX * vw, FACE_NY * vh) < HIT_RADIUS ? 0 : -1;
  }

  /** 女孩脸的设计坐标（回归测试用） */
  faceDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: GIRL_NX * vw, y: FACE_NY * vh };
  }
}
