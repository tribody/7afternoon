/**
 * 真机数字浮层。
 *
 * M1 的 DoD 要在**低端安卓 + 微信内置浏览器**上读帧率，而沙箱里没有真机、
 * 也不能联网上报。所以数字必须能在手机屏上直接看。
 *
 * 不引 vConsole（多 40KB 且会污染全局）；就是一个固定定位的 DOM 块，
 * 更新频率限到 4Hz，避免它自己成为性能噪声。
 *
 * 打开方式（二选一）：
 *   · URL 加 `?debug=1`
 *   · 屏幕左上角连点 3 下（方便在微信里打开时不用改地址）
 */
import type { FrameStats, TierDecision } from '../core/loop';

const UPDATE_MS = 250;

export class PerfOverlay {
  private el: HTMLElement;
  private last = 0;
  private taps: number[] = [];
  private visible = false;
  private extra: Record<string, string> = {};

  constructor(
    private stats: FrameStats,
    private tier: TierDecision,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'perf-overlay';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    // 左上角连点 3 下
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.clientX > 88 || e.clientY > 88) return;
        const now = performance.now();
        this.taps = this.taps.filter((t) => now - t < 900);
        this.taps.push(now);
        if (this.taps.length >= 3) {
          this.taps = [];
          this.toggle();
        }
      },
      { capture: true },
    );

    if (new URLSearchParams(location.search).has('debug')) this.toggle();
  }

  set(key: string, value: string): void {
    this.extra[key] = value;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    if (this.visible) this.render(true);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** 每帧调用；内部限频 */
  frame(now: number): void {
    if (!this.visible) return;
    if (now - this.last < UPDATE_MS) return;
    this.last = now;
    this.render();
  }

  private render(force = false): void {
    const s = this.stats.summary();
    const first60 = this.stats.firstFps(60);

    const lines = [
      `档位 ${this.tier.tier.toUpperCase()}`,
      s
        ? `fps ${s.avgFps.toFixed(1)}  p95 ${s.p95Ms.toFixed(1)}ms  p99 ${s.p99Ms.toFixed(1)}ms`
        : 'fps —',
      s ? `长帧(>50ms) ${(s.longPct * 100).toFixed(2)}%  最大 ${s.maxMs.toFixed(0)}ms` : '',
      first60 === null ? '首 60 帧 —' : `首 60 帧 ${first60.toFixed(1)} fps`,
      `帧数 ${this.stats.count}`,
      ...Object.entries(this.extra).map(([k, v]) => `${k} ${v}`),
    ].filter(Boolean);

    this.el.textContent = lines.join('\n');
    if (force) this.last = performance.now();
  }

  /** 供 Playwright 断言读取 */
  snapshot(): Record<string, unknown> {
    const s = this.stats.summary();
    return {
      tier: this.tier.tier,
      tierReason: this.tier.reason,
      frames: this.stats.count,
      avgFps: s?.avgFps ?? null,
      p95Ms: s?.p95Ms ?? null,
      p99Ms: s?.p99Ms ?? null,
      longPct: s?.longPct ?? null,
      maxMs: s?.maxMs ?? null,
      first60Fps: this.stats.firstFps(60),
      extra: { ...this.extra },
    };
  }
}
