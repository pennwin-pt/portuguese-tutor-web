/* 派对闯关（roam）：scene.js 在 tpl.roam 时动态 import 本模块，create() 返回的对象和 stage3d 的接口兼容
   （follow / enter / talk / cheer / cameraTo / dispose / fail），另外多了 run() 和 deliver()：
     run(opts)   —— 玩家在场地里跑动、抓取；每次抓取调用 opts.onGrab(pad)（scene.js 在那里调 evaluate），答对时 resolve。
     deliver()   —— 带着抓对的物件走进交付环时 resolve。
   一次抓取 = 一次 onGrab；已答对（pad.scored）的物件掉下去后再抓不会再调用 onGrab。 */
import * as T from '../vendor/three-bundle.js';
import { shared3d, claimActive, releaseActive } from '../stage3d.js';
import { buildArena, makeRing, PLAYER_R, FRIEND_H } from './arena.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { PHYS, createPlayer, respawn, stepPlayer } from './physics.js';

const { getRenderer, loadModel, normalize, blobShadow, mat, ease, reduced } = shared3d;
const SFX_BASE = new URL('../../sounds/roam/', import.meta.url).href;
const ORB_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24'];
const CAM = { dist: 6.5, pitch: 28 * Math.PI / 180, height: 1.0, follow: 6 };
const AUTO_GRAB_S = 0.8, AUTO_GRAB_SPEED = 0.5, AUTO_GRAB_CONE = 60 * Math.PI / 180;

const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 无痕模式等 */ } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const lerpN = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const sfxCache = {};
function sfx(name) {
    try {
        const a = sfxCache[name] || (sfxCache[name] = new Audio(`${SFX_BASE}${name}.wav`));
        a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => { });
    } catch { /* 没有音效文件就静默 */ }
}

export async function create({ view, tpl, debug, onLost, ctx, variant }) {
    const sh = getRenderer(), renderer = sh.renderer, canvas = sh.canvas;
    const arena = await buildArena(tpl.arena, tpl);
    if (arena.variantCount) arena.setVariant(Number.isInteger(variant) ? variant : 0);      // 形容词走路版：从开场对话起展台上就摆着本词语境的名词
    const playerGltf = await loadModel('roam/player');

    const scene = new T.Scene();
    scene.background = new T.Color(arena.sky); scene.fog = new T.Fog(arena.sky, 45, 100);
    scene.add(arena.root);
    const camera = new T.PerspectiveCamera(55, 1, 0.1, 200);

    /* ---------- 玩家：蛋形小人（有 roam/player.glb 用模型，没有用兜底；动画都是程序做的） ---------- */
    const pv = new T.Group(), inner = new T.Group(); pv.add(inner);
    let hands = [];
    if (playerGltf) {
        const body = normalize(T.cloneSkinned(playerGltf.scene), { h: 0.95 }); inner.add(body);
        const hl = body.getObjectByName('HandL'), hr = body.getObjectByName('HandR');
        if (hl && hr) hands = [hl, hr];
    } else {
        const egg = new T.Mesh(new T.SphereGeometry(1, 24, 18), mat('#fcd34d')); egg.scale.set(0.42, 0.52, 0.42); egg.position.y = 0.52;
        const belly = new T.Mesh(new T.SphereGeometry(1, 16, 12), mat('#fef3c7')); belly.scale.set(0.3, 0.34, 0.2); belly.position.set(0, 0.4, 0.28);
        inner.add(egg, belly);
        for (const x of [-0.13, 0.13]) {
            const eye = new T.Mesh(new T.SphereGeometry(0.05, 8, 8), mat('#111827')); eye.position.set(x, 0.68, 0.36); inner.add(eye);
            const cheek = new T.Mesh(new T.SphereGeometry(0.05, 8, 8), mat('#fb7185')); cheek.position.set(x * 1.6, 0.58, 0.34); cheek.scale.z = 0.4; inner.add(cheek);
            const foot = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), mat('#f59e0b')); foot.position.set(x * 1.2, 0.08, 0.06); foot.scale.set(1, 0.6, 1.3); inner.add(foot);
            const hand = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), mat('#fcd34d')); hand.position.set(x * 3.1, 0.4, 0.04); inner.add(hand); hands.push(hand);
        }
    }
    const handBase = hands.map(h => h.position.clone());
    scene.add(pv);
    const shadow = blobShadow(); shadow.scale.set(0.95, 0.95, 1); scene.add(shadow);

    const world = { boxes: arena.boxes, spinners: arena.spinners, fallY: arena.fallY };
    const P = createPlayer(arena.spawn);
    /* 起跳 / 落地的小灰尘：同屏 ≤ 8 个，0.45 秒淡出；系统开了“减少动态效果”就不出现 */
    const dust = [], dustGeo = new T.SphereGeometry(0.1, 8, 6);
    function puff(n, spread, up) {
        if (reduced()) return;
        for (let k = 0; k < n && dust.length < 8; k++) {
            const m = new T.Mesh(dustGeo, new T.MeshBasicMaterial({ color: '#f1f5f9', transparent: true, opacity: 0.7, depthWrite: false })), a = Math.random() * Math.PI * 2;
            m.position.set(P.x + Math.cos(a) * 0.25, P.y - PLAYER_R + 0.08, P.z + Math.sin(a) * 0.25); scene.add(m);
            dust.push({ m, vx: Math.cos(a) * spread, vz: Math.sin(a) * spread, vy: up, t: 0 });
        }
    }
    // 形容词变形工坊：摆件按词义变化（没有 pad.fx / playFx 时完全不运行）。M6：效果音按 kind 播；有变形机时先"咔哒"一声、效果音延后 0.3 秒，并让机器的灯和齿轮动起来
    const fx = createEffects({
        scene, arena, sfx, sfxDelay: arena.hasMachine ? 300 : 0,
        onStart: (spec, dur) => { if (arena.hasMachine) { arena.machineRun(dur); sfx('machine'); } }
    });
    const flights = [];                                            // 抓错后飞向展台的词牌副本 { m, from, to, k, done }
    const startFacing = arena.startYaw != null ? arena.startYaw + Math.PI : Math.PI / 2;   // 场地写了 startYaw（形容词展台 / 舞台：朝北）就按它出生，否则朝东
    P.facing = startFacing;                                        // 出生朝东（朝中枢）
    let yaw = arena.startYaw != null ? arena.startYaw : -Math.PI / 2;   // 镜头水平角：镜头在人物西侧、朝东（中枢方向）看；0 = 镜头在南侧朝北看

    /* ---------- DOM：HUD + 标签层 ---------- */
    const labelsLayer = el('div', 'rm-labels');
    const hud = el('div', 'rm-hud'); hud.hidden = true;
    hud.innerHTML = `
        <div class="rm-clue"><span class="rm-clue-emoji"></span><span class="rm-clue-zh"></span></div>
        <button class="rm-pause" type="button" aria-label="暂停">⏸</button>
        <div class="rm-zone rm-zone-l"></div><div class="rm-zone rm-zone-r"></div>
        <div class="rm-joy"><div class="rm-joy-base"><div class="rm-joy-knob"></div></div></div>
        <button class="rm-btn rm-grab" type="button" aria-label="抓">🤲</button>
        <button class="rm-btn rm-jump" type="button" aria-label="跳">⤴</button>
        <div class="rm-arrow" hidden>▲</div>
        <button class="rm-fast" type="button" hidden>⚡ 快速通道</button>
        <div class="rm-confirm" hidden><div class="rm-confirm-box"><div class="rm-confirm-title">已暂停</div>
            <button class="rm-c-resume" type="button">▶ 继续</button><button class="rm-c-auto" type="button"></button><button class="rm-c-exit" type="button">退出场景</button></div></div>
        <div class="rm-fade"></div>`;
    const rotate = el('div', 'rm-rotate', '📱 请把平板横过来玩');
    view.prepend(canvas);
    view.append(labelsLayer, hud, rotate);
    const $ = s => hud.querySelector(s);
    const clueEmoji = $('.rm-clue-emoji'), clueZh = $('.rm-clue-zh'), arrow = $('.rm-arrow'), fastBtn = $('.rm-fast'), fade = $('.rm-fade'),
        confirmBox = $('.rm-confirm'), grabBtn = $('.rm-grab'), autoBtn = $('.rm-c-auto');
    const input = createInput(hud);
    input.setEnabled(false);

    /* ---------- 渲染器尺寸与自适应画质 ---------- */
    let dprCap = Math.min(2, parseFloat(lsGet('roam_dpr')) || 2), W = 1, H = 1;
    const resize = () => {
        W = Math.max(1, view.clientWidth); H = Math.max(1, view.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap)); renderer.setSize(W, H, false);
        camera.aspect = W / H; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(view); resize();
    let qAcc = 0, qN = 0;
    const quality = dt => {
        qAcc += dt; qN++;
        if (qAcc < 2) return;
        const avg = qAcc / qN * 1000; qAcc = 0; qN = 0;
        if (avg > 28 && dprCap > 1) { dprCap = 1; lsSet('roam_dpr', '1'); resize(); }
        else if (avg > 20 && dprCap > 1.5) { dprCap = 1.5; lsSet('roam_dpr', '1.5'); resize(); }
    };

    /* ---------- 跟随的 DOM（气泡、朋友点击锚点等），和 stage3d.follow 同样的定位约定 ---------- */
    const followers = [], vtmp = new T.Vector3(), sizeCache = new WeakMap();
    const sizeOf = e => { let s = sizeCache.get(e); if (!s || !s.w) { s = { w: e.offsetWidth, h: e.offsetHeight }; sizeCache.set(e, s); } return s; };
    const place = (e, wx, wy, wz, how) => {
        vtmp.set(wx, wy, wz).project(camera);
        if (vtmp.z > 1) { e.style.visibility = 'hidden'; return; }
        e.style.visibility = '';
        const x = (vtmp.x * 0.5 + 0.5) * W, y = (-vtmp.y * 0.5 + 0.5) * H, s = sizeOf(e);
        if (how === 'above') { e.style.left = `${Math.round(x - 29)}px`; e.style.top = `${Math.round(y - s.h - 4)}px`; }
        else { e.style.left = `${Math.round(x - s.w / 2)}px`; e.style.top = `${Math.round(y - s.h / 2)}px`; }
    };
    const anchorOf = (key, how) => {
        if (key === 'friend') { const p = arena.friend.root.position; return [p.x, how === 'above' ? FRIEND_H + 0.3 : FRIEND_H * 0.6, p.z]; }
        if (key === 'me') return [P.x, P.y - PLAYER_R + 1.15, P.z];
        return null;
    };

    /* ---------- 运行状态 ---------- */
    let alive = true, raf = 0, last = performance.now(), acc = 0, time = 0;
    let mode = 'idle';              // idle（对话中）| free | locked（等判分）| carrying | delivering
    let run = null;                 // 当前 run 的状态
    let respawnT = 0, introT = 0, userPaused = false;
    const portrait = window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;
    const isPaused = () => userPaused || (portrait && portrait.matches);
    const autoOn = () => lsGet('roam_autograb') !== '0';
    const syncAutoBtn = () => { autoBtn.textContent = `自动抓取：${autoOn() ? '开' : '关'}`; };
    syncAutoBtn();

    const setHud = on => { hud.hidden = !on; input.setEnabled(on); };

    $('.rm-pause').addEventListener('click', () => { userPaused = true; confirmBox.hidden = false; input.reset(); });
    $('.rm-c-resume').addEventListener('click', () => { userPaused = false; confirmBox.hidden = true; });
    autoBtn.addEventListener('click', () => { lsSet('roam_autograb', autoOn() ? '0' : '1'); syncAutoBtn(); });
    $('.rm-c-exit').addEventListener('click', () => { if (ctx && ctx.onExit) ctx.onExit(); });

    /* ---------- 答案物件（orb）与标签 ---------- */
    const orbs = [];
    if (debug) window.__roam = { fx, arena, P, flights, orbs };      // 调试用（URL 带 ?debug）：scene-lab 的效果面板和自动化测试要用
    /* 选项放到哪个底座：正确项放 correctSlot（shop 的"词属于哪个货架区"）；没指定就在 randomTarget≠false 的底座里随机；干扰项随机填满剩下的 */
    function assignSlots(pads, seed, correctSlot) {
        const r = rng(seed), all = arena.slots.map((_, i) => i);
        const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
        const okI = pads.findIndex(p => p.ok);
        let okSlot = -1;
        if (correctSlot) { const f = all.find(i => arena.slots[i].id === correctSlot); if (f !== undefined) okSlot = f; }
        if (okSlot < 0 && okI >= 0) { const c = all.filter(i => arena.slots[i].randomTarget !== false); const pool = c.length ? c : all; okSlot = pool[Math.floor(r() * pool.length)]; }
        const rest = shuffle(all.filter(i => i !== okSlot)); let k = 0;
        return pads.map((_, i) => i === okI ? okSlot : rest[k++ % rest.length]);
    }
    function makeOrbs(pads, display, seed, correctSlot, fitLong) {
        const slotIdx = assignSlots(pads, seed, correctSlot);
        pads.forEach((pad, i) => {
            const slot = arena.slots[slotIdx[i]];
            const color = ORB_COLORS[slotIdx[i] % ORB_COLORS.length];
            const mesh = new T.Mesh(new T.SphereGeometry(0.32, 20, 16), new T.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
            const halo = makeRing(0.5, 0.03, '#ffffff', 20, 0.7); mesh.add(halo);
            mesh.position.set(slot.pos.x, slot.pos.y + 1.5, slot.pos.z); scene.add(mesh);
            const label = el('div', 'rm-label');
            if (display !== 'pt' && pad.emoji) label.append(el('span', 'rm-l-emoji', pad.emoji));
            label.append(el('span', 'rm-l-text', pad.text), el('i', 'rm-l-prog'));
            if (fitLong && pad.text && pad.text.length >= 10) label.classList.add(pad.text.length >= 13 ? 'xl' : 'long');   // 形容词词形较长（inteligentes）：字号收一档，不溢出
            labelsLayer.append(label);
            orbs.push({ pad, slot, mesh, halo, label, home: mesh.position.clone(), phase: i * 1.7, scale: 1, heard: false, prog: 0, carried: false });
        });
    }
    const clearOrbs = () => { for (const o of orbs) { scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.label.remove(); } orbs.length = 0; };

    /* ---------- 抓取 / 搬运 / 交付 ---------- */
    let carrying = null, deliverResolve = null;
    const heldPos = new T.Vector3();
    function pickUp(o) {
        carrying = o; o.carried = true; mode = 'carrying';
        if (run && run.match) arena.setStallRings(true, matchGlowIdx());        // 性数配对：显示还没放好的展台环
        else { arena.ring.active = true; arena.ring.obj.visible = true; }
        sfx('grab');
    }
    function dropBack() {                                         // 掉下去 / 重生：物件回到原底座
        if (!carrying) return;
        carrying.carried = false; carrying.mesh.position.copy(carrying.home); carrying.mesh.scale.setScalar(1);
        carrying = null; mode = run ? 'free' : 'idle'; arena.ring.active = false; arena.ring.obj.visible = false;
        if (arena.setStallRings) arena.setStallRings(false);
    }
    /* ---------- 性数配对（roam_match）：4 张词形牌 → 4 个名词展台 ---------- */
    const matchGlowIdx = () => (run && run.match && carrying && (run.opts.preview || run.wrong >= (run.opts.hints.arrow_after_wrong || 2))) ? carrying.pad.idx : -1;   // 预习总是提示；测验错 2 次后才提示
    function matchDeliver(s) {
        const o = carrying;
        if (o.pad.idx !== s.idx) {                                             // 送错：词牌弹回原架子，错误 +1
            run.wrong++; sfx('wrong'); dropBack(); run.cool = 1.4;
            if (run.opts.onMistake) run.opts.onMistake(o.pad, s.idx);
            return;
        }
        mode = 'delivering'; sfx('deliver'); arena.setStallRings(false); arrow.hidden = true;
        const from = o.mesh.position.clone(), to = s.deliver; let k = 0;
        const fly = () => {
            if (!alive) return;
            k += 0.05; const e = ease(Math.min(1, k));
            o.mesh.position.set(lerpN(from.x, to.x, e), lerpN(from.y, to.y, e) + Math.sin(e * Math.PI) * 0.8, lerpN(from.z, to.z, e)); o.mesh.scale.setScalar(0.8 - 0.55 * e);
            if (k < 1) { requestAnimationFrame(fly); return; }
            o.mesh.visible = false; o.label.remove(); o.carried = false; o.pad.out = true; carrying = null; s.done = true; mode = 'free'; run.placed++;
            if (o.pad.fx) fx.play(o.pad.fx, { dur: 1.4, targets: arena.stallTargets(s.idx) });      // 展台上的名词按这个词的意思变一下
            if (run.opts.onPlaced) run.opts.onPlaced(o.pad, s.idx);
            if (run.placed >= orbs.length) { const r = run.resolve; run.resolve = null; mode = 'idle'; if (r) r({ errors: run.wrong }); }
        };
        requestAnimationFrame(fly);
    }
    async function grab(o) {
        if (mode !== 'free' || !run) return;
        if (run.match) { pickUp(o); return; }                    // 性数配对：抓起来就走，送到展台才算对错
        if (o.pad.scored) { pickUp(o); return; }                  // 已答对的物件重抓：不再判分
        mode = 'locked'; input.reset(); sfx('grab'); if (navigator.vibrate) navigator.vibrate(15);
        let result = 'error';
        try { result = await run.opts.onGrab(o.pad); } catch { result = 'error'; }
        if (!alive) return;
        if (result === 'correct') { o.pad.scored = true; pickUp(o); const r = run.resolve; run.resolve = null; r && r({ pad: o.pad }); }
        else if (result === 'wrong') {
            o.pad.dead = true; run.wrong++; mode = 'free'; sfx('wrong');
            const dv = arena.delivery();
            if (o.pad.fx && dv.target) flyCopy(o, dv.target, () => fx.play(o.pad.fx, { dur: 1.6 }));   // 变形工坊：抓错的词牌也飞到展台，物体按"错词"的意思变一下再变回来（只是反馈，不影响判分）
        }
        else { mode = 'free'; run.cool = 1.2; }
    }
    function flyCopy(o, to, done) {
        const m = new T.Mesh(new T.SphereGeometry(0.32, 16, 12), o.mesh.material.clone());
        m.position.copy(o.mesh.position); scene.add(m);
        flights.push({ m, from: o.mesh.position.clone(), to: to.clone(), k: 0, done });
    }
    const inRange = o => {
        if (o.pad.dead || o.pad.out || o.carried) return false;
        const dx = o.slot.pos.x - P.x, dz = o.slot.pos.z - P.z, dy = o.slot.pos.y - (P.y - PLAYER_R);
        return Math.hypot(dx, dz) <= run.range && dy > -0.6 && dy < 2.2;
    };

    /* ---------- 每帧更新 ---------- */
    function frame() {
        raf = requestAnimationFrame(frame);
        const now = performance.now(); let dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (document.hidden) return;
        time += dt;
        const inp = input.consume();
        const paused = isPaused();
        rotate.style.display = portrait && portrait.matches ? 'flex' : '';
        if (!paused) simulate(dt, inp);
        visuals(dt, paused);
        renderer.render(scene, camera);
        quality(dt);
    }

    function simulate(dt, inp) {
        yaw -= inp.camDX;
        const controls = (mode === 'free' || mode === 'carrying' || mode === 'delivering') && respawnT <= 0 && introT <= 0;
        const move = controls ? inp : { ix: 0, iy: 0, jumpPressed: false, jumpHeld: false };
        if (respawnT > 0) {
            respawnT -= dt;
            if (respawnT <= 0) { respawn(P); dropBack(); fade.classList.remove('on'); sfx('respawn'); }
        } else {
            acc += dt; let n = 0; const ev = [];
            while (acc >= PHYS.fixedDt && n++ < PHYS.maxSteps) { stepPlayer(world, P, move, yaw, PHYS.fixedDt, !!carrying, ev); acc -= PHYS.fixedDt; }
            if (acc > PHYS.fixedDt) acc = 0;
            for (const e of ev) {
                if (e.type === 'jump') { sq = -0.4; sqv = 0; sfx('jump'); puff(3, 0.6, 0.5); }
                else if (e.type === 'land') { sq = Math.min(0.55, e.speed / 20); sqv = 0; sfx('land'); if (e.speed > 5) puff(5, 1.2, 0.3); }
                else if (e.type === 'bounce') { sq = -0.5; sqv = 0; arena.padHit(e.pad); sfx('bounce'); }
                else if (e.type === 'bump') { sq = 0.3; sqv = 0; sfx('bump'); }
                else if (e.type === 'fall' && respawnT <= 0) { respawnT = 0.5; fade.classList.add('on'); }
            }
        }
        if (introT > 0) introT -= dt;
        if (run) runLogic(dt, inp);
    }

    function runLogic(dt, inp) {
        if (respawnT > 0 || introT > 0) return;
        run.t += dt; if (run.cool > 0) run.cool -= dt;
        /* 范围内最近的物件 */
        let near = null, nd = 1e9;
        if (mode === 'free') for (const o of orbs) if (inRange(o)) { const d = Math.hypot(o.slot.pos.x - P.x, o.slot.pos.z - P.z); if (d < nd) { nd = d; near = o; } }
        run.near = near;
        grabBtn.classList.toggle('ready', !!near);
        for (const o of orbs) {
            const isNear = o === near;
            o.label.classList.toggle('near', isNear);
            o.label.classList.toggle('dead', !!(o.pad.dead || o.pad.out));
            o.label.classList.toggle('glow', !!(o.pad.ok && !o.pad.dead && (o.pad.hint || (run.opts.preview && run.since > (run.opts.hints.preview_glow_s || 25)))));
            if (isNear && run.opts.preview && !o.heard) { o.heard = true; run.opts.onApproach && run.opts.onApproach(o.pad); }
            if (!isNear) o.prog = 0;
        }
        /* 抓取：按钮立即抓；站定 0.8 秒自动抓（速度低、物件在面前 60° 内） */
        if (near && run.cool <= 0) {
            if (inp.grabPressed) { grab(near); return; }
            if (run.opts.autoGrab && autoOn()) {
                const speed = Math.hypot(P.vx, P.vz);
                const toward = Math.atan2(near.slot.pos.x - P.x, near.slot.pos.z - P.z);
                if (speed < AUTO_GRAB_SPEED && Math.abs(angDiff(toward, P.facing)) < AUTO_GRAB_CONE) near.prog += dt / AUTO_GRAB_S; else near.prog = Math.max(0, near.prog - dt * 2);
                if (near.prog >= 1) { near.prog = 0; grab(near); return; }
            }
        }
        for (const o of orbs) o.label.style.setProperty('--p', String(Math.min(1, o.prog)));
        run.since += dt;
        /* 提示：抓错 N 次后出箭头；总时长到了出"快速通道" */
        const target = run.match ? null : orbs.find(o => o.pad.ok && !o.pad.dead);
        const showArrow = !!target && mode === 'free' && run.wrong >= (run.opts.hints.arrow_after_wrong || 2);
        const matchStall = run.match && mode === 'carrying' && carrying ? arena.stalls[carrying.pad.idx] : null;
        if (run.match) {                                                       // 性数配对：携带时，预习 / 错 2 次后箭头指向该去的展台，对应的环亮绿色
            const glow = matchGlowIdx();
            if (mode === 'carrying' && glow !== run.glow) arena.setStallRings(true, glow);
            run.glow = glow; arrow.hidden = !(matchStall && glow >= 0);
        } else arrow.hidden = !(showArrow || (mode === 'carrying' && !!carrying));
        if (!arrow.hidden) {
            const tp = run.match ? matchStall.pos : (mode === 'carrying' ? arena.ring.pos : target.slot.pos);
            const vx = tp.x - P.x, vz = tp.z - P.z, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
            arrow.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz)}rad)`;
        }
        fastBtn.hidden = !(mode === 'free' && run.t > (run.opts.hints.fast_track_s || 60));
        /* 性数配对：进了某个展台环 = 把手里的词牌送给这个展台 */
        if (run.match && mode === 'carrying' && carrying) {
            for (const s of arena.stalls) {
                if (s.done) continue;
                if (Math.hypot(s.pos.x - P.x, s.pos.z - P.z) <= s.r && Math.abs(P.y - PLAYER_R - s.pos.y) < 1.2) { matchDeliver(s); break; }
            }
        }
        /* 交付 */
        if (mode === 'carrying' && deliverResolve) {
            const d = Math.hypot(arena.ring.pos.x - P.x, arena.ring.pos.z - P.z);
            if (d <= arena.ringR && Math.abs(P.y - PLAYER_R - arena.ring.pos.y) < 1.2) {
                mode = 'delivering'; sfx('deliver'); arena.ring.active = false; arrow.hidden = true;
                const o = carrying, from = o.mesh.position.clone(), dv = arena.delivery(), fp = dv.target || arena.friend.root.position, endY = dv.target ? dv.target.y : FRIEND_H * 0.85; let k = 0;   // 有变体：飞向展台 / 舞台上的名词；否则飞向朋友（老行为）
                const fly = () => {
                    if (!alive) return; k += 0.05; const e = ease(Math.min(1, k));
                    o.mesh.position.set(from.x + (fp.x - from.x) * e, from.y + (endY - from.y) * e + Math.sin(e * Math.PI) * 0.8, from.z + (fp.z - from.z) * e);
                    o.mesh.scale.setScalar(1 - e * 0.8);
                    if (k < 1) requestAnimationFrame(fly); else { if (dv.bounce.length) arena.bounce(dv.bounce); o.mesh.visible = false; o.label.remove(); carrying = null; arena.ring.obj.visible = false; setHud(false); mode = 'idle'; const r = deliverResolve; deliverResolve = null; r && r(); }
                };
                fly();
            }
        }
    }
    fastBtn.addEventListener('click', () => {
        if (!run || mode !== 'free') return;
        let best = null, bd = 1e9;
        for (const o of orbs) { if (o.pad.dead || o.pad.out) continue; const d = Math.hypot(o.slot.pos.x - P.x, o.slot.pos.z - P.z); if (d < bd) { bd = d; best = o; } }
        if (!best) return;
        const dx = arena.ring.pos.x - best.slot.pos.x, dz = arena.ring.pos.z - best.slot.pos.z, l = Math.hypot(dx, dz) || 1;
        P.x = best.slot.pos.x + dx / l * 1.1; P.z = best.slot.pos.z + dz / l * 1.1; P.y = best.slot.pos.y + PLAYER_R + 0.05; P.vx = P.vy = P.vz = 0;
        fastBtn.hidden = true; run.t = 0;
    });

    /* ---------- 视觉：角色程序动画、物件浮动、标签投影、镜头 ---------- */
    let sq = 0, sqv = 0, airS = 0;                                 // 挤压拉伸（弹簧，会回弹一下）：>0 压扁（落地 / 撞到），<0 拉长（起跳 / 弹跳）；airS = 空中上升 / 下落的平滑量
    const camPos = new T.Vector3(), camLook = new T.Vector3(); let camInit = false;
    function groundUnder() {
        let gy = arena.fallY;
        for (const b of arena.boxes) if (P.x >= b.min[0] && P.x <= b.max[0] && P.z >= b.min[2] && P.z <= b.max[2] && b.max[1] <= P.y - PLAYER_R + 0.35) gy = Math.max(gy, b.max[1]);
        return gy;
    }
    function visuals(dt, paused) {
        arena.update(paused ? 0 : dt);
        fx.tick(paused ? 0 : dt, camera);
        for (let i = flights.length - 1; i >= 0; i--) {                        // 抓错的词牌副本：弧线飞向展台，到了就触发效果
            const f = flights[i]; f.k += (paused ? 0 : dt) / 0.55; const e = ease(Math.min(1, f.k));
            f.m.position.set(lerpN(f.from.x, f.to.x, e), lerpN(f.from.y, f.to.y, e) + Math.sin(e * Math.PI) * 0.8, lerpN(f.from.z, f.to.z, e));
            f.m.scale.setScalar(1 - e * 0.6);
            if (f.k >= 1) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); flights.splice(i, 1); if (alive && f.done) f.done(); }
        }
        /* 玩家 */
        const hs = Math.hypot(P.vx, P.vz), run01 = Math.min(1, hs / PHYS.maxSpeed);
        pv.position.set(P.x, P.y - PLAYER_R, P.z);
        pv.rotation.y += angDiff(P.facing, pv.rotation.y) * Math.min(1, dt * 12);
        const sdt = Math.min(dt, 1 / 30);                                      // 切后台回来 dt 很大时不让弹簧发散
        sqv += (-220 * sq - 16 * sqv) * sdt; sq += sqv * sdt;                  // 弹簧：落地压扁后会轻轻弹回、再稳住
        const airT = P.onGround ? 0 : Math.max(-0.5, Math.min(1, P.vy / 7));   // 上升拉长、下落略扁，随速度平滑变化（不再跳变）
        airS += (airT - airS) * Math.min(1, dt * 14);
        let sy = 1 + (-sq) * 0.5, sxz = 1 + sq * 0.35;
        sy *= 1 + airS * 0.12; sxz *= 1 - airS * 0.07;
        sy *= 1 + Math.sin(time * 2.6) * 0.015 * (1 - run01);
        inner.scale.set(sxz, sy, sxz);
        const tiltT = P.onGround ? 0.16 * run01 : 0.1 * run01 - 0.12 * Math.max(0, airS);       // 地上前倾；起跳上升时身体略后仰
        inner.rotation.x += (tiltT - inner.rotation.x) * Math.min(1, dt * 12);
        inner.rotation.z = Math.sin(time * 15) * 0.09 * run01 * (P.onGround ? 1 : 0);
        const armUp = P.onGround ? 0 : Math.max(0, Math.min(1, airS));          // 上升时双手略抬起
        hands.forEach((h, i) => { const b = handBase[i]; const up = carrying ? 1 : 0; h.position.set(b.x * (1 - up * 0.45), b.y + up * 0.6 + armUp * 0.15, b.z + up * 0.1); });
        for (let k = dust.length - 1; k >= 0; k--) {                           // 灰尘：向外飘、变大、淡出
            const d = dust[k]; d.t += paused ? 0 : dt; const f = d.t / 0.45;
            d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt; d.m.position.y += d.vy * dt; d.vy *= 0.94;
            d.m.scale.setScalar(1 + f * 1.6); d.m.material.opacity = 0.7 * Math.max(0, 1 - f);
            if (f >= 1) { scene.remove(d.m); d.m.material.dispose(); dust.splice(k, 1); }
        }
        const gy = groundUnder(); shadow.position.set(P.x, gy + 0.03, P.z);
        const sh = Math.max(0.35, 1 - (P.y - PLAYER_R - gy) * 0.18); shadow.scale.set(0.95 * sh, 0.95 * sh, 1);
        /* 物件 */
        for (const o of orbs) {
            if (o.carried) {
                heldPos.set(P.x, P.y - PLAYER_R + 1.45 + Math.sin(time * 6) * 0.04, P.z);
                o.mesh.position.lerp(heldPos, Math.min(1, dt * 14)); o.mesh.scale.setScalar(0.8);
            } else if (mode !== 'delivering' || o !== carrying) {
                o.mesh.position.y = o.home.y + Math.sin(time * 2 + o.phase) * 0.1;
                const dead = o.pad.dead || o.pad.out; o.scale += ((dead ? 0 : 1) - o.scale) * Math.min(1, dt * 8); o.mesh.scale.setScalar(Math.max(0.001, o.scale));
            }
            o.mesh.rotation.y += dt * 1.4;
            const glow = o.label.classList.contains('glow'); o.mesh.material.emissiveIntensity = glow ? 0.6 + Math.sin(time * 6) * 0.35 : 0.35;
            if (o.label.isConnected && !o.carried) {
                const near = o === (run && run.near), s = sizeOf(o.label);
                vtmp.set(o.mesh.position.x, o.mesh.position.y + 0.55, o.mesh.position.z).project(camera);
                if (vtmp.z > 1) o.label.style.visibility = 'hidden';
                else { o.label.style.visibility = ''; o.label.style.left = `${Math.round((vtmp.x * 0.5 + 0.5) * W - s.w / 2)}px`; o.label.style.top = `${Math.round((-vtmp.y * 0.5 + 0.5) * H - s.h)}px`; o.label.style.zIndex = near ? 5 : 1; }
            } else if (o.carried) o.label.style.visibility = 'hidden';
        }
        /* 镜头 */
        const lx = P.x, ly = P.y - PLAYER_R + CAM.height, lz = P.z;
        const cx = lx + Math.sin(yaw) * Math.cos(CAM.pitch) * CAM.dist, cy = ly + Math.sin(CAM.pitch) * CAM.dist, cz = lz + Math.cos(yaw) * Math.cos(CAM.pitch) * CAM.dist;
        if (!camInit) { camPos.set(cx, cy, cz); camLook.set(lx, ly, lz); camInit = true; }
        if (introT > 0 && arena.camIntro) {
            const k = ease(1 - introT / run_introDur), a = arena.camIntro;
            camera.position.set(a.pos[0] + (cx - a.pos[0]) * k, a.pos[1] + (cy - a.pos[1]) * k, a.pos[2] + (cz - a.pos[2]) * k);
            camera.lookAt(a.look[0] + (lx - a.look[0]) * k, a.look[1] + (ly - a.look[1]) * k, a.look[2] + (lz - a.look[2]) * k);
            camPos.copy(camera.position); camLook.set(lx, ly, lz);
        } else {
            const f = 1 - Math.exp(-CAM.follow * dt);
            camPos.x += (cx - camPos.x) * f; camPos.y += (cy - camPos.y) * f; camPos.z += (cz - camPos.z) * f;
            camLook.x += (lx - camLook.x) * f; camLook.y += (ly - camLook.y) * f; camLook.z += (lz - camLook.z) * f;
            camera.position.copy(camPos); camera.lookAt(camLook);
        }
        camera.updateMatrixWorld(true);
        /* 跟随的 DOM */
        for (let i = followers.length - 1; i >= 0; i--) {
            const f = followers[i];
            if (!f.el.isConnected) { followers.splice(i, 1); continue; }
            const a = anchorOf(f.key, f.mode); if (!a) continue;
            place(f.el, a[0], a[1], a[2], f.mode);
        }
        /* 箭头跟在人物头顶 */
        if (!arrow.hidden) { vtmp.set(P.x, P.y - PLAYER_R + 2.0, P.z).project(camera); arrow.style.left = `${(vtmp.x * 0.5 + 0.5) * W}px`; arrow.style.top = `${(-vtmp.y * 0.5 + 0.5) * H - 8}px`; }
    }
    const run_introDur = 2.2;

    /* ---------- 对外接口 ---------- */
    const api = {
        follow(e, key, how) { const i = followers.findIndex(f => f.el === e); if (i >= 0) followers.splice(i, 1); followers.push({ el: e, key, mode: how || 'mid' }); },
        async enter() { },
        talk() { arena.friend.play('talk'); },
        cheer() { arena.friend.play('cheer'); },
        cameraTo() { },
        /* 性数配对：opts = { pads:[{text, idx, fx}], hints, preview, seed, clue:{zh}, onApproach, onMistake, onPlaced }；全部送对后 resolve({ errors }) */
        runMatch(opts) {
            return new Promise(resolve => {
                clearOrbs();
                opts.hints = opts.hints || {};
                makeOrbs(opts.pads, 'pt', opts.seed || 1, undefined, true);
                clueEmoji.textContent = ''; clueEmoji.classList.remove('multi'); clueZh.textContent = (opts.clue && opts.clue.zh) || '';
                for (const s of arena.stalls) s.done = false;
                run = { opts, resolve, t: 0, since: 0, wrong: 0, cool: 0, near: null, range: opts.grabRange || 1.4, match: true, placed: 0, glow: -1 };
                mode = 'free'; setHud(true);
                if (!reduced()) introT = run_introDur;
            });
        },
        playFx(spec, opts) { return fx.play(spec, opts); },          // 形容词变形工坊：scene.js 在交付后播放"正确词"的效果 / 预习收尾播放反义词
        showReward(ch) { if (arena.showTrophy) arena.showTrophy(ch); },        // 名词 / 动词的奖励型场景：在交付环上方摆出奖品（之后 playFx 的作用对象就是它）
        clearFx() { fx.clear(); },
        run(opts) {
            return new Promise(resolve => {
                clearOrbs();
                opts.hints = opts.hints || {};
                if (arena.variantCount && Number.isInteger(opts.variant)) arena.setVariant(opts.variant);
                makeOrbs(opts.pads, opts.display, opts.seed || 1, opts.correctSlot, opts.variant != null);
                /* 线索卡：形容词走路版带 clue.noun（名词图标 + 名词中文），图标不受 display 控制（名词图标不泄露答案）；其余场景保持原样 */
                const noun = opts.clue && opts.clue.noun;
                clueEmoji.textContent = noun && noun.icon ? noun.icon : (opts.clue && opts.clue.emoji && opts.display !== 'pt' ? opts.clue.emoji : '');
                clueEmoji.classList.toggle('multi', [...clueEmoji.textContent].length > 2);
                clueZh.textContent = noun && noun.zh ? `${noun.zh}\n${(opts.clue && opts.clue.zh) || ''}` : ((opts.clue && opts.clue.zh) || '');
                run = { opts, resolve, t: 0, since: 0, wrong: 0, cool: 0, near: null, range: opts.grabRange || 1.4 };
                mode = 'free'; setHud(true);
                if (!reduced()) introT = run_introDur;
            });
        },
        deliver() {
            return new Promise(resolve => { deliverResolve = resolve; setHud(true); arena.ring.active = true; arena.ring.obj.visible = true; });
        },
        fail() { api.dispose(); if (onLost) onLost(); },
        dispose() {
            if (!alive) return; alive = false;
            cancelAnimationFrame(raf); ro.disconnect(); input.destroy();
            if (debug && window.__roam && window.__roam.P === P) window.__roam = null;                   // 调试钩子随场景释放
            fx.dispose(); for (const d of dust) { scene.remove(d.m); d.m.material.dispose(); } dust.length = 0; dustGeo.dispose(); for (const f of flights) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); } flights.length = 0;
            clearOrbs(); hud.remove(); labelsLayer.remove(); rotate.remove(); if (canvas.parentNode === view) view.removeChild(canvas);
            scene.remove(pv, shadow); arena.dispose(); fade.classList.remove('on');
            releaseActive(api);
        }
    };
    claimActive(api);
    P.facing = startFacing; pv.rotation.y = P.facing;
    raf = requestAnimationFrame(frame);
    return api;
}