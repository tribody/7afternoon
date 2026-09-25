/**
 * 构建期烘焙 runner（计划 §4.1 / 决策 D1：烘焙放在构建期，不放设备端）
 *
 * 流程：
 *   1) 起一个极简静态服务器（根 = 仓库根，使 /bake/** 与 /classic/game.js 都可访问）
 *   2) 无头 Chromium 打开 /bake/index.html
 *   3) **前置断言**：先证明 ctx.filter 在本浏览器里真的生效
 *      —— 原版水彩的 blur 全靠它（20 余处），这条不成立则整条路线的前提是假的
 *   4) 跑 S3 烘焙，各层导出 WebP，记录尺寸 / 包围盒 / 耗时 / 字节 / SHA256
 *   5) 给出 GATE-C 判定：显存是否落在预算内
 *
 * 用法：node scripts/bake.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/**
 * 产物直接落进 public/bake/ —— 与 prebuild 组装出的转发页 / classic 同处一棵树，
 * Vite dev 与 build 都能原样服务。因此 **bake 必须跑在 prebuild 之后**
 * （prebuild 会 rmSync 整个 public/）。见 package.json 的 scripts 顺序。
 */
const outDir = join(root, 'public', 'bake');
/**
 * 对照图（原版直出 / 分层合成）落这里 —— 它们是**开发期证据**，
 * 不进产物。别混进 public/，否则 1.2MB 的 PNG 会被原样拷进 dist。
 */
const pngDir = join(root, 'bake-out');

/** 纹理显存预算（计划 §4.6） */
const VRAM_BUDGET_MB = 96;
/** 同时驻留场景数（LRU 策略，计划 §4.6「同时驻留 ≤ 4 层 × 2048²」） */
const RESIDENT_SCENES = 2;
const TOTAL_SCENES = 13;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
};

// ── 静态服务器（根 = 仓库根）──────────────────────────────
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = join(root, normalize(pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(file, 'index.html');
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`not found: ${e.message}`);
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  args: ['--no-proxy-server', '--force-color-profile=srgb', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });

page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text());
});

const done = async (code, msg) => {
  await browser.close();
  server.close();
  if (msg) console.log(msg);
  process.exit(code);
};

try {
  await page.goto(`${base}/bake/index.html`, { waitUntil: 'load', timeout: 30000 });
} catch (e) {
  await done(1, `\n✗ harness 打不开：${e.message.split('\n')[0]}\n`);
}

// ── 前置断言：ctx.filter 是否真的生效 ──────────────────────
const filterProbe = await page.evaluate(() => {
  const partial = (g, w, h) => {
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 4 && d[i] < 251) n++;
    return n;
  };
  const draw = (blur) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const g = c.getContext('2d');
    if (blur) g.filter = 'blur(4px)';
    g.fillStyle = '#000';
    g.fillRect(28, 0, 8, 8);
    return partial(g, 64, 8);
  };
  const sharp = draw(false);
  const blurred = draw(true);
  return {
    sharp,
    blurred,
    filterValue: (() => {
      const g = document.createElement('canvas').getContext('2d');
      g.filter = 'blur(4px)';
      return g.filter;
    })(),
  };
});

console.log('\n════════ 烘焙前置断言 ════════');
console.log(`ctx.filter 读回值      : ${JSON.stringify(filterProbe.filterValue)}`);
console.log(`无 blur 的半透明像素数 : ${filterProbe.sharp}`);
console.log(`有 blur 的半透明像素数 : ${filterProbe.blurred}`);

if (filterProbe.filterValue !== 'blur(4px)' || filterProbe.blurred <= filterProbe.sharp * 3) {
  await done(
    1,
    '\n✗ ctx.filter 未生效 —— 原版水彩的 blur 会静默丢失（画质退化成平涂）。\n' +
      '  这条不成立，构建期烘焙路线的前提就是假的，必须换浏览器或重新设计水彩实现。\n',
  );
}
console.log('✓ ctx.filter 生效，水彩 blur 前提成立');

// ── 引导 classic/game.js ─────────────────────────────────
const bootResult = await page
  .waitForFunction(() => window.__bake && (window.__bakeError || window.__bake), null, {
    timeout: 30000,
  })
  .then((h) => h.jsonValue());

if (await page.evaluate(() => window.__bakeError ?? null)) {
  const err = await page.evaluate(() => window.__bakeError);
  await done(1, `\n✗ 引导失败：${err}\n`);
}

const boot = await page.evaluate(() => window.__bake.boot);
console.log(`✓ 引导完成：绘制函数 ${Object.keys(boot.probe).length} 个就绪，调色板 ${boot.palette} 键`);

// ── 烘焙 ────────────────────────────────────────────────
// M2 量产节奏：每做完一场，往这里加一个 id（对应 bake/main.js 的 SCENES 注册表）
const SCENES = ['s3', 's10'];

await mkdir(outDir, { recursive: true });

/** 每场一行汇总，最后给 GATE-C 用 */
const sceneStats = [];

for (const id of SCENES) {
console.log(`\n══════════════════ 烘焙场景 ${id} ══════════════════`);
const result = await page.evaluate((s) => window.__bake.run({ scene: s }), id);
console.log(`✓ 烘焙完成：${result.layers.length} 层\n`);

// ── 逐层取图、落盘、算 SHA ───────────────────────────────
const manifest = {
  scene: id.toUpperCase(),
  design: result.design,
  scale: result.scale,
  overdraw: result.overdraw,
  overdrawRect: result.overdrawRect,
  anchors: result.anchors,
  timings: result.timings,
  notBaked: result.notBaked,
  layers: [],
};

if (result.warnings.length) {
  console.log('⚠️  图层自检告警：');
  for (const w of result.warnings) console.log(`   · ${w}`);
  console.log('');
}

// 诊断（来自烘焙脚本自标定过程中发现的异常）
const diags = await page.evaluate(() => window.__bake.diagnostics());
if (diags.length) {
  console.log('⚠️  烘焙诊断：');
  for (const d of diags) console.log(`   · ${d}`);
  console.log('');
}

console.log('┌──────────┬────────────┬──────────┬────────────┬────────────┬──────────┐');
console.log('│ 层       │ 尺寸(px)   │ 显存(MB) │ 文件(KB)   │ 耗时(ms)   │ 内容占比 │');
console.log('├──────────┼────────────┼──────────┼────────────┼────────────┼──────────┤');

let sceneVram = 0;
let totalFileBytes = 0;

for (const meta of result.layers) {
  const dataURL = await page.evaluate((n) => window.__bake.getLayerDataURL(n), meta.name);
  const b64 = dataURL.slice(dataURL.indexOf(',') + 1);
  const buf = Buffer.from(b64, 'base64');
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12);

  const file = join(outDir, `${id}.${meta.name}.webp`);
  await writeFile(file, buf);

  const vramMb = (meta.w * meta.h * 4) / 1024 / 1024;
  sceneVram += vramMb;
  totalFileBytes += buf.length;

  // "内容占比"：包围盒面积 / 全画布面积，用来看该层是否开得过大
  const fillRatio = meta.bbox
    ? ((meta.bbox.w * meta.bbox.h) / (meta.w * meta.h)) * 100
    : 0;

  console.log(
    `│ ${meta.name.padEnd(8)} │ ${String(meta.w + '×' + meta.h).padEnd(10)} │ ${vramMb.toFixed(2).padStart(8)} │ ${(buf.length / 1024).toFixed(1).padStart(10)} │ ${String(result.timings[meta.name] ?? '-').padStart(10)} │ ${fillRatio.toFixed(1).padStart(7)}% │`,
  );

  manifest.layers.push({
    name: meta.name,
    file: `${id}.${meta.name}.webp`,
    // canvas 像素尺寸（显存与 mipmap 用）
    w: meta.w,
    h: meta.h,
    // 设计单位矩形（逻辑与命中测试用）
    dx: meta.dx,
    dy: meta.dy,
    dw: meta.dw,
    dh: meta.dh,
    // 归一化矩形（3D 舞台摆放用）
    nx: meta.nx,
    ny: meta.ny,
    nw: meta.nw,
    nh: meta.nh,
    blend: meta.blend,
    parallax: meta.parallax,
    overdraw: meta.overdraw ?? 0,
    note: meta.note,
    bytes: buf.length,
    sha256: hash,
    vramMB: +vramMb.toFixed(3),
    bakeMs: result.timings[meta.name] ?? null,
  });

  console.log(`│   └─ 包围盒 ${JSON.stringify(meta.bbox)}  sha ${hash}`);
}

console.log('└──────────┴────────────┴──────────┴────────────┴────────────┴──────────┘');

await writeFile(join(outDir, `${id}.manifest.json`), JSON.stringify(manifest, null, 2), 'utf8');

// ── 真值参考图 vs 分层合成图 ─────────────────────────────
const pair = await page.evaluate(
  ([dw, dh, sc, s]) => window.__bake.renderPair(dw, dh, sc, 16, s),
  [result.design.w, result.design.h, result.scale, id],
);

const savePNG = async (name, dataURL) => {
  const buf = Buffer.from(dataURL.slice(dataURL.indexOf(',') + 1), 'base64');
  // ⚠️ 对照图放 bake-out/，**不进 public/** —— 否则这两张 PNG（≈1.2MB）
  // 会被 Vite 原样拷进 dist，白白撑大产物。
  await mkdir(pngDir, { recursive: true });
  await writeFile(join(pngDir, name), buf);
  return buf.length;
};

const origBytes = await savePNG(`${id}.original.png`, pair.original);
const compBytes = await savePNG(`${id}.composite.png`, pair.composite);

console.log('════════ 画面对照（真值 vs 分层合成）════════');
console.log(`${id}.original.png   ${(origBytes / 1024).toFixed(1)} KB   ← 原版直出，真值`);
console.log(`${id}.composite.png  ${(compBytes / 1024).toFixed(1)} KB   ← 烘焙层按设计坐标叠回`);
console.log(`分块均值差（16×16 块）: 平均 ${pair.diff.mean} / 255`);
console.log('差异最大的 5 块（结构性问题的指纹）：');
for (const w of pair.diff.worst) {
  console.log(`  块(${String(w.bx).padStart(2)},${String(w.by).padStart(2)})  Δ${w.d}`);
}
console.log('注：粒子与星星闪烁本身时变，故平均差不归零属正常；看的是有没有"整块偏掉"。');

sceneStats.push({
  id,
  vramMB: sceneVram,
  bytes: totalFileBytes,
  bakeMs: Object.values(result.timings).reduce((a, b) => a + b, 0),
  meanDiff: pair.diff.mean,
  worstBlock: pair.diff.worst[0]?.d ?? 0,
});
} // ← end for (const id of SCENES)

console.log('\n════════ 逐场汇总 ════════');
console.log('┌──────┬──────────┬──────────┬──────────┬────────────┬────────────┐');
console.log('│ 场景 │ 显存(MB) │ 文件(KB) │ 烘焙(ms) │ 平均差/255 │ 最差块 Δ   │');
console.log('├──────┼──────────┼──────────┼──────────┼────────────┼────────────┤');
for (const s of sceneStats) {
  console.log(
    `│ ${s.id.padEnd(4)} │ ${s.vramMB.toFixed(2).padStart(8)} │ ${(s.bytes / 1024).toFixed(1).padStart(8)} │ ${s.bakeMs.toFixed(1).padStart(8)} │ ${String(s.meanDiff).padStart(10)} │ ${String(s.worstBlock).padStart(10)} │`,
  );
}
console.log('└──────┴──────────┴──────────┴──────────┴────────────┴────────────┘');

// GATE-C 用**已做场景的平均**外推全量，而不是拿单场景数字冒充全片
const avgVram = sceneStats.reduce((a, s) => a + s.vramMB, 0) / sceneStats.length;
const avgBytes = sceneStats.reduce((a, s) => a + s.bytes, 0) / sceneStats.length;
const avgBake = sceneStats.reduce((a, s) => a + s.bakeMs, 0) / sceneStats.length;

// ── GATE-C 判定 ─────────────────────────────────────────
const residentVram = avgVram * RESIDENT_SCENES;
const allVram = avgVram * TOTAL_SCENES;
const bakeTotal = avgBake;

console.log('\n════════ GATE-C：烘焙预算（按已做场景均值外推 13 场）════════');
console.log(`已做场景：${sceneStats.map((s) => s.id).join(', ')}（${sceneStats.length}/${TOTAL_SCENES}）`);
console.log(`单场景显存（均值，全部层驻留）: ${avgVram.toFixed(2)} MB`);
console.log(`  × ${TOTAL_SCENES} 场全驻留            : ${allVram.toFixed(1)} MB   ← 不可能，必须 LRU`);
console.log(`  × ${RESIDENT_SCENES} 场驻留（计划策略）    : ${residentVram.toFixed(2)} MB   / 预算 ${VRAM_BUDGET_MB} MB`);
console.log(`单场景 WebP 落盘体积（均值）  : ${(avgBytes / 1024).toFixed(1)} KB`);
console.log(`  × ${TOTAL_SCENES} 场全量            : ${((avgBytes * TOTAL_SCENES) / 1024 / 1024).toFixed(2)} MB   ← 直接影响下载总量`);
console.log(`单场景烘焙总耗时（均值）      : ${bakeTotal.toFixed(1)} ms`);
console.log(`  × ${TOTAL_SCENES} 场              : ${(bakeTotal * TOTAL_SCENES / 1000).toFixed(2)} s`);

const gatePass = residentVram <= VRAM_BUDGET_MB;
console.log(
  `\nGATE-C 判定：${gatePass ? '✅ 通过' : '❌ 不通过'}（驻留 ${residentVram.toFixed(2)} MB vs 预算 ${VRAM_BUDGET_MB} MB）`,
);
if (!gatePass) {
  console.log('→ 按计划退路：改单场景按需烘焙 + 及时释放，或降分辨率 / 减层数。');
}

await done(gatePass ? 0 : 3);
