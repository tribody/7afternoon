import * as THREE from 'three';
import { createRenderer } from '../core/renderer';

/**
 * 色彩链路自检（M1 · 验收项 #17「色彩不失真」的可执行版本）
 *
 * 做法：把原版调色板铺成色卡，渲染后用 gl.readPixels 逐格回读，与真值比对。
 *
 * 刻意做成**三路对照实验**，其中第三路是故意配错的对照组：
 *
 *   unlit       MeshBasicMaterial({color})           期望 ✓
 *   tex-srgb    贴图 colorSpace = SRGBColorSpace     期望 ✓
 *   tex-linear  贴图**故意不设** colorSpace（= 当线性处理）期望 ✗
 *
 * 第三路必须失败。如果它"通过"了，说明自检本身是坏的（假阴性），
 * 那这条最致命的链子就等于没验证。
 */

/** 原版调色板真值 —— 摘自 classic/game.js 第 9–38 行的 C，逐键核对过 */
export const PALETTE = {
  cream: '#FFF8F0',
  paper: '#FBF6EE',
  coral: '#FF8B7B',
  honey: '#FFC857',
  warmBrown: '#8B6F5C',
  peach: '#FFD4B8',
  navy: '#2A2050',
  sky: '#7BB8E0',
} as const;

type Path = 'unlit' | 'tex-srgb' | 'tex-linear';

export interface ColorCheckRow {
  readonly name: string;
  readonly path: Path;
  readonly expected: readonly [number, number, number];
  readonly actual: readonly [number, number, number];
  readonly delta: number;
  readonly pass: boolean;
}

/** 判定阈值：±2 是 8-bit 量化 + 三次色彩空间往返的合理容差 */
const TOLERANCE = 2;

const COLS = 6;
const ROWS = 4;
const CELL_PX = 128;
const W = COLS * CELL_PX; // 768
const H = ROWS * CELL_PX; // 512

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function fillCanvas(hex: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function runColorCheck(canvas: HTMLCanvasElement): ColorCheckRow[] {
  const renderer = createRenderer(canvas, { preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  // 正交相机覆盖 x∈[-1,1]、y∈[-1,1]
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  const scene = new THREE.Scene();

  const geo = new THREE.PlaneGeometry(1, 1);
  const cellW = 2 / COLS;
  const cellH = 2 / ROWS;
  const planeW = cellW * 0.72;
  const planeH = cellH * 0.72;

  const entries: Array<{ name: string; path: Path; col: number; row: number }> = [];
  const paths: Path[] = ['unlit', 'tex-srgb', 'tex-linear'];
  const names = Object.keys(PALETTE) as Array<keyof typeof PALETTE>;

  // 每 8 色一组，三路共 24 格 → 6 列 × 4 行
  let col = 0;
  let row = 0;
  for (const path of paths) {
    for (const name of names) {
      const hex = PALETTE[name];
      let mat: THREE.Material;

      if (path === 'unlit') {
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex) });
      } else {
        const tex = new THREE.CanvasTexture(fillCanvas(hex, 32));
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        if (path === 'tex-srgb') tex.colorSpace = THREE.SRGBColorSpace;
        // tex-linear：故意不设 colorSpace，留作失败对照
        mat = new THREE.MeshBasicMaterial({ map: tex });
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(planeW, planeH, 1);
      mesh.position.set(
        -1 + (col + 0.5) * cellW,
        1 - (row + 0.5) * cellH,
        0,
      );
      scene.add(mesh);
      entries.push({ name, path, col, row });

      col++;
      if (col >= COLS) {
        col = 0;
        row++;
      }
    }
  }

  renderer.render(scene, camera);

  // 回读像素。WebGL 原点在左下，翻转 y。
  const gl = renderer.getContext();
  const buf = new Uint8Array(4);
  const rows: ColorCheckRow[] = [];

  for (const e of entries) {
    const px = Math.round((e.col + 0.5) * CELL_PX);
    const pyTop = Math.round((e.row + 0.5) * CELL_PX);
    const py = H - 1 - pyTop;

    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    const expected = hexToRgb(PALETTE[e.name as keyof typeof PALETTE]);
    const actual: [number, number, number] = [buf[0], buf[1], buf[2]];
    const delta = Math.max(
      Math.abs(actual[0] - expected[0]),
      Math.abs(actual[1] - expected[1]),
      Math.abs(actual[2] - expected[2]),
    );

    rows.push({
      name: e.name,
      path: e.path,
      expected,
      actual,
      delta,
      pass: delta <= TOLERANCE,
    });
  }

  reportColorCheck(rows);
  return rows;
}

const hex = (rgb: readonly [number, number, number]) =>
  '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * 结论按**路径**汇总，而不是逐格：
 *  - unlit / tex-srgb 全通过  → 链路正确
 *  - tex-linear 全失败        → 对照组成立，自检可信
 *  - tex-linear 也通过        → ⚠️ 自检失效，别信这份结果
 */
export function reportColorCheck(rows: ColorCheckRow[]): void {
  const byPath = new Map<Path, ColorCheckRow[]>();
  for (const r of rows) {
    const list = byPath.get(r.path) ?? [];
    list.push(r);
    byPath.set(r.path, list);
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('════════ 色彩链路自检 ════════');
  lines.push('');

  let allGood = true;
  let controlBroken = false;

  for (const path of ['unlit', 'tex-srgb', 'tex-linear'] as Path[]) {
    const list = byPath.get(path) ?? [];
    const passed = list.filter((r) => r.pass).length;
    const shouldPass = path !== 'tex-linear';
    const ok = shouldPass ? passed === list.length : passed === 0;

    if (!ok) allGood = false;
    if (path === 'tex-linear' && passed === list.length) controlBroken = true;

    const worst = list.reduce((m, r) => Math.max(m, r.delta), 0);
    lines.push(
      `${ok ? '✓' : '✗'} ${path.padEnd(11)} ${passed}/${list.length} 通过   最大偏差 ${worst}`,
    );
  }

  lines.push('');
  for (const r of byPath.get('tex-linear') ?? []) {
    lines.push(
      `  对照组 ${r.name.padEnd(10)} 期望 ${hex(r.expected)} → 实得 ${hex(r.actual)}  Δ${r.delta}`,
    );
  }

  lines.push('');
  if (controlBroken) {
    lines.push('⚠️ 对照组成立失败 —— 自检本身是坏的，这份结论不可信。');
  } else if (allGood) {
    lines.push('结论：色彩链路正确，对照组按预期失败。');
  } else {
    lines.push('结论：链路有问题，检查 outputColorSpace / 贴图 colorSpace / toneMapping。');
  }
  lines.push('══════════════════════════════');
  lines.push('');

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}
