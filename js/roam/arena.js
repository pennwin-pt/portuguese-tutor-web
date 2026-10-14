/* 派对闯关的场地：数据（ARENAS）+ 构建（buildArena）。
   坐标：x 向东、z 向南、y 向上，单位米，中心为原点。每个模板的 arena 字段对应 ARENAS 的键。
   模型都放 models/roam/（characters/friend 复用）；缺文件时用兜底几何体，所以没模型也能玩。
   v1 最小版：N（弹跳垫 → 高台）、E（旋转杆窄桥）是障碍岛，S、A 是平地岛。 */
import * as T from '../vendor/three-bundle.js';
import { shared3d } from '../stage3d.js';

const { loadModel, normalize, blobShadow, fallbackPerson, mat } = shared3d;

export const PLAYER_R = 0.45;

/* 圆环：bundle 里没有 TorusGeometry / RingGeometry，用一圈小长方体拼（xz 平面，中心在原点） */
export function makeRing(r, tube, color, n = 32, opacity = 1) {
    const g = new T.Group(), m = new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    const geo = new T.BoxGeometry(2 * Math.PI * r / n * 1.12, tube, tube * 1.4);
    for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, b = new T.Mesh(geo, m);
        b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); b.rotation.y = -a - Math.PI / 2; g.add(b);
    }
    return g;
}

export const ARENAS = {
    roam_party: {
        sky: '#bfe3ff', seaY: -5, fallY: -6,
        spawn: [-10, 0, 0],                                   // 出生点（脚下的 y）
        ring: { pos: [0, 0, 0], r: 1.3 },                     // 交付环
        friend: { pos: [2.1, 0, 1.3], rotY: -2.2 },           // 朋友站在交付环旁边
        /* tile：top=顶面高度，thick=厚度，rp=掉下去后的重生点（脚下的 xyz），bridge=桥（只影响颜色） */
        tiles: [
            { x: -10, z: 0, w: 4, d: 4, color: '#fde68a', rp: [-10, 0, 0] },
            { x: -5.5, z: 0, w: 5, d: 1.8, thick: 0.3, color: '#e5e7eb' },
            { x: 0, z: 0, w: 6, d: 6, color: '#fbcfe8', rp: [-1.8, 0, 0] },
            { x: 0, z: -4.5, w: 4, d: 3, color: '#ddd6fe', rp: [0, 0, -4.2] },
            { x: 0, z: -8, w: 4, d: 4, top: 2, thick: 2.6, color: '#c4b5fd', rp: [0, 2, -8] },   // N 高台
            { x: 5.5, z: 0, w: 5, d: 2.6, thick: 0.3, color: '#e5e7eb' },                          // E 桥
            { x: 10, z: 0, w: 4, d: 4, color: '#a7f3d0', rp: [10, 0, 0] },
            { x: 0, z: 4.5, w: 2.4, d: 3, thick: 0.3, color: '#e5e7eb' },
            { x: 0, z: 8, w: 4, d: 4, color: '#fed7aa', rp: [0, 0, 8] },
            { x: 4.25, z: -3, w: 2.5, d: 1.2, thick: 0.3, color: '#e5e7eb' },
            { x: 7, z: -4.5, w: 3, d: 3, color: '#bae6fd', rp: [7, 0, -4.5] }
        ],
        pads: [[-1.3, -4.7], [0, -4.7], [1.3, -4.7]],         // 弹跳垫：N 高台前的三级"台阶"
        padSize: 1.2, padHeight: 0.3, padBounce: 11,
        spinners: [{ x: 5.5, z: -1.3, y0: 0.15, y1: 0.55, half: 1.8, hw: 0.2, omega: 0.8 }],   // 杆长 3.6 m、高 0.4 m、转速 0.8 rad/s：随便跑约 6 成能过（原 6 m / 1.2 rad/s 实测几乎过不去）
        /* 四个答案底座；item 悬在底座上方 1.5 米。id 只是名字，哪个选项放哪个由 index.js 洗牌 */
        slots: [{ id: 'N', pos: [0, 2, -8] }, { id: 'E', pos: [10, 0, 0] }, { id: 'S', pos: [0, 0, 8] }, { id: 'A', pos: [7, 0, -4.5] }],
        camIntro: { pos: [0, 22, 20], look: [0, 0, -1] }
    }
};

const MODEL_PATHS = ['roam/platform_tile', 'roam/bounce_pad', 'roam/spinner', 'roam/pedestal', 'roam/delivery_ring', 'roam/cloud', 'characters/friend'];
const CLIPS = { idle: /idle|stand/i, talk: /wave|talk|hello|interact|emote|greet/i, cheer: /jump|cheer|dance|victory|happy|yes|celebrat/i };

/* 非等比缩放到 w×h×d，底面中心放到原点 */
function fitBox(obj, w, h, d) {
    const box = new T.Box3().setFromObject(obj), s = box.getSize(new T.Vector3());
    obj.scale.set(w / Math.max(s.x, 1e-4), h / Math.max(s.y, 1e-4), d / Math.max(s.z, 1e-4)); obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    const c = box.getCenter(new T.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
    const holder = new T.Group(); holder.add(obj);
    return holder;
}

export async function buildArena(arenaId, tpl) {
    const A = ARENAS[arenaId];
    if (!A) throw new Error(`没有名为 ${arenaId} 的场地（js/roam/arena.js 的 ARENAS）`);
    const loaded = {};
    await Promise.all(MODEL_PATHS.map(async p => { loaded[p] = await loadModel(p); }));
    const clone = p => T.cloneSkinned(loaded[p].scene);

    const root = new T.Group();
    const boxes = [];                                         // 静态碰撞：{ min:[x,y,z], max:[x,y,z], bounce?, rp?, pad? }
    const tileMeshes = [];

    /* ---- 平台 / 桥 ---- */
    for (const t of A.tiles) {
        const top = t.top ?? 0, thick = t.thick ?? 0.6;
        let obj;
        if (loaded['roam/platform_tile']) obj = fitBox(clone('roam/platform_tile'), t.w, thick, t.d);
        else { obj = new T.Group(); const m = new T.Mesh(new T.BoxGeometry(t.w, thick, t.d), mat(t.color)); m.position.y = thick / 2; obj.add(m); }
        obj.position.set(t.x, top - thick, t.z);
        root.add(obj); tileMeshes.push(obj);
        boxes.push({ min: [t.x - t.w / 2, top - thick, t.z - t.d / 2], max: [t.x + t.w / 2, top, t.z + t.d / 2], rp: t.rp || null });
    }

    /* ---- 弹跳垫 ---- */
    const pads = [];
    for (const [x, z] of A.pads) {
        let obj;
        if (loaded['roam/bounce_pad']) obj = normalize(clone('roam/bounce_pad'), { w: A.padSize });
        else {
            obj = new T.Group();
            const base = new T.Mesh(new T.CylinderGeometry(A.padSize / 2, A.padSize / 2, A.padHeight, 20), mat('#f472b6')); base.position.y = A.padHeight / 2;
            const top = new T.Mesh(new T.CylinderGeometry(A.padSize / 2.4, A.padSize / 2.4, 0.05, 20), mat('#fbcfe8')); top.position.y = A.padHeight + 0.01;
            obj.add(base, top);
        }
        obj.position.set(x, 0, z); root.add(obj); pads.push({ obj, squash: 0 });
        const h = A.padSize / 2;
        boxes.push({ min: [x - h, 0, z - h], max: [x + h, A.padHeight, z + h], bounce: A.padBounce, pad: pads.length - 1 });
    }

    /* ---- 旋转杆 ---- */
    const spinners = [];
    for (const s of A.spinners) {
        let obj;
        if (loaded['roam/spinner']) obj = normalize(clone('roam/spinner'), { w: s.half * 2 });
        else {
            obj = new T.Group();
            const pole = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.9, 12), mat('#fbbf24')); pole.position.y = 0.45;
            const bar = new T.Mesh(new T.BoxGeometry(s.half * 2, s.y1 - s.y0, s.hw * 2), mat('#fb7185')); bar.position.y = (s.y0 + s.y1) / 2;
            obj.add(pole, bar);
        }
        obj.position.set(s.x, 0, s.z); root.add(obj);
        spinners.push({ ...s, angle: 0, obj });
        boxes.push({ min: [s.x - 0.25, 0, s.z - 0.25], max: [s.x + 0.25, 0.9, s.z + 0.25] });   // 立柱
    }

    /* ---- 答案底座 ---- */
    const slots = A.slots.map(s => {
        let obj;
        if (loaded['roam/pedestal']) obj = normalize(clone('roam/pedestal'), { h: 0.8 });
        else {
            obj = new T.Group();
            const base = new T.Mesh(new T.CylinderGeometry(0.6, 0.7, 0.8, 20), mat('#fff7ed')); base.position.y = 0.4;
            const glow = makeRing(0.55, 0.05, '#fde047', 24); glow.position.y = 0.82;
            obj.add(base, glow);
        }
        obj.position.set(s.pos[0], s.pos[1], s.pos[2]); root.add(obj);
        boxes.push({ min: [s.pos[0] - 0.5, s.pos[1], s.pos[2] - 0.5], max: [s.pos[0] + 0.5, s.pos[1] + 0.8, s.pos[2] + 0.5] });
        return { id: s.id, pos: new T.Vector3(...s.pos), obj };
    });

    /* ---- 交付环 ---- */
    let ringObj;
    if (loaded['roam/delivery_ring']) ringObj = normalize(clone('roam/delivery_ring'), { w: A.ring.r * 2 });
    else {
        ringObj = new T.Group();
        const torus = makeRing(A.ring.r, 0.09, '#4ade80', 40); torus.position.y = 0.06;
        const disc = new T.Mesh(new T.CylinderGeometry(A.ring.r, A.ring.r, 0.02, 40), new T.MeshBasicMaterial({ color: '#86efac', transparent: true, opacity: 0.35, depthWrite: false })); disc.position.y = 0.03;
        ringObj.add(torus, disc);
    }
    ringObj.position.set(...A.ring.pos); ringObj.visible = false; root.add(ringObj);
    const ring = { pos: new T.Vector3(...A.ring.pos), r: A.ring.r, obj: ringObj, active: false };

    /* ---- 朋友（站在交付环旁；talk / cheer 播动画，没有动画就原地跳一下） ---- */
    const fl = tpl.cast?.friend ? { shirt: tpl.cast.friend[0], hair: tpl.cast.friend[1] } : null;
    const fg = loaded['characters/friend'];
    const body = fg ? normalize(clone('characters/friend'), { h: 1.7 }) : normalize(fallbackPerson(fl), { h: 1.7 });
    const friendRoot = new T.Group(); friendRoot.add(body, blobShadow());
    friendRoot.position.set(...A.friend.pos); friendRoot.rotation.y = A.friend.rotY || 0;
    root.add(friendRoot);
    const friend = { root: friendRoot, mixer: null, actions: {}, hop: 0, current: null };
    if (fg && fg.animations?.length) {
        friend.mixer = new T.AnimationMixer(body);
        for (const [name, re] of Object.entries(CLIPS)) {
            const clip = fg.animations.find(c => re.test(c.name));
            if (clip) friend.actions[name] = friend.mixer.clipAction(clip);
        }
        if (friend.actions.idle) { friend.actions.idle.play(); friend.current = friend.actions.idle; }
    }
    friend.play = name => {                                     // 'talk' | 'cheer'：播一次再回到 idle
        const a = friend.actions[name];
        if (!a) { friend.hop = 1; return; }
        a.reset(); a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = false; a.play();
        if (friend.current && friend.current !== a) friend.current.crossFadeTo(a, 0.15, false);
        const done = e => { if (e.action !== a) return; friend.mixer.removeEventListener('finished', done); if (friend.actions.idle) { friend.actions.idle.reset().play(); a.crossFadeTo(friend.actions.idle, 0.2, false); friend.current = friend.actions.idle; } };
        friend.mixer.addEventListener('finished', done); friend.current = a;
    };

    /* ---- 海面 + 装饰云（掉下去有东西接着；云只有放了模型才出现） ---- */
    const sea = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = A.seaY; root.add(sea);
    if (loaded['roam/cloud']) {
        [[-14, 4, -14, 4], [16, 6, -10, 5], [-6, 7, 18, 4.5]].forEach(([x, y, z, w]) => { const c = normalize(clone('roam/cloud'), { w }); c.position.set(x, y, z); root.add(c); });
    }

    /* ---- 灯光 ---- */
    root.add(new T.HemisphereLight('#ffffff', '#b6d4ff', 1.5));
    const sun = new T.DirectionalLight('#ffffff', 1.6); sun.position.set(-6, 12, 8); root.add(sun);

    let t = 0;
    return {
        root, boxes, spinners, slots, ring, friend, pads, spawn: A.spawn, fallY: A.fallY, sky: A.sky, camIntro: A.camIntro, ringR: A.ring.r,
        padHit(i) { if (pads[i]) pads[i].squash = 1; },
        update(dt) {
            t += dt;
            for (const s of spinners) { s.obj.rotation.y = -s.angle; }
            for (const p of pads) { if (p.squash > 0) { p.squash = Math.max(0, p.squash - dt * 4); const k = 1 - 0.35 * Math.sin(p.squash * Math.PI); p.obj.scale.set(1 + (1 - k) * 0.6, k, 1 + (1 - k) * 0.6); } }
            if (ring.active) { const k = 1 + Math.sin(t * 5) * 0.06; ring.obj.scale.set(k, 1, k); }
            if (friend.mixer) friend.mixer.update(dt);
            if (friend.hop > 0) { friend.hop = Math.max(0, friend.hop - dt * 2.2); friend.root.position.y = A.friend.pos[1] + Math.sin(friend.hop * Math.PI) * 0.35; }
        },
        dispose() {
            root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); });
        }
    };
}
