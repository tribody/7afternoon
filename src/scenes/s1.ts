/**
 * S1「公司初遇 · 两台显示器」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1118-1269。
 *
 * 状态迁移是这场的关键：两台显示器各有 connected，**全连上**才换文案
 * 并把 t 归零（game.js:1261-1265），随后 t>1 判 done（:1132）。
 *
 * 表现层的三个替代（都在 notBaked 里记过）：
 *   · 显示器 bob ±1.5px —— 用 sprite 位移复现（幅度一致，不是近似）
 *   · 连接态的珊瑚屏 —— screenOn 层 sprite，覆盖在未连接态之上
 *   · 连线生长 —— link 层 sprite 左端固定、scaleX 从 0 展开（原版是画线）
 * badge 上的 PRD / CODE 走 DOM（烘死只能一份，且 8px 文字进 3D 会糊）。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S1_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1121-1122 —— 文案一个字都不能改 */
const TEXT_ENTER = '那年冬天，在公司第一次见到你，你是产品，我是开发';
const HINT_ENTER = '轻触两台显示器，连结我们的缘分';
const TEXT_DONE = '产品与开发，缘分就这样开始了...';

const DH = 812;
/** 屏幕基准点（原版 update 里设的，game.js:1130-1131） */
const SCREEN_NX = [0.28, 0.72];
const SCREEN_NY = 0.48;
/** 命中半径（game.js:1257） */
const HIT_RADIUS = 35;
/** bob 幅度（设计像素，game.js:1183） */
const BOB_PX = 1.5;
const LABELS = ['PRD', 'CODE'];

interface ScreenState {
  nx: number;
  ny: number;
  connected: boolean;
  label: string;
  sprite: SpriteHandle;
  badge: HTMLElement;
}

export interface S1Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S1 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private screens: ScreenState[] = [];
  private link: SpriteHandle;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S1Host,
    private domLayer: HTMLElement,
  ) {
    for (let i = 0; i < 2; i++) {
      const badge = document.createElement('div');
      badge.className = 'screen-badge';
      badge.textContent = LABELS[i];
      badge.style.opacity = '0.45';
      this.domLayer.appendChild(badge);

      this.screens.push({
        nx: SCREEN_NX[i],
        ny: SCREEN_NY,
        connected: false,
        label: LABELS[i],
        sprite: stage.addSpriteAt(
          'screenOn',
          { x: SCREEN_NX[0], y: SCREEN_NY },
          { x: SCREEN_NX[i], y: SCREEN_NY },
        ),
        badge,
      });
      this.screens[i].sprite.setVisible(false);
    }

    // 连线：锚点（贴图中心）就是两屏中点
    this.link = stage.addSpriteAt('link', { x: 0.5, y: SCREEN_NY }, { x: 0.5, y: SCREEN_NY });
    this.link.setVisible(false);
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    for (const s of this.screens) {
      s.connected = false;
      s.sprite.setVisible(false);
      s.badge.style.opacity = '0.45';
      s.badge.classList.remove('is-on');
    }
    this.link.setVisible(false);
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1130-1131：屏幕基准点（归一化后与视口无关），
    // game.js:1183：bob = sin(t*1.5 + i*π)*1.5
    for (let i = 0; i < this.screens.length; i++) {
      const s = this.screens[i];
      const bob = (Math.sin(this.t * 1.5 + i * Math.PI) * BOB_PX) / DH;
      const ny = s.ny + bob;
      s.sprite.setCenter(SCREEN_NX[i], ny);
      this.placeBadge(s, ny);
    }

    // 原版 game.js:1227-1242：两台都连上才画连线，进度 p = easeOut(clamp(t-0.5,0,1))
    const bothOn = this.screens[0].connected && this.screens[1].connected;
    if (bothOn) {
      const p = U.easeOut(U.clamp(this.t - 0.5, 0, 1));
      this.link.setVisible(p > 0);
      this.link.setOpacity(p);
      const r = this.stage.normRectOf('link');
      this.link.setScale(p, 1);
      // 左端固定：中心 = 左边界 + 已展开宽度的一半
      this.link.setCenter(r.nx + (r.nw * p) / 2, r.ny + r.nh / 2);
    }

    // 原版 game.js:1132
    if (bothOn && this.t > 1 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  /** badge 文字跟着屏幕 bob 一起走（原版是 fillText 在 s.y-20/-26 处） */
  private placeBadge(s: ScreenState, ny: number): void {
    const { w: vw, h: vh } = this.logic.viewport;
    const p = this.logic.normToScreen(s.nx, ny - (s.connected ? 20 : 26) / DH);
    s.badge.style.left = `${p.x}px`;
    s.badge.style.top = `${p.y}px`;
    void vw;
    void vh;
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S1_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S1_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S1_CAMERA.pointerGain;
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

  /** ⬇️ 与原版 classic/game.js:1255-1268 逐行对应 ⬇️ */
  private onDown(x: number, y: number, screenX: number, screenY: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    let hit = false;

    for (let i = 0; i < this.screens.length; i++) {
      const s = this.screens[i];
      // 原版：U.dist(x, y, s.x, s.y) < 35（s.x/s.y 是 update 里设的基准点，不含 bob）
      if (!s.connected && U.dist(x, y, SCREEN_NX[i] * vw, s.ny * vh) < HIT_RADIUS) {
        s.connected = true;
        hit = true;
        // 原版此处 spawn heart×6 + sparkle×4
        s.sprite.setVisible(true);
        s.badge.style.opacity = '1';
        s.badge.classList.add('is-on');
        this.ripple(screenX, screenY);
      }
    }

    // 原版 game.js:1261-1265
    if (hit && this.screens[0].connected && this.screens[1].connected) {
      this.hint = '';
      this.text = TEXT_DONE;
      this.t = 0;
      this.host.onHint('');
      this.host.onText(this.text);
    }
    return hit;
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
    return this.screens.filter((s) => s.connected).length;
  }

  /** 命中测试（回归测试用）—— 返回命中的屏幕序号，未命中 -1 */
  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    for (let i = 0; i < this.screens.length; i++) {
      const s = this.screens[i];
      if (!s.connected && U.dist(x, y, SCREEN_NX[i] * vw, s.ny * vh) < HIT_RADIUS) return i;
    }
    return -1;
  }

  /** 屏幕的当前设计坐标（回归测试用） */
  screenDesignPositions(): Array<{ index: number; x: number; y: number; connected: boolean }> {
    const { w: vw, h: vh } = this.logic.viewport;
    return this.screens.map((s, i) => ({ index: i, x: SCREEN_NX[i] * vw, y: s.ny * vh, connected: s.connected }));
  }
}
