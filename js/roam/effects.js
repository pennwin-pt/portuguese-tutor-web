/* 形容词变形工坊的效果引擎：让展台 / 舞台上的摆件（或人物）按词义"变"一下。
   全部是程序动画，不需要新模型：缩放、变色、粒子（emoji 贴图的朝向镜头的小平面）、表情气泡、跑动。
   用法（roam/index.js 创建后挂到 stage 上）：
     const fx = createEffects({ scene, arena });
     await fx.play(spec, { dur: 2.4, hold: true });   // spec 来自模板的 effects 表，如 { kind:'scale', to:[1.8,1.8,1.8] }
     fx.clear();                                        // 立即复位
     fx.tick(dt, camera);                               // 每帧调用
   作用对象 = arena.variantTargets()（当前显示的那一组摆件 / 人物，复数时多个一起变）。
   约定：同一时刻只有一个效果在播；播新的会先立即复位旧的，所以重复触发不会叠加。
   M6：新增 tag（头顶价签）、emote 的 jitter 动作、tint 的 shine（金属闪光）；createEffects 多了可选的 hooks（音效 / 变形机联动）：
     createEffects({ scene, arena, sfx, sfxDelay, onStart, onEnd })
       sfx(name)        播 sounds/roam/<name>.wav（缺文件静默）；效果开始时播 sfxOf(spec)，非 hold 的效果开始复位时播 fx_revert
       sfxDelay         效果音相对开场延后多少毫秒（有变形机时给机器的"咔哒"声让出一点时间）
       onStart(spec,dur) / onEnd()   效果开始 / 结束（roam/index.js 用它驱动变形机装饰的灯和齿轮）
     不传 hooks 时行为和 M5 完全一样。 */
import * as T from '../vendor/three-bundle.js';

export const EFFECT_KINDS = ['scale', 'tint', 'aura', 'dirt', 'age', 'weight', 'emote', 'speed', 'tag'];
const MAX_PARTICLES = 30;                                       // 同屏粒子上限（低端手机）
const RAMP_IN = 0.45, RAMP_OUT = 0.4;

const clamp01 = k => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const backOut = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

/* 效果 → 音效文件名（sounds/roam/<name>.wav）。同类效果共用，缺文件时 sfx() 静默 */
export function sfxOf(spec) {
    switch (spec && spec.kind) {
        case 'scale': { const to = spec.to || [1, 1, 1]; return (to[0] + to[1] + to[2]) / 3 >= 1 ? 'fx_grow' : 'fx_shrink'; }
        case 'tint': return spec.shine ? 'fx_sparkle' : 'fx_tint';
        case 'aura': return 'fx_aura';
        case 'dirt': return spec.clean ? 'fx_sparkle' : 'fx_dirt';
        case 'age': return spec.fresh ? 'fx_sparkle' : 'fx_old';
        case 'weight': return spec.light ? 'fx_light' : 'fx_heavy';
        case 'emote': return 'fx_pop';
        case 'speed': return spec.fast === false ? 'fx_slow' : 'fx_zip';
        case 'tag': return 'fx_cash';
        default: return null;
    }
}

/* emoji → 贴图（缓存）；字体不支持时会画成方框，但不影响玩法 */
const texCache = new Map();
export function emojiTexture(ch, px = 96) {                    // px：贴图边长。粒子 / 气泡很小，用默认 96 就够；放大展示的奖品用 256，否则会糊
    const key = px === 96 ? ch : `${ch}@${px}`;
    let tex = texCache.get(key);
    if (tex) return tex;
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d');
    g.font = `${Math.round(px * 2 / 3)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, px / 2, Math.round(px * 52 / 96));
    tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    texCache.set(key, tex);
    return tex;
}

/* 价签贴图（缓存，键 = 文字 + 底色）：圆角牌子 + 左边一个小孔 + 白色粗体价格；宽高比 2:1 */
function tagTexture(text, bg) {
    const key = `tag:${text}:${bg}`;
    let tex = texCache.get(key);
    if (tex) return tex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'), r = 26, x0 = 8, y0 = 12, w = 240, h = 104;
    g.beginPath();                                              // 手写圆角矩形（roundRect 在旧浏览器里没有）
    g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath();
    g.fillStyle = bg; g.fill(); g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x0 + 34, 64, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = bg; g.beginPath(); g.arc(x0 + 34, 64, 6, 0, Math.PI * 2); g.fill();
    g.font = 'bold 56px system-ui,\"Segoe UI\",Arial,sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(text).slice(0, 8), x0 + 34 + (w - 34) / 2 + 6, 66, w - 64);
    tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    texCache.set(key, tex);
    return tex;
}

export function createEffects({ scene, arena, sfx = null, sfxDelay = 0, onStart = null, onEnd = null }) {
    let cur = null;                                              // 正在播的效果
    const particles = [];                                        // { mesh, vy, vx, life, age, size }
    const bubbles = [];                                          // 表情气泡 { mesh, target, k }
    const tmpBox = new T.Box3(), tmpSize = new T.Vector3(), tmpCol = new T.Color();

    /* 第一次用到某个摆件时：克隆它的材质（GLB 克隆后材质是共享的，不克隆的话 tint 会串到同模型的其他摆件）、记下原始状态 */
    function prep(t) {
        if (t.fx) return t.fx;
        const meshes = [];
        t.obj.traverse(o => {
            if (!o.isMesh || !o.material) return;
            const many = Array.isArray(o.material);
            const mats = (many ? o.material : [o.material]).map(m => (m.clone ? m.clone() : m));
            o.material = many ? mats : mats[0];
            meshes.push({ o, mats, base: mats.map(m => (m.color ? m.color.clone() : null)) });
        });
        tmpBox.setFromObject(t.obj); tmpBox.getSize(tmpSize);
        t.fx = {
            meshes, pos: t.obj.position.clone(), rot: { x: t.obj.rotation.x, y: t.obj.rotation.y, z: t.obj.rotation.z },
            top: tmpBox.max.y, midX: (tmpBox.min.x + tmpBox.max.x) / 2, midZ: (tmpBox.min.z + tmpBox.max.z) / 2,
            w: Math.max(0.3, tmpSize.x), h: Math.max(0.3, tmpSize.y), d: Math.max(0.3, tmpSize.z), extra: []
        };
        return t.fx;
    }
    function tintAll(t, color, k) {
        const f = t.fx; tmpCol.set(color);
        for (const m of f.meshes) m.mats.forEach((mat, i) => { if (mat.color && m.base[i]) mat.color.copy(m.base[i]).lerp(tmpCol, clamp01(k)); });
    }
    function billboard(ch, size) {
        const mat = new T.MeshBasicMaterial({ map: emojiTexture(ch), transparent: true, depthWrite: false });
        const mesh = new T.Mesh(new T.PlaneGeometry(size, size), mat);
        mesh.renderOrder = 20; scene.add(mesh);
        return mesh;
    }
    function tagBillboard(text, bg, size) {
        const mat = new T.MeshBasicMaterial({ map: tagTexture(text, bg), transparent: true, depthWrite: false });
        const mesh = new T.Mesh(new T.PlaneGeometry(size * 2, size), mat);
        mesh.renderOrder = 20; scene.add(mesh);
        return mesh;
    }
    function dropMesh(mesh) { scene.remove(mesh); if (mesh.geometry) mesh.geometry.dispose(); if (mesh.material) mesh.material.dispose(); }
    function emit(ch, x, y, z, { vy = 0.8, vx = 0, life = 1.2, size = 0.28 } = {}) {
        if (particles.length >= MAX_PARTICLES) return;
        const mesh = billboard(ch, size); mesh.position.set(x, y, z);
        particles.push({ mesh, vy, vx, life, age: 0, size });
    }

    /* 复位：摆件回到原位原样，去掉粒子、斑点、气泡 */
    function restore(c) {
        for (const t of c.targets) {
            const f = t.fx; if (!f) continue;
            t.obj.position.copy(f.pos); t.obj.rotation.set(f.rot.x, f.rot.y, f.rot.z); t.obj.scale.copy(t.base);
            for (const m of f.meshes) m.mats.forEach((mat, i) => { if (mat.color && m.base[i]) mat.color.copy(m.base[i]); });
            for (const e of f.extra) { t.obj.remove(e); if (e.geometry) e.geometry.dispose(); if (e.material) e.material.dispose(); }
            f.extra.length = 0;
        }
        for (const p of particles) dropMesh(p.mesh); particles.length = 0;
        for (const b of bubbles) dropMesh(b.mesh); bubbles.length = 0;
    }
    function finish(c) {
        restore(c); if (cur === c) { cur = null; if (onEnd) onEnd(); }
        if (c.timer) { clearTimeout(c.timer); c.timer = 0; }
        if (c.res) { const r = c.res; c.res = null; r(); }
    }

    /* 开场：一次性的准备（斑点、气泡） */
    function init(c) {
        const s = c.spec;
        c.targets.forEach((t, i) => {
            const f = t.fx, base = t.base.x || 1;
            if (s.kind === 'dirt' && !s.clean) {
                const rand = mulberry(17 + i * 31);
                for (let k = 0; k < 8; k++) {
                    const spot = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), new T.MeshBasicMaterial({ color: '#4a3a2c' }));
                    const a = rand() * Math.PI * 2, rad = Math.max(f.w, f.d) * 0.42;
                    spot.position.set((Math.cos(a) * rad) / base, (f.h * (0.15 + rand() * 0.7)) / base, (Math.sin(a) * rad) / base);
                    spot.scale.set(0.9 + rand() * 0.8, 0.5, 0.9 + rand() * 0.8);
                    t.obj.add(spot); f.extra.push(spot);
                }
            }
            if (s.kind === 'tag' && s.text && bubbles.length < 3) {                // 价签：和表情气泡一样挂在摆件头顶、弹出并浮动
                const mesh = tagBillboard(s.text, s.tint || '#16a34a', 0.6);
                mesh.position.set(f.midX, f.top + 0.6, f.midZ); mesh.scale.setScalar(0.01);
                bubbles.push({ mesh, target: t, k: 0 });
            }
            if (s.kind === 'emote' && s.icon && bubbles.length < 3) {
                const mesh = billboard(s.icon, 1.0);
                mesh.position.set(f.midX, f.top + 0.6, f.midZ); mesh.scale.setScalar(0.01);
                bubbles.push({ mesh, target: t, k: 0 });
            }
        });
    }

    /* 每帧把效果推进到 e（0..1，已缓动）；c.t 是效果已播放的时间，给循环类动作用 */
    function apply(c, e, dt) {
        const s = c.spec;
        c.targets.forEach((t, i) => {
            const f = t.fx, o = t.obj;
            switch (s.kind) {
                case 'scale': {
                    const to = s.to || [1, 1, 1];
                    o.scale.set(t.base.x * lerp(1, to[0], e), t.base.y * lerp(1, to[1], e), t.base.z * lerp(1, to[2], e));
                    break;
                }
                case 'tint':
                    tintAll(t, s.color || '#ffffff', (s.mix == null ? 0.85 : s.mix) * e);
                    if (s.shine) {                                                  // 金属色（dourado / prateado）：变色的同时飘闪光
                        c.acc[i] = (c.acc[i] || 0) + dt;
                        if (c.phase !== 'out' && c.acc[i] > 0.13) { c.acc[i] = 0; emit('✨', f.midX + (Math.random() - 0.5) * f.w, f.top * (0.2 + Math.random() * 0.7), f.midZ + f.d * 0.55, { vy: 0.25, life: 0.9, size: 0.26 }); }
                    }
                    break;
                case 'aura':
                    tintAll(t, s.tint || '#ffffff', 0.4 * e);
                    c.acc[i] = (c.acc[i] || 0) + dt;
                    if (c.phase !== 'out' && c.acc[i] > 0.16 && s.particles) {
                        c.acc[i] = 0;
                        const down = s.drift === 'down', r = (Math.random() - 0.5) * f.w * 0.8;
                        emit(s.particles, f.midX + r, down ? f.top + 0.7 : f.top * 0.8, f.midZ + (Math.random() - 0.5) * f.d * 0.6, { vy: down ? -0.6 : 0.8, vx: (Math.random() - 0.5) * 0.3 });
                    }
                    break;
                case 'dirt':
                    if (s.clean) {
                        tintAll(t, '#ffffff', 0.3 * e);
                        c.acc[i] = (c.acc[i] || 0) + dt;
                        if (c.phase !== 'out' && c.acc[i] > 0.14) { c.acc[i] = 0; emit('✨', f.midX + (Math.random() - 0.5) * f.w, f.top * (0.3 + Math.random() * 0.6), f.midZ + f.d * 0.55, { vy: 0.3, life: 0.9, size: 0.26 }); }
                    } else {
                        tintAll(t, '#7a6150', 0.35 * e);
                        f.extra.forEach(sp => sp.scale.y = 0.5 * e + 0.001);
                    }
                    break;
                case 'age':
                    if (s.fresh) {
                        tintAll(t, '#ffffff', 0.25 * e);
                        o.scale.set(t.base.x * (1 + 0.1 * Math.sin(e * Math.PI)), t.base.y * (1 + 0.1 * Math.sin(e * Math.PI)), t.base.z * (1 + 0.1 * Math.sin(e * Math.PI)));
                        c.acc[i] = (c.acc[i] || 0) + dt;
                        if (c.phase !== 'out' && c.acc[i] > 0.12) { c.acc[i] = 0; emit('✨', f.midX + (Math.random() - 0.5) * f.w, f.top * (0.3 + Math.random() * 0.7), f.midZ + f.d * 0.55, { vy: 0.3, life: 0.9, size: 0.26 }); }
                    } else {
                        tintAll(t, '#8c8378', 0.55 * e);
                        o.rotation.z = f.rot.z + 0.14 * e;
                    }
                    break;
                case 'weight':
                    if (s.light) {
                        o.position.y = f.pos.y + (0.45 + Math.sin(c.t * 2.2) * 0.06) * e;
                        o.rotation.z = f.rot.z + Math.sin(c.t * 1.8) * 0.06 * e;
                    } else {
                        o.scale.set(t.base.x * (1 + 0.08 * e), t.base.y * (1 - 0.14 * e), t.base.z * (1 + 0.08 * e));
                        c.acc[i] = (c.acc[i] || 0) + dt;
                        if (c.phase === 'in' && c.acc[i] > 0.07) { c.acc[i] = 0; emit('💨', f.midX + (Math.random() - 0.5) * f.w, 0.15, f.midZ + f.d * 0.55, { vy: 0.15, vx: (Math.random() - 0.5) * 0.9, life: 0.8, size: 0.3 }); }
                    }
                    break;
                case 'emote': {
                    const m = s.motion || 'hop';
                    if (s.tint) tintAll(t, s.tint, 0.3 * e);
                    if (m === 'hop') o.position.y = f.pos.y + Math.abs(Math.sin(c.t * 6 + i)) * 0.35 * e;
                    else if (m === 'droop') { o.rotation.z = f.rot.z + 0.12 * e; o.scale.set(t.base.x, t.base.y * (1 - 0.08 * e), t.base.z); }
                    else if (m === 'sway') o.rotation.z = f.rot.z + Math.sin(c.t * 2.5 + i) * 0.1 * e;
                    else if (m === 'shake') o.position.x = f.pos.x + Math.sin(c.t * 40 + i) * 0.04 * e;
                    else if (m === 'jitter') {                                      // 坐立不安：x / z 小幅高频乱抖 + 左右转头（和 zangado 的单轴 shake 区分）
                        o.position.x = f.pos.x + (Math.sin(c.t * 31 + i * 1.7) + Math.sin(c.t * 23 + i)) * 0.022 * e;
                        o.position.z = f.pos.z + Math.sin(c.t * 27 + i * 2.3) * 0.03 * e;
                        o.rotation.y = f.rot.y + Math.sin(c.t * 17 + i) * 0.16 * e;
                    }
                    break;
                }
                case 'speed': {
                    const fast = s.fast !== false, freq = fast ? 6.5 : 1.3, amp = fast ? 1.4 : 0.5, ph = c.t * freq + i * 0.6;
                    o.position.x = f.pos.x + Math.sin(ph) * amp * e;
                    o.rotation.y = f.rot.y + (Math.cos(ph) > 0 ? 1 : -1) * 0.9 * e;
                    break;
                }
                case 'tag':                                                         // 价签：牌子在 init 里挂好了，摆件只轻轻晃一晃（让人注意到价格）
                    o.rotation.y = f.rot.y + Math.sin(c.t * 3 + i) * 0.1 * e;
                    break;
                default: break;
            }
            if (s.burst && c.phase !== 'out') {                         // 奖励型场景：任何效果都可以再叠一层 emoji 迸发（粒子仍受 MAX_PARTICLES 限制）
                c.bacc[i] = (c.bacc[i] || 0) + dt;
                if (c.bacc[i] > 0.11) { c.bacc[i] = 0; emit(s.burst, f.midX + (Math.random() - 0.5) * f.w * 1.1, f.top * (0.2 + Math.random() * 0.8), f.midZ + f.d * 0.55, { vy: 0.5 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.8, life: 1.0, size: 0.3 }); }
            }
        });
        for (const b of bubbles) {                                  // 气泡弹出并轻轻上下浮动
            b.k = Math.min(1, b.k + dt / 0.35);
            const pop = backOut(b.k) * (c.phase === 'out' ? clamp01(c.p) : 1);
            b.mesh.scale.setScalar(Math.max(0.01, pop));
            b.mesh.position.y = b.target.fx.top + 0.6 + Math.sin(c.t * 3) * 0.05;
        }
    }

    function updateParticles(dt, camera) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i]; p.age += dt;
            if (p.age >= p.life) { dropMesh(p.mesh); particles.splice(i, 1); continue; }
            p.mesh.position.y += p.vy * dt; p.mesh.position.x += p.vx * dt;
            p.mesh.material.opacity = 1 - Math.pow(p.age / p.life, 2);
            if (camera) p.mesh.quaternion.copy(camera.quaternion);
        }
        if (camera) for (const b of bubbles) b.mesh.quaternion.copy(camera.quaternion);
    }

    return {
        kinds: EFFECT_KINDS,
        get active() { return !!cur; },
        /* 播一个效果。dur = 从开始到"结束"的秒数；hold = true 时到点后保持变化后的样子（resolve 在 dur 到点，之后一直保持直到 clear / 下一个 play）。
           没有 spec、或当前没有摆件可变时直接 resolve（调用方不用判断）。 */
        play(spec, { dur = 2.4, hold = false, targets: given } = {}) {
            if (cur) finish(cur);
            if (!spec || !EFFECT_KINDS.includes(spec.kind)) return Promise.resolve();
            const targets = given || (arena.rewardTargets ? arena.rewardTargets() : (arena.variantTargets ? arena.variantTargets() : []));        // given：性数配对时作用在指定展台的摆件上
            if (!targets.length) return Promise.resolve();
            targets.forEach(t => { prep(t); t.bounce = 0; });     // 交付时的"弹一下"会改缩放，先掐掉，免得和效果打架
            return new Promise(res => {
                cur = { spec, targets, t: 0, p: 0, dur, hold, res, phase: 'in', acc: [], bacc: [], timer: 0 };
                init(cur);
                if (onStart) onStart(spec, dur);
                const name = sfx ? sfxOf(spec) : null;
                if (name) { if (sfxDelay > 0) cur.timer = setTimeout(() => { cur.timer = 0; sfx(name); }, sfxDelay); else sfx(name); }
            });
        },
        clear() { if (cur) finish(cur); },
        tick(dt, camera) {
            if (cur) {
                const c = cur; c.t += dt;
                if (c.phase === 'in') { c.p = Math.min(1, c.p + dt / RAMP_IN); if (c.p >= 1) c.phase = 'hold'; }
                if (c.phase === 'hold' && c.t >= c.dur) {
                    if (c.hold) { if (c.res) { const r = c.res; c.res = null; r(); } }      // 保持：只 resolve，样子留着
                    else { c.phase = 'out'; if (sfx) sfx('fx_revert'); }
                }
                if (c.phase === 'out') { c.p = Math.max(0, c.p - dt / RAMP_OUT); if (c.p <= 0) { finish(c); updateParticles(dt, camera); return; } }
                const e = c.phase === 'in' ? backOut(c.p) : easeInOut(c.p);
                apply(c, c.phase === 'out' ? easeInOut(c.p) : (c.phase === 'in' ? Math.min(1.12, e) : 1), dt);
            }
            updateParticles(dt, camera);
        },
        dispose() { if (cur) finish(cur); for (const t of texCache.values()) t.dispose && t.dispose(); texCache.clear(); }
    };
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }