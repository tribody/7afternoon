/**
 * S12「星空终局 · 许愿」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1898-1940。全片最后一场：
 *   onDown 任意点（无 hit test，game.js:1933-1939）计数
 *   → taps 满 8 → ended：换文案、大心出现并以 sin(t*3) 脉冲
 *
 * ⚠️ 原版 S12 **没有 done=true 的路径**（最后一幕没有"下一场"可去）——
 *    ended 后停在心脉冲的画面上直到玩家放下手机。这是终局的正确行为，
 *    v2 照抄：本类永不置 done、永不调 host.onDone()。
 *    冒烟闭环对本场跳过 done 断言（CLOSURES 的 expectDone: false）。
 *
 * ⚠️ 心的脉冲（game.js:1929）是 scale = 1 + sin(t*3)*0.1 —— 纯 transform，
 *    贴图按 pulse=1 基准烘、box 以心中心对称，setScale 时锚点不动。
 *    注意 t 是**场景累计时间**（不是 ended 起算），与原版一致。
 *
 * ⚠️ 环境粒子（star/heart 概率 spawn）与 ended 的 30 颗 heart burst
 *    不在烘焙真值里，v2 亦不实现（notBaked 声明）—— 粒子系统整体
 *    是 M2 明确不做的范围，终局的"心跳"由大心脉冲独自承担。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane } from '../input/logicPlane';
import { S12_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1899 */
const HINT_ENTER = '轻触星空，许下心愿';
const TEXT_ENDED = '七夕快乐，未来的每一天都在一起';

/** 许愿次数（game.js:1899） */
const MAX_TAPS = 8;
/** 大心中心（game.js:1930：w/2, h*0.5） */
const HEART_NX = 0.5;
const HEART_NY = 0.5;

export interface S12Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S12 {
  text = '';
  hint = HINT_ENTER;
  /** ⚠️ 恒为 false —— 原版 S12 永不完成，终局定格在心脉冲画面 */
  done = false;
  t = 0;

  private taps = 0;
  private ended = false;
  private heart: SpriteHandle;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S12Host,
    private domLayer: HTMLElement,
  ) {
    // heart 的 box 以心中心对称烘（锚点即中心）→ addSprite 居中摆位即可
    this.heart = stage.addSprite('heart', HEART_NX, HEART_NY);
    this.heart.setVisible(false);
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.taps = 0;
    this.ended = false;
    this.done = false;
    this.text = '';
    this.hint = HINT_ENTER;
    this.heart.setVisible(false);
    this.heart.setScale(1);
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  /** ⬇️ 原版 game.js:1900-1910 的 ended 判定 + 1928-1931 的脉冲 ⬇️ */
  update(dt: number): void {
    this.t += dt;

    if (this.taps >= MAX_TAPS && !this.ended) {
      this.ended = true;
      this.text = TEXT_ENDED;
      this.hint = '';
      this.host.onText(this.text);
      this.host.onHint('');
      this.heart.setVisible(true);
    }

    // pulse = 1 + sin(t*3)*0.1（game.js:1929）—— t 是场景累计时间
    if (this.ended) {
      this.heart.setScale(1 + Math.sin(this.t * 3) * 0.1);
    }

    this.updateCamera(dt);
  }

  /** ⬇️ 原版 game.js:1933-1939：ended 前任意点都计数（无距离判定）⬇️ */
  handlePointerDown(clientX: number, clientY: number): boolean {
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return false;
    if (!this.ended) {
      this.taps += 1;
      return true;
    }
    return false;
  }

  get tapCount(): number {
    return this.taps;
  }

  /** 无定位热点：任意点按都算（与 S10 同理，恒返回 0） */
  hitTest(_x: number, _y: number): number {
    return 0;
  }

  /** 大心是否已出现（冒烟终局断言用 —— 本场没有 done 可等） */
  heartVisible(): boolean {
    return this.ended;
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S12_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S12_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S12_CAMERA.pointerGain;
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
}
