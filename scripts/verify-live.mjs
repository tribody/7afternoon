/**
 * 线上冒烟 —— 部署后立刻跑，确认入口没被改坏。
 *
 * 为什么单独一个脚本：
 *   根 index.html 是**转发页**，一旦 classic/ 路径不对就是白屏，
 *   而白屏在本地 dev 里永远复现不出来（本地直接访问的是 /v2/）。
 *   这个站唯一的观众是主子的妻子，白屏一次的代价不能用"再推一次"来抵消。
 *
 * 用法：node scripts/verify-live.mjs [origin]
 */
const origin = process.argv[2] || 'https://home.sjtunix.cn';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function get(path) {
  const url = origin + path;
  const res = await fetch(url, { redirect: 'manual' });
  const body = res.status < 300 || res.status === 404 ? await res.text() : '';
  return { status: res.status, body, headers: res.headers, url };
}

console.log(`\n▶ 验证 ${origin}\n`);

// 1. 根：转发页必须存在，且开关指向 classic
const root = await get('/');
check('根可访问', root.status === 200, `HTTP ${root.status}`);
const m = root.body.match(/var\s+TARGET\s*=\s*'([^']+)'/);
check('转发页开关可读', !!m, m ? `TARGET='${m[1]}'` : '找不到 TARGET');
check('开关指向 classic（线上入口仍是原版）', m?.[1]?.includes('classic') ?? false, m?.[1] ?? '');

// 2. classic 三件套 —— 原版能否独立运行
for (const f of ['index.html', 'game.js', 'style.css']) {
  const r = await get(`/classic/${f}`);
  const isHtml = f.endsWith('.html');
  check(
    `classic/${f}`,
    r.status === 200 && r.body.length > 100,
    `HTTP ${r.status}, ${(r.body.length / 1024).toFixed(1)}KB`,
  );
  if (isHtml && r.status === 200) {
    check(
      '  classic/index.html 引用 style.css 与 game.js',
      /style\.css/.test(r.body) && /game\.js/.test(r.body),
    );
    check('  classic/index.html 无 Google Fonts（微信不可达）', !/fonts\.googleapis/.test(r.body));
  }
}

// 3. v2 是否已上线（未部署时应为 404，不算失败，只报告）
const v2 = await get('/v2/');
const v2Up = v2.status === 200;
console.log(`\n· /v2/ → HTTP ${v2.status}（${v2Up ? '已上线' : '未部署，属预期'}）`);
if (v2Up) {
  const js = v2.body.match(/src="\.?\/?([^"]*assets\/[^"]+\.js)"/);
  check('  v2/index.html 引用了打包产物', !!js, js ? js[1] : '没找到 assets/*.js');
  if (js) {
    const r = await get('/v2/' + js[1].replace(/^\.?\//, ''));
    check('  v2 JS 产物可访问', r.status === 200, `HTTP ${r.status}`);
  }
  const man = await get('/bake/s3.manifest.json');
  check('  烘焙清单可访问', man.status === 200, `HTTP ${man.status}`);
}

// 4. CNAME 生效 —— 自定义域名掉了等于站点消失
check('CNAME 已生效（同源返回 200）', root.status === 200, origin);

const bad = results.filter((r) => !r.ok);
console.log(`\n${bad.length === 0 ? '✅' : '❌'} ${results.length - bad.length}/${results.length} 通过`);
if (bad.length) {
  console.log('\n失败项：');
  for (const b of bad) console.log(`  ✗ ${b.name} ${b.detail}`);
  process.exit(1);
}
