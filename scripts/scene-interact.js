/**
 * 13 幕交互脚本 —— 冒烟闭环与连播取证共用。
 *
 * ⚠️ 这个函数会被 Playwright `page.evaluate()` 序列化后在页面里执行，
 *    所以**必须自成一体**：不允许引用任何外部作用域的变量，
 *    只允许用 `window.__v2` 提供的钩子（第一句就把它们取出来）。
 *    违反这条的症状是 `ReferenceError: xxx is not defined`，
 *    而且因为它发生在浏览器侧，报错信息经常不指向真正的原因。
 *
 * ⚠️ 每一幕的玩法都是照抄原版 game.js 的判定算出来的，改之前先回头读原版。
 *    这里任何一个数字改动都会让冒烟变红 —— 那是对的，说明判定变了。
 *
 * @param {string} id 场景 id（s0..s12）
 * @returns {Promise<{taps:number, text:string, hint:string, done:boolean}>}
 */
export async function playScene(id) {
  const v = window.__v2;
  const { w, h } = v.viewport();
  const s = v.scene;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  if (id === 's0') {
    // 一封信：点信封开
    const pt = s.envelopeDesignPosition();
    v.tapAt(pt.x, pt.y);
  } else if (id === 's1') {
    // 初遇：两台显示器各点一次（U.dist<60）
    for (const pt of s.screenDesignPositions()) v.tapAt(pt.x, pt.y);
  } else if (id === 's2') {
    // 剧本杀：连点心跳 3 次（50px 圆形判定）
    const pt = s.heartDesignPosition();
    for (let i = 0; i < 3; i++) v.tapAt(pt.x, pt.y);
  } else if (id === 's3') {
    // 除夕夜：4 句气泡按 0.8s 间隔逐个出现（t > 2.4s 才齐），全点掉才算聊完。
    // ⚠️ 每点一次都**重新取位置**：气泡有浮动动画，一次性取 4 个再连点
    //    会因为位移而点偏（50px 圆形判定擦边就可能漏）。
    const total = s.bubbleDesignPositions().length;
    for (let i = 0; i < total; i++) {
      const bp = s.bubbleDesignPositions()[i];
      if (bp) v.tapAt(bp.x, bp.y);
    }
  } else if (id === 's4') {
    // 春天：拖拽四步 —— 生成花瓣 → down 抓住 → move 到目标 → up 落下吸附
    const t = s.targetDesignPosition();
    for (let i = 0; i < 5; i++) {
      const px = w * (0.15 + 0.14 * i);
      const py = h * 0.75;
      s.spawnPetalAt(px, py);
      v.tapAt(px, py);
      v.moveAt(t.x, t.y);
      v.releaseAt(t.x, t.y);
    }
  } else if (id === 's5') {
    // 海南蜜月：海浪带中线点 5 次
    const band = s.waveBandDesign();
    const y = (band.y0 + band.y1) / 2;
    for (let i = 0; i < 5; i++) v.tapAt(w * (0.2 + 0.15 * i), y);
  } else if (id === 's6') {
    // 养猫：按住累积，petProgress 每秒 +0.5，必须按满 2 秒；松手才换文案
    const pt = s.catDesignPosition();
    v.tapAt(pt.x, pt.y);
    await sleep(2400);
    v.releaseAt(pt.x, pt.y);
  } else if (id === 's7') {
    // 失业雨天：按住 + 在 50px 内来回移动 40 次（0.03/次 → 1.2 ≥ 1），松手换文案
    const pt = s.faceDesignPosition();
    v.tapAt(pt.x, pt.y);
    for (let i = 0; i < 40; i++) v.moveAt(pt.x + Math.sin(i * 0.9) * 20, pt.y + Math.cos(i * 1.3) * 15);
    v.releaseAt(pt.x, pt.y);
  } else if (id === 's8') {
    // 自媒体：补光灯点 4 次触发闪光
    const pt = s.ringDesignPosition();
    for (let i = 0; i < 4; i++) v.tapAt(pt.x, pt.y);
  } else if (id === 's9') {
    // 争吵：抓住男孩拖到 girlX-70（间距 70 < 90 → 和好），松手
    const a = s.actorDesignPositions();
    v.tapAt(a.boyX, a.y);
    v.moveAt(a.girlX - 70, a.y);
    v.releaseAt(a.girlX - 70, a.y);
  } else if (id === 's10') {
    // 加班星空：无 hit test，任意点按计数，点满 6 次
    for (let i = 0; i < 6; i++) v.tapAt(w * (0.2 + 0.1 * i), h * 0.4);
  } else if (id === 's11') {
    // 加班晚归：窗心 40px 内点一次，done 在 lightT 走完之后
    const pt = s.windowDesignPosition();
    v.tapAt(pt.x, pt.y);
  } else if (id === 's12') {
    // 星空许愿：任意点 8 次（无 hit test）。ended 在下一帧 update 里判定，
    // 点完要等一拍再返回，否则读到的 text 还是空串。
    for (let i = 0; i < 8; i++) v.tapAt(w * (0.2 + 0.08 * i), h * 0.3);
    await sleep(150);
  }

  return { taps: s.tapCount, text: s.text, hint: s.hint, done: s.done };
}
