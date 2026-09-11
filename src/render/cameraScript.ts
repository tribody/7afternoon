/**
 * 镜头语言脚本 —— 数据格式 + 求值器。
 *
 * 计划 §「镜头语言脚本」要求为 13 个场景各设计一条相机运动，并给出可复用的
 * 数据格式。这里把格式固化下来：一条脚本 = 若干关键帧 + 指针微视差增益。
 *
 * 说明：正交相机不改焦距，所以"推/拉"靠的是**层的相对位移**（视差）而不是
 * zoom —— 对 2.5D 贴片堆栈来说，位移比缩放更便宜，也不会让水彩贴图糊掉。
 * 真要做出"推进"的观感，用整栈同向位移 + 焦点层反向微移即可。
 */

export interface CameraKey {
  /** 相对场景进入时刻的秒数 */
  t: number;
  /** 归一化偏移 */
  x: number;
  y: number;
}

export interface CameraScript {
  id: string;
  /** 这条运动服务什么情绪（写给自己看的，评审时要能对上） */
  mood: string;
  keys: CameraKey[];
  /** 指针微视差增益：手指/鼠标移动 1 个归一化单位，镜头跟多少 */
  pointerGain: number;
  /** 关键帧走完后的行为：'hold' 停住 / 'loop' 回头循环 */
  after: 'hold' | 'loop';
}

/**
 * S3「除夕夜聊天」。
 *
 * 这是全片最平、文本最密的一场：画面本身没什么可看的，情绪全在**等**
 * 与**靠近**上。所以镜头做一次极慢的、几乎察觉不到的向前推进 + 轻微下沉，
 * 让观众在四句话的间隙里感到"镜头在往前凑"。
 * 幅度必须小（总计 1.4% 画幅），大了就变成"镜头在抖"。
 */
export const S3_CAMERA: CameraScript = {
  id: 'S3',
  mood: '几乎静止的、向屏幕那头的缓慢靠近 —— 呼应"隔着屏幕聊天"',
  keys: [
    { t: 0, x: 0, y: 0 },
    { t: 6, x: 0, y: -0.006 },
    { t: 14, x: 0.004, y: -0.01 },
    { t: 24, x: 0, y: -0.014 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

const easeIO = (v: number) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);

/** 求某一时刻的镜头偏移（不含指针分量） */
export function evalCamera(script: CameraScript, t: number): { x: number; y: number } {
  const k = script.keys;
  if (k.length === 0) return { x: 0, y: 0 };
  if (t <= k[0].t) return { x: k[0].x, y: k[0].y };

  const last = k[k.length - 1];
  let tt = t;
  if (tt >= last.t) {
    if (script.after === 'hold') return { x: last.x, y: last.y };
    // 循环：折返跑，避免接缝跳变
    const span = last.t;
    tt = span > 0 ? (t % span) : 0;
  }

  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (tt >= a.t && tt <= b.t) {
      const u = b.t === a.t ? 0 : (tt - a.t) / (b.t - a.t);
      const e = easeIO(u);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
  }
  return { x: last.x, y: last.y };
}
