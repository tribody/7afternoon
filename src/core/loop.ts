/**
 * 主循环时钟 + 帧统计 + 设备分档。
 *
 * 这三样放一起，因为它们共同支撑 M1 的 DoD 验收（低端机 ≥50fps、
 * p95 帧时间 ≤33ms、长帧占比 <1%），必须能被客观测量、且能在真机上读出来。
 */

/** 单帧 dt 上限，与 classic/game.js:2131 的 `Math.min(dt, 0.05)` 保持一致 —— 切后台回来不要一帧跳完 */
export const MAX_DT = 0.05;

/** 长帧阈值（毫秒）。> 50ms 即掉到 20fps 以下，用户能明显感觉到卡 */
export const LONG_FRAME_MS = 50;

/** 采样窗口：最近 60 秒（按 60fps 估） */
const CAPACITY = 3600;

export interface FrameSummary {
  frames: number;
  /** 窗口内平均帧率 */
  avgFps: number;
  /** 帧率分位数（越低越糟） */
  p1Fps: number;
  /** 帧时间分位数（越高越糟） */
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** 长帧（> 50ms）占比，DoD 要求 < 1% */
  longPct: number;
}

/**
 * 帧采样器。
 * `noticeably` 用来判定"已经跑够久可以下结论"，避免开局几帧的抖动被当成问题。
 */
export class FrameStats {
  private dts: number[] = [];
  private head = 0;

  record(dtMs: number): void {
    if (this.dts.length < CAPACITY) {
      this.dts.push(dtMs);
    } else {
      this.dts[this.head] = dtMs;
      this.head = (this.head + 1) % CAPACITY;
    }
  }

  reset(): void {
    this.dts.length = 0;
    this.head = 0;
  }

  get count(): number {
    return this.dts.length;
  }

  /** 首 N 帧的平均帧率 —— 首屏体验的关键指标 */
  firstFps(n: number): number | null {
    if (this.dts.length < n) return null;
    const s = this.dts.slice(0, n).reduce((a, b) => a + b, 0);
    return (n / s) * 1000;
  }

  summary(): FrameSummary | null {
    const n = this.dts.length;
    if (n === 0) return null;

    const sorted = [...this.dts].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * n)))];

    const sum = sorted.reduce((a, b) => a + b, 0);
    const avgMs = sum / n;
    const long = sorted.filter((d) => d > LONG_FRAME_MS).length;

    return {
      frames: n,
      avgFps: 1000 / avgMs,
      // p1 帧率 = 最慢的 1% 帧所对应的帧率（用 p99 帧时间换算）
      p1Fps: 1000 / at(0.99),
      p95Ms: at(0.95),
      p99Ms: at(0.99),
      maxMs: sorted[n - 1],
      longPct: long / n,
    };
  }
}

/**
 * 设备分档。
 *
 * ⚠️ 取"三取劣"：`deviceMemory` / `hardwareConcurrency` / 首 60 帧实测 fps
 * 三者里**最差**的那个说了算。
 * 理由：单看硬件参数会高估（很多安卓机 deviceMemory 报 8 但实际很卡），
 * 单看首帧又会低估（首帧包含编译与纹理上传，天然慢）。
 */
export type Tier = 'high' | 'mid' | 'low';

export interface TierDecision {
  tier: Tier;
  reason: string;
  signals: { deviceMemory: number | null; cores: number | null; firstFps: number | null };
}

export function pickTier(firstFps: number | null): TierDecision {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;

  const byMemory: Tier = deviceMemory === null ? 'high' : deviceMemory >= 8 ? 'high' : deviceMemory >= 4 ? 'mid' : 'low';
  const byCores: Tier = cores === null ? 'high' : cores >= 8 ? 'high' : cores >= 4 ? 'mid' : 'low';
  const byFps: Tier = firstFps === null ? 'high' : firstFps >= 55 ? 'high' : firstFps >= 45 ? 'mid' : 'low';

  const rank: Record<Tier, number> = { low: 0, mid: 1, high: 2 };
  const worst = [byMemory, byCores, byFps].sort((a, b) => rank[a] - rank[b])[0];

  return {
    tier: worst,
    reason: `memory=${deviceMemory ?? '?'}→${byMemory}, cores=${cores ?? '?'}→${byCores}, firstFps=${
      firstFps === null ? '?' : firstFps.toFixed(1)
    }→${byFps}，取最劣`,
    signals: { deviceMemory, cores, firstFps },
  };
}

/** 每档的实际渲染参数 */
export interface TierProfile {
  /** DPR 上限。原版无上限（DPR3 白烧 2.25× 填充率），这里必须夹住 */
  maxDpr: number;
  /** 是否开启视差（关了省每帧的矩阵更新与重绘） */
  parallax: boolean;
  /** 是否锁 30fps（低端机稳定 30 比抖动的 45 体感好） */
  targetFps: number;
}

export const TIER_PROFILE: Record<Tier, TierProfile> = {
  high: { maxDpr: 2.0, parallax: true, targetFps: 60 },
  mid: { maxDpr: 1.5, parallax: true, targetFps: 60 },
  low: { maxDpr: 1.0, parallax: false, targetFps: 30 },
};
