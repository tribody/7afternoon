/**
 * 加载屏 —— 把原版那个"假的"进度条换成真的。
 *
 * 原版的问题（classic/game.js:2023 + style.css 的 `loadFill 2.5s forwards`）：
 * 进度条是一条**纯 CSS 动画**，与真实加载进度毫无关系，加载屏则在
 * 硬编码的 `setTimeout(..., 2700)` 之后被收掉。也就是说"首屏 3 秒可交互"
 * 从来就没有被验证过 —— 它只是"看起来加载了 2.7 秒"。
 *
 * 这里的做法：保留 2.7 秒的**最低展示时长**（仪式感是设计的一部分，不能砍），
 * 但进度条的宽度由真实进度驱动，并且：
 *
 *     displayed = clamp(animT × 0.92, 0, realP >= 1 ? 1 : 0.92)
 *
 * 即动画最多走到 92%，剩下 8% 只有**真加载完成**才会补齐。
 * 这样"进度条卡在 92%"就成为一个诚实的信号：真的还没好。
 * 同时用 8 秒超时兜底，超时后放行并提示降级，绝不白屏。
 */

const MIN_SHOW_MS = 2700;
const TIMEOUT_MS = 8000;
/** 动画封顶，留 8% 给"真完成" */
const ANIM_CEIL = 0.92;

export interface LoadingDone {
  /** 是否在超时前正常完成 */
  ok: boolean;
  /** 从构造到放行的毫秒数 */
  elapsedMs: number;
}

export class LoadingScreen {
  private el: HTMLElement;
  private fill: HTMLElement;
  private startedAt = performance.now();
  private animT = 0;
  private realP = 0;
  private raf = 0;
  private finished = false;

  constructor(el: HTMLElement, fill: HTMLElement) {
    this.el = el;
    this.fill = fill;
    this.tick();
  }

  /** 真实进度 0..1 */
  setProgress(p: number): void {
    this.realP = Math.max(0, Math.min(1, p));
  }

  /** 真实加载结束，把剩下的 8% 补上 */
  complete(): Promise<LoadingDone> {
    this.realP = 1;
    return this.settle();
  }

  /** 加载失败 / 超时：也要放行，但如实记账 */
  fallback(reason: string): Promise<LoadingDone> {
    this.el.classList.add('is-degraded');
    const note = this.el.querySelector('.loading-text');
    if (note) note.textContent = reason;
    this.realP = 1;
    return this.settle();
  }

  private settle(): Promise<LoadingDone> {
    if (this.finished) return Promise.resolve({ ok: true, elapsedMs: 0 });
    this.finished = true;

    return new Promise((resolve) => {
      const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - this.startedAt));
      window.setTimeout(() => {
        cancelAnimationFrame(this.raf);
        this.fill.style.width = '100%';
        this.el.classList.add('hidden');
        resolve({ ok: true, elapsedMs: performance.now() - this.startedAt });
      }, wait);
    });
  }

  private tick = (): void => {
    const elapsed = performance.now() - this.startedAt;
    this.animT = Math.min(1, elapsed / MIN_SHOW_MS);

    const displayed = Math.min(
      Math.max(this.animT * ANIM_CEIL, 0),
      this.realP >= 1 ? 1 : ANIM_CEIL,
    );
    this.fill.style.width = `${(displayed * 100).toFixed(1)}%`;

    if (elapsed > TIMEOUT_MS && !this.finished) {
      // 超时兜底：不等了，放行。绝不白屏。
      void this.fallback('网络有点慢，先用降级画质开始...');
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
