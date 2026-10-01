/**
 * S5「海南蜜月 · 海浪」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1484-1554。
 *
 * 这场只有波浪在动（waveT 驱动 sin 相位），而波形变化没法用贴图变换精确
 * 表达 —— 运行时的近似是"整层上下浮动"，观感是水在动，波形不精确，
 * 已记入 notBaked（要精确得做运行时绘制的 overlay，M3 议题）。
 *
 * 命中判定是**一条水平带**：y ∈ (0.45h, 0.7h)，与原版一致（game.js:1549）。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane } from '../input/logicPlane';
import { S5_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1485 / 1552 */
const TEXT_ENTER = '海南的阳光和海浪，蜜月真好';
const HINT_ENTER = '轻触海浪，听海的声音';
const TEXT_DONE = '和你在一起的每一天都是蜜月';

const DH = 812;
/** 海浪带（game.js:1497 / 1548-1549） */
const OCEAN_NY = 0.45;
const BEACH_NY = 0.7;
/** 波浪层锚点（与烘焙 spec 的 box 原点一致） */
const WAVE_ANCHOR = { x: 0, y: (OCEAN_NY * DH - 10) / DH };
/** 原版 game.js:1485 / 1552 */
const MAX_TAPS = 5;

export interface S5Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S5 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private taps = 0;
  private waveT = 0;
  private waves: SpriteHandle;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S5Host,
    private domLayer: HTMLElement,
  ) {
    this.waves = stage.addSpriteAt('waves', WAVE_ANCHOR, WAVE_ANCHOR);
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.taps = 0;
    this.waveT = 0;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.waves.setVisible(true);
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;
    this.waveT += dt;

    // 波浪近似：整层上下浮动 ±2 设计像素（原版是 sin 相位在动）
    const float = (Math.sin(this.waveT * 2) * 2) / DH;
    this.waves.setCenter(WAVE_ANCHOR.x, WAVE_ANCHOR.y + float);

    // 原版 game.js:1486
    if (this.taps >= MAX_TAPS && this.t > 1.5 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S5_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S5_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S5_CAMERA.pointerGain;
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

  /** ⬇️ 与原版 classic/game.js:1547-1554 逐行对应 ⬇️ */
  private onDown(_x: number, y: number, screenX: number, screenY: number): boolean {
    const { h: vh } = this.logic.viewport;
    // 原版只判 y（不判 x）：整条海浪带都是热区
    if (y > OCEAN_NY * vh && y < BEACH_NY * vh) {
      this.taps += 1;
      // 原版此处 spawn splash×8
      this.ripple(screenX, screenY);
      if (this.taps >= MAX_TAPS) {
        // 原版 game.js:1552
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
    el.className = 'tap-ripple splash-ripple';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.domLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  get tapCount(): number {
    return this.taps;
  }

  /**
   * 保真比对前的静默：波浪层的浮动由 waveT 驱动，而烘焙真值定格在
   * waveT=0。把相位归零，否则对拍是在跟一个漂移了三秒的元素比。
   */
  freezeForFidelity(): void {
    this.waveT = 0;
  }

  /** 海浪带在屏幕上的中线（回归测试用） */
  waveBandDesign(): { y0: number; y1: number } {
    const { h: vh } = this.logic.viewport;
    return { y0: OCEAN_NY * vh, y1: BEACH_NY * vh };
  }

  /** ⬇️ 原版 game.js:1548-1549：只判 y，x 完全不参与 ⬇️ */
  hitTest(_x: number, y: number): number {
    const { h: vh } = this.logic.viewport;
    return y > OCEAN_NY * vh && y < BEACH_NY * vh ? 0 : -1;
  }
}
