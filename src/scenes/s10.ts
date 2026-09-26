/**
 * S10「夕阳和解」的 2.5D 实现。
 *
 * ══════════════════════════════════════════════════════════════
 * M2 试点第二场：验证「配置 → 贴图 → 能跑」这条闭环在 S3 之外能不能
 * 原样复跑。它是全片交互**最轻**的一场 —— 原版 onDown 连命中测试都没有，
 * 任意点按都计数（classic/game.js:1825-1830），热点迁移因此只剩
 * "把屏幕坐标送进原版语义"这半步。
 * ══════════════════════════════════════════════════════════════
 *
 * 设计纪律（锚点 2，与 S3 相同）：
 *   · 文案、节奏、完成判定 **100% 沿用** classic/game.js:1798-1831
 *   · 画面（夕阳 / 地面 / 云 / 双人）走 s10.manifest.json 的烘焙贴图，
 *     本文件只负责交互状态与镜头
 *   · 原版的 sparkle/heart 粒子**刻意不烘焙**（manifest.notBaked 有记录），
 *     点按反馈用 DOM 涟漪代替 —— 与 S3 用弹跳代替粒子爆开是同一取舍
 */

import { Stage } from '../render/stage';
import { LogicPlane } from '../input/logicPlane';
import { S10_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1799 —— 文案一个字都不能改 */
const TEXT_ENTER = '夕阳下，一切都释然了';
const HINT_ENTER = '轻触飘散的光点';
const TEXT_DONE = '余生很长，请多指教';

/** 原版 game.js:1799/1829 */
const MAX_TAPS = 6;
/** 原版 game.js:1803 —— 点满后还要再等 1.5s 才判完成 */
const DONE_DELAY = 1.5;

export interface S10Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S10 {
  /** 与原版 Scene 基类同名的字段，便于对照 */
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private taps = 0;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  /** 调试开关：关掉后镜头停在 home 位，画面可与烘焙真值逐块比对 */
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S10Host,
    private domLayer: HTMLElement,
  ) {}

  // ── 生命周期：对应原版 Scene.enter() ─────────────────────
  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.taps = 0;
    this.done = false;

    // 原版 game.js:1799
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  // ── 每帧：对应原版 Scene.update(dt) ──────────────────────
  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1802 每帧 10% 概率飘一个环境 sparkle —— 粒子系统不在
    // 本阶段范围（manifest.notBaked 已记录），表现层等价物是镜头微视差。
    // 完成判定原样保留：game.js:1803
    if (this.taps >= MAX_TAPS && this.t > DONE_DELAY && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S10_CAMERA, this.cameraT);

    // 指针微视差：与 S3 同一套手感
    const px = (this.pointer.x - 0.5) * S10_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S10_CAMERA.pointerGain;

    this.stage.setCameraOffset(script.x + px, script.y + py);
  }

  setPointer(nx: number, ny: number): void {
    this.pointer.x = nx;
    this.pointer.y = ny;
  }

  /**
   * 指针按下（屏幕 client 像素）。
   *
   * 原版 game.js:1825 的 onDown **没有命中测试**：任意点按 taps++。
   * 这里仍然走一遍 toDesign —— 不是为了判定（没有可判定的目标），
   * 而是让"屏幕 → 设计坐标"这条链路在每一场都被走到，测试钩子
   * 才能用同一套断言覆盖全部场景。
   */
  handlePointerDown(clientX: number, clientY: number): boolean {
    const d = this.logic.toDesign(clientX, clientY);
    this.onDown(d.ok ? d.x : clientX, d.ok ? d.y : clientY, clientX, clientY);
    return true;
  }

  /** ⬇️ 与原版 classic/game.js:1825-1830 逐行对应 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): void {
    void x;
    void y;
    this.taps += 1;
    // 原版此处 spawn sparkle×8 + heart×3（game.js:1827-1828）——
    // 粒子不进本阶段，用 DOM 涟漪给一个即时的点按反馈
    this.ripple(screenX, screenY);

    if (this.taps >= MAX_TAPS) {
      // 原版 game.js:1829
      this.hint = '';
      this.text = TEXT_DONE;
      this.t = 0;
      this.host.onHint('');
      this.host.onText(this.text);
    }
  }

  /** 点按涟漪（原版粒子爆开的替代品，纯表现层，不影响判定） */
  private ripple(screenX: number, screenY: number): void {
    const el = document.createElement('div');
    el.className = 'tap-ripple';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    this.domLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /** 关掉镜头运动（调试 / 保真比对用），与 S3 同名同语义 */
  setCameraEnabled(on: boolean): void {
    this.cameraEnabled = on;
    if (!on) this.stage.setCameraOffset(0, 0);
  }

  get tapCount(): number {
    return this.taps;
  }

  /**
   * 命中测试（回归测试用）。原版本场没有命中测试（任意点按都算），
   * 为了让测试钩子可以用同一接口覆盖 13 场，这里恒返回 0。
   */
  hitTest(_x: number, _y: number): number {
    return 0;
  }
}
