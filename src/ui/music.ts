/**
 * 音乐 —— Web Audio 实时合成，全程无音频文件。
 *
 * 移植自原版 `classic/game.js:1944-1993` 的 `Music` 类，三个要点照抄不改：
 *
 *  1. **AudioContext 必须在用户手势里创建**。浏览器的自动播放策略不允许
 *     无手势起音频，原版把 `music.play()` 放在首次 canvas pointerdown 里
 *     （`game.js:2126`）。这一点是**对的，必须保留** —— 提前到 load 里
 *     创建会得到一个被挂起的 ctx（State 停在 suspended，一声不响）。
 *  2. **五声音阶循环旋律**，每 0.5s 一个音，正弦波配快起慢落的包络。
 *     曲调本身不重要，它的作用是把画面从"静默的图"变成"有呼吸的场景"。
 *  3. **静音走 gain 归零，不是停振荡器**。这样切回来能立刻接着响，
 *     也不会在切静音时留下一个断在半拍的音。
 *
 * 原版还有一处刻意为之：`play()` 是幂等的（`if (this.audioCtx) return`），
 * 所以每次 pointerdown 调它都安全，不需要额外的 started 标志位。
 */

const MELODY = [523, 587, 659, 784, 880, 988, 1047, 880, 784, 659, 587, 523];
const NOTE_INTERVAL = 0.5;
const VOLUME = 0.08;
const ATTACK = 0.05;
const RELEASE = 0.45;
const NOTE_LIFE = 0.5;

export class Music {
  private audioCtx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private muted = false;
  private melodyTimer = 0;
  private noteIdx = 0;

  /**
   * 创建音频上下文并起旋律。**必须在用户手势的调用栈里调**。
   * 幂等：重复调用直接返回，所以可以在每个 pointerdown 里无脑调。
   */
  play(): void {
    if (this.audioCtx) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = VOLUME;
      gain.connect(ctx.destination);
      this.audioCtx = ctx;
      this.gain = gain;
      this.noteIdx = 0;
      this.melodyTimer = 0;
    } catch {
      // 音频不可用（无权限 / 无输出设备 / 老内核）就静默降级 ——
      // 音乐是锦上添花，绝不能因为它让主流程挂掉。
    }
  }

  /** 返回切换后的静音态（调用方据此切按钮样式） */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.gain) this.gain.gain.value = this.muted ? 0 : VOLUME;
    return this.muted;
  }

  /** 每帧推进旋律。未起播 or 静音时直接返回。 */
  update(dt: number): void {
    const ctx = this.audioCtx;
    const gain = this.gain;
    if (!ctx || !gain || this.muted) return;

    this.melodyTimer -= dt;
    if (this.melodyTimer > 0) return;
    this.melodyTimer = NOTE_INTERVAL;

    const freq = MELODY[this.noteIdx % MELODY.length] ?? MELODY[0]!;
    this.noteIdx++;

    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    noteGain.gain.setValueAtTime(0, ctx.currentTime);
    noteGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + ATTACK);
    noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + RELEASE);
    osc.connect(noteGain);
    noteGain.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + NOTE_LIFE);
  }

  /** 是否已起播（首次手势后为 true） */
  get started(): boolean {
    return this.audioCtx !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }
}
