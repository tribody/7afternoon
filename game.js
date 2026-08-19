'use strict';

// ============================================================
//  Canvas Interactive Story Game - Qixi Festival Surprise
//  Pure HTML5 Canvas, no frameworks
// ============================================================

// ==================== COLOR CONSTANTS ====================
const C = {
    cream: '#FFF8F0',
    warmWhite: '#FFFDF9',
    peach: '#FFD4B8',
    coral: '#FF8B7B',
    coralLight: '#FFB5A0',
    honey: '#FFC857',
    warmBrown: '#8B6F5C',
    darkBrown: '#5C4033',
    skin: '#FFD4B8',
    white: '#FFFFFF',
    navy: '#2A2050',
    purple: '#3A2C5C',
    gray: '#6B6B80',
    darkGray: '#3D3D4A',
    sky: '#4A90D9',
    ocean: '#2E86AB',
    sand: '#F4E4BC',
    leaf: '#7CB342',
    rose: '#E91E63',
    gold: '#FFD700'
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
    T: 0
};

// ==================== DRAWING HELPERS ====================
function fRect(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
}

function fCircle(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function sCircle(ctx, x, y, r, c, lw) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
}

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

function fRR(ctx, x, y, w, h, r, c) {
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = c;
    ctx.fill();
}

function sRR(ctx, x, y, w, h, r, c, lw) {
    rrPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = c;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
}

function heartPath(ctx, x, y, s) {
    const ty = y - s * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, ty + s * 0.3);
    ctx.bezierCurveTo(x, ty, x - s, ty, x - s, ty + s * 0.3);
    ctx.bezierCurveTo(x - s, ty + s * 0.6, x - s * 0.5, ty + s * 0.9, x, ty + s * 1.2);
    ctx.bezierCurveTo(x + s * 0.5, ty + s * 0.9, x + s, ty + s * 0.6, x + s, ty + s * 0.3);
    ctx.bezierCurveTo(x + s, ty, x, ty, x, ty + s * 0.3);
    ctx.closePath();
}

function fHeart(ctx, x, y, s, c) {
    heartPath(ctx, x, y, s);
    ctx.fillStyle = c;
    ctx.fill();
}

function starPath(ctx, x, y, r, p) {
    p = p || 5;
    ctx.beginPath();
    for (let i = 0; i < p * 2; i++) {
        const a = (i * Math.PI) / p - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function fStar(ctx, x, y, r, c) {
    starPath(ctx, x, y, r, 5);
    ctx.fillStyle = c;
    ctx.fill();
}

function dLine(ctx, x1, y1, x2, y2, c, w) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w || 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function dCurve(ctx, x1, y1, cx, cy, x2, y2, c, w) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w || 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
}

function fText(ctx, t, x, y, font, c, align, bl) {
    ctx.fillStyle = c;
    ctx.font = font;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = bl || 'alphabetic';
    ctx.fillText(t, x, y);
}

function gradV(ctx, w, h, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
}

function gradD(ctx, w, h, stops, angle) {
    const x1 = Math.cos(angle) * h / 2;
    const y1 = Math.sin(angle) * h / 2;
    const g = ctx.createLinearGradient(w / 2 - x1, h / 2 - y1, w / 2 + x1, h / 2 + y1);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
}

// ==================== PARTICLE SYSTEM ====================
class Particle {
    constructor(x, y, vx, vy, life, size, color, type) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.size = size; this.color = color;
        this.type = type;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 4;
        this.twinkle = Math.random() * Math.PI * 2;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.rotation += this.rotSpeed * dt;
        this.twinkle += dt * 8;

        if (this.type === 'heart') {
            this.vy -= 40 * dt;
            this.vx *= 0.98;
        } else if (this.type === 'petal') {
            this.vy += 30 * dt;
            this.vx += Math.sin(this.life * 3) * 15 * dt;
        } else if (this.type === 'star') {
            this.vx *= 0.95;
            this.vy *= 0.95;
        } else if (this.type === 'splash') {
            this.vy += 350 * dt;
        } else if (this.type === 'gold') {
            this.vx *= 0.96;
            this.vy *= 0.96;
        } else if (this.type === 'firework') {
            this.vy += 60 * dt;
            this.vx *= 0.98;
        }

        this.life -= dt;
    }

    render(ctx) {
        const a = Math.max(0, this.life / this.maxLife);
        ctx.save();
        ctx.globalAlpha = a;

        if (this.type === 'heart') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            fHeart(ctx, 0, 0, this.size, this.color);
        } else if (this.type === 'petal') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size, this.size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'star') {
            const tw = Math.sin(this.twinkle) * 0.3 + 0.7;
            ctx.globalAlpha = a * tw;
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            fStar(ctx, 0, 0, this.size, this.color);
        } else if (this.type === 'splash') {
            fCircle(ctx, this.x, this.y, this.size, this.color);
        } else if (this.type === 'gold') {
            const sp = Math.sin(this.twinkle) * 0.5 + 0.5;
            ctx.globalAlpha = a * sp;
            ctx.translate(this.x, this.y);
            fStar(ctx, 0, 0, this.size, 4);
            ctx.fillStyle = this.color;
        } else if (this.type === 'firework') {
            ctx.translate(this.x, this.y);
            fCircle(ctx, 0, 0, this.size, this.color);
            ctx.globalAlpha = a * 0.5;
            fCircle(ctx, 0, 0, this.size * 2, this.color);
        }

        ctx.restore();
    }

    get dead() { return this.life <= 0; }
}

class ParticleSystem {
    constructor() {
        this.list = [];
    }

    spawn(type, x, y, count, opts) {
        opts = opts || {};
        const colors = opts.colors || ['#FF8B7B', '#FFC857', '#FFD4B8', '#FFB5A0'];
        const speed = opts.speed || 100;
        const life = opts.life || 2;
        const size = opts.size || 8;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = speed * (0.5 + Math.random() * 0.5);
            const c = colors[Math.floor(Math.random() * colors.length)];
            this.list.push(new Particle(
                x + (Math.random() - 0.5) * 20,
                y + (Math.random() - 0.5) * 20,
                Math.cos(a) * sp,
                Math.sin(a) * sp,
                life * (0.7 + Math.random() * 0.6),
                size * (0.6 + Math.random() * 0.8),
                c, type
            ));
        }
    }

    burstHearts(x, y, count) {
        for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
            const sp = U.rand(60, 140);
            this.list.push(new Particle(
                x + U.rand(-30, 30), y + U.rand(-20, 20),
                Math.cos(a) * sp, Math.sin(a) * sp - 30,
                U.rand(1.5, 3), U.rand(5, 12),
                ['#FF8B7B', '#FFB5A0', '#E91E63'][U.randInt(0, 2)], 'heart'
            ));
        }
    }

    burstStars(x, y, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = U.rand(50, 150);
            this.list.push(new Particle(
                x, y,
                Math.cos(a) * sp, Math.sin(a) * sp,
                U.rand(1, 2), U.rand(4, 10),
                ['#FFC857', '#FFF8F0', '#FFD700'][U.randInt(0, 2)], 'star'
            ));
        }
    }

    burstSplash(x, y, count) {
        for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const sp = U.rand(80, 200);
            this.list.push(new Particle(
                x, y,
                Math.cos(a) * sp, Math.sin(a) * sp - 50,
                U.rand(0.8, 1.5), U.rand(3, 8),
                '#4A90D9', 'splash'
            ));
        }
    }

    burstGold(x, y, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = U.rand(20, 60);
            this.list.push(new Particle(
                x + U.rand(-20, 20), y + U.rand(-20, 20),
                Math.cos(a) * sp, Math.sin(a) * sp,
                U.rand(1, 2.5), U.rand(3, 8),
                '#FFD700', 'gold'
            ));
        }
    }

    rainHearts(w, count) {
        for (let i = 0; i < count; i++) {
            this.list.push(new Particle(
                U.rand(0, w), -20,
                U.rand(-20, 20), U.rand(30, 80),
                U.rand(3, 6), U.rand(6, 14),
                ['#FF8B7B', '#FFB5A0', '#E91E63', '#FFC857'][U.randInt(0, 3)], 'heart'
            ));
        }
    }

    firework(x, y) {
        const colors = ['#FF8B7B', '#FFC857', '#FFD4B8', '#4A90D9', '#7CB342', '#E91E63', '#FFD700'];
        const c = colors[U.randInt(0, colors.length - 1)];
        for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2;
            const sp = U.rand(80, 180);
            this.list.push(new Particle(
                x, y,
                Math.cos(a) * sp, Math.sin(a) * sp,
                U.rand(1.5, 3), U.rand(3, 7),
                c, 'firework'
            ));
        }
    }

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            this.list[i].update(dt);
            if (this.list[i].dead) this.list.splice(i, 1);
        }
    }

    render(ctx) {
        for (const p of this.list) p.render(ctx);
    }

    clear() { this.list = []; }
}

// ==================== CHARACTER DRAWING ====================
function drawBoy(ctx, x, y, s, o) {
    o = o || {};
    const expr = o.expression || 'happy';
    const blink = o.blink || false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sk = C.peach, hr = C.darkBrown, sh = C.coral;

    // Legs
    ctx.strokeStyle = C.warmBrown; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, 68); ctx.lineTo(-9, 90);
    ctx.moveTo(9, 68); ctx.lineTo(9, 90);
    ctx.stroke();
    fCircle(ctx, -9, 92, 6, C.darkBrown);
    fCircle(ctx, 9, 92, 6, C.darkBrown);

    // Body
    fRR(ctx, -20, 32, 40, 40, 12, sh);

    // Arms
    ctx.strokeStyle = sh; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-20, 38); ctx.quadraticCurveTo(-32, 48, -28, 62);
    ctx.moveTo(20, 38); ctx.quadraticCurveTo(32, 48, 28, 62);
    ctx.stroke();
    fCircle(ctx, -28, 64, 5, sk);
    fCircle(ctx, 28, 64, 5, sk);

    // Neck
    fRect(ctx, -5, 26, 10, 10, sk);

    // Head
    fCircle(ctx, 0, 5, 26, sk);

    // Hair
    ctx.fillStyle = hr;
    ctx.beginPath();
    ctx.arc(0, 5, 26, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-12, -12, 9, 10, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -12, 9, 10, 0.2, 0, Math.PI * 2); ctx.fill();

    // Eyes
    if (!blink) {
        fCircle(ctx, -9, 5, 3.5, C.darkBrown);
        fCircle(ctx, 9, 5, 3.5, C.darkBrown);
        fCircle(ctx, -8, 4, 1.2, C.white);
        fCircle(ctx, 10, 4, 1.2, C.white);
    } else {
        ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-9, 5, 4, 0, Math.PI); ctx.stroke();
        ctx.beginPath();
        ctx.arc(9, 5, 4, 0, Math.PI); ctx.stroke();
    }

    // Mouth
    ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (expr === 'happy') {
        ctx.beginPath(); ctx.arc(0, 14, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    } else if (expr === 'sad') {
        ctx.beginPath(); ctx.arc(0, 20, 5, Math.PI + 0.2, Math.PI * 2 - 0.2); ctx.stroke();
    } else if (expr === 'surprised') {
        fCircle(ctx, 0, 14, 3, C.darkBrown);
    }

    // Blush
    if (o.blush) {
        fCircle(ctx, -14, 12, 3, 'rgba(255,139,123,0.3)');
        fCircle(ctx, 14, 12, 3, 'rgba(255,139,123,0.3)');
    }
    ctx.restore();
}

function drawGirl(ctx, x, y, s, o) {
    o = o || {};
    const expr = o.expression || 'happy';
    const blink = o.blink || false;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sk = C.peach, hr = C.darkBrown, dr = C.honey;

    // Legs
    ctx.strokeStyle = C.warmBrown; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, 68); ctx.lineTo(-9, 90);
    ctx.moveTo(9, 68); ctx.lineTo(9, 90);
    ctx.stroke();
    fCircle(ctx, -9, 92, 6, C.darkBrown);
    fCircle(ctx, 9, 92, 6, C.darkBrown);

    // Long hair behind body
    ctx.fillStyle = hr;
    ctx.beginPath(); ctx.ellipse(-22, 30, 8, 35, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, 30, 8, 35, 0.1, 0, Math.PI * 2); ctx.fill();

    // Body (dress)
    fRR(ctx, -20, 32, 40, 40, 12, dr);

    // Arms
    ctx.strokeStyle = dr; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-20, 38); ctx.quadraticCurveTo(-32, 48, -28, 62);
    ctx.moveTo(20, 38); ctx.quadraticCurveTo(32, 48, 28, 62);
    ctx.stroke();
    fCircle(ctx, -28, 64, 5, sk);
    fCircle(ctx, 28, 64, 5, sk);

    // Neck
    fRect(ctx, -5, 26, 10, 10, sk);

    // Long hair behind head
    ctx.fillStyle = hr;
    ctx.beginPath(); ctx.ellipse(-18, 5, 10, 28, -0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, 5, 10, 28, 0.05, 0, Math.PI * 2); ctx.fill();

    // Head
    fCircle(ctx, 0, 5, 26, sk);

    // Hair top
    ctx.fillStyle = hr;
    ctx.beginPath(); ctx.arc(0, 5, 26, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-10, -10, 12, 10, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -10, 12, 10, 0.1, 0, Math.PI * 2); ctx.fill();

    // Glasses
    ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-9, 5, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, 5, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, 5); ctx.lineTo(1, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-17, 3); ctx.lineTo(-22, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17, 3); ctx.lineTo(22, 0); ctx.stroke();

    // Eyes behind glasses
    if (!blink) {
        fCircle(ctx, -9, 5, 3, C.darkBrown);
        fCircle(ctx, 9, 5, 3, C.darkBrown);
        fCircle(ctx, -8, 4, 1, C.white);
        fCircle(ctx, 10, 4, 1, C.white);
    } else {
        ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-9, 5, 4, 0, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(9, 5, 4, 0, Math.PI); ctx.stroke();
    }

    // Mouth
    ctx.strokeStyle = C.darkBrown; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (expr === 'happy' || expr === 'smile') {
        ctx.beginPath(); ctx.arc(0, 16, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    } else if (expr === 'sad') {
        ctx.beginPath(); ctx.arc(0, 22, 4, Math.PI + 0.2, Math.PI * 2 - 0.2); ctx.stroke();
    }

    // Blush
    if (o.blush) {
        fCircle(ctx, -15, 13, 3, 'rgba(255,139,123,0.3)');
        fCircle(ctx, 15, 13, 3, 'rgba(255,139,123,0.3)');
    }
    ctx.restore();
}

function drawCat(ctx, x, y, s, o) {
    o = o || {};
    const expr = o.expression || 'enjoy';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const bd = '#D4A574', dk = C.darkBrown;

    // Tail
    ctx.strokeStyle = bd; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.quadraticCurveTo(40, 10, 35, -10);
    ctx.stroke();

    // Body
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.ellipse(0, 20, 25, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    fCircle(ctx, 0, -10, 22, bd);

    // Ears
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.moveTo(-18, -22); ctx.lineTo(-12, -38); ctx.lineTo(-5, -25);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -22); ctx.lineTo(12, -38); ctx.lineTo(5, -25);
    ctx.closePath(); ctx.fill();

    // Inner ears
    ctx.fillStyle = '#FFB5A0';
    ctx.beginPath();
    ctx.moveTo(-15, -24); ctx.lineTo(-12, -33); ctx.lineTo(-8, -26);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -24); ctx.lineTo(12, -33); ctx.lineTo(8, -26);
    ctx.closePath(); ctx.fill();

    // Eyes
    ctx.strokeStyle = dk; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (expr === 'enjoy') {
        ctx.beginPath(); ctx.arc(-8, -8, 5, 0.3, Math.PI - 0.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(8, -8, 5, 0.3, Math.PI - 0.3); ctx.stroke();
    } else {
        fCircle(ctx, -8, -8, 3, dk);
        fCircle(ctx, 8, -8, 3, dk);
        fCircle(ctx, -7, -9, 1, C.white);
        fCircle(ctx, 9, -9, 1, C.white);
    }

    // Nose
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.lineTo(0, 3);
    ctx.closePath(); ctx.fill();

    // Mouth
    ctx.strokeStyle = dk; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 3); ctx.lineTo(0, 6);
    ctx.moveTo(0, 6); ctx.arc(-3, 6, 3, 0, Math.PI * 0.5);
    ctx.moveTo(0, 6); ctx.arc(3, 6, 3, Math.PI * 0.5, Math.PI);
    ctx.stroke();

    // Whiskers
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, 2); ctx.lineTo(-22, 0);
    ctx.moveTo(-10, 4); ctx.lineTo(-22, 5);
    ctx.moveTo(10, 2); ctx.lineTo(22, 0);
    ctx.moveTo(10, 4); ctx.lineTo(22, 5);
    ctx.stroke();

    // Stripes
    ctx.strokeStyle = '#B8896B'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -28); ctx.lineTo(-5, -22);
    ctx.moveTo(5, -28); ctx.lineTo(5, -22);
    ctx.moveTo(0, -30); ctx.lineTo(0, -25);
    ctx.stroke();

    ctx.restore();
}

// ==================== BACKGROUND HELPERS ====================
function makeStars(w, h, count, maxR) {
    const stars = [];
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * w,
            y: Math.random() * h * 0.7,
            r: Math.random() * (maxR || 2) + 0.5,
            p: Math.random() * Math.PI * 2,
            s: Math.random() * 2 + 1
        });
    }
    return stars;
}

function drawStars(ctx, stars, t) {
    for (const s of stars) {
        const tw = Math.sin(t * s.s + s.p) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,248,240,${tw * 0.9})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.5 && tw > 0.7) {
            ctx.strokeStyle = `rgba(255,248,240,${(tw - 0.7) * 0.5})`;
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

// ==================== SCENE BASE CLASS ====================
class Scene {
    constructor(g) {
        this.g = g;
        this.done = false;
        this.t = 0;
        this.hint = '';
        this.text = '';
    }
    enter() { this.t = 0; this.done = false; }
    exit() {}
    update(dt) { this.t += dt; }
    render(ctx) {}
    onDown(x, y) {}
    onMove(x, y) {}
    onUp(x, y) {}
}

// ==================== SCENE 0: Envelope ====================
class S0 extends Scene {
    constructor(g) { super(g); this.hint = '点击信封打开'; this.text = '你有一封未读信件 · 来自一个爱你的人'; }
    enter() { super.enter(); this.state = 'closed'; this.openP = 0; this.stars = makeStars(this.g.w, this.g.h, 60, 2); }
    update(dt) {
        super.update(dt);
        if (this.state === 'opening') {
            this.openP += dt * 1.5;
            if (this.openP >= 1) {
                this.openP = 1; this.state = 'opened';
                const cx = this.g.w / 2, cy = this.g.h / 2;
                this.g.ps.burstHearts(cx, cy, 25);
                this.g.ps.burstStars(cx, cy, 20);
                this.done = true;
            }
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#1a1530'],[0.5,'#2e2348'],[1,'#3a2c5c']]));
        drawStars(ctx, this.stars, this.t);
        const cx = this.g.w / 2, cy = this.g.h / 2 + Math.sin(this.t * 1.5) * 10;
        const ew = Math.min(140, this.g.w * 0.35), eh = ew * 0.65;
        const gr = 80 + Math.sin(this.t * 2) * 10;
        const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
        gg.addColorStop(0, 'rgba(255,200,87,0.25)'); gg.addColorStop(1, 'rgba(255,200,87,0)');
        ctx.fillStyle = gg; ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
        if (this.state !== 'opened') {
            fRR(ctx, cx - ew/2, cy - eh/2, ew, eh, 8, C.cream);
            const fa = this.state === 'opening' ? U.lerp(0, Math.PI * 0.7, this.openP) : 0;
            ctx.save(); ctx.translate(cx, cy - eh/2); ctx.rotate(fa);
            ctx.fillStyle = C.peach; ctx.beginPath();
            ctx.moveTo(-ew/2, 0); ctx.lineTo(ew/2, 0); ctx.lineTo(0, eh * 0.5); ctx.closePath(); ctx.fill();
            ctx.restore();
            if (this.state === 'closed') { fCircle(ctx, cx, cy, 12, C.coral); fCircle(ctx, cx, cy, 8, C.coralLight); }
            fHeart(ctx, cx, cy, 5, C.white);
        }
        if (this.openP > 0) {
            const br = this.openP * 250;
            const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, br);
            bg.addColorStop(0, `rgba(255,248,240,${0.5 * this.openP})`);
            bg.addColorStop(0.5, `rgba(255,200,87,${0.25 * this.openP})`);
            bg.addColorStop(1, 'rgba(255,200,87,0)');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, this.g.w, this.g.h);
        }
    }
    onDown(x, y) {
        if (this.state === 'closed') {
            if (U.dist(x, y, this.g.w/2, this.g.h/2) < 80) { this.state = 'opening'; this.g.music.play(); }
        }
    }
}

// ==================== SCENE 1: Door ====================
class S1 extends Scene {
    constructor(g) { super(g); this.hint = '向左滑动推开门'; this.text = '初次相遇 · 一眼万年'; }
    enter() { super.enter(); this.state = 'closed'; this.doorOpen = 0; this.swiping = false; this.startX = 0; }
    update(dt) {
        super.update(dt);
        if (this.state === 'closing') { this.doorOpen -= dt * 3; if (this.doorOpen <= 0) { this.doorOpen = 0; this.state = 'closed'; } }
        if (this.state === 'opened' && !this.done) { this.done = true; }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#FFB5A0'],[0.5,'#FF8B7B'],[1,'#FFD4B8']]));
        const cx = this.g.w / 2, cy = this.g.h / 2;
        const dw = Math.min(160, this.g.w * 0.4), dh = dw * 1.6;
        // Door frame
        fRR(ctx, cx - dw/2 - 12, cy - dh/2 - 12, dw + 24, dh + 24, 6, C.warmBrown);
        // Door opening (dark)
        fRect(ctx, cx - dw/2, cy - dh/2, dw, dh, '#2a1a0a');
        // Light from opening
        if (this.doorOpen > 0) {
            const lg = ctx.createLinearGradient(cx, cy, cx, cy);
            ctx.save();
            const rays = 8;
            for (let i = 0; i < rays; i++) {
                const a = (i / rays - 0.5) * Math.PI * 0.6;
                const len = 200 * this.doorOpen;
                ctx.fillStyle = `rgba(255,200,87,${0.15 * this.doorOpen})`;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a - Math.PI/2) * len, cy + Math.sin(a - Math.PI/2) * len);
                ctx.lineTo(cx + Math.cos(a + Math.PI/rays - Math.PI/2) * len, cy + Math.sin(a + Math.PI/rays - Math.PI/2) * len);
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        }
        // Door panel (swings open)
        ctx.save();
        ctx.translate(cx, cy);
        const angle = this.doorOpen * Math.PI * 0.4;
        ctx.transform(Math.cos(angle * 0.5), 0, 0, 1, -dw/2 * (1 - this.doorOpen), 0);
        fRR(ctx, -dw/2, -dh/2, dw, dh, 4, C.warmBrown);
        fRR(ctx, -dw/2 + 10, -dh/2 + 10, dw - 20, dh/3 - 5, 4, C.darkBrown);
        fRR(ctx, -dw/2 + 10, -dh/2 + dh/3 + 5, dw - 20, dh/3 - 5, 4, C.darkBrown);
        fRR(ctx, -dw/2 + 10, -dh/2 + dh*2/3 + 5, dw - 20, dh/3 - 15, 4, C.darkBrown);
        fCircle(ctx, dw/2 - 15, 0, 5, C.honey);
        ctx.restore();
    }
    onDown(x, y) { if (this.state === 'closed') { this.swiping = true; this.startX = x; } }
    onMove(x, y) {
        if (this.swiping && this.state === 'closed') {
            const dx = x - this.startX;
            this.doorOpen = U.clamp(-dx / 120, 0, 1);
            if (this.doorOpen >= 1) {
                this.state = 'opened'; this.swiping = false;
                this.g.ps.burstStars(this.g.w/2, this.g.h/2, 25);
                this.g.ps.spawn('gold', this.g.w/2, this.g.h/2, 15, {speed: 120, life: 2, size: 6});
            }
        }
    }
    onUp(x, y) { if (this.swiping && this.doorOpen < 1) { this.state = 'closing'; } this.swiping = false; }
}

// ==================== SCENE 2: Card Flip ====================
class S2 extends Scene {
    constructor(g) { super(g); this.hint = '点击翻开角色卡'; this.text = '剧本杀那晚 · 我心动了'; }
    enter() { super.enter(); this.state = 'down'; this.flipP = 0; }
    update(dt) {
        super.update(dt);
        if (this.state === 'flipping') {
            this.flipP += dt * 2;
            if (this.flipP >= 1) { this.flipP = 1; this.state = 'up'; this.g.ps.burstStars(this.g.w/2, this.g.h/2, 20); this.done = true; }
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#3D2B2B'],[0.5,'#5C3D3D'],[1,'#3D2B2B']]));
        const cx = this.g.w / 2, cy = this.g.h / 2;
        const cw = Math.min(140, this.g.w * 0.35), ch = cw * 1.4;
        ctx.save();
        ctx.translate(cx, cy);
        const p = this.state === 'down' ? 0 : this.flipP;
        const sx = Math.abs(Math.cos(p * Math.PI));
        ctx.scale(sx, 1);
        if (p < 0.5) {
            // Back of card
            fRR(ctx, -cw/2, -ch/2, cw, ch, 10, C.darkBrown);
            fRR(ctx, -cw/2 + 8, -ch/2 + 8, cw - 16, ch - 16, 6, C.warmBrown);
            ctx.strokeStyle = C.honey; ctx.lineWidth = 1.5;
            for (let i = -2; i <= 2; i++) { dLine(ctx, -cw/3, i * 20, cw/3, i * 20, C.honey, 1); }
            fHeart(ctx, 0, 0, 12, C.coral);
        } else {
            // Front of card
            fRR(ctx, -cw/2, -ch/2, cw, ch, 10, C.cream);
            fRR(ctx, -cw/2 + 8, -ch/2 + 8, cw - 16, ch - 16, 6, C.warmWhite);
            fHeart(ctx, 0, -10, 20, C.rose);
            fText(ctx, '心动', 0, 30, '14px ' + FT, C.darkBrown, 'center', 'middle');
        }
        ctx.restore();
        // Glow
        if (p > 0.4) {
            const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
            gg.addColorStop(0, `rgba(255,200,87,${(p - 0.4) * 0.4})`);
            gg.addColorStop(1, 'rgba(255,200,87,0)');
            ctx.fillStyle = gg; ctx.fillRect(0, 0, this.g.w, this.g.h);
        }
    }
    onDown(x, y) {
        if (this.state === 'down') {
            const cx = this.g.w / 2, cy = this.g.h / 2;
            const cw = Math.min(140, this.g.w * 0.35), ch = cw * 1.4;
            if (Math.abs(x - cx) < cw/2 && Math.abs(y - cy) < ch/2) { this.state = 'flipping'; }
        }
    }
}

// ==================== SCENE 3: Phone Chat ====================
class S3 extends Scene {
    constructor(g) { super(g); this.hint = '长按输入框回复'; this.text = '除夕夜 · 你问我有没有女朋友'; }
    enter() { super.enter(); this.state = 'waiting'; this.pressP = 0; this.pressing = false; this.replyP = 0; this.fireworks = []; this.fwT = 0; }
    update(dt) {
        super.update(dt);
        if (this.pressing) { this.pressP += dt * 0.6; if (this.pressP >= 1) { this.pressP = 1; this.pressing = false; this.state = 'replied'; } }
        if (this.state === 'replied') { this.replyP += dt * 1.5; if (this.replyP > 1) this.replyP = 1; if (this.replyP >= 1 && !this.done) { this.g.ps.burstHearts(this.g.w/2, this.g.h/2, 15); this.done = true; } }
        this.fwT += dt;
        if (this.fwT > 0.8) { this.fwT = 0; this.g.ps.firework(U.rand(this.g.w*0.2, this.g.w*0.8), U.rand(this.g.h*0.1, this.g.h*0.3)); }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#1a1530'],[1,'#2a2050']]));
        const cx = this.g.w / 2, cy = this.g.h / 2;
        // Distant fireworks
        // Phone
        const pw = Math.min(220, this.g.w * 0.6), ph = pw * 1.8;
        fRR(ctx, cx - pw/2, cy - ph/2, pw, ph, 16, C.darkBrown);
        fRR(ctx, cx - pw/2 + 6, cy - ph/2 + 6, pw - 12, ph - 12, 10, '#1a1530');
        // Chat bubble (received)
        const bw = pw * 0.65, bh = 36;
        fRR(ctx, cx - pw/2 + 16, cy - ph/4, bw, bh, 10, C.coralLight);
        fText(ctx, '你有女朋友吗？', cx - pw/2 + 26, cy - ph/4 + 22, '12px ' + FB, C.darkBrown, 'left', 'middle');
        // Input box / progress
        const iy = cy + ph/8;
        fRR(ctx, cx - pw/2 + 16, iy, pw - 32, 32, 8, C.darkGray);
        if (this.pressing || this.pressP > 0) {
            fRR(ctx, cx - pw/2 + 16, iy, (pw - 32) * this.pressP, 32, 8, C.coral);
        }
        fText(ctx, this.pressing ? '正在回复...' : (this.state === 'replied' ? '' : '长按此处回复'), cx, iy + 20, '11px ' + FB, this.pressing ? C.cream : 'rgba(255,255,255,0.4)', 'center', 'middle');
        // Reply bubble
        if (this.state === 'replied') {
            const rp = U.easeOut(U.clamp(this.replyP, 0, 1));
            const rx = U.lerp(cx + pw/2, cx + pw/2 - bw - 16, rp);
            fRR(ctx, rx, cy + ph/4 - 20, bw, bh, 10, C.honey);
            fText(ctx, '没有，但我想有你 ♥', rx + 10, cy + ph/4 + 2, '11px ' + FB, C.darkBrown, 'left', 'middle');
        }
    }
    onDown(x, y) {
        if (this.state === 'waiting') {
            const cx = this.g.w / 2, cy = this.g.h / 2;
            const pw = Math.min(220, this.g.w * 0.6), ph = pw * 1.8;
            const iy = cy + ph/8;
            if (x > cx - pw/2 + 16 && x < cx + pw/2 - 16 && y > iy && y < iy + 32) { this.pressing = true; this.g.music.play(); }
        }
    }
    onUp(x, y) { if (this.pressing && this.pressP < 1) { this.pressing = false; this.pressP = 0; } }
}

// ==================== SCENE 4: Hold Hands ====================
class S4 extends Scene {
    constructor(g) { super(g); this.hint = '拖动两只手牵到一起'; this.text = '春节返工 · 我们在一起了'; }
    enter() { super.enter(); this.leftX = 0.18; this.rightX = 0.82; this.dragging = null; this.connected = false; }
    update(dt) {
        super.update(dt);
        if (!this.connected && this.rightX - this.leftX < 0.08) {
            this.connected = true;
            this.leftX = 0.46; this.rightX = 0.54;
            const cx = this.g.w / 2, cy = this.g.h / 2;
            this.g.ps.burstHearts(cx, cy, 30);
            this.done = true;
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#FFD4B8'],[0.5,'#FFB5A0'],[1,'#FFC857']]));
        const cy = this.g.h / 2;
        const lx = this.leftX * this.g.w, rx = this.rightX * this.g.w;
        // Left hand
        this.drawHand(ctx, lx, cy, false);
        // Right hand
        this.drawHand(ctx, rx, cy, true);
        // Connection
        if (this.connected) {
            const cx = (lx + rx) / 2;
            const ps = 1 + Math.sin(this.t * 4) * 0.1;
            fHeart(ctx, cx, cy - 20, 14 * ps, C.rose);
        }
    }
    drawHand(ctx, x, y, flip) {
        ctx.save();
        ctx.translate(x, y);
        if (flip) ctx.scale(-1, 1);
        ctx.fillStyle = C.peach;
        // Palm
        fRR(ctx, -20, -12, 40, 24, 12, C.peach);
        // Thumb
        fRR(ctx, -22, -8, 12, 14, 6, C.peach);
        // Fingers
        for (let i = 0; i < 4; i++) {
            fRR(ctx, -16 + i * 10, -20, 7, 12, 3, C.peach);
        }
        ctx.restore();
    }
    onDown(x, y) {
        const cy = this.g.h / 2;
        const lx = this.leftX * this.g.w, rx = this.rightX * this.g.w;
        if (!this.connected) {
            if (U.dist(x, y, lx, cy) < 35) this.dragging = 'left';
            else if (U.dist(x, y, rx, cy) < 35) this.dragging = 'right';
        }
    }
    onMove(x, y) {
        if (this.dragging === 'left') this.leftX = U.clamp(x / this.g.w, 0.05, this.rightX - 0.08);
        else if (this.dragging === 'right') this.rightX = U.clamp(x / this.g.w, this.leftX + 0.08, 0.95);
    }
    onUp(x, y) { this.dragging = null; }
}

// ==================== SCENE 5: Pet Cat ====================
class S5 extends Scene {
    constructor(g) { super(g); this.hint = '在猫咪身上滑动抚摸'; this.text = '仙姑 · 欢迎来到我们的家'; }
    enter() { super.enter(); this.petCount = 0; this.swiping = false; this.startX = 0; this.startY = 0; this.swipeDist = 0; this.ripples = []; this.catBlink = false; this.lastPetT = 0; }
    update(dt) {
        super.update(dt);
        if (this.petCount >= 3 && !this.done) { this.done = true; this.g.ps.burstHearts(this.g.w/2, this.g.h/2, 20); }
        this.ripples = this.ripples.filter(r => { r.r += dt * 80; r.a -= dt * 1.5; return r.a > 0; });
        if (this.t - this.lastPetT > 0.3) this.catBlink = false;
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#FFF8F0'],[0.5,'#FFE4B5'],[1,'#FFD4B8']]));
        const cx = this.g.w / 2, cy = this.g.h / 2;
        // Ripples
        for (const r of this.ripples) {
            ctx.strokeStyle = `rgba(255,139,123,${r.a * 0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
        }
        drawCat(ctx, cx, cy, Math.min(1.5, this.g.w / 250), { expression: this.catBlink ? 'enjoy' : 'curious' });
    }
    onDown(x, y) {
        const cx = this.g.w / 2, cy = this.g.h / 2;
        if (U.dist(x, y, cx, cy) < 60) { this.swiping = true; this.startX = x; this.startY = y; this.swipeDist = 0; }
    }
    onMove(x, y) {
        if (this.swiping) {
            const d = U.dist(x, y, this.startX, this.startY);
            this.swipeDist += U.dist(x, y, this.lastX || x, this.lastY || y);
            this.lastX = x; this.lastY = y;
            if (this.swipeDist > 60 && this.t - this.lastPetT > 0.5) {
                this.petCount++; this.catBlink = true; this.lastPetT = this.t;
                this.ripples.push({ x: x, y: y, r: 5, a: 1 });
                this.g.ps.burstHearts(x, y - 30, 5);
                this.swipeDist = 0;
            }
        }
    }
    onUp(x, y) { this.swiping = false; this.swipeDist = 0; this.lastX = null; this.lastY = null; }
}

// ==================== SCENE 6: Surfing ====================
class S6 extends Scene {
    constructor(g) { super(g); this.hint = '左右滑动保持平衡'; this.text = '海南冲浪 · 最甜的时光'; }
    enter() { super.enter(); this.balCount = 0; this.swiping = false; this.startX = 0; this.tilt = 0; this.tiltT = 0; this.lastDir = 0; }
    update(dt) {
        super.update(dt);
        this.tiltT += dt;
        if (this.tilt !== 0 && this.tiltT > 0.5) { this.tilt *= 0.9; }
        if (this.balCount >= 3 && !this.done) { this.done = true; this.g.ps.burstHearts(this.g.w/2, this.g.h/2, 20); }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0,'#4A90D9'],[0.4,'#5BA3E8'],[1,'#2E86AB']]));
        const cx = this.g.w / 2, cy = this.g.h * 0.55;
        // Waves
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
        for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            const wy = cy + 40 + j * 30;
            for (let i = 0; i <= this.g.w; i += 10) {
                const yy = wy + Math.sin(i * 0.02 + this.t * 2 + j) * 8;
                if (i === 0) ctx.moveTo(i, yy); else ctx.lineTo(i, yy);
            }
            ctx.stroke();
        }
        // Surfboard
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.tilt * 0.3);
        ctx.fillStyle = C.honey;
        ctx.beginPath();
        ctx.ellipse(0, 0, 50, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.warmBrown;
        ctx.fillRect(-2, -3, 4, 6);
        // Figure
        drawBoy(ctx, 0, -30, 0.4, { expression: 'happy' });
        ctx.restore();
        // Balance indicator
        for (let i = 0; i < 3; i++) {
            fCircle(ctx, cx - 30 + i * 30, 50, 8, i < this.balCount ? C.honey : 'rgba(255,255,255,0.2)');
        }
    }
    onDown(x, y) { this.swiping = true; this.startX = x; }
    onMove(x, y) {
        if (this.swiping) {
            const dx = x - this.startX;
            this.tilt = U.clamp(dx / 100, -1, 1);
        }
    }
    onUp(x, y) {
        if (this.swiping) {
            const dx = x - this.startX;
            const dir = dx > 40 ? 1 : (dx < -40 ? -1 : 0);
            if (dir !== 0 && dir !== this.lastDir) {
                this.balCount++;
                this.lastDir = dir;
                this.g.ps.burstSplash(this.g.w/2, this.g.h * 0.55, 15);
            }
            this.swiping = false; this.tilt = 0; this.tiltT = 0;
        }
    }
}

// ==================== SCENE 7: Hug ====================
class S7 extends Scene {
    constructor(g) { super(g); this.hint = '拖动男孩给女孩拥抱'; this.text = '不管怎样 · 有我在'; }
    enter() { super.enter(); this.boyX = 0.75; this.girlX = 0.25; this.dragging = false; this.hugging = false; }
    update(dt) {
        super.update(dt);
        if (!this.hugging && this.boyX - this.girlX < 0.12) {
            this.hugging = true; this.boyX = this.girlX + 0.08;
            this.g.ps.burstHearts(this.g.w / 2, this.g.h / 2, 30);
            this.done = true;
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0, '#3D3D4A'], [0.5, '#4A4055'], [1, '#2D2D38']]));
        const cy = this.g.h * 0.55;
        const sc = Math.min(1, this.g.w / 220);
        const gx = this.girlX * this.g.w, bx = this.boyX * this.g.w;
        drawGirl(ctx, gx, cy, sc, { expression: this.hugging ? 'happy' : 'sad', blush: this.hugging });
        drawBoy(ctx, bx, cy, sc, { expression: this.hugging ? 'happy' : 'sad', blush: this.hugging });
        if (this.hugging) {
            const cx = (gx + bx) / 2;
            const ps = 1 + Math.sin(this.t * 4) * 0.15;
            fHeart(ctx, cx, cy - 60, 14 * ps, C.coral);
        }
    }
    onDown(x, y) {
        if (!this.hugging) {
            const bx = this.boyX * this.g.w, cy = this.g.h * 0.55;
            if (U.dist(x, y, bx, cy) < 55) this.dragging = true;
        }
    }
    onMove(x, y) { if (this.dragging) this.boyX = U.clamp(x / this.g.w, this.girlX + 0.08, 0.95); }
    onUp(x, y) { this.dragging = false; }
}

// ==================== SCENE 8: Ring Light ====================
class S8 extends Scene {
    constructor(g) { super(g); this.hint = '点击点亮环形灯'; this.text = '你重新出发 · 我在身后'; }
    enter() { super.enter(); this.lightLevel = 0; this.pulseT = 0; }
    update(dt) {
        super.update(dt);
        this.pulseT += dt;
        if (this.lightLevel >= 3 && !this.done) {
            this.done = true;
            this.g.ps.burstStars(this.g.w / 2, this.g.h / 2, 25);
            this.g.ps.spawn('gold', this.g.w / 2, this.g.h / 2, 15, { speed: 100, life: 2, size: 6 });
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0, '#1a1530'], [1, '#2D2D38']]));
        const cx = this.g.w / 2, cy = this.g.h / 2;
        const r = Math.min(80, this.g.w * 0.2);
        const lightness = this.lightLevel / 3;
        if (lightness > 0) {
            const pulse = 1 + Math.sin(this.pulseT * 3) * 0.1;
            const rayR = r * 3 * lightness * pulse;
            const gg = ctx.createRadialGradient(cx, cy, r, cx, cy, rayR);
            gg.addColorStop(0, `rgba(255,248,240,${0.4 * lightness})`);
            gg.addColorStop(1, 'rgba(255,248,240,0)');
            ctx.fillStyle = gg;
            ctx.fillRect(cx - rayR, cy - rayR, rayR * 2, rayR * 2);
        }
        const ringColors = ['#3D3D4A', '#FFD4B8', '#FFC857', '#FFF8F0'];
        const rc = ringColors[Math.min(this.lightLevel, 3)];
        sCircle(ctx, cx, cy, r, rc, 14);
        if (lightness > 0) {
            const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            ig.addColorStop(0, `rgba(255,248,240,${0.15 * lightness})`);
            ig.addColorStop(1, `rgba(255,200,87,${0.05 * lightness})`);
            ctx.fillStyle = ig;
            ctx.beginPath();
            ctx.arc(cx, cy, r - 8, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < 3; i++) {
            fCircle(ctx, cx - 24 + i * 24, cy + r + 30, 7, i < this.lightLevel ? C.honey : 'rgba(255,255,255,0.15)');
        }
    }
    onDown(x, y) {
        if (this.lightLevel < 3) {
            const cx = this.g.w / 2, cy = this.g.h / 2;
            const r = Math.min(80, this.g.w * 0.2);
            if (U.dist(x, y, cx, cy) < r + 25) {
                this.lightLevel++;
                this.g.ps.burstStars(cx, cy, 8);
            }
        }
    }
}

// ==================== SCENE 9: Mend Crack ====================
class S9 extends Scene {
    constructor(g) { super(g); this.hint = '沿裂痕滑动修补'; this.text = '我们也曾 · 差点走散'; }
    enter() {
        super.enter();
        this.mendP = 0; this.lastIdx = -1;
        const cx = this.g.w / 2, cy = this.g.h / 2;
        const w = Math.min(220, this.g.w * 0.55);
        this.path = [];
        const n = 8;
        for (let i = 0; i <= n; i++) {
            this.path.push({
                x: cx - w / 2 + (w / n) * i,
                y: cy + (i % 2 === 0 ? -1 : 1) * U.rand(20, 45)
            });
        }
        this.drops = [];
        for (let i = 0; i < 40; i++) {
            this.drops.push({ x: Math.random() * this.g.w, y: Math.random() * this.g.h, len: U.rand(10, 20), speed: U.rand(200, 400), maxY: this.g.h });
        }
    }
    update(dt) {
        super.update(dt);
        if (this.mendP >= 1 && !this.done) {
            this.done = true;
            this.g.ps.burstGold(this.g.w / 2, this.g.h / 2, 30);
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0, '#2D2D38'], [0.5, '#3D3D4A'], [1, '#1a1530']]));
        drawRaindrops(ctx, this.drops, this.t);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < this.path.length; i++) {
            const p = this.path[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        const mc = Math.floor(this.mendP * (this.path.length - 1));
        if (mc > 0 || (this.mendP > 0 && mc === 0)) {
            ctx.strokeStyle = C.gold; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
            ctx.shadowColor = C.gold; ctx.shadowBlur = 10;
            ctx.beginPath();
            for (let i = 0; i <= mc && i < this.path.length; i++) {
                const p = this.path[i];
                if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            }
            if (mc < this.path.length - 1) {
                const frac = (this.mendP * (this.path.length - 1)) - mc;
                const p = this.path[mc], nx = this.path[mc + 1];
                ctx.lineTo(U.lerp(p.x, nx.x, frac), U.lerp(p.y, nx.y, frac));
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }
    onDown(x, y) {
        if (this.path.length > 0 && U.dist(x, y, this.path[0].x, this.path[0].y) < 50) this.lastIdx = 0;
    }
    onMove(x, y) {
        if (this.lastIdx >= 0) {
            for (let i = this.lastIdx + 1; i < this.path.length; i++) {
                if (U.dist(x, y, this.path[i].x, this.path[i].y) < 50) {
                    this.lastIdx = i;
                    this.mendP = i / (this.path.length - 1);
                    this.g.ps.burstGold(this.path[i].x, this.path[i].y, 4);
                    break;
                }
            }
        }
    }
    onUp(x, y) { this.lastIdx = -1; }
}

// ==================== SCENE 10: Reconcile ====================
class S10 extends Scene {
    constructor(g) { super(g); this.hint = '拖动两人转向彼此'; this.text = '但我们 · 选择了彼此'; }
    enter() { super.enter(); this.turn1 = 0; this.turn2 = 0; this.dragging = null; this.facing = false; this.lastX = 0; this.lastY = 0; }
    update(dt) {
        super.update(dt);
        if (!this.facing && this.turn1 >= 1 && this.turn2 >= 1) {
            this.facing = true;
            this.g.ps.burstHearts(this.g.w / 2, this.g.h / 2, 30);
            this.done = true;
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0, '#FF8B7B'], [0.5, '#FFC857'], [1, '#FFB5A0']]));
        const cx = this.g.w / 2, cy = this.g.h * 0.55;
        const sep = Math.min(120, this.g.w * 0.25);
        const sc = Math.min(0.8, this.g.w / 280);
        ctx.save();
        ctx.translate(cx - sep, cy);
        ctx.rotate(U.lerp(-0.4, 0, this.turn2));
        drawGirl(ctx, 0, 0, sc, { expression: this.facing ? 'happy' : 'sad', blush: this.facing });
        ctx.restore();
        ctx.save();
        ctx.translate(cx + sep, cy);
        ctx.rotate(U.lerp(0.4, 0, this.turn1));
        drawBoy(ctx, 0, 0, sc, { expression: this.facing ? 'happy' : 'sad', blush: this.facing });
        ctx.restore();
        if (this.facing) {
            const ps = 1 + Math.sin(this.t * 4) * 0.15;
            fHeart(ctx, cx, cy - 70, 16 * ps, C.rose);
        }
    }
    onDown(x, y) {
        if (!this.facing) {
            const cx = this.g.w / 2, cy = this.g.h * 0.55;
            const sep = Math.min(120, this.g.w * 0.25);
            if (U.dist(x, y, cx + sep, cy) < 55) { this.dragging = 'boy'; this.lastX = x; this.lastY = y; }
            else if (U.dist(x, y, cx - sep, cy) < 55) { this.dragging = 'girl'; this.lastX = x; this.lastY = y; }
        }
    }
    onMove(x, y) {
        if (this.dragging) {
            const d = U.dist(x, y, this.lastX, this.lastY);
            if (this.dragging === 'boy') this.turn1 = U.clamp(this.turn1 + d * 0.008, 0, 1);
            else this.turn2 = U.clamp(this.turn2 + d * 0.008, 0, 1);
            this.lastX = x; this.lastY = y;
        }
    }
    onUp(x, y) { this.dragging = null; }
}

// ==================== SCENE 11: Turn Key ====================
class S11 extends Scene {
    constructor(g) { super(g); this.hint = '画圆弧转动钥匙'; this.text = '不管多晚回家 · 你和仙姑都在等我'; }
    enter() {
        super.enter();
        this.keyAngle = 0; this.dragging = false; this.lastA = 0;
        this.stars = makeStars(this.g.w, this.g.h, 50, 2);
    }
    update(dt) {
        super.update(dt);
        if (this.keyAngle >= Math.PI * 2 && !this.done) {
            this.done = true;
            this.g.ps.spawn('gold', this.g.w / 2, this.g.h / 2, 20, { speed: 80, life: 2, size: 6 });
            this.g.ps.burstHearts(this.g.w / 2, this.g.h / 2, 15);
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0, '#1a1530'], [1, '#2a2050']]));
        drawStars(ctx, this.stars, this.t);
        const cx = this.g.w / 2, cy = this.g.h / 2;
        // Window
        const ww = Math.min(100, this.g.w * 0.25), wh = ww * 0.7;
        fRR(ctx, cx - ww / 2 - 6, cy - 110, ww + 12, wh + 12, 6, C.warmBrown);
        const wg = ctx.createLinearGradient(cx, cy - 110, cx, cy - 110 + wh);
        wg.addColorStop(0, 'rgba(255,200,87,0.6)');
        wg.addColorStop(1, 'rgba(255,139,123,0.3)');
        fRR(ctx, cx - ww / 2, cy - 104, ww, wh, 4, wg);
        // Cat silhouette in window
        drawCat(ctx, cx, cy - 90, 0.25, { expression: 'enjoy' });
        // Door
        const dw = Math.min(120, this.g.w * 0.3), dh = dw * 1.6;
        fRR(ctx, cx - dw / 2, cy - dh / 2 + 30, dw, dh, 4, C.warmBrown);
        fRR(ctx, cx - dw / 2 + 8, cy - dh / 2 + 38, dw - 16, dh / 3 - 8, 4, C.darkBrown);
        fRR(ctx, cx - dw / 2 + 8, cy - dh / 2 + 38 + dh / 3, dw - 16, dh / 3 - 8, 4, C.darkBrown);
        // Keyhole
        const ky = cy + 10;
        fCircle(ctx, cx, ky, 8, '#1a0a00');
        fRect(ctx, cx - 3, ky, 6, 16, '#1a0a00');
        // Key
        if (this.keyAngle < Math.PI * 2) {
            ctx.save();
            ctx.translate(cx, ky);
            ctx.rotate(this.keyAngle);
            fCircle(ctx, 0, -16, 9, C.gold);
            sCircle(ctx, 0, -16, 4, '#8B6F5C', 2);
            fRect(ctx, -2, -10, 4, 22, C.gold);
            fRect(ctx, 2, 6, 6, 4, C.gold);
            fRect(ctx, 2, 12, 4, 4, C.gold);
            ctx.restore();
        }
        // Glow when unlocked
        if (this.keyAngle >= Math.PI * 2) {
            const pulse = 1 + Math.sin(this.t * 3) * 0.1;
            const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160 * pulse);
            gg.addColorStop(0, 'rgba(255,200,87,0.25)');
            gg.addColorStop(1, 'rgba(255,200,87,0)');
            ctx.fillStyle = gg;
            ctx.fillRect(0, 0, this.g.w, this.g.h);
        }
        // Progress arc
        if (this.keyAngle > 0 && this.keyAngle < Math.PI * 2) {
            ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, ky, 25, -Math.PI / 2, -Math.PI / 2 + this.keyAngle);
            ctx.stroke();
        }
    }
    onDown(x, y) {
        const cx = this.g.w / 2, ky = this.g.h / 2 + 10;
        if (U.dist(x, y, cx, ky) < 35) {
            this.dragging = true;
            this.lastA = U.angle(cx, ky, x, y);
        }
    }
    onMove(x, y) {
        if (this.dragging) {
            const cx = this.g.w / 2, ky = this.g.h / 2 + 10;
            const a = U.angle(cx, ky, x, y);
            let delta = a - this.lastA;
            if (delta > Math.PI) delta -= Math.PI * 2;
            if (delta < -Math.PI) delta += Math.PI * 2;
            if (delta > 0) this.keyAngle += delta;
            this.lastA = a;
        }
    }
    onUp(x, y) { this.dragging = false; }
}

// ==================== SCENE 12: Final Confession ====================
class S12 extends Scene {
    constructor(g) { super(g); this.hint = ''; this.text = '从相识到此刻'; }
    enter() {
        super.enter();
        this.phase = 0; this.phaseT = 0;
        this.celebrating = false; this.celebT = 0;
        this.stars = makeStars(this.g.w, this.g.h, 80, 2.5);
        this.btnP = false;
    }
    update(dt) {
        super.update(dt);
        this.phaseT += dt;
        if (this.phase === 0 && this.phaseT > 2.5) { this.phase = 1; this.phaseT = 0; this.g.setSceneText('谢谢你陪我走过每一步'); }
        else if (this.phase === 1 && this.phaseT > 2.5) { this.phase = 2; this.phaseT = 0; this.g.setSceneText('这些日子，谢谢你。以后的路，你还愿意陪我走下去吗？'); }
        else if (this.phase === 2 && this.phaseT > 3.5) { this.phase = 3; this.phaseT = 0; this.g.setHint('点击下方按钮'); }
        if (this.celebrating) {
            this.celebT += dt;
            if (this.celebT > 0.4 && this.celebT < 6) {
                if (Math.random() < 0.35) this.g.ps.firework(U.rand(this.g.w * 0.1, this.g.w * 0.9), U.rand(this.g.h * 0.1, this.g.h * 0.4));
            }
            if (this.celebT > 1 && this.celebT < 8) this.g.ps.rainHearts(this.g.w, 3);
            if (this.celebT > 2.5 && this.phase < 5) {
                this.phase = 5;
                this.g.setSceneText('那就继续牵着手 一起走吧 ♥');
                this.g.setHint('');
            }
        }
    }
    render(ctx) {
        fRect(ctx, 0, 0, this.g.w, this.g.h, gradV(ctx, this.g.w, this.g.h, [[0, '#1a1530'], [0.5, '#2e2348'], [1, '#1a1530']]));
        drawStars(ctx, this.stars, this.t);
        if (this.phase >= 3 && !this.celebrating) {
            const cx = this.g.w / 2, cy = this.g.h * 0.65;
            const bw = Math.min(130, this.g.w * 0.32), bh = 48;
            const ps = 1 + Math.sin(this.t * 3) * 0.05;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(ps, ps);
            const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, bw);
            gg.addColorStop(0, 'rgba(255,139,123,0.4)');
            gg.addColorStop(1, 'rgba(255,139,123,0)');
            ctx.fillStyle = gg;
            ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
            fRR(ctx, -bw / 2, -bh / 2, bw, bh, 24, this.btnP ? C.coralLight : C.coral);
            sRR(ctx, -bw / 2, -bh / 2, bw, bh, 24, C.cream, 2);
            fText(ctx, '愿 意', 0, 0, '20px ' + FT, C.cream, 'center', 'middle');
            ctx.restore();
        }
        if (this.phase >= 5) {
            const cx = this.g.w / 2, cy = this.g.h * 0.4;
            const sc = Math.min(0.7, this.g.w / 320);
            drawBoy(ctx, cx - 35, cy, sc, { expression: 'happy', blush: true });
            drawGirl(ctx, cx + 35, cy, sc, { expression: 'happy', blush: true });
            fHeart(ctx, cx, cy - 65, 14 + Math.sin(this.t * 3) * 2, C.rose);
            drawCat(ctx, cx, cy + 50, sc * 0.6, { expression: 'enjoy' });
        }
    }
    onDown(x, y) {
        if (this.phase >= 3 && !this.celebrating) {
            const cx = this.g.w / 2, cy = this.g.h * 0.65;
            const bw = Math.min(130, this.g.w * 0.32), bh = 48;
            if (Math.abs(x - cx) < bw / 2 && Math.abs(y - cy) < bh / 2) {
                this.btnP = true;
                this.celebrating = true;
                this.celebT = 0;
                this.g.ps.firework(cx, cy - 50);
                this.g.ps.burstHearts(cx, cy, 30);
                this.done = true;
            }
        }
    }
}

// ==================== AUDIO: NOTE FREQUENCIES ====================
const NOTE_FREQ = {
    'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00
};

// ==================== AUDIO: MELODY DATA ====================
// C major 4/4 69BPM, chord progression: C -> G/B -> Am -> F -> G -> C
const MELODY = {
    verse: [
        [['E4', 0.5], ['G4', 0.5], ['A4', 1], ['G4', 0.5], ['E4', 0.5], ['C4', 1]],
        [['D4', 0.5], ['G4', 0.5], ['A4', 1], ['G4', 0.5], ['D4', 0.5], ['B3', 1]],
        [['C4', 0.5], ['E4', 0.5], ['G4', 1], ['E4', 0.5], ['C4', 0.5], ['A3', 1]],
        [['A3', 0.5], ['C4', 0.5], ['F4', 1], ['E4', 0.5], ['C4', 0.5], ['A3', 1]],
        [['B3', 0.5], ['D4', 0.5], ['G4', 1], ['A4', 0.5], ['G4', 0.5], ['D4', 1]],
        [['C4', 0.5], ['E4', 0.5], ['G4', 1], ['C5', 0.5], ['B4', 0.5], ['G4', 1]]
    ],
    chorus: [
        [['G4', 0.5], ['C5', 0.5], ['E5', 1], ['D5', 0.5], ['C5', 0.5], ['G4', 1]],
        [['G4', 0.5], ['B4', 0.5], ['D5', 1], ['C5', 0.5], ['B4', 0.5], ['G4', 1]],
        [['A4', 0.5], ['C5', 0.5], ['E5', 1], ['D5', 0.5], ['C5', 0.5], ['A4', 1]],
        [['F4', 0.5], ['A4', 0.5], ['C5', 1], ['D5', 0.5], ['C5', 0.5], ['A4', 1]],
        [['G4', 0.5], ['B4', 0.5], ['D5', 1], ['E5', 0.5], ['D5', 0.5], ['B4', 1]],
        [['G4', 0.5], ['C5', 0.5], ['E5', 1], ['G5', 0.5], ['E5', 0.5], ['C5', 1]]
    ],
    bass: ['C3', 'B2', 'A2', 'F2', 'G2', 'C3'],
    chords: [
        ['C4', 'E4', 'G4'], ['B3', 'D4', 'G4'], ['A3', 'C4', 'E4'],
        ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'], ['C4', 'E4', 'G4']
    ]
};

// ==================== AUDIO SYSTEM ====================
class Music {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.playing = false;
        this.bpm = 69;
        this.beatDur = 60 / this.bpm;
        this.barDur = this.beatDur * 4;
        this.nextBarTime = 0;
        this.barIndex = 0;
        this.timer = null;
    }

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.1;
            this.master.connect(this.ctx.destination);
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    freq(note) { return NOTE_FREQ[note] || 261.63; }

    playNote(freq, start, dur, type, vol) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(start);
        osc.stop(start + dur + 0.05);
    }

    scheduleBar(barIdx, startTime) {
        const section = barIdx < 6 ? 'verse' : (barIdx < 12 ? 'chorus' : 'verse');
        const barInSec = barIdx % 6;
        const melody = MELODY[section][barInSec];
        const beatDur = this.beatDur;

        // Melody (sine wave - piano-like)
        let t = startTime;
        for (const [note, dur] of melody) {
            this.playNote(this.freq(note), t, dur * beatDur * 0.9, 'sine', 0.2);
            t += dur * beatDur;
        }
        // Bass (triangle wave)
        this.playNote(this.freq(MELODY.bass[barInSec]), startTime, this.barDur * 0.95, 'triangle', 0.12);
        // Chord accompaniment (triangle wave, soft)
        for (const note of MELODY.chords[barInSec]) {
            this.playNote(this.freq(note), startTime, this.barDur * 0.9, 'triangle', 0.05);
        }
    }

    scheduler() {
        if (!this.ctx) return;
        while (this.nextBarTime < this.ctx.currentTime + 0.3) {
            this.scheduleBar(this.barIndex % 18, this.nextBarTime);
            this.nextBarTime += this.barDur;
            this.barIndex++;
        }
    }

    play() {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.playing) return;
        this.playing = true;
        this.nextBarTime = this.ctx.currentTime + 0.1;
        this.barIndex = 0;
        this.scheduler();
        this.timer = setInterval(() => this.scheduler(), 100);
    }

    pause() {
        this.playing = false;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        if (this.ctx) this.ctx.suspend();
    }

    toggle() {
        if (this.playing) this.pause();
        else this.play();
        return this.playing;
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
        this.fadeDur = 0.5;
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

        this.ui.musicBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const playing = this.music.toggle();
            this.ui.musicBtn.classList.toggle('muted', !playing);
        });
    }

    updateUI() {
        const scene = this.scenes[this.currentScene];
        this.setSceneText(scene.text);
        this.setHint(scene.hint);
        this.ui.progressDots.innerHTML = '';
        for (let i = 0; i < this.scenes.length; i++) {
            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            if (i < this.currentScene) dot.classList.add('done');
            if (i === this.currentScene) dot.classList.add('active');
            this.ui.progressDots.appendChild(dot);
        }
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
        this.update(dt);
        this.render();
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        this.ps.update(dt);

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
