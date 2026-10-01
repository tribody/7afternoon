/**
 * S6「养猫 · 抚摸」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1558-1613。
 *
 * 交互是**按住累积**型的：onDown 命中猫 → petting=true；只要 petting 为真，
 * update 里 petProgress 就以 0.5/s 累积（game.js:1563）；onUp 时若已满 1
 * 才换文案。done 由 update 判定（petProgress≥1 && t>1），**不需要松手**。
 *
 * 猫两态（curious / enjoy）是画出来的表情，没法用 transform 表达 ——
 * 所以烘了两层，运行时切显隐；purr 抖动是位置偏移，两态共用。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S6_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1559 / 1612 */
const TEXT_ENTER = '家里多了个小家伙，日子更热闹了';
const HINT_ENTER = '轻轻抚摸小猫';
const TEXT_DONE = '小家伙也很喜欢你们的小家';

const DH = 812;
/** 猫（game.js:1562） */
const CAT_NX = 0.5;
const CAT_NY = 0.6;
/** 命中半径（game.js:1606） */
const HIT_RADIUS = 40;
/** purr 抖动幅度（game.js:1587） */
const PURR_PX = 2;

export interface S6Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S6 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private petting = false;
  private petT = 0;
  private petProgress = 0;
  private catIdle: SpriteHandle;
  private catEnjoy: SpriteHandle;
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S6Host,
    private domLayer: HTMLElement,
  ) {
    const anchor = { x: CAT_NX, y: CAT_NY };
    this.catIdle = stage.addSpriteAt('catIdle', anchor, anchor);
    this.catEnjoy = stage.addSpriteAt('catEnjoy', anchor, anchor);
    this.catEnjoy.setVisible(false);

    // 抚摸进度环（原版是 canvas 画的 arc，game.js:1590-1596）。
    // 走 DOM SVG：进度改一个 dashoffset 就行，比每帧重绘便宜，也更清晰
    this.ring = document.createElement('div');
    this.ring.className = 'pet-ring';
    this.ring.innerHTML =
      '<svg viewBox="0 0 72 72" width="72" height="72">' +
      '<circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,139,123,0.25)" stroke-width="4"/>' +
      '<circle class="pet-ring-arc" cx="36" cy="36" r="30" fill="none" stroke="#FF8B7B" ' +
      'stroke-width="4" stroke-linecap="round" transform="rotate(-90 36 36)"/></svg>';
    this.ring.style.display = 'none';
    this.domLayer.appendChild(this.ring);
    this.ringArc = this.ring.querySelector('.pet-ring-arc') as SVGCircleElement;
    const C = 2 * Math.PI * 30;
    this.ringArc.style.strokeDasharray = `${C}`;
    this.ringArc.style.strokeDashoffset = `${C}`;
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.petting = false;
    this.petT = 0;
    this.petProgress = 0;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.catIdle.setVisible(true);
    this.catEnjoy.setVisible(false);
    this.ring.style.display = 'none';
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1563
    if (this.petting) {
      this.petProgress += dt * 0.5;
      this.petT += dt;
    }

    // 原版 game.js:1587-1588：purr 抖动 + 表情切换
    const purr = this.petting ? (Math.sin(this.petT * 10) * PURR_PX) / DH : 0;
    const ny = CAT_NY + purr;
    this.catIdle.setCenter(CAT_NX, ny);
    this.catEnjoy.setCenter(CAT_NX, ny);

    // 进度环跟着走（原版 arc 在猫上方 50 设计像素处）
    this.paintRing();

    // 原版 game.js:1563
    if (this.petProgress >= 1 && this.t > 1 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  private paintRing(): void {
    if (!this.petting || this.petProgress >= 1) {
      this.ring.style.display = 'none';
      return;
    }
    const p = this.logic.normToScreen(CAT_NX, CAT_NY - 50 / DH);
    this.ring.style.display = '';
    this.ring.style.left = `${p.x}px`;
    this.ring.style.top = `${p.y}px`;
    const C = 2 * Math.PI * 30;
    this.ringArc.style.strokeDashoffset = `${C * (1 - U.clamp(this.petProgress, 0, 1))}`;
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S6_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S6_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S6_CAMERA.pointerGain;
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

  /** ⬇️ 与原版 classic/game.js:1605-1609 逐行对应 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    // 原版：U.dist(x, y, this.catX, this.catY) < 40
    if (U.dist(x, y, CAT_NX * vw, CAT_NY * vh) < HIT_RADIUS) {
      this.petting = true;
      this.petT = 0;
      this.catIdle.setVisible(false);
      this.catEnjoy.setVisible(true);
      // 原版此处 spawn sparkle×4
      this.ripple(screenX, screenY);
      return true;
    }
    return false;
  }

  /** ⬇️ 原版 game.js:1611（onMove 只撒粒子，不参与判定）⬇️ */
  handlePointerMove(_clientX: number, _clientY: number): void {
    /* 原版在抚摸时按 15% 概率撒 heart 粒子 —— 粒子不进本阶段 */
  }

  /** ⬇️ 原版 game.js:1612 ⬇️ */
  handlePointerUp(): void {
    this.petting = false;
    if (this.petProgress >= 1) {
      // 原版：hint='' text=... t=0
      this.hint = '';
      this.text = TEXT_DONE;
      this.t = 0;
      this.host.onHint('');
      this.host.onText(this.text);
    }
  }

  private ripple(screenX: number, screenY: number): void {
    const el = document.createElement('div');
    el.className = 'tap-ripple heart-ripple';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.domLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /** 抚摸进度（0..1）—— 回归测试用 */
  get progress(): number {
    return this.petProgress;
  }

  get tapCount(): number {
    return this.petProgress >= 1 ? 1 : 0;
  }

  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    return U.dist(x, y, CAT_NX * vw, CAT_NY * vh) < HIT_RADIUS ? 0 : -1;
  }

  catDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: CAT_NX * vw, y: CAT_NY * vh };
  }
}
