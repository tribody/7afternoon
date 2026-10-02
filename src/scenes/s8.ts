/**
 * S8「自媒体创业 · 拍下美好」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1688-1734。交互是"点一下闪一下"：
 *   onDown 命中补光灯（0.5w, 0.3h 的 45px）→ taps++ 且 flashT = 1
 *   update 里 flashT 以 dt*3 衰减（约 0.33 秒白幕）
 *   taps 满 4 次换文案，t>1.5 判 done
 *
 * ⚠️ 闪光是**全画布遮罩**，本项目头一次出现这种东西：
 *    它不是某个对象的贴图，而是 `fillRect(0,0,w,h)` 盖住一切（game.js:1717）。
 *    做法：烘一张纯白满幅贴图当 sprite，运行时 `setOpacity(flashT*0.6)` +
 *    按 flashT>0 控显隐。
 *
 *    ⚠️ 绘制序要命：闪光在女孩**之前**（1714 早于 1722），所以女孩不会被
 *       白幕糊掉。层序照抄，别把 flash 挪到最后去。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S8_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1689 / 1731 */
const TEXT_ENTER = '你开始创业做自媒体，闪闪发光';
const HINT_ENTER = '轻触补光灯，拍下美好';
const TEXT_DONE = '你认真的样子，真的很美';

/** 补光灯（game.js:1700 / 1726） */
const RING_NX = 0.5;
const RING_NY = 0.3;
/** 命中半径（game.js:1727） */
const HIT_RADIUS = 45;
/** 点按上限（game.js:1689） */
const MAX_TAPS = 4;
/** 白幕最大不透明度（game.js:1716） */
const FLASH_ALPHA = 0.6;

export interface S8Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S8 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private taps = 0;
  private flashT = 0;
  private flash: SpriteHandle;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S8Host,
    private domLayer: HTMLElement,
  ) {
    // 全屏幕形式的白幕：中心摆在 (0.5,0.5)，尺寸就是贴图本身的满幅 1×1
    this.flash = stage.addSprite('flash', 0.5, 0.5);
    this.flash.setVisible(false);
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.taps = 0;
    this.flashT = 0;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.applyFlash();
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1690
    if (this.flashT > 0) this.flashT -= dt * 3;
    this.applyFlash();

    if (this.taps >= MAX_TAPS && this.t > 1.5 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  /** ⬇️ 原版 game.js:1714-1720 ⬇️ */
  private applyFlash(): void {
    const on = this.flashT > 0;
    this.flash.setVisible(on);
    if (on) this.flash.setOpacity(this.flashT * FLASH_ALPHA);
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S8_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S8_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S8_CAMERA.pointerGain;
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

  /** 闪光在真值那一帧是 0（flashT 初值 0），比对前显式熄灭 */
  freezeForFidelity(): void {
    this.flashT = 0;
    this.applyFlash();
  }

  handlePointerDown(clientX: number, clientY: number): boolean {
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return false;
    return this.onDown(d.x, d.y, clientX, clientY);
  }

  /** ⬇️ 原版 game.js:1725-1733 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    if (U.dist(x, y, RING_NX * vw, RING_NY * vh) < HIT_RADIUS) {
      this.taps += 1;
      this.flashT = 1;
      this.ripple(screenX, screenY);
      if (this.taps >= MAX_TAPS) {
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
    el.className = 'tap-ripple';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.domLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  get tapCount(): number {
    return this.taps;
  }

  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    return U.dist(x, y, RING_NX * vw, RING_NY * vh) < HIT_RADIUS ? 0 : -1;
  }

  /** 补光灯的设计坐标（回归测试用） */
  ringDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: RING_NX * vw, y: RING_NY * vh };
  }
}
