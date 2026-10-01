/**
 * S2「剧本杀 · 心跳藏不住」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1272-1327。
 *
 * 这场只有一件事在动：心跳。原版 heartScale = 1 + sin(beatT*4)*0.15
 * （game.js:1277-1278），驱动的是**光晕 + 双层心**整块的缩放 ——
 * 所以烘成一张 scale=1 的贴图，运行时按同一公式 setScale，
 * 语义与原版完全一致（不是近似）。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S2_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1273 / 1324 —— 文案一个字都不能改 */
const TEXT_ENTER = '剧本杀的夜晚，心跳的声音藏不住了';
const HINT_ENTER = '轻触那颗跳动的心';
const TEXT_DONE = '心动，是藏不住的秘密';

/** 心与光晕的中心（game.js:1303）、命中半径（game.js:1320） */
const HEART_NX = 0.5;
const HEART_NY = 0.42;
const HIT_RADIUS = 50;
/** 原版 game.js:1279/1324 */
const MAX_TAPS = 3;

export interface S2Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S2 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private taps = 0;
  private beatT = 0;
  private heart: SpriteHandle;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S2Host,
    private domLayer: HTMLElement,
  ) {
    this.heart = stage.addSpriteAt(
      'heart',
      { x: HEART_NX, y: HEART_NY },
      { x: HEART_NX, y: HEART_NY },
    );
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.taps = 0;
    this.beatT = 0;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.heart.setVisible(true);
    this.heart.setScale(1);
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1276-1278
    this.beatT += dt;
    const beat = Math.sin(this.beatT * 4);
    const heartScale = 1 + beat * 0.15;
    this.heart.setCenter(HEART_NX, HEART_NY);
    this.heart.setScale(heartScale);

    // 原版 game.js:1279
    if (this.taps >= MAX_TAPS && this.t > 1 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S2_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S2_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S2_CAMERA.pointerGain;
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

  /** ⬇️ 与原版 classic/game.js:1318-1326 逐行对应 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    // 原版：U.dist(x, y, w/2, h*0.42) < 50
    if (U.dist(x, y, HEART_NX * vw, HEART_NY * vh) < HIT_RADIUS) {
      this.taps += 1;
      // 原版此处 spawn heart×10 + sparkle×5
      this.ripple(screenX, screenY);
      if (this.taps >= MAX_TAPS) {
        // 原版 game.js:1324
        this.hint = '';
        this.text = TEXT_DONE;
        this.t = 0;
        this.host.onHint('');
        this.host.onText(this.text);
      }
      return true;
    }
    return false;
  }

  private ripple(screenX: number, screenY: number): void {
    const el = document.createElement('div');
    el.className = 'tap-ripple heart-ripple';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.domLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  get tapCount(): number {
    return this.taps;
  }

  /** 命中测试（回归测试用）—— 命中返回 0（只有一个热点） */
  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    return U.dist(x, y, HEART_NX * vw, HEART_NY * vh) < HIT_RADIUS ? 0 : -1;
  }

  /** 心当前设计坐标（回归测试用） */
  heartDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: HEART_NX * vw, y: HEART_NY * vh };
  }
}
