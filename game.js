'use strict';

// ============================================================
//  Canvas Watercolor Story Game - Qixi Festival Surprise
//  Pure HTML5 Canvas, warm watercolor picture book style
// ============================================================

// ==================== COLOR PALETTE ====================
const C = {
    // Base palette
    cream: '#FFF8F0', warmWhite: '#FFFDF9', paper: '#FBF6EE',
    peach: '#FFD4B8', peachDeep: '#FFB088',
    coral: '#FF8B7B', coralLight: '#FFB5A0', coralDeep: '#E07060',
    honey: '#FFC857', honeyDeep: '#E8A830',
    warmBrown: '#8B6F5C', darkBrown: '#5C4033',
    brown: '#7A5C4A', brownLight: '#A88870',
    skin: '#FFD4B8', skinShadow: '#E8B898', skinDeep: '#D4A088',
    white: '#FFFFFF',
    // Atmosphere
    navy: '#2A2050', navyLight: '#3D2F6B', purple: '#3A2C5C', purpleLight: '#5A4880',
    gray: '#9B9BAA', grayLight: '#C5C5D0', darkGray: '#4D4D5A',
    // Nature
    sky: '#7BB8E0', skyDeep: '#5A9FD9', skyLight: '#B8D8F0',
    ocean: '#3E8EAB', oceanDeep: '#2E6E8B', oceanLight: '#6BB0C8',
    sand: '#F4E4BC', sandDeep: '#E0CC94',
    leaf: '#7CB342', leafDeep: '#5A8B30', leafLight: '#A4D870',
    rose: '#E91E63', roseLight: '#F06292',
    gold: '#FFD700', goldLight: '#FFE873',
    // Watercolor accents
    sakura: '#FFB7C5', sakuraDeep: '#FF8FA8',
    sunset: '#FF9A56', sunsetDeep: '#E87040',
    lavender: '#B8A0D0', lavenderDeep: '#9070B0',
    mint: '#A8D8C0', mintDeep: '#70B8A0',
    // Shadows
    shadow: 'rgba(60,40,30,0.15)', shadowDeep: 'rgba(60,40,30,0.25)',
    // Transparency helpers
    rgba: (c, a) => { const h = c.replace('#',''); const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16); return `rgba(${r},${g},${b},${a})`; }
};

const FT = "'Ma Shan Zheng', serif";
const FB = "'Noto Serif SC', serif";

// ==================== UTILITY FUNCTIONS ====================
const U = {
    lerp(a, b, t) { return a + (b - a) * t; },
    clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); },
    rand(mn, mx) { return Math.random() * (mx - mn) + mn; },
    randInt(mn, mx) { return Math.floor(Math.random() * (mx - mn + 1)) + mn; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
    map(v, a, b, c, d) { return c + (d - c) * ((v - a) / (b - a)); },
    easeIO(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    easeOut(t) { return 1 - (1 - t) * (1 - t); },
    easeIn(t) { return t * t; },
    easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    easeElastic(t) { if (t===0||t===1) return t; const c=2*Math.PI/3; return Math.pow(2,-10*t)*Math.sin((t*10-0.75)*c)+1; },
    T: 0
};

// ==================== WATERCOLOR HELPERS ====================
// Soft watercolor edge shape
function wcShape(ctx, drawFn, blur, alpha, layers) {
    blur = blur || 1.5;
    alpha = alpha || 0.6;
    layers = layers || 2;
    ctx.save();
    for (let i = 0; i < layers; i++) {
        ctx.globalAlpha = alpha / layers;
        ctx.filter = `blur(${blur}px)`;
        drawFn(ctx);
    }
    ctx.restore();
}

// Watercolor blob - organic rounded shape
function wcBlob(ctx, x, y, w, h, color, opts) {
    opts = opts || {};
    const blur = opts.blur || 2;
    const alpha = opts.alpha || 0.5;
    const points = opts.points || 8;
    const variance = opts.variance || 0.15;
    ctx.save();
    ctx.translate(x, y);
    for (let layer = 0; layer < 2; layer++) {
        ctx.globalAlpha = alpha / 2;
        ctx.filter = `blur(${blur}px)`;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
            const a = (i / points) * Math.PI * 2;
            const rx = w * (1 + Math.sin(a * 3 + layer) * variance);
            const ry = h * (1 + Math.cos(a * 2 + layer) * variance);
            const px = Math.cos(a) * rx;
            const py = Math.sin(a) * ry;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// Watercolor gradient fill
function wcGradient(ctx, x, y, w, h, c1, c2, angle) {
    angle = angle || Math.PI / 2;
    const cx = x + w / 2, cy = y + h / 2;
    const dx = Math.cos(angle) * w / 2, dy = Math.sin(angle) * h / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
}

// Radial watercolor wash - handles hex (#RRGGBB) and rgba() colors
function wcWash(ctx, x, y, r, color, alpha) {
    alpha = alpha === undefined ? 0.3 : alpha;
    r = Math.max(1, r);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (color.startsWith('#')) {
        const h = color.replace('#', '');
        const r2 = parseInt(h.substr(0, 2), 16);
        const g2 = parseInt(h.substr(2, 2), 16);
        const b2 = parseInt(h.substr(4, 2), 16);
        g.addColorStop(0, `rgba(${r2},${g2},${b2},${alpha})`);
        g.addColorStop(0.6, `rgba(${r2},${g2},${b2},${alpha * 0.3})`);
        g.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
    } else if (color.startsWith('rgba')) {
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
    } else if (color.startsWith('rgb')) {
        g.addColorStop(0, color.replace(')', `,${alpha})`).replace('rgb(', 'rgba('));
        g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
        g.addColorStop(0, color);
        g.addColorStop(1, color);
    }
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Paper texture overlay
function drawPaperTexture(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.025;
    for (let i = 0; i < 300; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? C.darkBrown : C.warmWhite;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.restore();
}

// ==================== DRAWING HELPERS ====================
function fRect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function fCircle(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function sCircle(ctx, x, y, r, c, lw) { ctx.strokeStyle = c; ctx.lineWidth = lw || 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }

function rrPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function fRR(ctx, x, y, w, h, r, c) { rrPath(ctx, x, y, w, h, r); ctx.fillStyle = c; ctx.fill(); }

// Soft shadow ellipse
function drawShadow(ctx, x, y, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = C.darkBrown;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ==================== CHARACTER: BOY ====================
// Middle-Q ratio (1:3.5), watercolor picture book style
function drawBoy(ctx, x, y, s, o) {
    o = o || {};
    const expr = o.expression || 'happy';
    const blink = o.blink || false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sk = C.skin, skS = C.skinShadow, hr = C.darkBrown, hrH = C.brownLight, sh = C.coral;

    // --- Ground shadow ---
    drawShadow(ctx, 0, 95, 28, 7);

    // --- Legs ---
    ctx.strokeStyle = C.warmBrown; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 65); ctx.quadraticCurveTo(-9, 80, -8, 92);
    ctx.moveTo(8, 65); ctx.quadraticCurveTo(9, 80, 8, 92);
    ctx.stroke();
    // Shoes
    ctx.fillStyle = C.darkBrown;
    ctx.beginPath(); ctx.ellipse(-9, 93, 8, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, 93, 8, 5, 0, 0, Math.PI*2); ctx.fill();

    // --- Body (shirt) ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    // Main torso
    const tg = ctx.createLinearGradient(0, 30, 0, 70);
    tg.addColorStop(0, sh);
    tg.addColorStop(1, C.coralDeep);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-18, 32);
    ctx.quadraticCurveTo(-22, 45, -20, 60);
    ctx.quadraticCurveTo(-18, 68, -12, 65);
    ctx.lineTo(12, 65);
    ctx.quadraticCurveTo(18, 68, 20, 60);
    ctx.quadraticCurveTo(22, 45, 18, 32);
    ctx.closePath();
    ctx.fill();
    // Collar
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.moveTo(-6, 32); ctx.lineTo(0, 38); ctx.lineTo(6, 32);
    ctx.lineTo(4, 30); ctx.lineTo(-4, 30);
    ctx.closePath();
    ctx.fill();
    // Shirt fold lines
    ctx.strokeStyle = C.rgba(C.coralDeep, 0.3); ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, 45); ctx.quadraticCurveTo(-8, 52, -10, 58);
    ctx.moveTo(10, 45); ctx.quadraticCurveTo(8, 52, 10, 58);
    ctx.stroke();
    ctx.restore();

    // --- Arms ---
    ctx.strokeStyle = sh; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 36); ctx.quadraticCurveTo(-28, 48, -24, 58);
    ctx.moveTo(18, 36); ctx.quadraticCurveTo(28, 48, 24, 58);
    ctx.stroke();
    // Hands
    fCircle(ctx, -24, 60, 5.5, sk);
    fCircle(ctx, 24, 60, 5.5, sk);

    // --- Neck ---
    ctx.fillStyle = skS;
    ctx.fillRect(-5, 24, 10, 12);
    ctx.fillStyle = sk;
    ctx.fillRect(-4.5, 24, 9, 8);

    // --- Head shape ---
    ctx.save();
    ctx.filter = 'blur(0.3px)';
    ctx.fillStyle = sk;
    ctx.beginPath();
    ctx.ellipse(0, 5, 24, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    // Face shadow
    ctx.fillStyle = C.rgba(skS, 0.4);
    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 18, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();

    // --- Ears ---
    fCircle(ctx, -23, 8, 4, sk);
    fCircle(ctx, 23, 8, 4, sk);
    fCircle(ctx, -23, 8, 2, skS);
    fCircle(ctx, 23, 8, 2, skS);

    // --- Hair (layered, with strands) ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    ctx.fillStyle = hr;
    // Back hair
    ctx.beginPath();
    ctx.ellipse(0, -2, 26, 24, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Top hair
    ctx.beginPath();
    ctx.ellipse(0, -8, 25, 20, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
    // Side bangs
    ctx.beginPath();
    ctx.moveTo(-24, -5);
    ctx.quadraticCurveTo(-20, -22, -8, -24);
    ctx.quadraticCurveTo(-12, -10, -14, 2);
    ctx.quadraticCurveTo(-20, 0, -24, -5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, -5);
    ctx.quadraticCurveTo(20, -22, 8, -24);
    ctx.quadraticCurveTo(12, -10, 14, 2);
    ctx.quadraticCurveTo(20, 0, 24, -5);
    ctx.fill();
    // Front bangs with strands
    ctx.beginPath();
    ctx.moveTo(-20, -10);
    ctx.quadraticCurveTo(-14, -20, -5, -18);
    ctx.quadraticCurveTo(-8, -5, -10, 2);
    ctx.quadraticCurveTo(-16, -2, -20, -10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, -10);
    ctx.quadraticCurveTo(14, -20, 5, -18);
    ctx.quadraticCurveTo(8, -5, 10, 2);
    ctx.quadraticCurveTo(16, -2, 20, -10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, -20);
    ctx.quadraticCurveTo(0, -22, 6, -20);
    ctx.quadraticCurveTo(4, -8, 0, -5);
    ctx.quadraticCurveTo(-4, -8, -6, -20);
    ctx.fill();
    // Hair highlight
    ctx.fillStyle = hrH;
    ctx.beginPath();
    ctx.ellipse(-8, -15, 6, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, -15, 6, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Eyebrows ---
    ctx.strokeStyle = hr; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (expr === 'happy' || expr === 'smile') {
        ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-6, -4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(14, -2); ctx.stroke();
    } else if (expr === 'sad') {
        ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-6, -1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, -1); ctx.lineTo(14, -4); ctx.stroke();
    } else if (expr === 'surprised') {
        ctx.beginPath(); ctx.arc(-10, -3, 4, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(10, -3, 4, Math.PI, 0); ctx.stroke();
    } else if (expr === 'shy') {
        ctx.beginPath(); ctx.moveTo(-14, -1); ctx.quadraticCurveTo(-10, -5, -6, -3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, -3); ctx.quadraticCurveTo(10, -5, 14, -1); ctx.stroke();
    }

    // --- Eyes ---
    if (!blink) {
        // Eye whites
        ctx.fillStyle = C.white;
        ctx.beginPath(); ctx.ellipse(-10, 5, 5, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(10, 5, 5, 6, 0, 0, Math.PI*2); ctx.fill();
        // Iris
        ctx.fillStyle = C.darkBrown;
        ctx.beginPath(); ctx.arc(-10, 6, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 6, 3.5, 0, Math.PI*2); ctx.fill();
        // Pupil
        ctx.fillStyle = C.navy;
        ctx.beginPath(); ctx.arc(-10, 6, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 6, 2, 0, Math.PI*2); ctx.fill();
        // Highlight
        ctx.fillStyle = C.white;
        ctx.beginPath(); ctx.arc(-9, 5, 1.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(11, 5, 1.2, 0, Math.PI*2); ctx.fill();
        // Eyelashes (subtle)
        ctx.strokeStyle = hr; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-14, 1); ctx.lineTo(-15, -1);
        ctx.moveTo(14, 1); ctx.lineTo(15, -1);
        ctx.stroke();
    } else {
        ctx.strokeStyle = hr; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-14, 5); ctx.quadraticCurveTo(-10, 8, -6, 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, 5); ctx.quadraticCurveTo(10, 8, 14, 5); ctx.stroke();
    }

    // --- Nose ---
    ctx.strokeStyle = C.rgba(skS, 0.6); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.quadraticCurveTo(-1, 11, 1, 12);
    ctx.stroke();

    // --- Mouth ---
    ctx.strokeStyle = C.coralDeep; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (expr === 'happy' || expr === 'smile') {
        ctx.beginPath();
        ctx.moveTo(-5, 17); ctx.quadraticCurveTo(0, 22, 5, 17);
        ctx.stroke();
    } else if (expr === 'sad') {
        ctx.beginPath();
        ctx.moveTo(-5, 19); ctx.quadraticCurveTo(0, 15, 5, 19);
        ctx.stroke();
    } else if (expr === 'surprised') {
        ctx.fillStyle = C.coralDeep;
        ctx.beginPath(); ctx.ellipse(0, 19, 3, 4, 0, 0, Math.PI*2); ctx.fill();
    } else if (expr === 'shy') {
        ctx.strokeStyle = C.coralDeep; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, 18); ctx.quadraticCurveTo(0, 20, 3, 18);
        ctx.stroke();
    }

    // --- Blush ---
    if (o.blush) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.filter = 'blur(2px)';
        fCircle(ctx, -13, 14, 4, C.coral);
        fCircle(ctx, 13, 14, 4, C.coral);
        ctx.restore();
    }

    ctx.restore();
}

// ==================== CHARACTER: GIRL (with glasses) ====================
function drawGirl(ctx, x, y, s, o) {
    o = o || {};
    const expr = o.expression || 'happy';
    const blink = o.blink || false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sk = C.skin, skS = C.skinShadow, hr = C.darkBrown, hrH = C.brownLight, dr = C.honey;

    // --- Ground shadow ---
    drawShadow(ctx, 0, 95, 30, 7);

    // --- Long hair behind body ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    ctx.fillStyle = hr;
    ctx.beginPath(); ctx.ellipse(-24, 35, 10, 38, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, 35, 10, 38, 0.1, 0, Math.PI * 2); ctx.fill();
    // Hair strands
    ctx.strokeStyle = hrH; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-28, 20); ctx.quadraticCurveTo(-30, 40, -26, 65);
    ctx.moveTo(28, 20); ctx.quadraticCurveTo(30, 40, 26, 65);
    ctx.stroke();
    ctx.restore();

    // --- Legs ---
    ctx.strokeStyle = C.warmBrown; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 65); ctx.quadraticCurveTo(-9, 80, -8, 92);
    ctx.moveTo(8, 65); ctx.quadraticCurveTo(9, 80, 8, 92);
    ctx.stroke();
    // Shoes
    ctx.fillStyle = C.coralDeep;
    ctx.beginPath(); ctx.ellipse(-9, 93, 8, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, 93, 8, 5, 0, 0, Math.PI*2); ctx.fill();

    // --- Body (dress) ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    const dg = ctx.createLinearGradient(0, 30, 0, 72);
    dg.addColorStop(0, dr);
    dg.addColorStop(0.6, C.honeyDeep);
    dg.addColorStop(1, C.honeyDeep);
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(-16, 32);
    ctx.quadraticCurveTo(-24, 50, -22, 68);
    ctx.lineTo(-16, 65);
    ctx.lineTo(16, 65);
    ctx.lineTo(22, 68);
    ctx.quadraticCurveTo(24, 50, 16, 32);
    ctx.closePath();
    ctx.fill();
    // Dress pattern (polka dots)
    ctx.fillStyle = C.rgba(C.cream, 0.3);
    for (let dy = 38; dy < 64; dy += 10) {
        for (let dx = -14; dx <= 14; dx += 12) {
            ctx.beginPath(); ctx.arc(dx + (dy/10 % 2 === 0 ? 0 : 6), dy, 2, 0, Math.PI*2); ctx.fill();
        }
    }
    // Collar
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.moveTo(-5, 32); ctx.lineTo(0, 38); ctx.lineTo(5, 32);
    ctx.lineTo(3, 30); ctx.lineTo(-3, 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- Arms ---
    ctx.strokeStyle = dr; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 36); ctx.quadraticCurveTo(-26, 48, -22, 58);
    ctx.moveTo(16, 36); ctx.quadraticCurveTo(26, 48, 22, 58);
    ctx.stroke();
    // Hands
    fCircle(ctx, -22, 60, 5.5, sk);
    fCircle(ctx, 22, 60, 5.5, sk);

    // --- Neck ---
    ctx.fillStyle = skS;
    ctx.fillRect(-5, 24, 10, 12);
    ctx.fillStyle = sk;
    ctx.fillRect(-4.5, 24, 9, 8);

    // --- Head ---
    ctx.save();
    ctx.filter = 'blur(0.3px)';
    ctx.fillStyle = sk;
    ctx.beginPath();
    ctx.ellipse(0, 5, 24, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.rgba(skS, 0.4);
    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 18, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();

    // --- Ears ---
    fCircle(ctx, -23, 8, 4, sk);
    fCircle(ctx, 23, 8, 4, sk);
    fCircle(ctx, -23, 8, 2, skS);
    fCircle(ctx, 23, 8, 2, skS);

    // --- Hair (layered with flow) ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    ctx.fillStyle = hr;
    // Back hair frame
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 28, 0, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    // Top hair
    ctx.beginPath();
    ctx.ellipse(0, -10, 26, 22, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    // Side hair (longer, flowing)
    ctx.beginPath();
    ctx.moveTo(-25, -3);
    ctx.quadraticCurveTo(-22, -26, -8, -28);
    ctx.quadraticCurveTo(-15, -8, -16, 8);
    ctx.quadraticCurveTo(-21, 6, -25, -3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(25, -3);
    ctx.quadraticCurveTo(22, -26, 8, -28);
    ctx.quadraticCurveTo(15, -8, 16, 8);
    ctx.quadraticCurveTo(21, 6, 25, -3);
    ctx.fill();
    // Front bangs (curtain style)
    ctx.beginPath();
    ctx.moveTo(-22, -12);
    ctx.quadraticCurveTo(-12, -25, 0, -23);
    ctx.quadraticCurveTo(-8, -8, -12, 0);
    ctx.quadraticCurveTo(-18, -4, -22, -12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(22, -12);
    ctx.quadraticCurveTo(12, -25, 0, -23);
    ctx.quadraticCurveTo(8, -8, 12, 0);
    ctx.quadraticCurveTo(18, -4, 22, -12);
    ctx.fill();
    // Center bang
    ctx.beginPath();
    ctx.moveTo(-5, -22);
    ctx.quadraticCurveTo(0, -20, 5, -22);
    ctx.quadraticCurveTo(3, -10, 0, -8);
    ctx.quadraticCurveTo(-3, -10, -5, -22);
    ctx.fill();
    // Hair highlights
    ctx.fillStyle = hrH;
    ctx.beginPath(); ctx.ellipse(-10, -18, 7, 3, -0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -18, 7, 3, 0.2, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // --- Glasses ---
    ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    // Lens fill (subtle)
    ctx.fillStyle = C.rgba(C.white, 0.15);
    ctx.beginPath(); ctx.ellipse(-10, 5, 9, 8, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, 5, 9, 8, 0, 0, Math.PI*2); ctx.fill();
    // Frame
    ctx.beginPath(); ctx.ellipse(-10, 5, 9, 8, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(10, 5, 9, 8, 0, 0, Math.PI*2); ctx.stroke();
    // Bridge
    ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(1, 4); ctx.stroke();
    // Temple arms
    ctx.beginPath(); ctx.moveTo(-19, 3); ctx.lineTo(-24, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(19, 3); ctx.lineTo(24, -1); ctx.stroke();
    // Glass glint
    ctx.strokeStyle = C.rgba(C.white, 0.5); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-12, 2, 5, Math.PI*1.3, Math.PI*1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(8, 2, 5, Math.PI*1.3, Math.PI*1.6); ctx.stroke();

    // --- Eyebrows (above glasses) ---
    ctx.strokeStyle = hr; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (expr === 'happy' || expr === 'smile') {
        ctx.beginPath(); ctx.moveTo(-15, -4); ctx.quadraticCurveTo(-10, -6, -5, -4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -4); ctx.quadraticCurveTo(10, -6, 15, -4); ctx.stroke();
    } else if (expr === 'sad') {
        ctx.beginPath(); ctx.moveTo(-15, -6); ctx.lineTo(-5, -2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -2); ctx.lineTo(15, -6); ctx.stroke();
    } else if (expr === 'surprised') {
        ctx.beginPath(); ctx.arc(-10, -4, 5, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(10, -4, 5, Math.PI, 0); ctx.stroke();
    } else if (expr === 'shy') {
        ctx.beginPath(); ctx.moveTo(-15, -3); ctx.quadraticCurveTo(-10, -7, -5, -5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -5); ctx.quadraticCurveTo(10, -7, 15, -3); ctx.stroke();
    }

    // --- Eyes behind glasses ---
    if (!blink) {
        ctx.fillStyle = C.white;
        ctx.beginPath(); ctx.ellipse(-10, 5, 4.5, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(10, 5, 4.5, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = C.darkBrown;
        ctx.beginPath(); ctx.arc(-10, 6, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 6, 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = C.navy;
        ctx.beginPath(); ctx.arc(-10, 6, 1.8, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 6, 1.8, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = C.white;
        ctx.beginPath(); ctx.arc(-9, 5, 1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(11, 5, 1, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.strokeStyle = hr; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-14, 5); ctx.quadraticCurveTo(-10, 8, -6, 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, 5); ctx.quadraticCurveTo(10, 8, 14, 5); ctx.stroke();
    }

    // --- Nose ---
    ctx.strokeStyle = C.rgba(skS, 0.5); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 9); ctx.quadraticCurveTo(-1.5, 12, 1, 13);
    ctx.stroke();

    // --- Mouth ---
    ctx.strokeStyle = C.coralDeep; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (expr === 'happy' || expr === 'smile') {
        ctx.beginPath();
        ctx.moveTo(-5, 18); ctx.quadraticCurveTo(0, 23, 5, 18);
        ctx.stroke();
    } else if (expr === 'sad') {
        ctx.beginPath();
        ctx.moveTo(-5, 20); ctx.quadraticCurveTo(0, 16, 5, 20);
        ctx.stroke();
    } else if (expr === 'surprised') {
        ctx.fillStyle = C.coralDeep;
        ctx.beginPath(); ctx.ellipse(0, 20, 3, 4, 0, 0, Math.PI*2); ctx.fill();
    } else if (expr === 'shy') {
        ctx.strokeStyle = C.coralDeep; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, 19); ctx.quadraticCurveTo(0, 21, 3, 19);
        ctx.stroke();
    }

    // --- Blush ---
    if (o.blush) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.filter = 'blur(2px)';
        fCircle(ctx, -14, 15, 4.5, C.coral);
        fCircle(ctx, 14, 15, 4.5, C.coral);
        ctx.restore();
    }

    ctx.restore();
}

// ==================== CHARACTER: CAT ====================
function drawCat(ctx, x, y, s, o) {
    o = o || {};
    const expr = o.expression || 'enjoy';
    const blink = o.blink || false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const bd = '#D4A574', bdD = '#B8896B', bdL = '#E8C098', dk = C.darkBrown;

    // --- Shadow ---
    drawShadow(ctx, 0, 28, 26, 5);

    // --- Tail (curved, flowing) ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    ctx.strokeStyle = bd; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(18, 18);
    ctx.quadraticCurveTo(38, 8, 34, -16);
    ctx.quadraticCurveTo(32, -24, 26, -22);
    ctx.stroke();
    // Tail stripes
    ctx.strokeStyle = bdD; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(26, 12); ctx.lineTo(30, 10);
    ctx.moveTo(33, 2); ctx.lineTo(37, 0);
    ctx.moveTo(35, -10); ctx.lineTo(38, -12);
    ctx.stroke();
    ctx.restore();

    // --- Body ---
    ctx.save();
    ctx.filter = 'blur(0.5px)';
    const bg = ctx.createLinearGradient(0, 0, 0, 40);
    bg.addColorStop(0, bdL);
    bg.addColorStop(1, bd);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, 18, 24, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body stripes
    ctx.strokeStyle = bdD; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 8); ctx.lineTo(-12, 16);
    ctx.moveTo(0, 6); ctx.lineTo(0, 14);
    ctx.moveTo(12, 8); ctx.lineTo(12, 16);
    ctx.stroke();
    ctx.restore();

    // --- Front paws ---
    ctx.fillStyle = bd;
    ctx.beginPath(); ctx.ellipse(-10, 32, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, 32, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    // Paw lines
    ctx.strokeStyle = bdD; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, 33); ctx.lineTo(-12, 35);
    ctx.moveTo(-9, 33); ctx.lineTo(-9, 35);
    ctx.moveTo(9, 33); ctx.lineTo(9, 35);
    ctx.moveTo(12, 33); ctx.lineTo(12, 35);
    ctx.stroke();

    // --- Head ---
    ctx.save();
    ctx.filter = 'blur(0.3px)';
    const hg = ctx.createRadialGradient(0, -15, 5, 0, -10, 24);
    hg.addColorStop(0, bdL);
    hg.addColorStop(1, bd);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, -10, 22, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Ears ---
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.moveTo(-18, -20); ctx.lineTo(-14, -36); ctx.lineTo(-6, -22);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -20); ctx.lineTo(14, -36); ctx.lineTo(6, -22);
    ctx.closePath(); ctx.fill();
    // Inner ears
    ctx.fillStyle = C.rgba(C.coralLight, 0.7);
    ctx.beginPath();
    ctx.moveTo(-15, -22); ctx.lineTo(-13, -31); ctx.lineTo(-9, -24);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -22); ctx.lineTo(13, -31); ctx.lineTo(9, -24);
    ctx.closePath(); ctx.fill();

    // --- Eyes ---
    if (!blink) {
        ctx.fillStyle = dk;
        if (expr === 'enjoy') {
            // Happy closed-curve eyes
            ctx.strokeStyle = dk; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(-8, -8, 5, 0.2, Math.PI - 0.2); ctx.stroke();
            ctx.beginPath(); ctx.arc(8, -8, 5, 0.2, Math.PI - 0.2); ctx.stroke();
        } else if (expr === 'curious') {
            // Wide round eyes
            ctx.beginPath(); ctx.ellipse(-8, -8, 4, 5, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(8, -8, 4, 5, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = C.gold;
            ctx.beginPath(); ctx.arc(-8, -7, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(8, -7, 2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = C.navy;
            ctx.beginPath(); ctx.ellipse(-8, -7, 0.8, 3, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(8, -7, 0.8, 3, 0, 0, Math.PI*2); ctx.fill();
        }
    } else {
        ctx.strokeStyle = dk; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-4, -8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(12, -8); ctx.stroke();
    }

    // --- Nose ---
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.lineTo(0, 3);
    ctx.closePath(); ctx.fill();

    // --- Mouth (w shape) ---
    ctx.strokeStyle = dk; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 3); ctx.lineTo(0, 6);
    ctx.moveTo(0, 6); ctx.quadraticCurveTo(-4, 9, -6, 6);
    ctx.moveTo(0, 6); ctx.quadraticCurveTo(4, 9, 6, 6);
    ctx.stroke();

    // --- Whiskers ---
    ctx.strokeStyle = C.rgba(dk, 0.5); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, 2); ctx.lineTo(-22, -1);
    ctx.moveTo(-10, 4); ctx.lineTo(-22, 4);
    ctx.moveTo(10, 2); ctx.lineTo(22, -1);
    ctx.moveTo(10, 4); ctx.lineTo(22, 4);
    ctx.stroke();

    // --- Head stripes ---
    ctx.strokeStyle = bdD; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -28); ctx.lineTo(-6, -22);
    ctx.moveTo(6, -28); ctx.lineTo(6, -22);
    ctx.moveTo(0, -30); ctx.lineTo(0, -24);
    ctx.moveTo(-14, -18); ctx.lineTo(-14, -12);
    ctx.moveTo(14, -18); ctx.lineTo(14, -12);
    ctx.stroke();

    ctx.restore();
}

// ==================== PARTICLE SYSTEM ====================
class ParticleSystem {
    constructor() { this.particles = []; }
    spawn(x, y, type, count, opts) {
        opts = opts || {};
        for (let i = 0; i < count; i++) {
            const p = {
                x, y,
                vx: opts.vx !== undefined ? opts.vx + U.rand(-opts.spread || 0, opts.spread || 0) : U.rand(-2, 2),
                vy: opts.vy !== undefined ? opts.vy + U.rand(-opts.spread || 0, opts.spread || 0) : U.rand(-3, -0.5),
                life: opts.life || U.rand(1, 2.5),
                age: 0,
                size: opts.size || U.rand(3, 8),
                rot: U.rand(0, Math.PI * 2),
                vrot: U.rand(-0.05, 0.05),
                type,
                color: opts.color || C.coral,
                gravity: opts.gravity !== undefined ? opts.gravity : 0.05
            };
            this.particles.push(p);
        }
    }
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += dt;
            if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.vy += p.gravity * dt * 60;
            p.rot += p.vrot * dt * 60;
        }
    }
    render(ctx) {
        for (const p of this.particles) {
            const a = 1 - p.age / p.life;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            if (p.type === 'heart') {
                const sz = p.size * a;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.moveTo(0, sz * 0.3);
                ctx.bezierCurveTo(-sz, -sz * 0.5, -sz * 0.5, -sz, 0, -sz * 0.3);
                ctx.bezierCurveTo(sz * 0.5, -sz, sz, -sz * 0.5, 0, sz * 0.3);
                ctx.fill();
            } else if (p.type === 'petal') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, p.size * a, p.size * a * 1.5, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'star') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                for (let j = 0; j < 5; j++) {
                    const ang = (j / 5) * Math.PI * 2 - Math.PI / 2;
                    const r = j % 2 === 0 ? p.size * a : p.size * a * 0.4;
                    const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
                    if (j === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            } else if (p.type === 'sparkle') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(0, 0, p.size * a, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-p.size * a * 2, 0); ctx.lineTo(p.size * a * 2, 0);
                ctx.moveTo(0, -p.size * a * 2); ctx.lineTo(0, p.size * a * 2);
                ctx.stroke();
            } else if (p.type === 'splash') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(0, 0, p.size * a * 0.6, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'bubble') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, p.size * a, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }
    clear() { this.particles = []; }
}

// ==================== BACKGROUND HELPERS ====================
function makeStars(w, h, count, maxR) {
    const stars = [];
    for (let i = 0; i < count; i++) {
        stars.push({ x: Math.random() * w, y: Math.random() * h * 0.75, r: Math.random() * (maxR || 2) + 0.5, p: Math.random() * Math.PI * 2, s: Math.random() * 2 + 1 });
    }
    return stars;
}

function drawStars(ctx, stars, t) {
    for (const s of stars) {
        const tw = Math.sin(t * s.s + s.p) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,248,240,${tw * 0.9})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        if (s.r > 1.5 && tw > 0.7) {
            ctx.strokeStyle = `rgba(255,248,240,${(tw - 0.7) * 0.4})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(s.x - s.r * 3, s.y); ctx.lineTo(s.x + s.r * 3, s.y);
            ctx.moveTo(s.x, s.y - s.r * 3); ctx.lineTo(s.x, s.y + s.r * 3);
            ctx.stroke();
        }
    }
}

function drawRaindrops(ctx, drops, t) {
    ctx.strokeStyle = 'rgba(174,194,224,0.4)';
    ctx.lineWidth = 1.5;
    for (const d of drops) {
        const y = (d.y + t * d.speed) % (d.maxY + 100);
        ctx.beginPath();
        ctx.moveTo(d.x, y);
        ctx.lineTo(d.x - 3, y + d.len);
        ctx.stroke();
    }
}

// Watercolor sky gradient
function drawSky(ctx, w, h, c1, c2, c3) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c1);
    g.addColorStop(0.6, c2);
    g.addColorStop(1, c3 || c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

// Watercolor ground
function drawGround(ctx, w, h, groundY, c1, c2) {
    const g = ctx.createLinearGradient(0, groundY, 0, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, w, h - groundY);
    // Soft edge
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.filter = 'blur(8px)';
    ctx.fillStyle = c1;
    ctx.fillRect(0, groundY - 5, w, 10);
    ctx.restore();
}

// Watercolor tree (simple)
function drawTree(ctx, x, y, s, leafColor, trunkColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // Trunk
    ctx.fillStyle = trunkColor || C.warmBrown;
    ctx.fillRect(-4, 0, 8, 30);
    // Leaves (watercolor blobs)
    wcBlob(ctx, 0, -15, 30, 28, leafColor, { blur: 3, alpha: 0.5 });
    wcBlob(ctx, -12, -5, 22, 20, leafColor, { blur: 3, alpha: 0.4 });
    wcBlob(ctx, 12, -5, 22, 20, leafColor, { blur: 3, alpha: 0.4 });
    ctx.restore();
}

// Watercolor cloud
function drawCloud(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = color || C.white;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-20, 5, 20, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(20, 5, 20, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-10, -10, 18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -10, 18, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

// Draw a watercolor heart
function drawHeart(ctx, x, y, s, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha || 1;
    ctx.filter = 'blur(0.5px)';
    ctx.fillStyle = color || C.coral;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-12, -4, -8, -14, 0, -6);
    ctx.bezierCurveTo(8, -14, 12, -4, 0, 8);
    ctx.fill();
    ctx.restore();
}

// ==================== SCENE BASE CLASS ====================
class Scene {
    constructor(g) { this.g = g; this.done = false; this.t = 0; this.hint = ''; this.text = ''; }
    enter() { this.t = 0; this.done = false; }
    exit() {}
    update(dt) { this.t += dt; }
    render(ctx) {}
    onDown(x, y) {}
    onMove(x, y) {}
    onUp(x, y) {}
}

// ==================== SCENE 0: Starry Night Opening ====================
class S0 extends Scene {
    enter() { super.enter(); this.text = ''; this.hint = '轻触星空，开启我们的故事'; this.stars = makeStars(this.g.w, this.g.h, 60, 2.5); this.envY = -100; this.opened = false; }
    update(dt) {
        super.update(dt);
        this.envY = U.lerp(this.envY, this.g.h * 0.4, dt * 2);
        if (this.opened && this.t > 1.5) this.done = true;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        drawSky(ctx, w, h, C.navy, C.purple, C.purpleLight);
        // Watercolor wash
        wcWash(ctx, w * 0.3, h * 0.2, 200, C.lavender, 0.15);
        wcWash(ctx, w * 0.7, h * 0.15, 180, C.lavenderDeep, 0.1);
        drawStars(ctx, this.stars, U.T);
        drawPaperTexture(ctx, w, h);
        // Floating envelope
        const cx = w / 2, cy = this.envY;
        const float = Math.sin(this.t * 2) * 8;
        ctx.save();
        ctx.translate(cx, cy + float);
        ctx.scale(1.5, 1.5);
        // Envelope shadow
        drawShadow(ctx, 0, 45, 35, 8);
        // Body
        fRR(ctx, -30, -20, 60, 42, 8, C.cream);
        // Flap
        ctx.fillStyle = C.peach;
        ctx.beginPath();
        ctx.moveTo(-30, -20); ctx.lineTo(0, -2); ctx.lineTo(30, -20);
        ctx.closePath(); ctx.fill();
        // Seal
        if (!this.opened) {
            ctx.save();
            ctx.filter = 'blur(1px)';
            fCircle(ctx, 0, -10, 10, C.coral);
            ctx.restore();
            // Heart on seal
            drawHeart(ctx, 0, -12, 0.8, C.cream, 0.9);
        } else {
            // Opened - sparkle burst
            ctx.fillStyle = C.honey;
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2;
                const r = 30 + Math.sin(this.t * 3 + i) * 10;
                ctx.globalAlpha = 0.6;
                ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        // Ambient particles
        if (Math.random() < 0.05) this.g.ps.spawn(U.rand(0, w), U.rand(0, h * 0.6), 'star', 1, { size: 2, color: C.cream, vy: -0.2, life: 3, gravity: 0 });
    }
    onDown(x, y) {
        const cx = this.g.w / 2, cy = this.envY;
        if (U.dist(x, y, cx, cy) < 60 && !this.opened) {
            this.opened = true;
            this.hint = '';
            this.text = '一封信，开始了我们的故事';
            this.g.ps.spawn(cx, cy, 'sparkle', 20, { size: 5, color: C.honey, spread: 3, life: 2, gravity: 0.02 });
            this.g.ps.spawn(cx, cy, 'heart', 8, { size: 6, color: C.coral, spread: 2, life: 2.5, gravity: -0.03 });
        }
    }
}

// ==================== SCENE 1: First Meeting (Cafe) ====================
class S1 extends Scene {
    enter() { super.enter(); this.text = '那年冬天，咖啡馆里的初次相遇'; this.hint = '轻触两杯咖啡，连结我们的缘分'; this.cups = [{ x: 0, y: 0, connected: false }, { x: 0, y: 0, connected: false }]; this.connectT = 0; }
    update(dt) { super.update(dt); const w = this.g.w, h = this.g.h; this.cups[0].x = w * 0.32; this.cups[0].y = h * 0.65; this.cups[1].x = w * 0.68; this.cups[1].y = h * 0.65; if (this.cups[0].connected && this.cups[1].connected && this.t > 1) this.done = true; }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Warm cafe interior
        drawSky(ctx, w, h, C.peachDeep, C.honey, C.cream);
        // Window light wash
        wcWash(ctx, w * 0.5, h * 0.3, 300, C.honey, 0.15);
        wcWash(ctx, w * 0.2, h * 0.4, 200, C.coral, 0.08);
        drawPaperTexture(ctx, w, h);
        // Floor
        drawGround(ctx, w, h, h * 0.7, C.warmBrown, C.darkBrown);
        // Window
        ctx.save();
        ctx.fillStyle = C.rgba(C.cream, 0.3);
        ctx.filter = 'blur(2px)';
        fRect(ctx, w * 0.05, h * 0.1, w * 0.25, h * 0.5);
        ctx.restore();
        // Hanging lights
        for (let i = 0; i < 3; i++) {
            const lx = w * (0.25 + i * 0.25);
            const ly = h * 0.15;
            ctx.strokeStyle = C.warmBrown; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly); ctx.stroke();
            wcWash(ctx, lx, ly + 8, 40, C.honey, 0.3);
            fCircle(ctx, lx, ly + 5, 8, C.honeyDeep);
        }
        // Table
        ctx.fillStyle = C.warmBrown;
        fRR(ctx, w * 0.15, h * 0.68, w * 0.7, 12, 6, C.warmBrown);
        // Coffee cups
        for (let i = 0; i < 2; i++) {
            const c = this.cups[i];
            ctx.save();
            const bob = Math.sin(this.t * 2 + i * Math.PI) * 2;
            // Steam
            ctx.strokeStyle = C.rgba(C.white, 0.15); ctx.lineWidth = 2;
            ctx.filter = 'blur(2px)';
            for (let s = 0; s < 3; s++) {
                ctx.beginPath();
                ctx.moveTo(c.x + (s - 1) * 4, c.y - 15 + bob);
                ctx.quadraticCurveTo(c.x + (s - 1) * 4 + Math.sin(this.t * 3 + s) * 5, c.y - 30 + bob, c.x + (s - 1) * 4, c.y - 40 + bob);
                ctx.stroke();
            }
            ctx.restore();
            // Cup
            ctx.fillStyle = c.connected ? C.coral : C.cream;
            fRR(ctx, c.x - 12, c.y - 15 + bob, 24, 22, 4, ctx.fillStyle);
            // Handle
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(c.x + 14, c.y - 4 + bob, 6, -Math.PI/2, Math.PI/2); ctx.stroke();
            // Coffee
            ctx.fillStyle = C.darkBrown;
            fRR(ctx, c.x - 9, c.y - 12 + bob, 18, 4, 2, C.darkBrown);
            // Glow when connected
            if (c.connected) { wcWash(ctx, c.x, c.y, 30, C.coral, 0.2); }
        }
        // Connection line
        if (this.cups[0].connected && this.cups[1].connected) {
            const p = U.easeOut(U.clamp(this.t - 0.5, 0, 1));
            ctx.save();
            ctx.strokeStyle = C.rgba(C.coral, 0.4); ctx.lineWidth = 3;
            ctx.filter = 'blur(1px)';
            ctx.beginPath();
            ctx.moveTo(this.cups[0].x, this.cups[0].y - 4);
            ctx.quadraticCurveTo(w / 2, h * 0.5, this.cups[1].x * p + this.cups[0].x * (1-p), this.cups[1].y - 4);
            ctx.stroke();
            ctx.restore();
        }
        // Characters
        const sc = Math.min(1.4, w / 280);
        drawBoy(ctx, w * 0.32, h * 0.52, sc, { expression: 'shy', blush: true });
        drawGirl(ctx, w * 0.68, h * 0.52, sc, { expression: 'shy', blush: true });
    }
    onDown(x, y) {
        for (const c of this.cups) {
            if (!c.connected && U.dist(x, y, c.x, c.y) < 25) {
                c.connected = true;
                this.g.ps.spawn(c.x, c.y, 'heart', 6, { size: 4, color: C.coral, spread: 1.5, life: 1.5, gravity: -0.05 });
                if (this.cups[0].connected && this.cups[1].connected) {
                    this.hint = ''; this.text = '缘分就这样开始了...';
                    this.t = 0;
                }
            }
        }
    }
}

// ==================== SCENE 2: Murder Mystery (Heartbeat) ====================
class S2 extends Scene {
    enter() { super.enter(); this.text = '剧本杀的夜晚，心跳的声音藏不住了'; this.hint = '轻触那颗跳动的心'; this.heartScale = 1; this.beatT = 0; this.taps = 0; }
    update(dt) {
        super.update(dt);
        this.beatT += dt;
        const beat = Math.sin(this.beatT * 4);
        this.heartScale = 1 + beat * 0.15;
        if (this.taps >= 3 && this.t > 1) this.done = true;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Dim dramatic atmosphere
        drawSky(ctx, w, h, C.navy, C.purple, C.purpleLight);
        wcWash(ctx, w * 0.5, h * 0.4, 250, C.coral, 0.12);
        wcWash(ctx, w * 0.2, h * 0.3, 150, C.lavender, 0.1);
        drawPaperTexture(ctx, w, h);
        // Table with game pieces
        drawGround(ctx, w, h, h * 0.72, C.purpleLight, C.navy);
        // Game cards on table
        ctx.save();
        ctx.fillStyle = C.rgba(C.cream, 0.15);
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.translate(w * (0.2 + i * 0.15), h * 0.78);
            ctx.rotate(U.rand(-0.2, 0.2));
            fRR(ctx, -15, -20, 30, 40, 3, C.rgba(C.cream, 0.15));
            ctx.restore();
        }
        ctx.restore();
        // Heartbeat glow
        const hx = w / 2, hy = h * 0.42;
        wcWash(ctx, hx, hy, 80 * this.heartScale, C.coral, 0.25);
        // Pulsing heart
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(this.heartScale, this.heartScale);
        drawHeart(ctx, 0, 0, 1.5, C.coral, 0.8);
        // Inner glow
        drawHeart(ctx, 0, 0, 0.9, C.honey, 0.5);
        ctx.restore();
        // Characters
        const sc = Math.min(1.4, w / 280);
        drawBoy(ctx, w * 0.3, h * 0.52, sc, { expression: 'shy', blush: true });
        drawGirl(ctx, w * 0.7, h * 0.52, sc, { expression: 'happy', blush: true });
    }
    onDown(x, y) {
        const hx = this.g.w / 2, hy = this.g.h * 0.42;
        if (U.dist(x, y, hx, hy) < 50) {
            this.taps++;
            this.g.ps.spawn(x, y, 'heart', 10, { size: 5, color: C.coral, spread: 2.5, life: 2, gravity: -0.05 });
            this.g.ps.spawn(x, y, 'sparkle', 5, { size: 4, color: C.honey, spread: 2, life: 1.5, gravity: 0 });
            if (this.taps >= 3) { this.hint = ''; this.text = '心动，是藏不住的秘密'; this.t = 0; }
        }
    }
}

// ==================== SCENE 3: New Year Chat ====================
class S3 extends Scene {
    enter() { super.enter(); this.text = '除夕夜，屏幕那头的你问我有没有女朋友'; this.hint = '轻触消息气泡'; this.bubbles = []; this.tapped = 0; this.maxTaps = 4; this.genBubble(); }
    genBubble() {
        const msgs = ['在吗？', '有没有女朋友？', '...其实', '我也喜欢你'];
        if (this.bubbles.length < msgs.length) {
            this.bubbles.push({ x: U.rand(this.g.w * 0.15, this.g.w * 0.85), y: -40, text: msgs[this.bubbles.length], vy: 0, tapped: false, life: 0 });
        }
    }
    update(dt) {
        super.update(dt);
        if (this.t > (this.bubbles.length * 0.8) && this.bubbles.length < 4) this.genBubble();
        for (const b of this.bubbles) {
            b.life += dt;
            b.y = U.lerp(b.y, this.g.h * (0.25 + this.bubbles.indexOf(b) * 0.12), dt * 2);
        }
        if (this.tapped >= this.maxTaps && this.t > 1) this.done = true;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Night scene
        drawSky(ctx, w, h, C.navy, C.navyLight, C.purple);
        // Phone glow
        wcWash(ctx, w / 2, h * 0.5, 200, C.sky, 0.15);
        drawPaperTexture(ctx, w, h);
        // Stars
        if (!this.stars) this.stars = makeStars(w, h, 40, 1.5);
        drawStars(ctx, this.stars, U.T);
        // Fireworks
        const fwT = (U.T * 0.5) % 3;
        if (fwT < 0.1) {
            this.g.ps.spawn(U.rand(w * 0.2, w * 0.8), U.rand(h * 0.1, h * 0.3), 'sparkle', 15, { size: 4, color: U.rand(0,1) > 0.5 ? C.honey : C.coral, spread: 3, life: 1.5, gravity: 0.05 });
        }
        // Chat bubbles
        for (const b of this.bubbles) {
            const alpha = U.clamp(b.life * 2, 0, 1);
            ctx.save();
            ctx.globalAlpha = b.tapped ? alpha * 0.4 : alpha;
            // Bubble
            const bc = b.tapped ? C.rgba(C.gray, 0.3) : C.rgba(C.cream, 0.8);
            ctx.fillStyle = bc;
            ctx.filter = 'blur(0.5px)';
            fRR(ctx, b.x - 50, b.y - 18, 100, 36, 12, bc);
            ctx.restore();
            // Text
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = b.tapped ? C.gray : C.darkBrown;
            ctx.font = `14px ${FB}`;
            ctx.textAlign = 'center';
            ctx.fillText(b.text, b.x, b.y + 2);
            ctx.restore();
        }
        // Phone
        ctx.save();
        ctx.globalAlpha = 0.3;
        fRR(ctx, w/2 - 40, h * 0.7, 80, 14, 4, C.darkBrown);
        ctx.restore();
        // Characters
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.5, h * 0.62, sc, { expression: 'surprised', blush: true });
    }
    onDown(x, y) {
        for (const b of this.bubbles) {
            if (!b.tapped && U.dist(x, y, b.x, b.y) < 50) {
                b.tapped = true;
                this.tapped++;
                this.g.ps.spawn(b.x, b.y, 'sparkle', 6, { size: 3, color: C.honey, spread: 1.5, life: 1, gravity: 0 });
                if (this.tapped >= this.maxTaps) { this.hint = ''; this.text = '新年的钟声里，一切都有了答案'; this.t = 0; }
            }
        }
    }
}

// ==================== SCENE 4: Confirm Relationship (Spring) ====================
class S4 extends Scene {
    enter() { super.enter(); this.text = '春暖花开，我们正式在一起了'; this.hint = '拖动花瓣，拼出一颗心'; this.petals = []; this.target = { x: 0, y: 0 }; this.placed = 0; this.maxPetals = 5; this.dragPetal = null; }
    update(dt) {
        super.update(dt);
        this.target.x = this.g.w / 2; this.target.y = this.g.h * 0.42;
        // Spawn ambient petals
        if (Math.random() < 0.03) {
            this.petals.push({ x: U.rand(0, this.g.w), y: -20, vx: U.rand(-0.5, 0.5), vy: U.rand(0.5, 1.5), rot: 0, vrot: U.rand(-0.02, 0.02), placed: false, size: U.rand(8, 14) });
        }
        for (const p of this.petals) {
            if (!p.placed) {
                p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt; p.rot += p.vrot * 60 * dt;
                if (p.y > this.g.h + 20) p.y = -20;
            }
        }
        if (this.placed >= this.maxPetals && this.t > 1.5) this.done = true;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Spring sky
        drawSky(ctx, w, h, C.skyLight, C.sky, C.mint);
        wcWash(ctx, w * 0.3, h * 0.2, 200, C.sakura, 0.12);
        wcWash(ctx, w * 0.7, h * 0.25, 180, C.honey, 0.08);
        drawPaperTexture(ctx, w, h);
        // Ground (grass)
        drawGround(ctx, w, h, h * 0.75, C.mint, C.mintDeep);
        // Cherry blossom trees
        drawTree(ctx, w * 0.15, h * 0.6, 1.5, C.sakura);
        drawTree(ctx, w * 0.85, h * 0.6, 1.5, C.sakura);
        // Target heart outline
        if (this.placed < this.maxPetals) {
            ctx.save();
            ctx.globalAlpha = 0.2;
            drawHeart(ctx, this.target.x, this.target.y, 2, C.sakuraDeep, 0.3);
            ctx.restore();
        }
        // Placed petals forming heart
        for (let i = 0; i < this.placed; i++) {
            const angle = (i / this.maxPetals) * Math.PI * 2 - Math.PI/2;
            const r = 30;
            drawHeart(ctx, this.target.x + Math.cos(angle) * r, this.target.y + Math.sin(angle) * r, 0.6, C.sakuraDeep, 0.8);
        }
        // Falling petals
        for (const p of this.petals) {
            if (!p.placed) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = C.sakura;
                ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.6, p.size, 0, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            }
        }
        // Characters
        const sc = Math.min(1.4, w / 280);
        drawBoy(ctx, w * 0.35, h * 0.58, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.65, h * 0.58, sc, { expression: 'happy', blush: true });
    }
    onDown(x, y) {
        for (const p of this.petals) {
            if (!p.placed && U.dist(x, y, p.x, p.y) < 25) { this.dragPetal = p; break; }
        }
    }
    onMove(x, y) {
        if (this.dragPetal) { this.dragPetal.x = x; this.dragPetal.y = y; }
    }
    onUp(x, y) {
        if (this.dragPetal) {
            if (U.dist(x, y, this.target.x, this.target.y) < 60) {
                this.dragPetal.placed = true;
                this.placed++;
                this.g.ps.spawn(this.target.x, this.target.y, 'heart', 5, { size: 4, color: C.sakura, spread: 2, life: 1.5, gravity: -0.03 });
                if (this.placed >= this.maxPetals) { this.hint = ''; this.text = '从今天起，你是我的了'; this.t = 0; }
            }
            this.dragPetal = null;
        }
    }
}

// ==================== SCENE 5: Honeymoon (Beach) ====================
class S5 extends Scene {
    enter() { super.enter(); this.text = '海南的阳光和海浪，蜜月真好'; this.hint = '轻触海浪，听海的声音'; this.waveT = 0; this.taps = 0; this.maxTaps = 5; }
    update(dt) { super.update(dt); this.waveT += dt; if (this.taps >= this.maxTaps && this.t > 1.5) this.done = true; }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Tropical sky
        drawSky(ctx, w, h, C.skyLight, C.sky, C.sand);
        wcWash(ctx, w * 0.7, h * 0.15, 150, C.honey, 0.2);
        // Sun
        const sx = w * 0.75, sy = h * 0.2;
        wcWash(ctx, sx, sy, 80, C.honey, 0.3);
        fCircle(ctx, sx, sy, 30, C.honeyDeep);
        // Ocean
        const oceanY = h * 0.45;
        drawSky(ctx, w, h, C.sky, C.oceanLight, C.ocean);
        ctx.fillStyle = C.ocean;
        ctx.fillRect(0, oceanY, w, h * 0.25);
        // Wave animation
        ctx.strokeStyle = C.rgba(C.white, 0.3); ctx.lineWidth = 2;
        for (let layer = 0; layer < 3; layer++) {
            ctx.beginPath();
            for (let x = 0; x <= w; x += 5) {
                const wy = oceanY + 10 + layer * 15 + Math.sin(x * 0.02 + this.waveT * 2 + layer) * 6;
                if (x === 0) ctx.moveTo(x, wy);
                else ctx.lineTo(x, wy);
            }
            ctx.stroke();
        }
        // Beach
        drawGround(ctx, w, h, h * 0.7, C.sand, C.sandDeep);
        drawPaperTexture(ctx, w, h);
        // Palm tree
        ctx.save();
        ctx.translate(w * 0.1, h * 0.7);
        ctx.fillStyle = C.warmBrown;
        ctx.beginPath();
        ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-15, -40, -8, -80); ctx.lineTo(0, -80); ctx.quadraticCurveTo(-5, -40, 3, 0);
        ctx.fill();
        // Leaves
        for (let i = 0; i < 5; i++) {
            const la = (i / 5) * Math.PI - Math.PI/2;
            ctx.save();
            ctx.translate(0, -80);
            ctx.rotate(la);
            ctx.fillStyle = C.leaf;
            ctx.beginPath();
            ctx.ellipse(20, 0, 25, 8, 0, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
        // Characters with surfboards
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.3, h * 0.58, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.7, h * 0.58, sc, { expression: 'happy', blush: true });
        // Surfboard
        ctx.save();
        ctx.fillStyle = C.coral;
        ctx.filter = 'blur(0.5px)';
        fRR(ctx, w * 0.4, h * 0.66, w * 0.2, 6, 3, C.coral);
        ctx.restore();
    }
    onDown(x, y) {
        const oceanY = this.g.h * 0.45;
        if (y > oceanY && y < this.g.h * 0.7) {
            this.taps++;
            this.g.ps.spawn(x, y, 'splash', 8, { size: 4, color: C.oceanLight, spread: 2.5, life: 1, gravity: 0.1, vy: -2 });
            if (this.taps >= this.maxTaps) { this.hint = ''; this.text = '和你在一起的每一天都是蜜月'; this.t = 0; }
        }
    }
}

// ==================== SCENE 6: Cat Home ====================
class S6 extends Scene {
    enter() { super.enter(); this.text = '家里多了个小家伙，日子更热闹了'; this.hint = '轻轻抚摸小猫'; this.petT = 0; this.catX = 0; this.catY = 0; this.petting = false; this.petProgress = 0; }
    update(dt) {
        super.update(dt);
        this.catX = this.g.w * 0.5; this.catY = this.g.h * 0.6;
        if (this.petting) { this.petProgress += dt * 0.5; this.petT += dt; if (this.petProgress >= 1 && this.t > 1) this.done = true; }
        this.catBlink = Math.sin(this.t * 0.5) > 0.95;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Cozy interior
        drawSky(ctx, w, h, C.peachDeep, C.honey, C.cream);
        wcWash(ctx, w * 0.5, h * 0.3, 300, C.honey, 0.12);
        wcWash(ctx, w * 0.2, h * 0.4, 150, C.coral, 0.08);
        drawPaperTexture(ctx, w, h);
        drawGround(ctx, w, h, h * 0.72, C.warmBrown, C.darkBrown);
        // Cat tree
        ctx.save();
        ctx.fillStyle = C.warmBrown;
        fRR(ctx, w * 0.8 - 5, h * 0.4, 10, h * 0.32, 3, C.warmBrown);
        fCircle(ctx, w * 0.8, h * 0.4, 18, C.warmBrown);
        ctx.restore();
        // Window
        ctx.save();
        ctx.fillStyle = C.rgba(C.skyLight, 0.3);
        ctx.filter = 'blur(2px)';
        fRR(ctx, w * 0.1, h * 0.1, w * 0.2, h * 0.3, 10, C.rgba(C.skyLight, 0.3));
        ctx.restore();
        // Cat with pet feedback
        const purr = this.petting ? Math.sin(this.petT * 10) * 2 : 0;
        drawCat(ctx, this.catX, this.catY + purr, 1.8, { expression: this.petting ? 'enjoy' : 'curious', blink: this.catBlink });
        // Pet progress
        if (this.petting) {
            ctx.save();
            ctx.strokeStyle = C.coral; ctx.lineWidth = 4; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(this.catX, this.catY - 50, 30, -Math.PI/2, -Math.PI/2 + this.petProgress * Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            // Hearts from cat
            if (Math.random() < 0.1) this.g.ps.spawn(this.catX + U.rand(-20, 20), this.catY - 30, 'heart', 1, { size: 4, color: C.coral, vy: -1.5, life: 2, gravity: 0 });
        }
        // Characters
        const sc = Math.min(1.2, w / 320);
        drawBoy(ctx, w * 0.2, h * 0.55, sc, { expression: 'happy' });
        drawGirl(ctx, w * 0.8, h * 0.55, sc, { expression: 'happy', blush: true });
    }
    onDown(x, y) {
        if (U.dist(x, y, this.catX, this.catY) < 40) {
            this.petting = true; this.petT = 0;
            this.g.ps.spawn(x, y, 'sparkle', 4, { size: 3, color: C.honey, spread: 1, life: 1, gravity: 0 });
        }
    }
    onMove(x, y) { if (this.petting && U.dist(x, y, this.catX, this.catY) < 50) { if (Math.random() < 0.15) this.g.ps.spawn(x, y, 'heart', 1, { size: 3, color: C.coralLight, vy: -1, life: 1.5, gravity: 0 }); } }
    onUp() { if (this.petProgress >= 1) { this.hint = ''; this.text = '小家伙也很喜欢你们的小家'; this.t = 0; } }
}

// ==================== SCENE 7: Job Loss (Rainy Day) ====================
class S7 extends Scene {
    enter() { super.enter(); this.text = '那天下了很大的雨，你很难过'; this.hint = '轻轻擦去她的眼泪'; this.drops = []; this.tearWipe = 0; this.wiping = false; for (let i = 0; i < 80; i++) this.drops.push({ x: U.rand(0, 2000), y: U.rand(0, 600), speed: U.rand(200, 400), len: U.rand(10, 20), maxY: this.g.h }); }
    update(dt) { super.update(dt); if (this.tearWipe >= 1 && this.t > 1.5) this.done = true; }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Rainy gray-blue atmosphere
        drawSky(ctx, w, h, C.navyLight, C.gray, C.grayLight);
        wcWash(ctx, w * 0.5, h * 0.4, 250, C.navy, 0.1);
        drawPaperTexture(ctx, w, h);
        // Rain
        drawRaindrops(ctx, this.drops, U.T);
        drawGround(ctx, w, h, h * 0.72, C.gray, C.darkGray);
        // Umbrella over characters
        const ux = w / 2, uy = h * 0.35;
        ctx.save();
        ctx.fillStyle = C.coral;
        ctx.filter = 'blur(1px)';
        ctx.beginPath();
        ctx.ellipse(ux, uy, 80, 30, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = C.coralDeep;
        ctx.beginPath();
        ctx.ellipse(ux, uy, 80, 10, 0, Math.PI, 0);
        ctx.fill();
        ctx.restore();
        // Umbrella handle
        ctx.strokeStyle = C.warmBrown; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux, uy + 50); ctx.stroke();
        // Girl with tears
        const sc = Math.min(1.3, w / 300);
        drawGirl(ctx, w * 0.5, h * 0.52, sc, { expression: 'sad' });
        drawBoy(ctx, w * 0.5, h * 0.52, sc * 0.8, { expression: 'sad' });
        // Tears
        if (!this.wiping || this.tearWipe < 1) {
            const tearY = h * 0.5 + Math.sin(this.t * 2) * 3;
            ctx.save();
            ctx.fillStyle = C.rgba(C.sky, 0.5);
            ctx.filter = 'blur(0.5px)';
            for (let i = 0; i < 3 - Math.floor(this.tearWipe * 3); i++) {
                ctx.beginPath();
                ctx.ellipse(w * 0.5 - 10 + i * 10, tearY + 20 + i * 5, 2, 8, 0, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }
        // Wipe progress
        if (this.wiping) {
            ctx.save();
            ctx.strokeStyle = C.coral; ctx.lineWidth = 3;
            ctx.globalAlpha = 0.6;
            ctx.filter = 'blur(1px)';
            ctx.beginPath();
            ctx.arc(w * 0.5, h * 0.5, 35, -Math.PI/2, -Math.PI/2 + this.tearWipe * Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
    onDown(x, y) {
        if (U.dist(x, y, this.g.w * 0.5, this.g.h * 0.5) < 50) { this.wiping = true; }
    }
    onMove(x, y) {
        if (this.wiping) {
            if (U.dist(x, y, this.g.w * 0.5, this.g.h * 0.5) < 50) {
                this.tearWipe = Math.min(1, this.tearWipe + 0.02);
                if (Math.random() < 0.3) this.g.ps.spawn(x, y, 'sparkle', 2, { size: 2, color: C.skyLight, spread: 0.5, life: 0.8, gravity: 0 });
            }
        }
    }
    onUp() { if (this.tearWipe >= 1) { this.wiping = false; this.hint = ''; this.text = '别哭，有我在'; this.t = 0; this.g.ps.spawn(this.g.w/2, this.g.h*0.5, 'heart', 8, { size: 4, color: C.coral, spread: 2, life: 2, gravity: -0.03 }); } }
}

// ==================== SCENE 8: Self Media (Studio) ====================
class S8 extends Scene {
    enter() { super.enter(); this.text = '你开始创业做自媒体，闪闪发光'; this.hint = '轻触补光灯，拍下美好'; this.taps = 0; this.maxTaps = 4; this.flashT = 0; }
    update(dt) { super.update(dt); if (this.flashT > 0) this.flashT -= dt * 3; if (this.taps >= this.maxTaps && this.t > 1.5) this.done = true; }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Studio atmosphere
        drawSky(ctx, w, h, C.purpleLight, C.lavender, C.cream);
        wcWash(ctx, w * 0.3, h * 0.3, 200, C.lavender, 0.12);
        wcWash(ctx, w * 0.7, h * 0.2, 150, C.honey, 0.1);
        drawPaperTexture(ctx, w, h);
        drawGround(ctx, w, h, h * 0.72, C.lavenderDeep, C.purple);
        // Ring light
        const rx = w * 0.5, ry = h * 0.3;
        wcWash(ctx, rx, ry, 60, C.honey, 0.3);
        sCircle(ctx, rx, ry, 30, C.darkBrown, 4);
        fCircle(ctx, rx, ry, 25, C.rgba(C.honey, 0.3));
        // Light stand
        ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(rx, ry + 30); ctx.lineTo(rx, h * 0.72); ctx.stroke();
        ctx.fillStyle = C.darkBrown;
        ctx.beginPath(); ctx.moveTo(rx - 15, h * 0.72); ctx.lineTo(rx + 15, h * 0.72); ctx.lineTo(rx + 10, h * 0.72 + 5); ctx.lineTo(rx - 10, h * 0.72 + 5); ctx.fill();
        // Camera
        ctx.fillStyle = C.darkGray;
        fRR(ctx, w * 0.15 - 20, h * 0.5, 40, 25, 4, C.darkGray);
        fCircle(ctx, w * 0.15, h * 0.55, 10, C.navy);
        // Flash effect
        if (this.flashT > 0) {
            ctx.save();
            ctx.globalAlpha = this.flashT * 0.6;
            ctx.fillStyle = C.white;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }
        // Character (girl working)
        const sc = Math.min(1.3, w / 300);
        drawGirl(ctx, w * 0.55, h * 0.55, sc, { expression: 'happy', blush: true });
    }
    onDown(x, y) {
        const rx = this.g.w * 0.5, ry = this.g.h * 0.3;
        if (U.dist(x, y, rx, ry) < 45) {
            this.taps++;
            this.flashT = 1;
            this.g.ps.spawn(rx, ry, 'sparkle', 10, { size: 4, color: C.honey, spread: 3, life: 1.5, gravity: 0 });
            if (this.taps >= this.maxTaps) { this.hint = ''; this.text = '你认真的样子，真的很美'; this.t = 0; }
        }
    }
}

// ==================== SCENE 9: Fight ====================
class S9 extends Scene {
    enter() { super.enter(); this.text = '吵了一架，各自沉默'; this.hint = '把他们拖到一起'; this.boyX = 0; this.girlX = 0; this.targetX = 0; this.dragging = null; this.merged = false; }
    update(dt) {
        super.update(dt);
        const w = this.g.w;
        if (!this.boyX) { this.boyX = w * 0.2; this.girlX = w * 0.8; }
        this.targetX = w * 0.5;
        this.boyX = U.lerp(this.boyX, this.dragging === 'boy' ? this.boyX : (this.merged ? this.targetX - 40 : w * 0.2), dt * 3);
        this.girlX = U.lerp(this.girlX, this.dragging === 'girl' ? this.girlX : (this.merged ? this.targetX + 40 : w * 0.8), dt * 3);
        if (this.merged && this.t > 2) this.done = true;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Cold blue atmosphere
        drawSky(ctx, w, h, C.navy, C.navyLight, C.purple);
        wcWash(ctx, w * 0.3, h * 0.3, 200, C.navy, 0.08);
        wcWash(ctx, w * 0.7, h * 0.3, 200, C.purple, 0.08);
        drawPaperTexture(ctx, w, h);
        drawGround(ctx, w, h, h * 0.72, C.purple, C.navy);
        // Distance gap visualization
        if (!this.merged) {
            ctx.save();
            ctx.strokeStyle = C.rgba(C.gray, 0.15); ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(this.boyX, h * 0.55); ctx.lineTo(this.girlX, h * 0.55); ctx.stroke();
            ctx.restore();
        }
        // Characters
        const sc = Math.min(1.2, w / 320);
        const expr = this.merged ? 'happy' : 'sad';
        drawBoy(ctx, this.boyX, h * 0.52, sc, { expression: expr, blush: this.merged });
        drawGirl(ctx, this.girlX, h * 0.52, sc, { expression: expr, blush: this.merged });
        // Hearts when merged
        if (this.merged) {
            if (Math.random() < 0.08) this.g.ps.spawn(w * 0.5, h * 0.4, 'heart', 1, { size: 4, color: C.coral, vy: -1, life: 2, gravity: 0 });
        }
    }
    onDown(x, y) {
        const h = this.g.h;
        if (U.dist(x, y, this.boyX, h * 0.52) < 40) this.dragging = 'boy';
        else if (U.dist(x, y, this.girlX, h * 0.52) < 40) this.dragging = 'girl';
    }
    onMove(x, y) {
        if (this.dragging === 'boy') this.boyX = U.clamp(x, 0, this.girlX - 60);
        if (this.dragging === 'girl') this.girlX = U.clamp(x, this.boyX + 60, this.g.w);
    }
    onUp() {
        if (this.dragging) {
            if (Math.abs(this.boyX - this.girlX) < 90) {
                this.merged = true;
                this.hint = '';
                this.text = '和好如初，再也不放手';
                this.t = 0;
                this.g.ps.spawn(this.g.w / 2, this.g.h * 0.5, 'heart', 15, { size: 5, color: C.coral, spread: 3, life: 2.5, gravity: -0.05 });
            }
            this.dragging = null;
        }
    }
}

// ==================== SCENE 10: Reconciliation (Sunset) ====================
class S10 extends Scene {
    enter() { super.enter(); this.text = '夕阳下，一切都释然了'; this.hint = '轻触飘散的光点'; this.taps = 0; this.maxTaps = 6; }
    update(dt) {
        super.update(dt);
        if (Math.random() < 0.1) this.g.ps.spawn(U.rand(0, this.g.w), U.rand(0, this.g.h * 0.5), 'sparkle', 1, { size: 3, color: C.honey, vy: -0.5, life: 3, gravity: 0 });
        if (this.taps >= this.maxTaps && this.t > 1.5) this.done = true;
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Warm sunset
        drawSky(ctx, w, h, C.sunset, C.honey, C.coral);
        wcWash(ctx, w * 0.5, h * 0.25, 300, C.honey, 0.2);
        wcWash(ctx, w * 0.3, h * 0.4, 200, C.coral, 0.1);
        drawPaperTexture(ctx, w, h);
        drawGround(ctx, w, h, h * 0.72, C.sunsetDeep, C.darkBrown);
        // Sun
        const sx = w * 0.5, sy = h * 0.35;
        wcWash(ctx, sx, sy, 120, C.honey, 0.3);
        fCircle(ctx, sx, sy, 40, C.honeyDeep);
        // Clouds
        drawCloud(ctx, w * 0.2, h * 0.15, 1.2, C.coralLight);
        drawCloud(ctx, w * 0.8, h * 0.2, 1, C.honey);
        // Characters together
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.42, h * 0.55, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.58, h * 0.55, sc, { expression: 'happy', blush: true });
    }
    onDown(x, y) {
        this.taps++;
        this.g.ps.spawn(x, y, 'sparkle', 8, { size: 4, color: C.honey, spread: 2.5, life: 1.5, gravity: 0 });
        this.g.ps.spawn(x, y, 'heart', 3, { size: 4, color: C.coral, spread: 2, life: 2, gravity: -0.03 });
        if (this.taps >= this.maxTaps) { this.hint = ''; this.text = '余生很长，请多指教'; this.t = 0; }
    }
}

// ==================== SCENE 11: Late Home ====================
class S11 extends Scene {
    enter() { super.enter(); this.text = '加班到很晚回家，你和仙姑都在等我'; this.hint = '轻触窗户，点亮回家的灯'; this.lightsOn = false; this.lightT = 0; }
    update(dt) { super.update(dt); if (this.lightsOn) { this.lightT += dt; if (this.lightT > 2) this.done = true; } }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Night scene
        drawSky(ctx, w, h, C.navy, C.navyLight, C.purple);
        if (!this.stars) this.stars = makeStars(w, h, 50, 1.5);
        drawStars(ctx, this.stars, U.T);
        drawPaperTexture(ctx, w, h);
        drawGround(ctx, w, h, h * 0.72, C.purple, C.navy);
        // House
        const hx = w * 0.5, hy = h * 0.45;
        // House body
        ctx.fillStyle = C.warmBrown;
        fRR(ctx, hx - 60, hy, 120, 80, 5, C.warmBrown);
        // Roof
        ctx.fillStyle = C.darkBrown;
        ctx.beginPath();
        ctx.moveTo(hx - 70, hy); ctx.lineTo(hx, hy - 40); ctx.lineTo(hx + 70, hy);
        ctx.closePath(); ctx.fill();
        // Window
        const lit = this.lightsOn ? Math.min(1, this.lightT) : 0;
        ctx.fillStyle = lit > 0 ? C.honey : C.navyLight;
        fRR(ctx, hx - 20, hy + 15, 40, 35, 3, ctx.fillStyle);
        if (lit > 0) { wcWash(ctx, hx, hy + 30, 60, C.honey, 0.3 * lit); }
        // Door
        ctx.fillStyle = C.darkBrown;
        fRR(ctx, hx - 12, hy + 42, 24, 38, 2, C.darkBrown);
        // Light from window when on
        if (lit > 0) {
            ctx.save();
            ctx.globalAlpha = lit * 0.4;
            ctx.fillStyle = C.honey;
            ctx.filter = 'blur(10px)';
            ctx.beginPath();
            ctx.moveTo(hx, hy + 30);
            ctx.lineTo(hx - 80, h * 0.72);
            ctx.lineTo(hx + 80, h * 0.72);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // Girl at door
        const sc = Math.min(1.1, w / 350);
        if (lit > 0) drawGirl(ctx, hx, hy + 65, sc * 0.7, { expression: 'happy', blush: true });
        // Cat at door
        if (lit > 0) drawCat(ctx, hx + 30, hy + 70, sc * 0.4, { expression: 'enjoy' });
        // Boy walking home
        const walkProg = this.lightsOn ? U.clamp(this.lightT / 2, 0, 1) : 0;
        const boyX = U.lerp(w * 0.1, hx - 40, walkProg);
        drawBoy(ctx, boyX, h * 0.58, sc, { expression: this.lightsOn ? 'happy' : 'sad' });
    }
    onDown(x, y) {
        const hx = this.g.w * 0.5, hy = this.g.h * 0.45;
        if (!this.lightsOn && U.dist(x, y, hx, hy + 30) < 40) {
            this.lightsOn = true;
            this.hint = '';
            this.g.ps.spawn(hx, hy + 30, 'sparkle', 12, { size: 4, color: C.honey, spread: 2, life: 1.5, gravity: 0 });
        }
    }
}

// ==================== SCENE 12: Ending ====================
class S12 extends Scene {
    enter() { super.enter(); this.text = ''; this.hint = '轻触星空，许下心愿'; this.stars = makeStars(this.g.w, this.g.h, 80, 2.5); this.taps = 0; this.maxTaps = 8; this.ended = false; }
    update(dt) {
        super.update(dt);
        if (Math.random() < 0.08) this.g.ps.spawn(U.rand(0, this.g.w), U.rand(0, this.g.h * 0.6), 'star', 1, { size: 2, color: C.cream, vy: -0.3, life: 4, gravity: 0 });
        if (Math.random() < 0.05) this.g.ps.spawn(U.rand(0, this.g.w), U.rand(0, this.g.h * 0.5), 'heart', 1, { size: 3, color: C.coral, vy: -0.5, life: 4, gravity: -0.01 });
        if (this.taps >= this.maxTaps && !this.ended) {
            this.ended = true;
            this.text = '七夕快乐，未来的每一天都在一起';
            this.hint = '';
            for (let i = 0; i < 30; i++) this.g.ps.spawn(U.rand(0, this.g.w), U.rand(0, this.g.h * 0.7), 'heart', 1, { size: U.rand(4, 8), color: C.coral, spread: 2, life: 3, gravity: -0.02 });
        }
    }
    render(ctx) {
        const w = this.g.w, h = this.g.h;
        // Beautiful starry sky
        drawSky(ctx, w, h, C.navy, C.purple, C.purpleLight);
        wcWash(ctx, w * 0.3, h * 0.2, 200, C.lavender, 0.12);
        wcWash(ctx, w * 0.7, h * 0.15, 180, C.lavenderDeep, 0.1);
        drawStars(ctx, this.stars, U.T);
        drawPaperTexture(ctx, w, h);
        // Moon
        const mx = w * 0.8, my = h * 0.15;
        wcWash(ctx, mx, my, 50, C.cream, 0.2);
        fCircle(ctx, mx, my, 25, C.cream);
        // Characters
        const sc = Math.min(1.3, w / 300);
        drawBoy(ctx, w * 0.42, h * 0.58, sc, { expression: 'happy', blush: true });
        drawGirl(ctx, w * 0.58, h * 0.58, sc, { expression: 'happy', blush: true });
        // Big heart between them
        if (this.ended) {
            const pulse = 1 + Math.sin(this.t * 3) * 0.1;
            drawHeart(ctx, w / 2, h * 0.5, 2 * pulse, C.coral, 0.8);
        }
    }
    onDown(x, y) {
        if (!this.ended) {
            this.taps++;
            this.g.ps.spawn(x, y, 'star', 5, { size: 4, color: C.cream, spread: 2, life: 2, gravity: 0 });
            this.g.ps.spawn(x, y, 'sparkle', 3, { size: 3, color: C.honey, spread: 1.5, life: 1.5, gravity: 0 });
        }
    }
}

// ==================== MUSIC ====================
class Music {
    constructor() {
        this.audioCtx = null;
        this.muted = false;
        this.gain = null;
        this.melodyTimer = 0;
        this.noteIdx = 0;
    }
    play() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.gain = this.audioCtx.createGain();
            this.gain.gain.value = 0.08;
            this.gain.connect(this.audioCtx.destination);
            this.noteIdx = 0;
            this.melodyTimer = 0;
        } catch (e) {}
    }
    toggleMute() {
        this.muted = !this.muted;
        if (this.gain) this.gain.gain.value = this.muted ? 0 : 0.08;
    }
    update(dt) {
        if (!this.audioCtx || this.muted) return;
        this.melodyTimer -= dt;
        if (this.melodyTimer <= 0) {
            this.melodyTimer = 0.5;
            // Simple melody (pentatonic)
            const notes = [523, 587, 659, 784, 880, 988, 1047, 880, 784, 659, 587, 523];
            const freq = notes[this.noteIdx % notes.length];
            this.noteIdx++;
            const osc = this.audioCtx.createOscillator();
            const noteGain = this.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            noteGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
            noteGain.gain.linearRampToValueAtTime(0.5, this.audioCtx.currentTime + 0.05);
            noteGain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.45);
            osc.connect(noteGain);
            noteGain.connect(this.gain);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.5);
        }
    }
}

// ==================== GAME ENGINE ====================
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.w = 0; this.h = 0; this.dpr = 1;
        this.ps = new ParticleSystem();
        this.music = new Music();
        this.scenes = [
            new S0(this), new S1(this), new S2(this), new S3(this),
            new S4(this), new S5(this), new S6(this), new S7(this),
            new S8(this), new S9(this), new S10(this), new S11(this), new S12(this)
        ];
        this.currentScene = 0;
        this.state = 'loading';
        this.completionTimer = -1;
        this.completionHandled = false;
        this.fadeAlpha = 0;
        this.fadeDur = 0.6;
        this.lastTime = 0;
        this.audioStarted = false;
        this.pointerDown = false;
        this.px = 0; this.py = 0;
        this.ui = {};
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 100));
        this.setupInput();
        this.setupUI();
        this.scenes[0].enter();
        this.state = 'playing';
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
        setTimeout(() => this.hideLoading(), 2700);
    }

    hideLoading() {
        this.ui.loading.classList.add('hidden');
        setTimeout(() => {
            this.ui.loading.style.display = 'none';
            this.ui.overlay.style.display = 'block';
            this.updateUI();
        }, 800);
    }

    resize() {
        this.dpr = window.devicePixelRatio || 1;
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.canvas.width = this.w * this.dpr;
        this.canvas.height = this.h * this.dpr;
        this.canvas.style.width = this.w + 'px';
        this.canvas.style.height = this.h + 'px';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    setupInput() {
        this.canvas.addEventListener('pointerdown', (e) => this.onPointer(e, 'down'));
        this.canvas.addEventListener('pointermove', (e) => this.onPointer(e, 'move'));
        this.canvas.addEventListener('pointerup', (e) => this.onPointer(e, 'up'));
        this.canvas.addEventListener('pointercancel', (e) => this.onPointer(e, 'up'));
        this.canvas.addEventListener('pointerleave', (e) => { if (this.pointerDown) this.onPointer(e, 'up'); });
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('gesturestart', (e) => e.preventDefault());
        document.addEventListener('dblclick', (e) => e.preventDefault());
        document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: true });
    }

    onPointer(e, type) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (type === 'down') {
            this.pointerDown = true;
            this.px = x; this.py = y;
            if (this.state === 'playing') {
                this.scenes[this.currentScene].onDown(x, y);
                if (!this.audioStarted) { this.music.play(); this.audioStarted = true; }
            }
        } else if (type === 'move') {
            if (this.pointerDown && this.state === 'playing') {
                this.scenes[this.currentScene].onMove(x, y);
            }
            this.px = x; this.py = y;
        } else if (type === 'up') {
            this.pointerDown = false;
            if (this.state === 'playing') {
                this.scenes[this.currentScene].onUp(x, y);
            }
        }
    }

    setupUI() {
        this.ui.loading = document.getElementById('loading-screen');
        this.ui.overlay = document.getElementById('ui-overlay');
        this.ui.musicBtn = document.getElementById('music-btn');
        this.ui.progressDots = document.getElementById('progress-dots');
        this.ui.sceneText = document.getElementById('scene-text');
        this.ui.hintText = document.getElementById('hint-text');
        if (this.ui.musicBtn) {
            this.ui.musicBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.music.toggleMute();
                this.ui.musicBtn.classList.toggle('muted');
            });
        }
    }

    updateUI() {
        this.ui.progressDots.innerHTML = '';
        for (let i = 0; i < this.scenes.length; i++) {
            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            if (i < this.currentScene) dot.classList.add('done');
            if (i === this.currentScene) dot.classList.add('active');
            this.ui.progressDots.appendChild(dot);
        }
        this.setSceneText(this.scenes[this.currentScene].text);
        this.setHint(this.scenes[this.currentScene].hint);
    }

    setSceneText(text) {
        this.ui.sceneText.classList.remove('show');
        setTimeout(() => {
            this.ui.sceneText.textContent = text || '';
            if (text) this.ui.sceneText.classList.add('show');
        }, 400);
    }

    setHint(hint) {
        this.ui.hintText.textContent = hint || '';
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;
        U.T = timestamp / 1000;
        try { this.update(dt); } catch (e) { console.error('Update error:', e); }
        try { this.render(); } catch (e) { console.error('Render error:', e); }
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        this.ps.update(dt);
        this.music.update(dt);

        if (this.state === 'playing') {
            this.scenes[this.currentScene].update(dt);
            if (this.scenes[this.currentScene].done && !this.completionHandled) {
                this.completionHandled = true;
                if (this.currentScene < this.scenes.length - 1) {
                    this.completionTimer = 0;
                }
            }
            if (this.completionTimer >= 0) {
                this.completionTimer += dt;
                if (this.completionTimer >= 2.0) {
                    this.completionTimer = -1;
                    this.state = 'fadeOut';
                    this.fadeAlpha = 0;
                }
            }
        } else if (this.state === 'fadeOut') {
            this.fadeAlpha += dt / this.fadeDur;
            if (this.fadeAlpha >= 1) {
                this.fadeAlpha = 1;
                this.scenes[this.currentScene].exit();
                this.currentScene++;
                this.scenes[this.currentScene].enter();
                this.completionHandled = false;
                this.updateUI();
                this.state = 'fadeIn';
            }
        } else if (this.state === 'fadeIn') {
            this.scenes[this.currentScene].update(dt);
            this.fadeAlpha -= dt / this.fadeDur;
            if (this.fadeAlpha <= 0) {
                this.fadeAlpha = 0;
                this.state = 'playing';
            }
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.w, this.h);
        this.scenes[this.currentScene].render(ctx);
        this.ps.render(ctx);
        if (this.state === 'fadeOut' || this.state === 'fadeIn') {
            ctx.fillStyle = `rgba(0,0,0,${this.fadeAlpha})`;
            ctx.fillRect(0, 0, this.w, this.h);
        }
    }
}

// ==================== BOOTSTRAP ====================
window.addEventListener('load', function () {
    new Game().init();
});