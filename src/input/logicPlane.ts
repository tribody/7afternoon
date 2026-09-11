/**
 * 逻辑平面 —— 屏幕坐标 ↔ 原版设计坐标的双向换算。
 *
 * ══════════════════════════════════════════════════════════════
 * 这是"只重制表现层"这个锚点最容易被做错的地方。
 * ══════════════════════════════════════════════════════════════
 *
 * 原版的命中测试是**屏幕像素坐标下的圆形判定**：
 *
 *     // classic/game.js:1389-1390
 *     if (!b.tapped && U.dist(x, y, b.x, b.y) < 50)
 *     // 其中 b.x = this.g.w * (0.25 + slot * 0.17)   ← g.w 是 CSS 视口宽
 *
 * 分层进 3D 之后，x / y 不再天然存在，必须从屏幕坐标反算回来。
 * 换算链路：
 *
 *     client 像素
 *       → NDC → raycast 打到 z=0 的逻辑平面 → 归一化坐标 n ∈ [0,1]²
 *       → 扣掉该层的视差位移（否则手指与画面会错开一个位移量）
 *       → 乘以**当前视口的 CSS 尺寸** → 原版语义下的 CSS 像素
 *
 * ⚠️ 关键点：乘的是**当前视口**的 CSS 尺寸，不是烘焙基准 375×812。
 * 因为原版 b.x = g.w*(0.25+…) 里的 g.w 就是当时的视口宽；
 * 而我们的归一化坐标 0.25+slot*0.17 恰好来自 375*(0.25+slot*0.17)/375，
 * 两者在**任意视口**下都恒等。于是原版那句 `U.dist(...) < 50`
 * 可以一个字不改地复用，50px 的阈值语义也完好无损。
 *
 * 早先有方案把这套逻辑坐标定成"设计宽 750"，那样阈值就得跟着翻倍，
 * 语义就悄悄变了 —— 这里刻意避开。
 */
import type { Stage } from '../render/stage';

export interface DesignPoint {
  /** 原版语义下的 CSS 像素 x（0..视口宽） */
  x: number;
  /** 同上 y（0..视口高） */
  y: number;
  /** 是否成功投影（点在相机视锥内） */
  ok: boolean;
}

/**
 * @param designW 烘焙基准设计宽（375）—— 只用于把归一化坐标换回 CSS 像素时的比例，
 *                实际换算用的是当前视口尺寸，见 `toDesign`。
 */
export class LogicPlane {
  private viewW = 1;
  private viewH = 1;

  constructor(private stage: Stage, private layerName: string) {}

  setViewport(cssW: number, cssH: number): void {
    this.viewW = cssW;
    this.viewH = cssH;
  }

  /**
   * 屏幕坐标 → 原版设计坐标（CSS 像素）。
   * 可直接喂给原版 `onDown(x, y)` 的逻辑。
   */
  toDesign(clientX: number, clientY: number): DesignPoint {
    const n = this.stage.screenToNorm(clientX, clientY);
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return { x: NaN, y: NaN, ok: false };

    // 扣掉该层自身的视差位移：画面上的气泡被平移过，手指位置要跟着还原
    const off = this.stage.layerOffset(this.layerName);

    return {
      x: (n.x - off.x) * this.viewW,
      y: (n.y - off.y) * this.viewH,
      ok: true,
    };
  }

  /**
   * 原版设计坐标（CSS 像素）→ 归一化坐标。
   * 用于把 DOM 文字摆到 3D 里对应气泡的位置上。
   */
  toNorm(cssX: number, cssY: number): { x: number; y: number } {
    const off = this.stage.layerOffset(this.layerName);
    return { x: cssX / this.viewW + off.x, y: cssY / this.viewH + off.y };
  }

  /** 归一化 → 屏幕 CSS 像素（DOM 叠层定位用） */
  normToScreen(nx: number, ny: number): { x: number; y: number } {
    return { x: nx * this.viewW, y: ny * this.viewH };
  }

  get viewport(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }
}

/**
 * 原版的距离函数 —— 从 classic/game.js:49 原样搬来。
 * 保留同名同语义，让迁移过来的 `onDown` 逻辑看上去和原版一模一样。
 */
export const U = {
  dist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x2 - x1, y2 - y1);
  },
  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  },
  clamp(v: number, mn: number, mx: number): number {
    return Math.max(mn, Math.min(mx, v));
  },
};

/** 原版 S3.onDown 的命中半径（CSS 像素），game.js:1390 */
export const BUBBLE_HIT_RADIUS = 50;
