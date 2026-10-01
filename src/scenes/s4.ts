/**
 * S4「春暖花开 · 拼一颗心」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1404-1481。这是全片**唯一需要真正拖拽**的一场：
 *   onDown 抓 25px 内的花瓣 → onMove 让花瓣跟着手指 → onUp 若落在
 *   目标心 60px 内则吸附（placed++）。
 *
 * 运行时元素（都不进烘焙）：
 *   · 下落花瓣 —— 原版每帧 6% 概率生成、无上限。运行时给一个上限
 *     （MAX_PETALS），否则长时间停留会累积出几百个 sprite 把帧率拖垮。
 *   · 已放置花瓣 —— 按 (i/max)*2π - π/2 的环形角度摆，与原版同式。
 *   · 目标心轮廓 —— placed 满后隐藏（原版 game.js:1434）。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S4_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1405 / 1476 */
const TEXT_ENTER = '春暖花开，我们正式在一起了';
const HINT_ENTER = '拖动花瓣，拼出一颗心';
const TEXT_DONE = '从今天起，你是我的了';

/** 目标心（game.js:1408） */
const TARGET_NX = 0.5;
const TARGET_NY = 0.42;
/** 原版常数 */
const MAX_PETALS = 5;
const GRAB_RADIUS = 25;
const DROP_RADIUS = 60;
/** 下落花瓣的运行时上限（原版无上限，这里防累积） */
const MAX_FALLING = 16;
/** 花瓣中位尺寸（与烘焙 petalFall 的 PETAL_MID 一致，用于换算缩放） */
const PETAL_MID = 11;

interface FallingPetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  placed: boolean;
  sprite: SpriteHandle;
}

export interface S4Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S4 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  /** 环境花瓣生成率（原版 game.js:1410 的 6%）。测试里调 0 可冻结随机性 */
  ambientRate = 0.06;

  private petals: FallingPetal[] = [];
  private placed = 0;
  private dragPetal: FallingPetal | null = null;
  private outline: SpriteHandle;
  private placedSprites: SpriteHandle[] = [];
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S4Host,
    private domLayer: HTMLElement,
  ) {
    const anchor = { x: TARGET_NX, y: TARGET_NY };
    this.outline = stage.addSpriteAt('heartOutline', anchor, anchor);
    for (let i = 0; i < MAX_PETALS; i++) {
      const s = stage.addSpriteAt('petalPlaced', anchor, anchor);
      s.setVisible(false);
      this.placedSprites.push(s);
    }
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.placed = 0;
    this.done = false;
    this.dragPetal = null;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    for (const p of this.petals) p.sprite.setVisible(false);
    this.petals = [];
    for (const s of this.placedSprites) s.setVisible(false);
    this.outline.setVisible(true);
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    for (const p of this.petals) p.sprite.setVisible(false);
    this.petals = [];
    this.domLayer.replaceChildren();
  }

  update(dt: number): void {
    this.t += dt;

    // 原版 game.js:1410-1412
    if (Math.random() < this.ambientRate && this.petals.length < MAX_FALLING) this.spawnPetal();

    // 原版 game.js:1413-1418
    const { h: vh } = this.logic.viewport;
    for (const p of this.petals) {
      if (p.placed) continue;
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;
      p.rot += p.vrot * 60 * dt;
      if (p.y > vh + 20) p.y = -20;
      this.placePetal(p);
    }

    // 原版 game.js:1419
    if (this.placed >= MAX_PETALS && this.t > 1.5 && !this.done) {
      this.done = true;
      this.host.onDone();
    }

    this.updateCamera(dt);
  }

  private spawnPetal(): void {
    const { w: vw } = this.logic.viewport;
    const p: FallingPetal = {
      x: U.rand(0, vw),
      y: -20,
      vx: U.rand(-0.5, 0.5),
      vy: U.rand(0.5, 1.5),
      rot: 0,
      vrot: U.rand(-0.02, 0.02),
      size: U.rand(8, 14),
      placed: false,
      sprite: this.stage.addSpriteAt(
        'petalFall',
        { x: TARGET_NX, y: TARGET_NY },
        { x: 0.5, y: 0 },
      ),
    };
    this.petals.push(p);
    this.placePetal(p);
  }

  /** 把花瓣摆到它的设计坐标上（含旋转与尺寸） */
  private placePetal(p: FallingPetal): void {
    const { w: vw, h: vh } = this.logic.viewport;
    p.sprite.setCenter(p.x / vw, p.y / vh);
    p.sprite.setScale(p.size / PETAL_MID);
    p.sprite.mesh.rotation.z = p.rot;
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S4_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S4_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S4_CAMERA.pointerGain;
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

  /** ⬇️ 与原版 classic/game.js:1462-1466 逐行对应 ⬇️ */
  private onDown(x: number, y: number): boolean {
    for (const p of this.petals) {
      if (!p.placed && U.dist(x, y, p.x, p.y) < GRAB_RADIUS) {
        this.dragPetal = p;
        return true;
      }
    }
    return false;
  }

  /** ⬇️ 原版 game.js:1467-1469 ⬇️ */
  handlePointerMove(clientX: number, clientY: number): void {
    if (!this.dragPetal) return;
    const d = this.logic.toDesign(clientX, clientY);
    if (!d.ok) return;
    this.dragPetal.x = d.x;
    this.dragPetal.y = d.y;
    this.placePetal(this.dragPetal);
  }

  /** ⬇️ 原版 game.js:1470-1480 ⬇️ */
  handlePointerUp(clientX: number, clientY: number): void {
    if (!this.dragPetal) return;
    const { w: vw, h: vh } = this.logic.viewport;
    const d = this.logic.toDesign(clientX, clientY);

    // 原版：U.dist(x, y, this.target.x, this.target.y) < 60
    const tx = TARGET_NX * vw;
    const ty = TARGET_NY * vh;
    if (d.ok && U.dist(d.x, d.y, tx, ty) < DROP_RADIUS) {
      const petal = this.dragPetal;
      petal.placed = true;
      petal.sprite.setVisible(false);
      // 吸附：改用"已放置"层，按环形角度摆（原版 game.js:1441-1445）
      const i = this.placed;
      const angle = (i / MAX_PETALS) * Math.PI * 2 - Math.PI / 2;
      const r = 30;
      const sp = this.placedSprites[i];
      sp.setVisible(true);
      sp.setCenter((tx + Math.cos(angle) * r) / vw, (ty + Math.sin(angle) * r) / vh);

      this.placed += 1;
      if (this.placed >= MAX_PETALS) {
        // 原版 game.js:1476
        this.hint = '';
        this.text = TEXT_DONE;
        this.t = 0;
        this.outline.setVisible(false);
        this.host.onHint('');
        this.host.onText(this.text);
      }
    }
    this.dragPetal = null;
  }

  get tapCount(): number {
    return this.placed;
  }

  /** 命中测试（回归测试用）—— 返回抓到的花瓣序号，未命中 -1 */
  hitTest(x: number, y: number): number {
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      if (!p.placed && U.dist(x, y, p.x, p.y) < GRAB_RADIUS) return i;
    }
    return -1;
  }

  /** 花瓣设计坐标（回归测试用）：直接读，不做投影 */
  petalDesignPositions(): Array<{ x: number; y: number; placed: boolean; size: number }> {
    return this.petals.map((p) => ({ x: p.x, y: p.y, placed: p.placed, size: p.size }));
  }

  /**
   * 保真比对前的静默：环境花瓣是**每帧随机**生成的，不在烘焙真值里，
   * 留着比对就是假失败。关掉生成率并清干净现有花瓣。
   */
  freezeForFidelity(): void {
    this.ambientRate = 0;
    this.clearPetals();
  }

  /** 清掉全部下落花瓣（含已抓在手上的） */
  clearPetals(): void {
    for (const p of this.petals) p.sprite.setVisible(false);
    this.petals = [];
    this.dragPetal = null;
  }

  /** 目标心设计坐标 */
  targetDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: TARGET_NX * vw, y: TARGET_NY * vh };
  }

  /** 测试辅助：直接生成一片花瓣在指定位置（避免等随机） */
  spawnPetalAt(x: number, y: number): number {
    const before = this.petals.length;
    const p: FallingPetal = {
      x,
      y,
      vx: 0,
      vy: 0,
      rot: 0,
      vrot: 0,
      size: PETAL_MID,
      placed: false,
      sprite: this.stage.addSpriteAt('petalFall', { x: TARGET_NX, y: TARGET_NY }, { x: 0.5, y: 0 }),
    };
    this.petals.push(p);
    this.placePetal(p);
    return before;
  }
}
