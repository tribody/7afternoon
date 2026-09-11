/**
 * 部署：把 dist/ 推到 GitHub Pages 分支。
 *
 * ── 设计原则 ────────────────────────────────────────────────
 *
 * 1. **默认不推送。** 不带参数跑 = 构建 + 组装 + 打印将要推送的完整清单。
 *    想看结果再推，必须显式 `--push`。
 *    理由：这个站的唯一观众是主子的妻子，误推一次就是"首因"被消耗掉一次。
 *
 * 2. **只动一个分支。** 默认 `gh-pages`。推 `main` / `master` 需要再加
 *    `--i-know-this-is-the-live-site` —— 因为那会直接改线上站点。
 *
 * 3. **单提交孤儿历史。** 用临时仓库 commit 一棵全新的树再 force push，
 *    分支上永远只有一个提交（部署产物本来就无需历史），
 *    也让"回滚"退化为改一行开关重新构建，30 秒生效。
 *
 * ── 用法 ────────────────────────────────────────────────────
 *
 *   node scripts/deploy.mjs                      # 组装 + 干跑清单
 *   node scripts/deploy.mjs --push               # 推到 gh-pages
 *   node scripts/deploy.mjs --push --branch main --i-know-this-is-the-live-site
 *   GIT_PROXY=http://127.0.0.1:7892 node scripts/deploy.mjs --push
 *
 * ── 本机网络说明 ────────────────────────────────────────────
 *
 * 沙箱 shell 会注入 `HTTP(S)_PROXY=http://127.0.0.1:64783`，它对
 * `github.com:443` 的 CONNECT 直接返回 502，表现为
 * `CONNECT tunnel failed, response 502` 或 `schannel: server closed abruptly`。
 * 所以推送时**必须清掉这两个环境变量**，并改走主子自己的代理（默认 7892）。
 * 用 `DEPLOY_NO_PROXY=1` 可以完全绕开代理（比如在公司网络里直连）。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const doPush = has('--push');
const branch = val('--branch', 'gh-pages');
const LIVE_BRANCHES = ['main', 'master'];
const isLive = LIVE_BRANCHES.includes(branch);
const confirmed = has('--i-know-this-is-the-live-site');

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

/**
 * 手工递归拷贝。
 * ⚠️ 不用 fs.copySync/cpSync —— 本机沙箱下 cpSync(recursive) 会**静默杀死进程**
 *    （exit 127，异常都抛不出来）。这个坑在 prebuild.mjs 里踩过一次。
 */
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else if (statSync(s).isFile()) writeFileSync(d, readFileSync(s));
  }
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push({ rel: relative(base, p).split('\\').join('/'), size: statSync(p).size });
  }
  return out;
}

// ══ 1. 构建 ══════════════════════════════════════════════════
console.log('▶ 构建（prebuild → bake → vite build）');
const run = (script) => {
  execFileSync(process.execPath, [join(root, 'scripts', script)], { cwd: root, stdio: 'inherit' });
};
run('prebuild.mjs');
run('bake.mjs');
execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
});

// ══ 2. 产物自检 ══════════════════════════════════════════════
// 每条都对应一个真实会翻车的场景，不是形式主义。
const REQUIRED = [
  'index.html', // 转发页本身
  'CNAME', // 缺了自定义域名 home.sjtunix.cn 直接失效
  'classic/index.html', // 原版冻结副本
  'classic/game.js',
  'classic/style.css',
  'v2/index.html', // 重制版
  'bake/s3.manifest.json', // 烘焙清单（v2 的运行时契约）
];

const missing = REQUIRED.filter((f) => !existsSync(join(dist, f)));
if (missing.length) die(`dist 缺少必需文件：${missing.join(', ')}`);

// 双轨开关必须停在 classic —— 万一有人调试时改成 v2 忘了改回来，
// 这一步就是最后一道闸门。
const forward = readFileSync(join(dist, 'index.html'), 'utf8');
const m = forward.match(/var\s+TARGET\s*=\s*'([^']+)'/);
if (!m) die('转发页里找不到 TARGET 开关，不敢推 —— 线上入口会 404');
if (!m[1].includes('classic')) {
  die(
    `转发页开关当前指向 ${m[1]}，不是 classic。\n` +
      '  如果这是有意的灰度发布，请先把 index.html 改好或手工确认后再推。',
  );
}

// 烘焙清单必须真的被 v2 引用得到（路径契约）
const manifest = JSON.parse(readFileSync(join(dist, 'bake', 's3.manifest.json'), 'utf8'));
if (!manifest.layers?.length) die('烘焙清单里没有 layers');
const missingTex = manifest.layers.filter((l) => !existsSync(join(dist, 'bake', l.file)));
if (missingTex.length) die(`清单引用的贴图缺失：${missingTex.map((l) => l.file).join(', ')}`);

const files = walk(dist);
const total = files.reduce((a, f) => a + f.size, 0);

console.log(`\n✓ 产物自检通过：${files.length} 个文件，共 ${(total / 1024).toFixed(0)} KB`);
console.log(`  转发页开关   TARGET = '${m[1]}'`);
console.log(`  烘焙层       ${manifest.layers.map((l) => l.name).join(', ')}`);
console.log('  最大 8 个文件：');
for (const f of files.sort((a, b) => b.size - a.size).slice(0, 8)) {
  console.log(`    ${(f.size / 1024).toFixed(1).padStart(8)} KB  ${f.rel}`);
}

if (!doPush) {
  console.log('\n（干跑，未推送。要推送请加 --push）');
  process.exit(0);
}

// ══ 3. 推送 ══════════════════════════════════════════════════
if (isLive && !confirmed) {
  die(
    `拒绝推送 ${branch} —— 那是**线上站点**所在的分支。\n` +
      '  确需如此请再加 --i-know-this-is-the-live-site。\n' +
      '  推荐做法：推到 gh-pages，在仓库设置里把 Pages 源切过去，线上零风险。',
  );
}

const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
console.log(`\n▶ 推送目标：${remote}  →  refs/heads/${branch}`);

// 临时孤儿仓库：干净、不碰工作树、不留历史
const tmp = mkdtempSync(join(tmpdir(), '7a-deploy-'));
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: tmp, stdio: 'inherit', env: pushEnv, ...opts });

// ── 代理：清掉沙箱注入的那个，改走本地代理 ──────────────────
const pushEnv = { ...process.env };
delete pushEnv.HTTP_PROXY;
delete pushEnv.HTTPS_PROXY;
delete pushEnv.http_proxy;
delete pushEnv.https_proxy;

const proxyArgs = [];
if (process.env.DEPLOY_NO_PROXY !== '1') {
  const p = process.env.GIT_PROXY || 'http://127.0.0.1:7892';
  proxyArgs.push('-c', `http.proxy=${p}`, '-c', `https.proxy=${p}`);
  console.log(`  经代理 ${p}（DEPLOY_NO_PROXY=1 可直连）`);
}

try {
  execFileSync('git', ['init', '-q', '-b', 'deploy', tmp], { env: pushEnv });
  copyDir(dist, tmp);
  git(['add', '-A', '-f']);
  git([
    '-c',
    'user.name=7afternoon-deploy',
    '-c',
    'user.email=deploy@localhost',
    'commit',
    '-q',
    '-m',
    `deploy: v2 M1（${new Date().toISOString().slice(0, 16).replace('T', ' ')}）`,
  ]);
  git(['push', ...proxyArgs, '--force', remote, `HEAD:refs/heads/${branch}`]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n✅ 已推送到 ${branch}。`);
console.log('   若线上没变，去仓库 Settings → Pages 确认发布源指向这个分支。');
console.log(`   回滚：把根 index.html 的 TARGET 改回 './classic/' 重新执行本脚本。`);
