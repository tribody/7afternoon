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
import { rmSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pub = join(root, 'public');

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

// 1) 转发页（回滚开关）
const forward = join(root, 'index.html');
if (!existsSync(forward)) fail('根目录缺少 index.html（转发页）');
copyFileSync(forward, join(pub, 'index.html'));

// 2) CNAME —— 缺了它自定义域名直接失效
const cname = join(root, 'CNAME');
if (!existsSync(cname)) fail('缺少 CNAME，自定义域名 home.sjtunix.cn 会失效');
copyFileSync(cname, join(pub, 'CNAME'));

// 3) 原版冻结副本
const classic = join(root, 'classic');
if (!existsSync(classic)) fail('缺少 classic/，原版将无法作为灰度对照运行');
copyDir(classic, join(pub, 'classic'));

for (const f of ['index.html', 'CNAME', 'classic/index.html', 'classic/game.js', 'classic/style.css']) {
  if (!existsSync(join(pub, f))) fail(`public/${f} 未生成`);
}

console.log('✓ prebuild: public/ 已组装（转发页 + CNAME + classic/）');
