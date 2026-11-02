/* 走路版的"两次选择"：先在门厅里选一扇门（选大类），门打开后进入原来的场地，再在场地里选词。
   - 大类是预设的几个（DOOR_CATEGORIES），和词的真实含义无关：正确答案在每扇门后面的房间里都有，所以选哪扇门都能通关；
     门只决定"这一间的干扰项是哪几个 + 房间里摆什么类别的小东西"。
   - 门厅是和场地分开的一块小地方（自己的地板 / 墙 / 灯光 / 碰撞盒），roam/index.js 在两者之间切换，不改任何 ARENAS 数据。
   - 所有模型都是可选的：缺文件时门用程序几何体、房间摆设用 emoji 面片，所以没有模型也能玩。
   模型清单（都放 models/ 下，没有就用兜底）：
     roam/door.glb              单扇门板（正面朝 +z，高:宽 ≈ 2.3:1.5，门轴假定在左边缘，代码会把它绕左边缘转开）
     roam/cat/<id>.glb          每个类别 3 个摆设，见 DOOR_CATEGORIES[].deco[].model */
import * as T from '../vendor/three-bundle.js';
import { shared3d } from '../stage3d.js';
import { makeRing } from './arena.js';
import { emojiTexture } from './effects.js';

const { loadModel, normalize, mat, ease } = shared3d;

export const DOOR_CATEGORIES = [
    { id: 'food', icon: '🍎', zh: '吃的', color: '#f87171',
        deco: [{ model: 'roam/cat/food_apple', emoji: '🍎', h: 0.8 }, { model: 'roam/cat/food_bread', emoji: '🍞', h: 0.7 }, { model: 'roam/cat/food_milk', emoji: '🥛', h: 0.8 }] },
    { id: 'home', icon: '🏠', zh: '家里', color: '#60a5fa',
        deco: [{ model: 'roam/cat/home_lamp', emoji: '💡', h: 1.0 }, { model: 'roam/cat/home_chair', emoji: '🪑', h: 0.9 }, { model: 'roam/cat/home_plant', emoji: '🪴', h: 0.9 }] },
    { id: 'school', icon: '🎒', zh: '学校', color: '#34d399',
        deco: [{ model: 'roam/cat/school_bag', emoji: '🎒', h: 0.8 }, { model: 'roam/cat/school_books', emoji: '📚', h: 0.6 }, { model: 'roam/cat/school_pencil', emoji: '✏️', h: 0.9 }] },
    { id: 'play', icon: '🧸', zh: '玩的', color: '#fbbf24',
        deco: [{ model: 'roam/cat/play_teddy', emoji: '🧸', h: 0.8 }, { model: 'roam/cat/play_ball', emoji: '⚽', h: 0.6 }, { model: 'roam/cat/play_car', emoji: '🚗', h: 0.6 }] }
];

/* 从预设里取 count 个：起点按 seed 轮转，所以同一个词同一天门的顺序不变，换个词顺序会变 */
export function pickCategories(count, seed) {
    const n = DOOR_CATEGORIES.length, start = Math.abs(Math.floor(seed || 0)) % n;
    return Array.from({ length: Math.max(1, Math.min(count, n)) }, (_, i) => DOOR_CATEGORIES[(start + i) % n]);
}

const LOBBY = { sky: '#bfe3ff', zBack: -3.7, spawn: [0, 0, 3.6], spacing: 5.4, doorFront: 1.3 };
export const LOBBY_SKY = LOBBY.sky;

/* ---------- 门厅 ---------- */
export async function buildLobby(cats) {
    const doorGltf = await loadModel('roam/door');
    const { zBack } = LOBBY;
    const group = new T.Group(); group.visible = false;
    const boxes = [];

    // 地面和 roam_party 一样：一块块悬空的小岛 + 窄桥，四周是海，掉下去回最近的重生点。
    // 出生岛在南边，每扇门各站在自己北边的一座小岛上，用窄桥和出生岛相连。
    const tile = (x, z, w, d, top, thick, color, rp) => {
        const m = new T.Mesh(new T.BoxGeometry(w, thick, d), mat(color)); m.position.set(x, top - thick / 2, z); group.add(m);
        boxes.push({ min: [x - w / 2, top - thick, z - d / 2], max: [x + w / 2, top, z + d / 2], rp: rp || null });
    };
    const n = cats.length, spacing = LOBBY.spacing, ISLAND = ['#fde68a', '#a7f3d0', '#bae6fd', '#fbcfe8'];
    tile(0, 3.6, 7 + Math.max(0, n - 3) * 2, 5, 0, 0.6, '#fbcfe8', LOBBY.spawn.slice());          // 出生岛（z 1.1 ~ 6.1）
    for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * spacing;
        tile(x, 0, 1.6, 2.4, 0, 0.3, '#e5e7eb', null);                                              // 桥（z -1.2 ~ 1.2，和两头的岛各重叠一点）
        tile(x, -2.8, 3.8, 3.6, 0, 0.6, ISLAND[i % ISLAND.length], [x, 0, -2.4]);                  // 门前的小岛（z -4.6 ~ -1.0）
        boxes.push({ min: [x - 1.2, 0, zBack - 0.5], max: [x + 1.2, 3.2, zBack - 0.05] });          // 门后的墙垛（挡住不让走进门里）
        const slab = new T.Mesh(new T.BoxGeometry(2.4, 3.2, 0.45), mat('#f3dccb')); slab.position.set(x, 1.6, zBack - 0.3); group.add(slab);
    }
    const sea = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -2.5; group.add(sea);

    // 门：门框 + 能转开的门板 + 门后的发光色块（开门时亮起）+ 门上方的类别图标 + 门前地上的色环
    const doors = cats.map((cat, i) => {
        const x = (i - (n - 1) / 2) * spacing;
        const g = new T.Group(); g.position.set(x, 0, zBack); group.add(g);
        const hole = new T.Mesh(new T.PlaneGeometry(1.5, 2.3), new T.MeshBasicMaterial({ color: '#111827' })); hole.position.set(0, 1.15, 0.02); g.add(hole);
        const glowMat = new T.MeshBasicMaterial({ color: cat.color, transparent: true, opacity: 0, depthWrite: false });
        const glow = new T.Mesh(new T.PlaneGeometry(1.5, 2.3), glowMat); glow.position.set(0, 1.15, 0.03); g.add(glow);
        const fm = mat('#7c5a3a');
        for (const sx of [-0.84, 0.84]) { const post = new T.Mesh(new T.BoxGeometry(0.18, 2.5, 0.28), fm); post.position.set(sx, 1.25, 0.12); g.add(post); }
        const lintel = new T.Mesh(new T.BoxGeometry(1.86, 0.2, 0.28), fm); lintel.position.set(0, 2.4, 0.12); g.add(lintel);

        const hinge = new T.Group(); hinge.position.set(-0.75, 0, 0.1); g.add(hinge);          // 门轴在门板左边缘，绕它转开
        if (doorGltf) {
            const m = normalize(T.cloneSkinned(doorGltf.scene), { h: 2.3 });
            const w = new T.Box3().setFromObject(m).getSize(new T.Vector3()).x;
            m.position.x = w / 2; hinge.add(m);
        } else {
            const panel = new T.Mesh(new T.BoxGeometry(1.5, 2.3, 0.1), mat(cat.color)); panel.position.set(0.75, 1.15, 0); hinge.add(panel);
            const knob = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), mat('#fde68a')); knob.position.set(1.28, 1.1, 0.09); hinge.add(knob);
            const icon = new T.Mesh(new T.PlaneGeometry(0.75, 0.75), new T.MeshBasicMaterial({ map: emojiTexture(cat.icon, 128), transparent: true, depthWrite: false }));
            icon.position.set(0.75, 1.45, 0.056); hinge.add(icon);
        }
        const sign = new T.Mesh(new T.PlaneGeometry(0.95, 0.95), new T.MeshBasicMaterial({ map: emojiTexture(cat.icon, 128), transparent: true, depthWrite: false }));
        sign.position.set(0, 3.0, 0.15); g.add(sign);
        const ringMark = makeRing(0.8, 0.05, cat.color, 28); ringMark.position.set(0, 0.05, LOBBY.doorFront); g.add(ringMark);
        return { idx: i, cat, x, front: new T.Vector3(x, 0, zBack + LOBBY.doorFront), hinge, glowMat, k: 0, dir: 0 };
    });

    // 门厅自己的灯光（场地的灯在 arena.root 里，场地隐藏时它们也不亮）
    group.add(new T.HemisphereLight('#ffffff', '#e8d8c0', 1.6));
    const sun = new T.DirectionalLight('#ffffff', 1.4); sun.position.set(-4, 10, 8); group.add(sun);

    return {
        group, boxes, doors, spawn: LOBBY.spawn.slice(), fallY: -4, sky: LOBBY.sky,
        open(i) { if (doors[i]) doors[i].dir = 1; },
        closeAll() { for (const d of doors) d.dir = -1; },
        update(dt) {
            for (const d of doors) {
                if (!d.dir) continue;
                d.k = Math.max(0, Math.min(1, d.k + d.dir * dt / 0.6));
                if (d.k === 0 || d.k === 1) d.dir = 0;
                d.hinge.rotation.y = ease(d.k) * 1.75;                                          // 门板的自由边转向墙里面（-z）
                d.glowMat.opacity = ease(d.k) * 0.85;
            }
        },
        dispose() {
            group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); });
        }
    };
}

/* ---------- 进了某一间以后，在 4 个答案底座旁边摆这个类别的小东西（有模型用模型，没有就用会上下飘、朝向镜头的 emoji 面片） ---------- */
export async function buildDeco(cat, slots) {
    const group = new T.Group(), floaters = [];
    const models = {};
    await Promise.all(cat.deco.map(async d => { models[d.model] = await loadModel(d.model); }));
    slots.forEach((s, i) => {
        const item = cat.deco[i % cat.deco.length], side = i % 2 === 0 ? 1 : -1;
        const x = s.pos.x + side * 0.95, z = s.pos.z + 0.35, y = s.pos.y, g = models[item.model];
        if (g) {
            const o = normalize(T.cloneSkinned(g.scene), { h: item.h || 0.8 });
            o.position.set(x, y, z); o.rotation.y = -side * 0.5; group.add(o);
        } else {
            const m = new T.Mesh(new T.PlaneGeometry(0.8, 0.8), new T.MeshBasicMaterial({ map: emojiTexture(item.emoji, 128), transparent: true, depthWrite: false }));
            m.renderOrder = 5; m.position.set(x, y + 0.55, z); group.add(m);
            floaters.push({ m, y: y + 0.55, phase: i * 1.3 });
        }
    });
    return {
        group,
        update(t, camera) { for (const f of floaters) { f.m.position.y = f.y + Math.sin(t * 2 + f.phase) * 0.06; if (camera) f.m.quaternion.copy(camera.quaternion); } },
        dispose() {
            group.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry') { o.geometry.dispose(); o.material.dispose(); } });
        }
    };
}