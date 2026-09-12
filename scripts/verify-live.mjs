/**
 * 线上冒烟 —— 部署后立刻跑，确认入口没被改坏。
 *
 * ── 为什么单独一个脚本 ──────────────────────────────────────
 *   根 index.html 是**转发页**，一旦 classic/ 路径不对就是白屏，
 *   而白屏在本地 dev 里永远复现不出来（本地直接访问的是 /v2/）。
 *   这个站唯一的观众是主子的妻子，白屏一次的代价不能用"再推一次"来抵消。
 *
 * ── 为什么不用 fetch，自己建 TLS 连接 ───────────────────────
 *   本机 DNS 服务器是 `fe80::1`（IPv6 链路本地），对刚续费/刚改过的域名
 *   常年解析不到，会误报 `ENOTFOUND` —— 而域名本身在公共 DNS 上是好的。
 *   所以这里显式指定公共 DNS 解析，再把 IP 喂给 https 连接
 *   （SNI 仍用域名，证书校验不受影响）。
 *
 * ── 用法 ────────────────────────────────────────────────────
 *   node scripts/verify-live.mjs
 *   node scripts/verify-live.mjs https://tribody.github.io/7afternoon
 *   VERIFY_DNS=8.8.8.8 node scripts/verify-live.mjs
 */
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';

const origin = (process.argv[2] || 'https://home.sjtunix.cn').replace(/\/$/, '');
const { hostname: host } = new URL(origin);

const DNS_SERVERS = (process.env.VERIFY_DNS || '223.5.5.5,119.29.29.29,8.8.8.8').split(',').map((s) => s.trim());
const resolver = new dns.promises.Resolver();
resolver.setServers(DNS_SERVERS);

// 解析一次就缓存：整轮验证都连同一个 IP，避免中途漂移导致结果不自洽
let resolvedIp = null;
const lookup = (hostname, opts, cb) => {
  // ⚠️ Node 在 `options.all === true` 时期望回调给的是**数组**，
  //    给字符串会报 ERR_INVALID_IP_ADDRESS: undefined
  const finish = (ip) => (opts && opts.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4));

  if (net.isIP(hostname)) return finish(hostname);
  if (resolvedIp) return finish(resolvedIp);
  resolver
    .resolve4(hostname)
    .then((addrs) => {
      if (!addrs?.length) return cb(new Error(`${hostname} 无任何 A 记录`));
      resolvedIp = addrs[0];
      finish(addrs[0]);
    })
    .catch((e) => cb(e));
};

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        path,
        method: 'GET',
        lookup,
        servername: host, // SNI 仍用域名，证书校验照常
        headers: { 'User-Agent': 'verify-live/1.0', Accept: '*/*' },
        timeout: 20000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`\n▶ 验证 ${origin}`);

// 0. 先确认解析本身是通的，否则后面全是噪声
try {
  const addrs = await resolver.resolve4(host);
  check('DNS 可解析（公共 DNS）', addrs.length > 0, `${host} → ${addrs.join(', ')}`);
} catch (e) {
  check('DNS 可解析（公共 DNS）', false, `${e.code || e.message}`);
  console.log('\n❌ 域名解析不通，后续检查无意义，到此为止。');
  process.exit(1);
}
console.log('');

// 1. 根：转发页必须存在，且开关指向 classic
const root = await get('/');
check('根可访问', root.status === 200, `HTTP ${root.status}`);
const m = root.body.match(/var\s+TARGET\s*=\s*'([^']+)'/);
check('转发页开关可读', !!m, m ? `TARGET='${m[1]}'` : '找不到 TARGET');
check('开关指向 classic（线上入口仍是原版）', m?.[1]?.includes('classic') ?? false, m?.[1] ?? '');

// 2. classic 三件套 —— 原版能否独立运行
for (const f of ['index.html', 'game.js', 'style.css']) {
  const r = await get(`/classic/${f}`);
  check(
    `classic/${f}`,
    r.status === 200 && r.body.length > 100,
    `HTTP ${r.status}, ${(r.body.length / 1024).toFixed(1)}KB`,
  );
  if (f.endsWith('.html') && r.status === 200) {
    check(
      '  classic/index.html 引用 style.css 与 game.js',
      /style\.css/.test(r.body) && /game\.js/.test(r.body),
    );
    // 这条是线上故障的防回归闸门 —— 别删。
    //
    // 原版自带 fonts.googleapis.com 的**阻塞 stylesheet**。该域名在中国大陆
    // 不可达且是"挂起"而非快速失败：浏览器因此不触发 load，而 game.js 的入口
    // 就写在 window load 里，页面永久停在 loading。曾实测挂起 30s 无任何进展。
    // 修法是整个删掉外链、退系统字体栈。所以线上 classic 必须**不含任何外网依赖**。
    // ⚠️ 必须先剥掉 HTML 注释再检测 —— 修复说明就写在注释里，
    // 里面明明白白写着 "fonts.googleapis.com"，直接正则会自己把自己判失败。
    const htmlStripped = r.body.replace(/<!--[\s\S]*?-->/g, '');
    check(
      '  classic/index.html 无外网字体依赖（防永久卡死）',
      !/fonts\.(googleapis|gstatic)\.com/.test(htmlStripped),
      /fonts\.(googleapis|gstatic)\.com/.test(htmlStripped) ? '仍含 Google Fonts ← 会卡死' : '干净',
    );
    check(
      '  classic/index.html 无任何外部 http(s) 资源',
      !/https?:\/\//.test(htmlStripped),
      '注释里的说明文字已排除',
    );
  }
}

// 3. v2 状态 —— 必须区分三种情况，否则会把"源码版占位页"误判成"已上线"
const v2 = await get('/v2/');
console.log('');
if (v2.status !== 200) {
  console.log(`· /v2/ → HTTP ${v2.status}（未部署，属预期）`);
} else if (/src\/main\.ts/.test(v2.body)) {
  // 源码入口被推上了 main，所以 /v2/ 是个能打开但跑不起来的占位页
  console.log('· /v2/ → HTTP 200，但是**源码版占位页**（引用 /src/main.ts，产物未部署）');
  console.log('  不是入口（TARGET 指向 classic），正常访问碰不到它；');
  console.log('  要真正上线得先把源码入口 v2/ 与产物 v2/ 拆成两个目录。');
} else {
  console.log('· /v2/ → HTTP 200，产物版');
  const js = v2.body.match(/src="\.?\/?([^"]*assets\/[^"]+\.js)"/);
  check('  v2/index.html 引用了打包产物', !!js, js ? js[1] : '没找到 assets/*.js');
  if (js) {
    const r = await get('/v2/' + js[1].replace(/^\.?\//, ''));
    check('  v2 JS 产物可访问', r.status === 200, `HTTP ${r.status}`);
  }
  const man = await get('/bake/s3.manifest.json');
  check('  烘焙清单可访问', man.status === 200, `HTTP ${man.status}`);
  check('  v2 已移除 Google Fonts（微信不可达）', !/fonts\.googleapis/.test(v2.body));
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${bad.length === 0 ? '✅' : '❌'} ${results.length - bad.length}/${results.length} 通过`);
if (bad.length) {
  console.log('\n失败项：');
  for (const b of bad) console.log(`  ✗ ${b.name} ${b.detail}`);
  process.exit(1);
}
