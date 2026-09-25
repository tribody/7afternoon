/**
 * scene-scan —— 13 场逐场清点，输出 M2 量产难度表
 *
 * M1 只做了 S3（全片最"平"的一场）。要量产剩下 12 场，第一步不是写代码，
 * 是搞清楚每场到底由什么构成：
 *
 *   - 静态成分  → 能烘焙成贴图（走 S3 已验证的路）
 *   - 动态成分  → 烘焙不了，必须运行时画或做精灵表
 *   - 随机源    → 不锁种子的话，真值比对会被随机噪声淹没（M1 踩过）
 *   - 昂贵滤镜  → ctx.filter=blur 是填充率杀手
 *   - 交互热点  → 命中要从屏幕像素坐标迁移到 raycast 平面坐标
 *
 * 用法：node scripts/scan-scenes.mjs [--md]
 *       --md 输出 Markdown 表（用于写进文档）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'classic/game.js'), 'utf8');
const lines = src.split('\n');

// 场景按名字排序（S0..S12），取源码行区间
const heads = [];
lines.forEach((l, i) => {
  const m = l.match(/^class (S\d+)(?: extends (\w+))?/);
  if (m) heads.push({ name: m[1], base: m[2] || '(无)', start: i });
});
heads.sort((a, b) => Number(a.name.slice(1)) - Number(b.name.slice(1)));

const STATIC_FN = ['drawSky', 'drawGround', 'drawPaperTexture', 'drawStars', 'drawStarsTwinkle'];
const DYNAMIC_CLASS = ['Scene', 'Game'];
const CHAR_FN = ['drawBoy', 'drawGirl', 'drawCat'];
const WASH_FN = ['wcWash', 'wcBlob', 'wcShape'];
const PRIM_FN = ['fRR', 'fCircle', 'fEllipse'];

const count = (body, re) => (body.match(re) || []).length;

const rows = heads.map((h, idx) => {
  const end = idx + 1 < heads.length ? heads[idx + 1].start : lines.length;
  const body = lines.slice(h.start, end).join('\n');

  const methods = [...body.matchAll(/^ {4}(\w+)\s*\(/gm)].map((m) => m[1]);
  const hotspots = [
    ...body.matchAll(/\{\s*[a-z]?\s*:\s*([\w.]+)\s*,\s*[a-z]?\s*:\s*([\w.]+)/g),
  ];
  const dist = count(body, /U\.dist\s*\(/g);
  const rand = count(body, /Math\.random\s*\(/g);
  const filter = count(body, /ctx\.filter\s*=/g);
  const text = count(body, /fillText|drawLines|wrapText/g);
  const chars = CHAR_FN.map((f) => ({ f, n: count(body, new RegExp(`\\b${f}\\s*\\(`, 'g')) })).filter(
    (x) => x.n,
  );
  const wash = WASH_FN.map((f) => ({ f, n: count(body, new RegExp(`\\b${f}\\s*\\(`, 'g')) })).filter(
    (x) => x.n,
  );
  const static_ = STATIC_FN.map((f) => ({ f, n: count(body, new RegExp(`\\b${f}\\s*\\(`, 'g')) })).filter(
    (x) => x.n,
  );
  const prim = PRIM_FN.reduce((s, f) => s + count(body, new RegExp(`\\b${f}\\s*\\(`, 'g')), 0);
  // 动画来源：用了 U.T（全局时间）或自增计数器
  const anim = count(body, /U\.T/g) + count(body, /\bthis\.t\s*\+?=|\bthis\.t\s*\*/g);

  const title = (body.match(/S_TITLE|title\s*[:=]\s*['"]([^'"]+)['"]/) || [])[1] || '—';

  return {
    name: h.name,
    base: h.base,
    lines: end - h.start,
    methods: [...new Set(methods)].join('/'),
    hotspotCount: hotspots.length,
    dist,
    rand,
    filter,
    text,
    anim,
    chars: chars.map((c) => `${c.f}×${c.n}`).join(','),
    wash: wash.map((c) => `${c.f}×${c.n}`).join(','),
    static: static_.map((c) => `${c.f}×${c.n}`).join(','),
    prim,
    title,
  };
});

// ── 难度分档 ─────────────────────────────────────────────
// A 档：纯静态为主 + 少量热点 → 直接套 S3 模板
// B 档：有角色/根节点动画，需要 atlas 或运行时绘制
// C 档：大面积 blur/多点角色/复杂手势 → 需要重新设计绘制策略
function tier(r) {
  const heavy = r.filter >= 3 || (r.chars && r.prim > 40) || r.anim >= 8;
  if (r.chars || r.filter >= 1 || r.anim >= 3) return 'B';
  return 'A';
}

const md = process.argv.includes('--md');

if (md) {
  const out = [
    '# 13 场量产难度清点',
    '',
    '由 `node scripts/scan-scenes.mjs --md` 从 `classic/game.js` 自动提取。',
    '',
    '| 场 | 行数 | 方法 | 热点 | U.dist | 随机源 | blur | 文本 | 动画源 | 角色 | 水彩 | 静态层 | 图元 | 档 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.lines} | ${r.methods} | ${r.hotspotCount} | ${r.dist} | ${r.rand} | ${r.filter} | ${r.text} | ${r.anim} | ${r.chars || '—'} | ${r.wash || '—'} | ${r.static || '—'} | ${r.prim} | **${tier(r)}** |`,
    ),
  ].join('\n');
  writeFileSync(join(root, 'docs', 'm2-scene-inventory.md'), out + '\n');
  console.log(out);
  console.log('\n→ 已写入 docs/m2-scene-inventory.md');
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad('场', 5) +
      pad('行', 5) +
      pad('热点', 5) +
      pad('随机', 5) +
      pad('blur', 5) +
      pad('文本', 5) +
      pad('动画', 5) +
      pad('图元', 5) +
      pad('档', 4) +
      '构成',
  );
  console.log('─'.repeat(110));
  for (const r of rows) {
    console.log(
      pad(r.name, 5) +
        pad(r.lines, 5) +
        pad(r.hotspotCount, 5) +
        pad(r.rand, 5) +
        pad(r.filter, 5) +
        pad(r.text, 5) +
        pad(r.anim, 5) +
        pad(r.prim, 5) +
        pad(tier(r), 4) +
        [r.static, r.wash, r.chars].filter(Boolean).join(' | '),
    );
  }
  const dist = { A: 0, B: 0, C: 0 };
  rows.forEach((r) => dist[tier(r)]++);
  console.log('─'.repeat(110));
  console.log(`档位分布：A=${dist.A}  B=${dist.B}  C=${dist.C}   （A=直接套模板 / B=需精灵表 / C=需重设计）`);
}
