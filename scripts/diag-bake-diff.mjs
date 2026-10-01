/**
 * 烘焙对拍差异定位器（M2 量产工具）
 *
 * 用法：node scripts/diag-bake-diff.mjs <sceneId>    例：node scripts/diag-bake-diff.mjs s1
 *
 * 分块均值差只能告诉你"哪块不对"，但**差的方向**（真值更亮 / 合成更亮）
 * 才是定位元凶的关键：
 *   · 合成更亮 → 少了某层（覆盖物没画上）
 *   · 合成更暗 → 多乘了一层，或 multiply 层乘到了不该乘的东西上
 *   · 单块极亮/极暗且边缘整齐 → 该层被裁了（包围盒贴边）
 *
 * 前置：node scripts/bake.mjs（产出 bake-out/<id>.original.png 与 .composite.png）
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] ?? 's1';

// ⚠️ 不要走 file:// —— 中文路径下 Chromium 会加载失败（onerror）。
//    读成 base64 走 data URL，与冒烟测试里比对图的做法一致
const asDataUrl = async (name) => {
  const buf = await readFile(join(root, 'bake-out', `${id}.${name}.png`));
  return `data:image/png;base64,${buf.toString('base64')}`;
};
const orig = await asDataUrl('original');
const comp = await asDataUrl('composite');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage();

const blocks = await page.evaluate(
  async ([a, b]) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('图加载失败：' + src));
        im.src = src;
      });
    const W = 750;
    const H = 1624;
    const px = async (src) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      g.drawImage(await load(src), 0, 0, W, H);
      return g.getImageData(0, 0, W, H).data;
    };
    const A = await px(a);
    const B = await px(b);

    const N = 16;
    const bw = Math.floor(W / N);
    const bh = Math.floor(H / N);
    const out = [];
    for (let by = 0; by < N; by++) {
      for (let bx = 0; bx < N; bx++) {
        let sa = 0;
        let sb = 0;
        for (let y = by * bh; y < (by + 1) * bh; y++) {
          for (let x = bx * bw; x < (bx + 1) * bw; x++) {
            const i = (y * W + x) * 4;
            sa += (A[i] + A[i + 1] + A[i + 2]) / 3;
            sb += (B[i] + B[i + 1] + B[i + 2]) / 3;
          }
        }
        const n = bw * bh;
        out.push({
          bx,
          by,
          truth: +(sa / n).toFixed(1),
          comp: +(sb / n).toFixed(1),
          d: +Math.abs(sa / n - sb / n).toFixed(1),
        });
      }
    }
    return out;
  },
  [orig, comp],
);

blocks.sort((x, y) => y.d - x.d);
console.log(`\n═══ ${id}：真值 vs 分层合成（16×16 块）═══`);
console.log('块(bx,by)   真值亮度   合成亮度    Δ    方向');
for (const b of blocks.slice(0, 12)) {
  const dir = b.d < 1 ? '—' : b.comp > b.truth ? '合成偏亮（疑似少层）' : '合成偏暗（疑似多层/乘错）';
  console.log(
    `(${String(b.bx).padStart(2)},${String(b.by).padStart(2)})  ${String(b.truth).padStart(7)}  ${String(b.comp).padStart(8)}  ${String(b.d).padStart(6)}  ${dir}`,
  );
}
const mean = blocks.reduce((s, b) => s + b.d, 0) / blocks.length;
console.log(`\n平均 Δ${mean.toFixed(2)} / 255`);

// ── 可选：把指定块裁出来并排出图（真值 | 合成），放大 4× 便于肉眼定位 ──
// 用法：node scripts/diag-bake-diff.mjs s1 crop 0,0
if (process.argv[3] === 'crop') {
  const [cbx, cby] = (process.argv[4] ?? '0,0').split(',').map(Number);
  const ZOOM = 4;
  const png = await page.evaluate(
    async ([a, b, bx, by, zoom]) => {
      const load = (src) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.src = src;
        });
      const W = 750;
      const H = 1624;
      const bw = Math.floor(W / 16);
      const bh = Math.floor(H / 16);
      const px = async (src) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        c.getContext('2d').drawImage(await load(src), 0, 0, W, H);
        return c.getContext('2d').getImageData(0, 0, W, H);
      };
      const A = await px(a);
      const B = await px(b);

      const out = document.createElement('canvas');
      out.width = bw * 2 * zoom;
      out.height = bh * zoom;
      const g = out.getContext('2d');
      const put = (src, ox) => {
        const tmp = document.createElement('canvas');
        tmp.width = bw;
        tmp.height = bh;
        tmp.getContext('2d').putImageData(src, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(tmp, ox, 0, bw * zoom, bh * zoom);
      };
      // 只取该块区域：先用整幅 ImageData 裁出子矩形的副本
      const sub = (img) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        c.getContext('2d').putImageData(img, 0, 0);
        const s = document.createElement('canvas');
        s.width = bw;
        s.height = bh;
        s.getContext('2d').drawImage(c, bx * bw, by * bh, bw, bh, 0, 0, bw, bh);
        return s.getContext('2d').getImageData(0, 0, bw, bh);
      };
      put(sub(A), 0);
      put(sub(B), bw * zoom);
      return out.toDataURL('image/png');
    },
    [orig, comp, cbx, cby, ZOOM],
  );
  const { writeFile } = await import('node:fs/promises');
  const outPath = join(root, 'bake-out', `diag-${id}-${cbx}-${cby}.png`);
  await writeFile(outPath, Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
  console.log(`裁剪图（左=真值 右=合成，${ZOOM}×）：${outPath}`);
}

await browser.close();
