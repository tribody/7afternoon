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

/**
 * S10「夕阳和解」。
 *
 * 情绪是"释然"：两人在夕阳下重新站到一起。镜头给一次极慢的横向漂移，
 * 方向朝太阳（画面中上），像呼吸一样把观众往平静里带。幅度依旧压在
 * 1.5% 画幅以内 —— 释然不是高潮，是落定。
 */
export const S10_CAMERA: CameraScript = {
  id: 'S10',
  mood: '朝着夕阳的极慢横移 —— 呼应"一切都释然了"的落定感',
  keys: [
    { t: 0, x: 0, y: 0 },
    { t: 8, x: 0.008, y: -0.004 },
    { t: 20, x: 0.012, y: -0.006 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

/**
 * S0「星空开场」：镜头从星空缓缓落到那封信上 —— 与 envY 的下落同向，
 * 但慢得多（信封是"落"，镜头是"跟着看"）。压在 1% 画幅以内。
 */
export const S0_CAMERA: CameraScript = {
  id: 'S0',
  mood: '跟着信封一起落下来的视线',
  keys: [
    { t: 0, x: 0, y: -0.008 },
    { t: 7, x: 0, y: 0 },
    { t: 16, x: 0, y: 0.005 },
  ],
  pointerGain: 0.014,
  after: 'hold',
};

/**
 * S1「公司初遇」：两台显示器一左一右，镜头几乎不动 —— 这场的主角是
 * "两个人各自坐着"，任何运动都会破坏那份拘谨。只留一丝横向漂移。
 */
export const S1_CAMERA: CameraScript = {
  id: 'S1',
  mood: '办公桌上拘谨的静止（只为让画面不是一张照片）',
  keys: [
    { t: 0, x: -0.004, y: 0 },
    { t: 10, x: 0, y: -0.003 },
    { t: 22, x: 0.004, y: -0.005 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

/**
 * S2「剧本杀」：心跳是这场唯一的节拍，镜头只做极轻的下沉，
 * 让"坐着不敢动"的紧张感成立。幅度比 S1 更小。
 */
export const S2_CAMERA: CameraScript = {
  id: 'S2',
  mood: '屏住呼吸的极轻下沉',
  keys: [
    { t: 0, x: 0, y: 0 },
    { t: 12, x: 0, y: -0.004 },
    { t: 24, x: 0, y: -0.006 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

/** 批量场景的镜头：幅度都压在 1.5% 画幅内，按情绪选方向 */
export const S4_CAMERA: CameraScript = {
  id: 'S4',
  mood: '春天里轻轻往上抬（花瓣在落，镜头在迎）',
  keys: [
    { t: 0, x: 0, y: 0.004 },
    { t: 14, x: 0.003, y: -0.006 },
  ],
  pointerGain: 0.014,
  after: 'hold',
};

export const S5_CAMERA: CameraScript = {
  id: 'S5',
  mood: '海平线一样的稳（先横向漂一点，再停住）',
  keys: [
    { t: 0, x: -0.005, y: 0 },
    { t: 16, x: 0.005, y: -0.004 },
  ],
  pointerGain: 0.014,
  after: 'hold',
};

export const S6_CAMERA: CameraScript = {
  id: 'S6',
  mood: '居家的随意（几乎不动，只有一点点呼吸）',
  keys: [
    { t: 0, x: 0, y: 0 },
    { t: 18, x: 0.004, y: -0.005 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

export const S7_CAMERA: CameraScript = {
  id: 'S7',
  mood: '雨里的静止（镜头不敢动，只有一点下沉）',
  keys: [
    { t: 0, x: 0, y: 0 },
    { t: 20, x: 0, y: -0.005 },
  ],
  pointerGain: 0.01,
  after: 'hold',
};

export const S8_CAMERA: CameraScript = {
  id: 'S8',
  mood: '补光灯下的轻微仰视（缓缓上抬）',
  keys: [
    { t: 0, x: 0, y: -0.003 },
    { t: 15, x: 0, y: 0.004 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

export const S9_CAMERA: CameraScript = {
  id: 'S9',
  mood: '争吵后的凝滞（只有极轻的横向游移，像不知道该看哪里）',
  keys: [
    { t: 0, x: -0.004, y: 0 },
    { t: 18, x: 0.004, y: -0.003 },
  ],
  pointerGain: 0.01,
  after: 'hold',
};

export const S11_CAMERA: CameraScript = {
  id: 'S11',
  mood: '夜归（镜头从画面左侧缓缓向右，跟着走回家的方向）',
  keys: [
    { t: 0, x: -0.006, y: 0 },
    { t: 20, x: 0.006, y: -0.004 },
  ],
  pointerGain: 0.012,
  after: 'hold',
};

export const S12_CAMERA: CameraScript = {
  id: 'S12',
  mood: '终局（极慢地向上，像把镜头交给星星）',
  keys: [
    { t: 0, x: 0, y: 0 },
    { t: 30, x: 0, y: -0.012 },
  ],
  pointerGain: 0.014,
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
