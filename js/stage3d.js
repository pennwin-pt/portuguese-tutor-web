/* 场景演练 3D 舞台（Three.js）。由 scene.js 动态 import，失败或没有布局时 scene.js 自动继续用 2D。
 * 设计要点：
 *  - 只负责“画面”：背景、人物、镜头、特效。剧情/判分/泄露保护仍在 scene.js。
 *  - 全局只建一个 WebGLRenderer（iOS 对 WebGL context 数量有限制，words.js 会连续播很多个词）。
 *  - DOM 按钮（热点、人物点击区、气泡、篮子）通过 follow() 每帧投影到 3D 位置，点击区仍是 DOM，保证 44px 和可访问性。
 *  - 模型缺失时用简易几何体代替，所以没放 glb 也能跑。 */
import * as T from './vendor/three-bundle.js';
import { LAYOUTS } from './stage3d-layouts.js';

const MODEL_BASE = new URL('../models/', import.meta.url).href;
const LOAD_TIMEOUT = 12000;
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

let shared = null;        // { renderer, canvas }
let active = null;        // 当前唯一的舞台实例
const cache = new Map();  // path -> Promise<gltf|null>
let blobTex = null;

function getRenderer() {
    if (shared) return shared;
    const canvas = document.createElement('canvas');
    canvas.className = 'sc-3d-canvas';
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        const a = active; shared = null;
        if (a) a.fail();
    });
    return (shared = { renderer, canvas });
}

function loadModel(path) {
    if (!cache.has(path)) {
        const loader = new T.GLTFLoader();
        const task = new Promise(res => {
            const timer = setTimeout(() => res(null), LOAD_TIMEOUT);
            loader.load(`${MODEL_BASE}${path}.glb`, g => { clearTimeout(timer); res(g); },
                undefined, () => { clearTimeout(timer); res(null); });
        });
        cache.set(path, task);
    }
    return cache.get(path);
}

const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const mat = c => new T.MeshLambertMaterial({ color: c });

function blobShadow() {
    if (!blobTex) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(0,0,0,.38)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        blobTex = new T.CanvasTexture(c);
    }
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.scale.set(0.9, 0.9, 1);
    return m;
}

/* ---------- 简易几何体兜底（模型缺失时） ---------- */
function fallbackProp(spec) {
    const fb = spec.fb || {}, h = spec.h || 1, w = fb.w || h * 0.8, g = new T.Group();
    if (fb.parts) {                                      // 用布局里写的小零件拼家具；整体会按 h 自动缩放，零件只需比例对
        for (const q of fb.parts) {
            const geo = q.shape === 'cyl' ? new T.CylinderGeometry(q.size[0] / 2, q.size[0] / 2, q.size[1], 16)
                : q.shape === 'sph' ? new T.SphereGeometry(q.size[0] / 2, 14, 10)
                    : new T.BoxGeometry(q.size[0], q.size[1], q.size[2]);
            const m = new T.Mesh(geo, mat(q.color)); m.position.set(q.pos[0], q.pos[1], q.pos[2]); g.add(m);
        }
    } else if (fb.tree) {
        const s = fb.small ? 0.5 : 1;
        const trunk = new T.Mesh(new T.CylinderGeometry(0.1 * s, 0.14 * s, h * 0.4, 8), mat('#8b5a2b')); trunk.position.y = h * 0.2;
        const crown = new T.Mesh(new T.SphereGeometry(h * 0.3, 12, 10), mat('#4caf50')); crown.position.y = h * 0.62;
        g.add(trunk, crown);
    } else if (fb.shelf) {
        const frame = new T.Mesh(new T.BoxGeometry(w, h, 0.5), mat(fb.color || '#c58b4e')); frame.position.y = h / 2;
        g.add(frame);
        for (let i = 0; i < 3; i++) {
            const board = new T.Mesh(new T.BoxGeometry(w * 0.9, 0.07, 0.56), mat('#a56a34'));
            board.position.set(0, h * (0.2 + i * 0.28), 0.04); g.add(board);
        }
    } else {
        const box = new T.Mesh(new T.BoxGeometry(w, h, fb.d || w * 0.9), mat(fb.color || '#cccccc')); box.position.y = h / 2;
        g.add(box);
        if (h > 3 || fb.house) {                         // 建筑：加一排窗和屋顶，别太像盒子
            const roof = new T.Mesh(new T.BoxGeometry(w * 1.08, 0.25, (fb.d || w * 0.9) * 1.08), mat('#8b5e3c')); roof.position.y = h + 0.12;
            g.add(roof);
            for (let i = -1; i <= 1; i += 2) {
                const win = new T.Mesh(new T.BoxGeometry(0.55, 0.7, 0.05), mat('#cfe9ff'));
                win.position.set(i * w * 0.24, h * 0.6, (fb.d || w * 0.9) / 2 + 0.03); g.add(win);
            }
        }
    }
    return g;
}

function fallbackPerson(look) {
    const g = new T.Group(), shirt = look?.shirt || '#3d9be9', hair = look?.hair || '#1f2937';
    for (const x of [-0.12, 0.12]) { const l = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.62, 8), mat('#374151')); l.position.set(x, 0.31, 0); g.add(l); }
    const body = new T.Mesh(new T.CapsuleGeometry(0.27, 0.46, 4, 10), mat(shirt)); body.position.y = 0.98; g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.25, 14, 12), mat('#f5cba7')); head.position.y = 1.52; g.add(head);
    const cap = new T.Mesh(new T.SphereGeometry(0.265, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hair)); cap.position.y = 1.55; g.add(cap);
    for (const x of [-0.09, 0.09]) { const e = new T.Mesh(new T.SphereGeometry(0.03, 6, 6), mat('#111827')); e.position.set(x, 1.53, 0.23); g.add(e); }
    return g;
}

/* 缩放到目标高度/宽度，并把底部中心放到原点 */
function normalize(obj, spec) {
    const box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3());
    const k = spec.h && size.y > 1e-4 ? spec.h / size.y : spec.w && size.x > 1e-4 ? spec.w / size.x : 1;
    obj.scale.multiplyScalar(k); obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    const c = box.getCenter(new T.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
    const holder = new T.Group(); holder.add(obj);
    holder.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    return holder;
}

const CLIPS = { idle: /idle|stand/i, walk: /walk/i, wave: /wave|talk|hello|interact|emote|greet/i, cheer: /jump|cheer|dance|victory|happy|yes|celebrat/i };

export async function create(opts) {
    const { view, tpl, hotspots = [], debug = false, onLost } = opts;
    const layout = LAYOUTS[tpl.id];
    if (!layout) return null;
    const startLoc = tpl.roomOnly ? 'place' : 'street';     // 房间类场景：朋友/帮手是同一个人，已经在室内，没有街道镜头
    if (!layout.cameras || !layout.cameras[startLoc]) { console.warn('stage3d: 布局缺少镜头', tpl.id, startLoc); return null; }
    for (const h of hotspots) if (!layout.hotspots[h.id]) { console.warn('stage3d: 布局缺少热点', tpl.id, h.id); return null; }

    let sh;
    try { sh = getRenderer(); } catch (e) { console.warn('stage3d: WebGL 不可用', e); return null; }
    if (active) active.dispose();
    const { renderer, canvas } = sh;

    /* ---- 场景基础 ---- */
    const scene = new T.Scene();
    scene.background = new T.Color(layout.sky || '#cfe9ff');
    scene.add(new T.HemisphereLight('#ffffff', '#b7c4a6', 1.55));
    const sun = new T.DirectionalLight('#fff4e0', 1.5); sun.position.set(6, 12, 9); scene.add(sun);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
    const world = new T.Group(); scene.add(world);

    for (const b of layout.blocks || []) {
        const m = new T.Mesh(new T.BoxGeometry(...b.size), mat(b.color)); m.position.set(...b.pos); world.add(m);
    }

    /* ---- 模型：并行加载，缺失的记录下来 ---- */
    const missing = new Set();
    const want = new Set();
    for (const p of layout.props || []) if (p.model) want.add(p.model);
    for (const a of Object.values(layout.actors || {})) if (a.model) want.add(a.model);
    const loaded = {};
    await Promise.all([...want].map(async m => { loaded[m] = await loadModel(m); if (!loaded[m]) missing.add(m); }));

    const instance = (path, spec) => {
        const g = loaded[path];
        if (!g) return null;
        return normalize(T.cloneSkinned(g.scene), spec);
    };

    const hsObjs = {};      // 热点 id -> 物件数组（同一个热点可以由几个物件组成，比如“几座房子”）
    for (const p of layout.props || []) {
        const obj = instance(p.model, p) || normalize(fallbackProp(p), { h: p.h });
        obj.position.set(...p.pos); obj.rotation.y = p.rotY || 0;
        world.add(obj);
        if (p.hs) { obj.userData.base = obj.scale.clone(); (hsObjs[p.hs] = hsObjs[p.hs] || []).push(obj); }
    }

    /* ---- 人物 ---- */
    const cssBlue = (getComputedStyle(view).getPropertyValue('--blue') || '').trim() || '#3d9be9';
    const looks = {
        me: { shirt: cssBlue, hair: '#4b2e1e' },
        friend: tpl.cast?.friend ? { shirt: tpl.cast.friend[0], hair: tpl.cast.friend[1] } : null,
        helper: tpl.cast?.helper ? { shirt: tpl.cast.helper[0], hair: tpl.cast.helper[1] } : null
    };
    const actors = {};
    for (const [key, spec] of Object.entries(layout.actors || {})) {
        const g = loaded[spec.model];
        const body = g ? normalize(T.cloneSkinned(g.scene), spec) : normalize(fallbackPerson(looks[key]), { h: spec.h });
        const root = new T.Group(), inner = new T.Group();
        inner.add(body); root.add(inner); root.add(blobShadow());
        const start = tpl.roomOnly ? spec.place : (spec.from || spec.street || spec.place);
        root.position.set(...start);
        world.add(root);
        const a = { key, spec, root, inner, hop: null, face: 0.35, walking: false, mixer: null, actions: {}, cur: null };
        if (g && g.animations?.length) {
            a.mixer = new T.AnimationMixer(body);
            for (const [name, re] of Object.entries(CLIPS)) {
                const clip = g.animations.find(c => re.test(c.name));
                if (clip) a.actions[name] = a.mixer.clipAction(clip);
            }
        }
        actors[key] = a;
    }
    const playClip = (a, name, once) => {
        const next = a.actions[name] || (once ? null : a.actions.idle);
        if (!next || a.cur === next) return;
        next.reset(); next.setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = false;
        if (a.cur) next.crossFadeFrom(a.cur, 0.2, false);
        next.play(); a.cur = next;
    };
    for (const a of Object.values(actors)) { a.root.rotation.y = a.face; playClip(a, 'idle'); }

    /* ---- 镜头 ---- */
    const cams = layout.cameras;
    const camPos = new T.Vector3(...cams[startLoc].pos), camLook = new T.Vector3(...cams[startLoc].look);
    let loc = startLoc;
    const applyCam = () => { camera.position.copy(camPos); camera.lookAt(camLook); };
    applyCam();

    /* ---- 补间 ---- */
    const tweens = [];
    const tween = (dur, fn, done) => {
        if (reduced()) dur = 0;
        const t = { t0: performance.now(), dur, fn, done };
        tweens.push(t); if (dur === 0) { fn(1); tweens.pop(); done && done(); } return t;
    };

    /* ---- 调试：轨道控制 + 坐标读数 ---- */
    let controls = null, readout = null, lastReadout = 0;
    if (debug) {
        controls = new T.OrbitControls(camera, canvas); controls.target.copy(camLook);
        scene.add(new T.GridHelper(80, 80, '#ef4444', '#94a3b8'), new T.AxesHelper(3));
        readout = document.createElement('pre');
        readout.style.cssText = 'position:absolute;z-index:9;left:6px;bottom:6px;margin:0;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.65);color:#fff;font:11px/1.4 monospace;pointer-events:none;white-space:pre-wrap;max-width:94%';
        view.append(readout);
    }

    /* ---- DOM 跟随 ---- */
    const followers = [];
    const proj = new T.Vector3();
    const anchorOf = key => {
        if (key.startsWith('hs:')) { const p = layout.hotspots[key.slice(3)]; return p ? proj.set(...p) : null; }
        const a = actors[key]; if (!a) return null;
        return proj.copy(a.root.position).setY(a.root.position.y + a.inner.position.y);
    };
    const MODES = { mid: [0.9, 'center'], above: [2.05, 'above'], hand: [0.55, 'center'], hot: [0, 'center'] };
    function updateFollowers(w, h) {
        for (let i = followers.length - 1; i >= 0; i--) {
            const f = followers[i];
            if (!f.el.isConnected) { followers.splice(i, 1); continue; }
            const p = anchorOf(f.key); if (!p) continue;
            const [dy, how] = MODES[f.mode] || MODES.mid;
            if (!f.key.startsWith('hs:')) { p.y += dy; if (f.mode === 'hand') p.x += 0.5; }
            p.project(camera);
            const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
            const ew = f.el.offsetWidth, eh = f.el.offsetHeight;
            if (how === 'above') { f.el.style.left = `${Math.round(x - 29)}px`; f.el.style.top = `${Math.round(y - eh - 4)}px`; }
            else { f.el.style.left = `${Math.round(x - ew / 2)}px`; f.el.style.top = `${Math.round(y - eh / 2)}px`; }
        }
    }

    /* ---- 渲染循环 ---- */
    let disposed = false, raf = 0, last = performance.now(), size = { w: 0, h: 0 };
    const resize = () => {
        const w = view.clientWidth, h = view.clientHeight;
        if (!w || !h || (w === size.w && h === size.h)) return;
        size = { w, h };
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // 竖屏窄画面：拉大视野，保证三个货架都在画面内
        const asp = w / h;
        camera.fov = asp < 1.05 ? 44 : asp > 1.8 ? 32 : 38;
        // 把 3D 画面整体往下推一截：顶部留给对话气泡和选项面板，别盖住人物
        camera.setViewOffset(w, h, 0, -Math.round(h * (asp < 1.05 ? 0.23 : 0.14)), w, h);
        camera.updateProjectionMatrix();
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    ro && ro.observe(view);

    const hopOf = (a, now) => {
        if (!a.hop) return 0;
        const p = (now - a.hop.t0) / a.hop.dur;
        if (p >= 1) { a.hop = null; return 0; }
        return Math.abs(Math.sin(p * Math.PI * a.hop.n)) * a.hop.amp;
    };
    function frame(now) {
        if (disposed) return;
        raf = requestAnimationFrame(frame);
        if (!view.isConnected) { api.dispose(); return; }       // 页面已把舞台移除（比如切到下一个词）
        resize();
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        for (let i = tweens.length - 1; i >= 0; i--) {
            const t = tweens[i], p = t.dur ? Math.min(1, (now - t.t0) / t.dur) : 1;
            t.fn(p);
            if (p >= 1) { tweens.splice(i, 1); t.done && t.done(); }
        }
        for (const a of Object.values(actors)) {
            a.inner.position.y = hopOf(a, now) + (a.walking && !a.actions.walk && !reduced() ? Math.abs(Math.sin(now / 110)) * 0.06 : 0);
            a.root.rotation.y += (a.face - a.root.rotation.y) * Math.min(1, dt * 10);
            a.mixer && a.mixer.update(dt);
        }
        if (controls) { if (camTween) applyCam(); else controls.update(); } else applyCam();
        renderer.render(scene, camera);
        updateFollowers(size.w, size.h);
        if (readout && now - lastReadout > 250) {
            lastReadout = now;
            const f = v => v.toArray().map(n => n.toFixed(2)).join(', ');
            readout.textContent = `camera pos: [${f(camera.position)}]\nlook at:    [${f(controls ? controls.target : camLook)}]` + (missing.size ? `\n缺少模型(用兜底几何体): ${[...missing].join(', ')}` : '\n模型全部已加载');
        }
    }

    let camTween = null;
    const actorOf = k => actors[k] || (tpl.roomOnly ? actors.helper : null);   // 房间场景里 friend 和 helper 是同一个人
    const move = (a, to, dur, face) => {
        const from = a.root.position.clone(), dest = new T.Vector3(...to);
        if (face != null) a.face = face;
        a.walking = true; playClip(a, 'walk');
        return tween(dur, p => a.root.position.lerpVectors(from, dest, ease(p)), () => { a.walking = false; playClip(a, 'idle'); });
    };

    const api = {
        missing: [...missing],
        /* 朋友从左边走进街道 */
        enter(who) {
            const a = actorOf(who); if (!a || tpl.roomOnly) return;
            move(a, a.spec.street, 950, Math.PI / 2);
            setTimeout(() => { a.face = -0.45; }, 900);
        },
        talk(who) {
            const a = actorOf(who); if (!a || reduced()) return;
            a.hop = { t0: performance.now(), dur: 1350, n: 3, amp: 0.13 };
            if (a.actions.wave) { playClip(a, 'wave', true); setTimeout(() => playClip(a, 'idle'), 1400); }
        },
        cheer(who) {
            const a = actorOf(who); if (!a || reduced()) return;
            a.hop = { t0: performance.now(), dur: 1500, n: 3, amp: 0.4 };
            if (a.actions.cheer) { playClip(a, 'cheer', true); setTimeout(() => playClip(a, 'idle'), 1500); }
        },
        /* 镜头平移 + “你”走过去 */
        cameraTo(to) {
            if (!cams[to] || to === loc) return;
            const dir = to === 'place' ? 1 : -1, c = cams[to];
            const p0 = camPos.clone(), l0 = camLook.clone(), p1 = new T.Vector3(...c.pos), l1 = new T.Vector3(...c.look);
            loc = to; camTween = tween(1400, p => { const e = ease(p); camPos.lerpVectors(p0, p1, e); camLook.lerpVectors(l0, l1, e); },
                () => { camTween = null; if (controls) controls.target.copy(camLook); });
            const me = actors.me;
            if (me && me.spec[to]) { move(me, me.spec[to], 1400, dir * Math.PI / 2); setTimeout(() => { me.face = 0.35; }, 1400); }
        },
        open(id) { this.bump(id, 1.12, 650); },
        shake(id) {
            const list = hsObjs[id]; if (!list || reduced()) return;
            for (const o of list) tween(350, p => { o.rotation.z = Math.sin(p * Math.PI * 4) * 0.05 * (1 - p); }, () => { o.rotation.z = 0; });
        },
        bump(id, k, dur) {
            const list = hsObjs[id]; if (!list || reduced()) return;
            for (const o of list) {
                const base = o.userData.base;
                tween(dur, p => o.scale.copy(base).multiplyScalar(1 + (k - 1) * Math.sin(p * Math.PI)), () => o.scale.copy(base));
            }
        },
        follow(el, key, mode) {
            const i = followers.findIndex(f => f.el === el);
            if (i >= 0) followers.splice(i, 1);
            followers.push({ el, key, mode: mode || 'mid' });
        },
        fail() { if (disposed) return; api.dispose(); onLost && onLost(); },
        dispose() {
            if (disposed) return; disposed = true;
            cancelAnimationFrame(raf); ro && ro.disconnect();
            controls && controls.dispose(); readout && readout.remove();
            canvas.remove();
            world.traverse(o => { if (o.userData.own) { o.geometry?.dispose(); } });
            if (active === api) active = null;
        }
    };

    view.prepend(canvas);
    if (debug) view.parentElement?.classList.add('is3d-debug');
    active = api;
    resize();
    raf = requestAnimationFrame(frame);
    if (missing.size) console.info('stage3d: 以下模型未找到，已用兜底几何体代替：', [...missing].map(m => `models/${m}.glb`));
    return api;
}