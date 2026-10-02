/**
 * 烘焙 harness 入口（仅开发/构建期使用，不进产物）
 *
 * 引导顺序上有一个刻意设计：
 *   等 window.load **之后**才动态注入 classic/game.js。
 *   因为 game.js 末尾写着 `window.addEventListener('load', () => new Game().init())`，
 *   load 事件一旦已经过去，这个监听就永远不会触发 ——
 *   我们干净地拿到 drawSky / drawBoy / wcWash / makeStars / C 等定义，
 *   而不会启动整个 Game（不建 AudioContext、不碰 DOM、不起 rAF 循环）。
 *
 * 注意：game.js 里 `const C` / `const U` 是**全局词法绑定**，不在 window 上，
 * 但模块可以直接以裸标识符访问；函数声明（drawBoy 等）则同时挂在 window。
 */
import { bakeS3 } from './scenes/s3.js';
import { bakeS10 } from './scenes/s10.js';
import { bakeS0 } from './scenes/s0.js';
import { bakeS1 } from './scenes/s1.js';
import { bakeS2 } from './scenes/s2.js';
import { bakeS4 } from './scenes/s4.js';
import { bakeS5 } from './scenes/s5.js';
import { bakeS6 } from './scenes/s6.js';
import { bakeS7 } from './scenes/s7.js';
import { bakeS8 } from './scenes/s8.js';
import { bakeS9 } from './scenes/s9.js';
import { tightBBox, withSeed, SEED_PAPER, createSink } from './layerSink.js';

/**
 * 把 runtimePlaced 层的贴图按「锚点对齐」画到合成图上。
 *
 * ⚠️ 贴图是**裁剪到紧致包围盒**的，锚点一般不在贴图中心（信封的阴影在
 *    下方、猫的身体偏下）。所以必须算出锚点在贴图内的归一化位置 (u,v)，
 *    再按"锚点 → 目标点"对齐。假定居中会让元素整块偏掉（实测 Δ88.8）。
 *
 * @param {number} anchor.x 锚点的设计坐标（与烘焙 spec 一致）
 * @param {number} target.x 希望锚点落到的地方（真值那一帧的实际值）
 */
function blitAnchored(g, last, name, anchor, target) {
  const spec = last.specs.find((s) => s.name === name);
  const sink = last.sinks[name];
  const u = (anchor.x - spec.dx) / spec.dw;
  const v = (anchor.y - spec.dy) / spec.dh;
  g.drawImage(sink.canvas, target.x - u * spec.dw, target.y - v * spec.dh, spec.dw, spec.dh);
  return spec;
}

/**
 * 场景注册表 —— M2 量产每加一场，就往这里加一条。
 *
 * hook 用来处理"没有烘进贴图、但真值里有"的运行时元素：
 *   klass        场景类（直接 new 出来跑原版 render 当真值）
 *   prepTruth    真值准备（喂同一批随机数据，锁两次随机的差异）
 *   animate      推进若干帧让运行时元素就位（S3 的气泡要收敛）
 *   refState     记录真值那一帧的实际状态，合成图按它摆放
 *   blitExtraAt  在某层**之后**插入额外绘制（绘制序敏感）。字符串或字符串数组
 *   blitExtra    额外绘制本体，末位参数是本次触发的层名（数组时可据此分支）
 */
const SCENES = {
  s3: {
    bake: bakeS3,
    klass: () => S3,
    prepTruth(scene, last) {
      scene.stars = last.stars;
    },
    animate(scene) {
      for (let i = 0; i < 60 * 4; i++) scene.update(1 / 60); // 让 4 个气泡就位
    },
    refState(scene) {
      return { bubbles: scene.bubbles.map((b) => ({ x: b.x, y: b.y, text: b.text })) };
    },
    blitExtraAt: 'paper',
    blitExtra(g, last, ref, w) {
      const bub = last.specs.find((s) => s.name === 'bubbles');
      const bubSink = last.sinks.bubbles;
      for (const b of ref.bubbles) {
        g.save();
        g.filter = 'blur(0.5px)';
        g.drawImage(
          bubSink.canvas,
          b.x + bub.dx,
          b.y + bub.dy,
          bubSink.canvas.width / last.scale,
          bubSink.canvas.height / last.scale,
        );
        g.restore();
        g.save();
        g.fillStyle = C.darkBrown;
        g.font = `14px ${FB}`;
        g.textAlign = 'center';
        g.fillText(b.text, b.x, b.y + 2);
        g.restore();
      }
    },
  },
  s10: {
    bake: bakeS10,
    klass: () => S10,
    // render 里没有随 t 变化的东西（粒子是 ps.spawn 出来的，不在 render 内），
    // 直接 enter 后 render 即真值
  },

  s0: {
    bake: bakeS0,
    klass: () => S0,
    prepTruth(scene, last) {
      scene.stars = last.stars;
    },
    // 信封从 envY=-100 lerp 到 h*0.4（dt*2）：推进 3 秒让它收敛，
    // 否则真值与合成图差着一整个"信封还在屏幕外"的距离
    animate(scene) {
      for (let i = 0; i < 60 * 3; i++) scene.update(1 / 60);
    },
    refState(scene) {
      return { envY: scene.envY, float: Math.sin(scene.t * 2) * 8 };
    },
    blitExtraAt: 'paper',
    blitExtra(g, last, ref) {
      blitAnchored(
        g,
        last,
        'envelope',
        { x: last.anchors.envX, y: last.anchors.envY },
        { x: last.anchors.envX, y: ref.envY + ref.float },
      );
    },
  },

  s1: {
    bake: bakeS1,
    klass: () => S1,
    /**
     * ⚠️ 必须推进一帧：两台显示器的坐标是**在 update() 里算的**
     *    （game.js:1130-1131），enter() 之后它们还停在 (0,0) ——
     *    不补这一帧，真值会把显示器画在左上角（实测该块 Δ24.1，
     *    而且真值全图上桌子上是空的）。
     *
     *    用 dt=0：坐标就位，而 t 不变 → bob = sin(0)=0，与静态层严格对齐。
     *    ⚠️ 别改成 1/60：那样 t=1/60，bob 立刻偏离 0，静态层就对不上了。
     */
    animate(scene) {
      scene.update(0);
    },
  },

  s2: {
    bake: bakeS2,
    klass: () => S2,
    prepTruth(scene, last) {
      // 卡牌旋转锁种子：用烘焙那一批，消除两次 U.rand 的差
      last.extra.cards.forEach((c, i) => {
        scene.cards[i].rot = c.rot;
      });
    },
    // 心跳 heartScale 在 beatT=0 时为 1 → 与烘焙定格帧一致，不推进
    blitExtraAt: 'cards',
    blitExtra(g, last) {
      const a = { x: last.anchors.heartX, y: last.anchors.heartY };
      blitAnchored(g, last, 'heart', a, a);
    },
  },

  s4: {
    bake: bakeS4,
    klass: () => S4,
    /**
     * update(0)：目标心坐标是在 update 里算的（game.js:1408），只跑 enter
     * 的话 target 还是 (0,0)。随后**清空花瓣** —— update 里那段
     * `Math.random() < 0.06` 的生成是随机的，真值有、合成没有，
     * 会变成假差异。花瓣本身由运行时摆，不参与对拍。
     */
    animate(scene) {
      scene.update(0);
      scene.petals = [];
    },
    blitExtraAt: 'trees',
    blitExtra(g, last, ref) {
      // 目标心轮廓：placed=0 < maxPetals 时原版会画（game.js:1434-1439）
      void ref;
      blitAnchored(
        g,
        last,
        'heartOutline',
        { x: last.anchors.targetX, y: last.anchors.targetY },
        { x: last.anchors.targetX, y: last.anchors.targetY },
      );
    },
  },

  s5: {
    bake: bakeS5,
    klass: () => S5,
    // waveT 初值 0 → render 即真值那一帧，无需 animate
    blitExtraAt: 'ocean',
    blitExtra(g, last, ref) {
      // 波浪层（定格 waveT=0）
      void ref;
      blitAnchored(
        g,
        last,
        'waves',
        { x: last.anchors.waveAnchorX ?? 0, y: last.anchors.waveAnchorY ?? 0 },
        { x: last.anchors.waveAnchorX ?? 0, y: last.anchors.waveAnchorY ?? 0 },
      );
    },
  },

  s6: {
    bake: bakeS6,
    klass: () => S6,
    /** update(0)：catX/catY 在 update 里算（game.js:1562）；不推进 t，眨眼保持不闭 */
    animate(scene) {
      scene.update(0);
    },
    blitExtraAt: 'furniture',
    blitExtra(g, last, ref) {
      // 未抚摸态：原版画 curious（game.js:1588，purr=0）
      void ref;
      blitAnchored(
        g,
        last,
        'catIdle',
        { x: last.anchors.catX, y: last.anchors.catY },
        { x: last.anchors.catX, y: last.anchors.catY },
      );
    },
  },

  s7: {
    bake: bakeS7,
    klass: () => S7,
    /** 雨滴锁种子：80 条逐条随机，两次随机出来的分布不同 = 结构性差异 */
    prepTruth(scene, last) {
      scene.drops = last.extra.drops;
    },
    // 泪珠位置恒定（t=0 → tearY=h*0.5，wobble=0），不需要 animate
    /** 两处插入点：雨要夹在 paper 与 ground 之间，泪珠要压在 actors 之后 */
    blitExtraAt: ['paper', 'actors'],
    blitExtra(g, last, ref, w, at) {
      void ref;
      void w;
      if (at === 'paper') {
        // 雨幕：满幅层，U.T=0 → 与烘焙完全一致，锚点 (0,0) 即自身原点
        blitAnchored(g, last, 'rain', { x: 0, y: 0 }, { x: 0, y: 0 });
        return;
      }
      // 泪珠 3 颗：tearWipe=0 → 3 - floor(0*3) = 3 颗全部在场（game.js:1654）
      for (let i = 0; i < 3; i++) {
        blitAnchored(
          g,
          last,
          'tear',
          { x: last.anchors.tear0X, y: last.anchors.tear0Y },
          { x: last.anchors.tear0X + i * 10, y: last.anchors.tear0Y + i * 5 },
        );
      }
    },
  },

  s8: {
    bake: bakeS8,
    klass: () => S8,
    // flashT 初值 0 → 真值那一帧没有白幕，也没有遗漏的元素要补
  },

  s9: {
    bake: bakeS9,
    klass: () => S9,
    /** update(0)：boyX/girlX/targetX 全在 update 里算（game.js:1742-1743） */
    animate(scene) {
      scene.update(0);
    },
    blitExtraAt: 'ground',
    blitExtra(g, last, ref) {
      void ref;
      // 距离虚线（game.js:1757-1763）—— 未和好时才画
      g.save();
      g.strokeStyle = C.rgba(C.gray, 0.15);
      g.lineWidth = 2;
      g.setLineDash([5, 5]);
      g.beginPath();
      const lineY = last.design.h * 0.55;
      g.moveTo(last.anchors.boyX, lineY);
      g.lineTo(last.anchors.girlX, lineY);
      g.stroke();
      g.restore();
      // 未和好 → 两人都画 sad 态
      const boyAnchor = { x: last.anchors.boyX, y: last.anchors.actY };
      blitAnchored(g, last, 'boySad', boyAnchor, boyAnchor);
      const girlAnchor = { x: last.anchors.girlX, y: last.anchors.actY };
      blitAnchored(g, last, 'girlSad', girlAnchor, girlAnchor);
    },
  },
};

const logEl = document.getElementById('log');
const say = (s) => {
  if (logEl) logEl.textContent += `\n${s}`;
};

function afterLoad() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`脚本加载失败：${src}`));
    document.head.appendChild(el);
  });
}

/** 上一次烘焙的结果（含各层 canvas），供 getLayerDataURL 取图 */
let last = null;
/** 上一个跑的场景 id —— renderPair 要按同一场景取 hook */
let lastId = 's3';

const boot = (async () => {
  await afterLoad();
  await injectScript('../classic/game.js');

  // 自检：绘制原语是否真的拿到了
  const probe = {
    drawSky: typeof drawSky,
    drawBoy: typeof drawBoy,
    drawStars: typeof drawStars,
    makeStars: typeof makeStars,
    wcWash: typeof wcWash,
    fRR: typeof fRR,
    drawPaperTexture: typeof drawPaperTexture,
  };
  const missing = Object.entries(probe).filter(([, t]) => t !== 'function').map(([k]) => k);
  if (missing.length) throw new Error(`classic/game.js 缺少绘制函数：${missing.join(', ')}`);

  // C 是词法绑定，探一下能不能读到
  if (!C || !C.navy) throw new Error('读不到调色板 C');

  say('classic/game.js 已注入；绘制函数与调色板就绪。');
  return { probe, palette: Object.keys(C).length };
})();

window.__bake = {
  boot,

  /** 跑一次场景烘焙，返回元数据（图另取，避免一次传十几 MB） */
  run(opts = {}) {
    const id = opts.scene ?? 's3';
    const entry = SCENES[id];
    if (!entry) throw new Error(`未知场景：${id}（已注册：${Object.keys(SCENES).join(', ')}）`);

    const r = entry.bake(opts);
    last = r;
    lastId = id;

    const layers = r.specs.map((spec) => {
      const sink = r.sinks[spec.name];
      const cw = sink.canvas.width;
      const ch = sink.canvas.height;
      const bbox = tightBBox(sink.canvas);
      const coverage = bbox ? (bbox.w * bbox.h) / (cw * ch) : 0;

      // 铺满自检：本层应覆盖自身整张画布时，覆盖率必须 ≈100%。
      // 首次烘焙时 sky 只有 87.4%，对应的正是「出血边距是透明的」这个
      // 视差穿帮 bug —— 现在把它变成会自己喊出来的断言。
      const warning =
        spec.fullCover && coverage < 0.995
          ? `${spec.name} 应铺满自身画布却只覆盖 ${(coverage * 100).toFixed(1)}%，边缘有空洞 → 视差会露底`
          : null;

      return {
        ...spec,
        w: cw,
        h: ch,
        bbox,
        coverage: +coverage.toFixed(4),
        warning,
      };
    });

    say(`烘焙完成：${layers.length} 层，耗时 ${JSON.stringify(r.timings)}`);

    return {
      design: r.design,
      scale: r.scale,
      overdraw: r.overdraw,
      overdrawRect: r.overdrawRect,
      anchors: r.anchors,
      timings: r.timings,
      notBaked: r.notBaked,
      layers,
      warnings: layers.map((l) => l.warning).filter(Boolean),
      diagnostics: r.diagnostics ?? [],
    };
  },

  /** 烘焙脚本自标定过程中发现的异常（图层贴边等） */
  diagnostics() {
    return last?.diagnostics ?? [];
  },

  /** 单层取图（webp base64），逐层取避免一次性大对象 */
  getLayerDataURL(name) {
    if (!last) throw new Error('先调 run()');
    const sink = last.sinks[name];
    if (!sink) throw new Error(`未知层：${name}`);
    return sink.canvas.toDataURL('image/webp', 0.8);
  },

  /** 自省：把各层运行时的真实变换矩阵读回来（排查坐标类问题用） */
  debug() {
    if (!last) throw new Error('先调 run()');
    return {
      design: last.design,
      scale: last.scale,
      sinks: Object.fromEntries(Object.entries(last.sinks).map(([n, s]) => [n, s.probe()])),
    };
  },

  /**
   * 最小隔离试验：造一个与气泡层参数完全相同的 sink，画 fRR，逐步读状态。
   * 现象是"变换矩阵明明写着 scale=2，填充结果却只有一半大"，
   * 推导走不通，就用这个把中间态钉死。
   */
  selfTest() {
    const s = createSink({ w: 200, h: 72, originX: -50, originY: -18, scale: 2 });
    const before = s.probe().rect;
    s.on();
    const afterOn = s.probe().rect;
    fRR(s.ctx, -50, -18, 100, 36, 12, '#FF0000');
    const afterFill = s.probe().rect;
    s.off();
    return { before, afterOn, afterFill, bbox: tightBBox(s.canvas) };
  },

  /**
   * 真值参考图 vs 分层合成图 —— 一次产出两图 + 结构化差异。
   *
   * 两张图都在 **2× 画布**上产出（复刻 DPR2 手机），但绘制调用全部用
   * **设计坐标**（375×812）—— 与原版在真机上的调用完全一致。
   *
   * 真值：直接 new 出 S3 类跑一遍原始 render()。
   * 合成：把烘焙出的各层按设计坐标叠回去。
   *
   * 差异用**分块均值差**而不是逐像素：粒子与星星闪烁本来就是随机/时变的，
   * 逐像素比会淹没掉真正的问题。分块均值能过滤掉这类噪声，
   * 只暴露"整块不对"的结构性错误（缺层、错位、比例错）。
   */
  renderPair(designW, designH, scale = 2, blocks = 16, sceneId = null) {
    if (!last) throw new Error('先调 run()');

    const id = sceneId ?? lastId;
    const hook = SCENES[id] ?? {};

    const w = designW;
    const h = designH;
    const cw = Math.round(w * scale);
    const chh = Math.round(h * scale);

    const mk = () => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = chh;
      const g = c.getContext('2d');
      g.setTransform(scale, 0, 0, scale, 0, 0); // 之后全部用设计坐标绘制
      return { c, g };
    };

    // —— 真值 ——
    const O = mk();
    /** 真值里运行时元素的最终状态，合成图按它摆放 —— 消除"收敛程度不同"这个假差异 */
    let refState = null;
    {
      const g = { w, h, ps: new ParticleSystem() };

      // ⚠️ klass 是 getter 函数（延迟取值：注入 game.js 之后才有 S3/S10 这些类），
      //    必须**调用**它拿到类本身再 new —— 直接 new 那个箭头函数会报
      //    "is not a constructor"
      const Klass = hook.klass ? hook.klass() : S3;
      const scene = new Klass(g);
      scene.enter();
      hook.prepTruth?.(scene, last);

      // 纸纹：原版内部走 Math.random 撒 300 点，必须锁成与烘焙同一批
      const origPaper = window.drawPaperTexture;
      window.drawPaperTexture = (ctx, pw, ph) =>
        withSeed(SEED_PAPER, () => origPaper(ctx, pw, ph));

      // 星星闪烁相位：烘焙时定格在 t=0，真值也对齐到 0
      const origT = U.T;
      U.T = 0;

      try {
        hook.animate?.(scene); // 让运行时元素（气泡等）就位
        scene.render(O.g);
      } finally {
        window.drawPaperTexture = origPaper;
        U.T = origT;
      }

      refState = hook.refState?.(scene) ?? {};
    }

    // —— 分层合成 ——
    // 严格按场景配置里的**层顺序**叠回去；multiply 层的序不能乱（见场景文件注释）
    const Cc = mk();
    {
      const g = Cc.g;
      g.fillStyle = C.paper;
      g.fillRect(0, 0, w, h);

      const blit = (name) => {
        const spec = last.specs.find((s) => s.name === name);
        const sink = last.sinks[name];
        if (!spec) return;
        g.save();
        g.globalCompositeOperation =
          spec.blend === 'add' ? 'lighter' : spec.blend === 'multiply' ? 'multiply' : 'source-over';
        // 贴图是 canvas 像素，落地时换算回**设计尺寸**
        g.drawImage(sink.canvas, spec.dx, spec.dy, sink.canvas.width / last.scale, sink.canvas.height / last.scale);
        g.restore();
      };

      // 插入点可以是单个层名，也可以是层名数组（S7 需要在 paper 之后下雨、
      // 在 actors 之后落泪 —— 两处都要按原版的绘制序）
      const extraAt =
        hook.blitExtraAt == null
          ? []
          : Array.isArray(hook.blitExtraAt)
            ? hook.blitExtraAt
            : [hook.blitExtraAt];

      for (const spec of last.specs) {
        // runtimePlaced 层是"按运行时坐标摆放的素材"，由 blitExtra 画，跳过整层
        if (!spec.runtimePlaced) blit(spec.name);
        if (extraAt.includes(spec.name)) hook.blitExtra?.(g, last, refState, w, spec.name);
      }
    }

    // —— 分块均值差 ——
    const bw = Math.floor(cw / blocks);
    const bh = Math.floor(chh / blocks);
    const od = O.g.getImageData(0, 0, cw, chh).data;
    const cd = Cc.g.getImageData(0, 0, cw, chh).data;

    const worst = [];
    let total = 0;

    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        let sumO = 0;
        let sumC = 0;
        for (let y = by * bh; y < (by + 1) * bh; y++) {
          for (let x = bx * bw; x < (bx + 1) * bw; x++) {
            const i = (y * cw + x) * 4;
            // 用亮度当代理，够抓结构错位
            sumO += (od[i] + od[i + 1] + od[i + 2]) / 3;
            sumC += (cd[i] + cd[i + 1] + cd[i + 2]) / 3;
          }
        }
        const n = bw * bh;
        const d = Math.abs(sumO / n - sumC / n);
        total += d;
        worst.push({ bx, by, d: +d.toFixed(1) });
      }
    }

    worst.sort((a, b) => b.d - a.d);

    return {
      original: O.c.toDataURL('image/png'),
      composite: Cc.c.toDataURL('image/png'),
      diff: {
        mean: +(total / (blocks * blocks)).toFixed(1),
        worst: worst.slice(0, 5),
      },
    };
  },
};

// 引导失败要显式暴露，否则 runner 只会看到超时
boot.catch((e) => {
  say(`引导失败：${e.message}`);
  window.__bakeError = e.message;
});
