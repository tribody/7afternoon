/**
 * S9「争吵 · 把他们拖到一起」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1737-1795。这是全片**第二次真正的拖拽**
 *   （S4 是把花瓣拖到固定目标，这一场是把两个人互相拖近）：
 *   onDown 抓住 40px 内的男孩/女孩 → onMove 拖动且保持 ≥60px 间距
 *   → onUp 若 |boyX-girlX| < 90 则 merged
 *
 * 与原版的差异只有一处、且是必要的：角色分成四张贴图
 * （boySad/girlSad/boyHappy/girlHappy），因为 expression 与 blush 是
 * 画出来的顶点差异，不是 transform 能表达的。运行时两两切显隐。
 *
 * 距离虚线走 DOM：原版用 canvas 的 setLineDash 横跨两人，运行时若用贴图
 * 就得 scaleX —— 会把虚线段本身也拉伸变形。DOM 的 border-top dashed 是矢量的。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S9_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1738 / 1788 */
const TEXT_ENTER = '吵了一架，各自沉默';
const HINT_ENTER = '把他们拖到一起';
const TEXT_DONE = '和好如初，再也不放手';

/** 抓取半径（game.js:1776-1777） */
const GRAB_RADIUS = 40;
/** 拖拽时的最小间距（game.js:1780-1781） */
const MIN_GAP = 60;
/** 判定和好的间距阈值（game.js:1785） */
const MERGE_GAP = 90;
/** 未拖动时各自站的位置（game.js:1742 / 1744-1745） */
const BOY_NX = 0.2;
const GIRL_NX = 0.8;
/** 角色脚下位置（game.js:1767-1768） */
const ACT_NY = 0.52;
/** 虚线所在的高度（game.js:1761） */
const LINE_NY = 0.55;
/** 和好后靠拢的目标点（game.js:1743） */
const TARGET_NX = 0.5;
/** 和好时两人相对中心的偏移（game.js:1744-1745） */
const MERGE_OFFSET = 40;

export interface S9Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S9 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private boyX = 0;
  private girlX = 0;
  private dragging: 'boy' | 'girl' | null = null;
  private merged = false;

  private boySad: SpriteHandle;
  private girlSad: SpriteHandle;
  private boyHappy: SpriteHandle;
  private girlHappy: SpriteHandle;
  private line: HTMLElement;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S9Host,
    private domLayer: HTMLElement,
  ) {
    const bAnchor = { x: BOY_NX, y: ACT_NY };
    const gAnchor = { x: GIRL_NX, y: ACT_NY };
    this.boySad = stage.addSpriteAt('boySad', bAnchor, bAnchor);
    this.girlSad = stage.addSpriteAt('girlSad', gAnchor, gAnchor);
    this.boyHappy = stage.addSpriteAt('boyHappy', bAnchor, bAnchor);
    this.girlHappy = stage.addSpriteAt('girlHappy', gAnchor, gAnchor);
    this.boyHappy.setVisible(false);
    this.girlHappy.setVisible(false);

    this.line = document.createElement('div');
    this.line.className = 'gap-line';
    this.domLayer.appendChild(this.line);
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.boyX = 0;
    this.girlX = 0;
    this.dragging = null;
    this.merged = false;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.applyActors();
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    const { w: vw } = this.logic.viewport;

    // ⬇️ 原版 game.js:1742-1745：初值、目标点与回弹 ⬇️
    if (!this.boyX) {
      this.boyX = vw * BOY_NX;
      this.girlX = vw * GIRL_NX;
    }
    const targetX = vw * TARGET_NX;
    this.boyX = U.lerp(
      this.boyX,
      this.dragging === 'boy' ? this.boyX : this.merged ? targetX - MERGE_OFFSET : vw * BOY_NX,
      dt * 3,
    );
    this.girlX = U.lerp(
      this.girlX,
      this.dragging === 'girl' ? this.girlX : this.merged ? targetX + MERGE_OFFSET : vw * GIRL_NX,
      dt * 3,
    );

    this.applyActors();

    // 原版 game.js:1746
    if (this.merged && this.t > 2 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  /** 把两人摆到当前设计坐标，并按 merged 切换表情 */
  private applyActors(): void {
    const { w: vw } = this.logic.viewport;
    const ny = ACT_NY;
    this.boySad.setCenter(this.boyX / vw, ny);
    this.boyHappy.setCenter(this.boyX / vw, ny);
    this.girlSad.setCenter(this.girlX / vw, ny);
    this.girlHappy.setCenter(this.girlX / vw, ny);
    this.boySad.setVisible(!this.merged);
    this.girlSad.setVisible(!this.merged);
    this.boyHappy.setVisible(this.merged);
    this.girlHappy.setVisible(this.merged);

    // ⬇️ 原版 game.js:1757-1763 的距离虚线 ⬇️
    if (this.merged) {
      this.line.style.display = 'none';
    } else {
      const a = this.logic.normToScreen(Math.min(this.boyX, this.girlX) / vw, LINE_NY);
      const bw = Math.abs(this.girlX - this.boyX);
      this.line.style.display = '';
      this.line.style.left = `${a.x}px`;
      this.line.style.top = `${a.y}px`;
      this.line.style.width = `${bw}px`;
    }
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S9_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S9_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S9_CAMERA.pointerGain;
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
    return this.onDown(d.x, d.y);
  }

  /** ⬇️ 原版 game.js:1774-1778 ⬇️ */
  private onDown(x: number, y: number): boolean {
    const { h: vh } = this.logic.viewport;
    const ay = ACT_NY * vh;
    if (U.dist(x, y, this.boyX, ay) < GRAB_RADIUS) this.dragging = 'boy';
    else if (U.dist(x, y, this.girlX, ay) < GRAB_RADIUS) this.dragging = 'girl';
    return this.dragging !== null;
  }

  /** ⬇️ 原版 game.js:1779-1781：保持两人之间至少 MIN_GAP ⬇️ */
  handlePointerMove(clientX: number, clientY: number): void {
    if (!this.dragging) return;
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return;
    const { w: vw } = this.logic.viewport;
    if (this.dragging === 'boy') this.boyX = U.clamp(d.x, 0, this.girlX - MIN_GAP);
    if (this.dragging === 'girl') this.girlX = U.clamp(d.x, this.boyX + MIN_GAP, vw);
    this.applyActors();
  }

  /** ⬇️ 原版 game.js:1783-1793 ⬇️ */
  handlePointerUp(): void {
    if (!this.dragging) return;
    if (Math.abs(this.boyX - this.girlX) < MERGE_GAP) {
      this.merged = true;
      this.hint = '';
      this.text = TEXT_DONE;
      this.t = 0;
      this.host.onHint('');
      this.host.onText(this.text);
    }
    this.dragging = null;
    this.applyActors();
  }

  get tapCount(): number {
    return this.merged ? 1 : 0;
  }

  hitTest(x: number, y: number): number {
    const { h: vh } = this.logic.viewport;
    const ay = ACT_NY * vh;
    if (U.dist(x, y, this.boyX, ay) < GRAB_RADIUS) return 0;
    if (U.dist(x, y, this.girlX, ay) < GRAB_RADIUS) return 1;
    return -1;
  }

  /**
   * 两个角色的设计坐标（回归测试用）。
   * ⚠️ 必须先 update 过一帧才有值 —— boyX 的初值是在 update 里赋的（原版同）。
   */
  actorDesignPositions(): { boyX: number; girlX: number; y: number } {
    const { h: vh } = this.logic.viewport;
    return { boyX: this.boyX, girlX: this.girlX, y: ACT_NY * vh };
  }
}
