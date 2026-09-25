/**
 * prebuild —— 组装 Vite 的 publicDir
 *
 * public/ 是**生成物**，绝不手工编辑（已进 .gitignore）。
 * 每次 dev/build 前重建，内容只有三样：
 *
 *   public/index.html   ← 仓库根转发页。原样拷贝，故回滚不必重新构建 v2。
 *   public/CNAME        ← 自定义域名 home.sjtunix.cn。⚠️ 漏了域名就失效。
 *   public/classic/**   ← 原版冻结副本。零构建，字节级不变。
 *
 * 注意：bake/ 不在其中 —— 烘焙工装只在开发期用（走 scripts/bake.mjs 自带的
 * 静态服务器），刻意不进产物。
 */
import { rmSync, mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pub = join(root, 'public');

/**
 * 构建版本号 —— 破 X5 缓存的**唯一真源**。
 *
 * X5（微信内核）对不带查询串的 URL 缓存极其激进，改了内容照样给旧的。
 * 所以每个会发给手机的资源都必须带 ?v=BUILD：
 *   - 根转发页跳转目标  → ./classic/?v=BUILD
 *   - classic/index.html 引用的 game.js / style.css → 同样 stamp 上 BUILD
 *     （否则 X5 缓存了 /classic/game.js 后，index 再新、JS 永远是旧的）
 *
 * ⚠️ 每次改动 classic/ 或转发页都要 bump 这个值，否则等于没改。
 */
const BUILD = '20260925a';

const fail = (msg) => {
  console.error(`\n✗ prebuild 失败：${msg}\n`);
  process.exit(1);
};

/**
 * 手工递归拷贝。
 * ⚠️ 刻意不用 fs.cpSync —— 本机沙箱下它会**静默杀死进程**（exit 127，
 *    抛不出的异常，连 catch 都进不去）。copyFileSync 则完全正常。
 */
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    const st = statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else if (st.isFile()) copyFileSync(s, d);
  }
}

rmSync(pub, { recursive: true, force: true });
mkdirSync(pub, { recursive: true });

// 1) 转发页（回滚开关）—— BUILD 以本文件为真源，写回转发页保持两处一致
const forward = join(root, 'index.html');
if (!existsSync(forward)) fail('根目录缺少 index.html（转发页）');
{
  const src = readFileSync(forward, 'utf8');
  if (!/var BUILD = '[\w-]+';/.test(src)) fail('转发页缺少 var BUILD 声明，破缓存链路会断');
  writeFileSync(join(pub, 'index.html'), src.replace(/var BUILD = '[\w-]+';/, `var BUILD = '${BUILD}';`));
}

// 2) CNAME —— 缺了它自定义域名直接失效
const cname = join(root, 'CNAME');
if (!existsSync(cname)) fail('缺少 CNAME，自定义域名 home.sjtunix.cn 会失效');
copyFileSync(cname, join(pub, 'CNAME'));

// 3) 原版冻结副本 —— 原样拷贝。
//    ⚠️ 资源版本戳（game.js?v= / style.css?v=）**写在源码 classic/index.html 里**，
//    不在这里生成 —— 因为部署方式是「push main = 发布」，线上跑的就是仓库源码，
//    生成物 public/ 根本不进仓库。这里只负责**校验** stamp 与 BUILD 一致，
//    不一致直接 fail（否则 X5 会拿旧 JS，改动等于没上线）。
const classic = join(root, 'classic');
if (!existsSync(classic)) fail('缺少 classic/，原版将无法作为灰度对照运行');
copyDir(classic, join(pub, 'classic'));
{
  const src = readFileSync(join(root, 'classic', 'index.html'), 'utf8');
  const stamped = [...src.matchAll(/(?:src|href)="((?:game\.js|style\.css)\?v=([\w-]+))"/g)];
  if (stamped.length < 2) {
    fail('classic/index.html 缺少资源版本戳（game.js?v= / style.css?v=）——\n' +
         '     X5 会缓存旧资源。请给两处引用补上 ?v=（值与根 index.html 的 BUILD 一致）');
  }
  for (const [, ref, ver] of stamped) {
    if (ver !== BUILD) {
      fail(`资源版本戳不一致：${ref}（${ver}）≠ BUILD（${BUILD}）。\n` +
           '     请同步 bump classic/index.html 与根 index.html 的版本号');
    }
  }
}

for (const f of ['index.html', 'CNAME', 'classic/index.html', 'classic/game.js', 'classic/style.css']) {
  if (!existsSync(join(pub, f))) fail(`public/${f} 未生成`);
}

console.log('✓ prebuild: public/ 已组装（转发页 + CNAME + classic/）');
