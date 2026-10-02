/**
 * S11「加班晚归 · 点亮回家的灯」的 2.5D 实现。
 *
 * 逐行对应 classic/game.js:1834-1895。交互极简但**画面状态最重**：
 * 一盏灯把整幅夜色切成两个世界 ——
 *   onDown 命中窗 (hx, hy+30) 40px 内 → lightsOn
 *   → 窗体跳变亮起 / wash 与光锥随 lit 渐强 / 女孩+猫出现在门口
 *   / 男孩表情 sad→happy 并向 hx-40 走去 / lightT>2 判 done
 *
 * 烘焙侧（bake/scenes/s11.js）把灭态烘足、亮态做增量：亮窗（跳变）、
 * wash（0.3*lit 渐变）、光锥（0.4*lit 渐变）、门口女孩+猫各一张
 * runtimePlaced 贴图，男孩烘 sad（定格起点）/ happy（行走）两态。
 * 这里逐一按原版的显隐语义接上 —— 窗体是跳变（game.js:1857 的三目），
 * wash/光锥才是渐变，两者不能混。
 */
import type { SpriteHandle, Stage } from '../render/stage';
import { LogicPlane, U } from '../input/logicPlane';
import { S11_CAMERA, evalCamera } from '../render/cameraScript';

/** 原版 game.js:1835 */
const TEXT_ENTER = '加班到很晚回家，你和仙姑都在等我';
const HINT_ENTER = '轻触窗户，点亮回家的灯';

/** 命中半径（game.js:1889） */
const HIT_RADIUS = 40;
/** 房子位置（game.js:1846，比例布局） */
const HOUSE_NX = 0.5;
const HOUSE_NY = 0.45;
/** 窗光/光锥原点 = (hx, hy+30)，30 是设计像素（game.js:1859/1870） */
const WIN_NY = HOUSE_NY + 30 / 812;
/** 男孩起点与终点（game.js:1884：lerp(w*0.1, hx-40, walkProg)） */
const BOY_NX0 = 0.1;
const BOY_NX1 = HOUSE_NX - 40 / 375;
const BOY_NY = 0.58;
/** 门口女孩站位（game.js:1879：hy+65） */
const GIRL_NY = HOUSE_NY + 65 / 812;

export interface S11Host {
  onText(text: string): void;
  onHint(hint: string): void;
  onDone(): void;
}

export class S11 {
  text = TEXT_ENTER;
  hint = HINT_ENTER;
  done = false;
  t = 0;

  private lightsOn = false;
  private lightT = 0;

  private windowLit: SpriteHandle;
  private windowGlow: SpriteHandle;
  private lightCone: SpriteHandle;
  private friends: SpriteHandle;
  private boySad: SpriteHandle;
  private boyHappy: SpriteHandle;
  private cameraT = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private cameraEnabled = true;

  constructor(
    private stage: Stage,
    private logic: LogicPlane,
    private host: S11Host,
    private domLayer: HTMLElement,
  ) {
    const win = { x: HOUSE_NX, y: WIN_NY };
    this.windowLit = stage.addSpriteAt('windowLit', win, win);
    this.windowGlow = stage.addSpriteAt('windowGlow', win, win);
    this.lightCone = stage.addSpriteAt('lightCone', win, win);
    const girl = { x: HOUSE_NX, y: GIRL_NY };
    this.friends = stage.addSpriteAt('friends', girl, girl);
    const boy0 = { x: BOY_NX0, y: BOY_NY };
    this.boySad = stage.addSpriteAt('boySad', boy0, boy0);
    this.boyHappy = stage.addSpriteAt('boyHappy', boy0, boy0);
    this.applyState();
  }

  enter(): void {
    this.t = 0;
    this.cameraT = 0;
    this.lightsOn = false;
    this.lightT = 0;
    this.done = false;
    this.text = TEXT_ENTER;
    this.hint = HINT_ENTER;
    this.applyState();
    this.host.onText(this.text);
    this.host.onHint(this.hint);
  }

  exit(): void {
    this.domLayer.replaceChildren();
  }

  /** ⬇️ 原版 game.js:1836：lightsOn 时 lightT 累加，>2 判 done ⬇️ */
  update(dt: number): void {
    this.t += dt;
    if (this.lightsOn) {
      this.lightT += dt;
      if (this.lightT > 2 && !this.done) {
        this.done = true;
        this.host.onDone();
      }
    }
    this.applyState();
    this.updateCamera(dt);
  }

  /**
   * 把当前灯光状态摆到舞台上。
   * 显隐语义逐项对齐原版（见 bake/scenes/s11.js 文件头的对照表）。
   */
  private applyState(): void {
    // lit = lightsOn ? min(1, lightT) : 0（game.js:1856）
    const lit = this.lightsOn ? Math.min(1, this.lightT) : 0;

    // 窗体是**跳变**：lit>0 即全亮（game.js:1857 的三目，不是渐变）
    this.windowLit.setVisible(lit > 0);
    // wash 渐变：0.3*lit（贴图烘 alpha 0.3，game.js:1859）
    this.windowGlow.setVisible(lit > 0);
    this.windowGlow.setOpacity(lit);
    // 光锥渐变：0.4*lit（贴图烘 alpha 0.4，game.js:1866）
    this.lightCone.setVisible(lit > 0);
    this.lightCone.setOpacity(lit);
    // lit>0 才画女孩 + 猫（game.js:1879-1881）
    this.friends.setVisible(lit > 0);

    // 男孩：灯亮瞬间表情 sad→happy，位置 lerp(0.1w, hx-40, walkProg)
    //（game.js:1883-1885 —— expression 与位置是同一段代码的两个属性）
    this.boySad.setVisible(!this.lightsOn);
    this.boyHappy.setVisible(this.lightsOn);
    if (this.lightsOn) {
      const walkProg = U.clamp(this.lightT / 2, 0, 1);
      this.boyHappy.setCenter(U.lerp(BOY_NX0, BOY_NX1, walkProg), BOY_NY);
    }
  }

  private updateCamera(dt: number): void {
    if (!this.cameraEnabled) return;
    this.cameraT += dt;
    const script = evalCamera(S11_CAMERA, this.cameraT);
    const px = (this.pointer.x - 0.5) * S11_CAMERA.pointerGain;
    const py = (this.pointer.y - 0.5) * S11_CAMERA.pointerGain;
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

  /** ⬇️ 原版 game.js:1887-1894 ⬇️ */
  private onDown(x: number, y: number): boolean {
    const { w: vw, h: vh } = this.logic.viewport;
    const hx = HOUSE_NX * vw;
    const hy = HOUSE_NY * vh;
    if (!this.lightsOn && U.dist(x, y, hx, hy + 30) < HIT_RADIUS) {
      this.lightsOn = true;
      this.hint = '';
      this.host.onHint('');
      this.applyState();
      return true;
    }
    return false;
  }

  get tapCount(): number {
    return this.lightsOn ? 1 : 0;
  }

  hitTest(x: number, y: number): number {
    const { w: vw, h: vh } = this.logic.viewport;
    const hx = HOUSE_NX * vw;
    const hy = HOUSE_NY * vh;
    if (!this.lightsOn && U.dist(x, y, hx, hy + 30) < HIT_RADIUS) return 0;
    return -1;
  }

  /** 窗口命中点的设计坐标（回归测试用，game.js:1889 的判定圆心） */
  windowDesignPosition(): { x: number; y: number } {
    const { w: vw, h: vh } = this.logic.viewport;
    return { x: HOUSE_NX * vw, y: HOUSE_NY * vh + 30 };
  }
}
