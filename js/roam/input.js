/* 派对闯关的输入：全部用 Pointer Events，每个控件各自记 pointerId，所以摇杆 + 跳 + 视角拖动可以同时按。
   hud 需要的元素（由 index.js 建）：.rm-zone-l（左侧摇杆区）、.rm-zone-r（右侧视角拖动区）、
   .rm-joy / .rm-joy-base / .rm-joy-knob（摇杆视觉）、.rm-jump、.rm-grab 两个按钮。
   键盘（调试用）：WASD / 方向键移动，空格跳，E 或回车抓。 */

const JOY_R = 64, DEAD = 0.12, CAM_SENS = 0.25 * Math.PI / 180;   // 摇杆半径 px；视角灵敏度 0.25°/px

export function createInput(hud) {
    const zl = hud.querySelector('.rm-zone-l'), zr = hud.querySelector('.rm-zone-r');
    const joy = hud.querySelector('.rm-joy'), base = hud.querySelector('.rm-joy-base'), knob = hud.querySelector('.rm-joy-knob');
    const bJump = hud.querySelector('.rm-jump'), bGrab = hud.querySelector('.rm-grab');
    const st = { ix: 0, iy: 0, jumpHeld: false, jumpPressed: false, grabPressed: false, camDX: 0 };
    const keys = new Set();
    let joyId = null, ox = 0, oy = 0, camId = null, camX = 0, enabled = true;

    const rel = e => { const r = hud.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const setJoy = (dx, dy) => {
        const len = Math.hypot(dx, dy), k = len > JOY_R ? JOY_R / len : 1;
        const kx = dx * k, ky = dy * k;
        knob.style.transform = `translate(${kx}px,${ky}px)`;
        let m = Math.min(1, len / JOY_R);
        if (m < DEAD) { st.ix = st.iy = 0; return; }
        m = Math.pow((m - DEAD) / (1 - DEAD), 1.3);
        st.ix = dx / len * m; st.iy = -dy / len * m;
    };
    const endJoy = () => { joyId = null; st.ix = st.iy = 0; joy.classList.remove('on'); knob.style.transform = ''; };

    const on = (el, type, fn, opt) => { el.addEventListener(type, fn, opt); return () => el.removeEventListener(type, fn, opt); };
    const offs = [];

    offs.push(on(zl, 'pointerdown', e => {
        if (!enabled || joyId !== null) return;
        e.preventDefault(); zl.setPointerCapture(e.pointerId); joyId = e.pointerId;
        [ox, oy] = rel(e);
        joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; joy.classList.add('on'); setJoy(0, 0);
    }));
    offs.push(on(zl, 'pointermove', e => { if (e.pointerId !== joyId) return; const [x, y] = rel(e); setJoy(x - ox, y - oy); }));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) offs.push(on(zl, t, e => { if (e.pointerId === joyId) endJoy(); }));

    offs.push(on(zr, 'pointerdown', e => {
        if (!enabled || camId !== null) return;
        e.preventDefault(); zr.setPointerCapture(e.pointerId); camId = e.pointerId; camX = e.clientX;
    }));
    offs.push(on(zr, 'pointermove', e => { if (e.pointerId !== camId) return; st.camDX += (e.clientX - camX) * CAM_SENS; camX = e.clientX; }));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) offs.push(on(zr, t, e => { if (e.pointerId === camId) camId = null; }));

    const button = (el, down, up) => {
        offs.push(on(el, 'pointerdown', e => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('down'); down(); }));
        for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) offs.push(on(el, t, () => { el.classList.remove('down'); up && up(); }));
    };
    button(bJump, () => { st.jumpHeld = true; st.jumpPressed = true; }, () => { st.jumpHeld = false; });
    button(bGrab, () => { st.grabPressed = true; });

    /* 键盘 */
    const kd = e => {
        if (!enabled || e.repeat) return;
        const k = e.key.toLowerCase();
        if (k === ' ') { st.jumpHeld = true; st.jumpPressed = true; e.preventDefault(); }
        else if (k === 'e' || k === 'enter') st.grabPressed = true;
        else if ('wasd'.includes(k) && k.length === 1 || k.startsWith('arrow')) { keys.add(k); e.preventDefault(); }
    };
    const ku = e => { const k = e.key.toLowerCase(); if (k === ' ') st.jumpHeld = false; keys.delete(k); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

    /* 其它：禁长按菜单、iOS 手势缩放；切后台时全部归零 */
    offs.push(on(hud, 'contextmenu', e => e.preventDefault()));
    offs.push(on(hud, 'gesturestart', e => e.preventDefault()));
    const vis = () => { if (document.hidden) reset(); };
    document.addEventListener('visibilitychange', vis);

    function reset() { endJoy(); camId = null; keys.clear(); st.jumpHeld = st.jumpPressed = st.grabPressed = false; st.camDX = 0; el_up(); }
    function el_up() { bJump.classList.remove('down'); bGrab.classList.remove('down'); }

    return {
        /* 每个渲染帧取一次：边沿事件（jumpPressed / grabPressed）读后清零，camDX 读后清零 */
        consume() {
            let ix = st.ix, iy = st.iy;
            if (keys.size) {
                const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
                const ky = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
                if (kx || ky) { const l = Math.hypot(kx, ky); ix = kx / l; iy = ky / l; }
            }
            const out = { ix, iy, jumpPressed: st.jumpPressed, jumpHeld: st.jumpHeld, grabPressed: st.grabPressed, camDX: st.camDX };
            st.jumpPressed = st.grabPressed = false; st.camDX = 0;
            return out;
        },
        setEnabled(v) { enabled = !!v; if (!enabled) reset(); },
        reset,
        destroy() { offs.forEach(f => f()); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', vis); }
    };
}
