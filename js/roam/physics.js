/* 派对闯关的物理：自己写，不引入物理库。
   玩家 = 一个球（半径 PLAYER_R）；世界 = 静态 AABB 列表 + 旋转杆（旋转的长方体，转到杆的局部坐标里判断）。
   没有斜坡、没有刚体堆叠；台阶 ≤ STEP 自动上；弹跳垫是带 bounce 的方块。
   手感参数都在 PHYS，改这里即可。 */
import { PLAYER_R as R } from './arena.js';

export const PHYS = {
    maxSpeed: 4.8, carryMul: 0.85,
    accel: 24, friction: 18, airControl: 0.5,
    gravity: 18, jump: 6.5, jumpCut: 0.5,
    fallMul: 1.7,                       // 下落时重力放大：上升轻、下落快，跳起来更利落（不拖泥带水）
    hang: 0.6, hangV: 1.5,              // 跳到最高点附近（|vy| < hangV）重力只剩 hang 倍：顶点稍微悬停一下，方便瞄准落点
    maxFall: 22,                        // 下落终速
    coyote: 0.14, jumpBuffer: 0.14,
    step: 0.25, knock: 5, fixedDt: 1 / 60, maxSteps: 4
};

export function createPlayer(spawn) {
    return { x: spawn[0], y: spawn[1] + R, z: spawn[2], vx: 0, vy: 0, vz: 0, onGround: false, coyote: 0, buffer: 0, jumping: false,
        facing: 0, lastRp: spawn.slice(), airSpeed: 0 };
}
export function respawn(p, to) {
    const rp = to || p.lastRp;
    p.x = rp[0]; p.y = rp[1] + R + 0.02; p.z = rp[2]; p.vx = p.vy = p.vz = 0; p.onGround = false; p.jumping = false;
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* 球 vs 方块；返回是否碰到。ground：法线朝上 */
function collideAABB(p, b, ev, flags) {
    const cx = clamp(p.x, b.min[0], b.max[0]), cy = clamp(p.y, b.min[1], b.max[1]), cz = clamp(p.z, b.min[2], b.max[2]);
    let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) return false;
    let nx, ny, nz, pen;
    if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; pen = R - d; }
    else {                                                   // 球心跑进方块里了：从最近的面推出去
        const opts = [[p.x - b.min[0], -1, 0, 0], [b.max[0] - p.x, 1, 0, 0], [p.y - b.min[1], 0, -1, 0], [b.max[1] - p.y, 0, 1, 0], [p.z - b.min[2], 0, 0, -1], [b.max[2] - p.z, 0, 0, 1]];
        const o = opts.reduce((m, c) => c[0] < m[0] ? c : m);
        nx = o[1]; ny = o[2]; nz = o[3]; pen = o[0] + R;
    }
    /* 撞到方块侧面、方块顶比脚高不多 → 自动上台阶 */
    const rise = b.max[1] - (p.y - R);
    if (Math.abs(ny) < 0.6 && rise > 0.01 && rise <= PHYS.step && p.onGround) { p.y = b.max[1] + R; p.vy = Math.max(p.vy, 0); flags.ground = true; if (b.rp) flags.rp = b.rp; return true; }
    p.x += nx * pen; p.y += ny * pen; p.z += nz * pen;
    const vn = p.vx * nx + p.vy * ny + p.vz * nz;
    if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; p.vz -= vn * nz; }
    if (ny > 0.6) {
        if (b.bounce && p.vy <= 2) { p.vy = b.bounce; p.jumping = false; ev.push({ type: 'bounce', pad: b.pad }); }
        else { flags.ground = true; if (b.rp) flags.rp = b.rp; }
    }
    return true;
}

/* 球 vs 旋转杆：转到杆的局部坐标里做"最近点"，再把法线转回世界；撞到侧面就击退（不扣分） */
function collideSpinner(p, s, ev, flags) {
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);      // 杆的轴向 a=(c,sn)，法向 n=(-sn,c)（xz 平面）
    const rx = p.x - s.x, rz = p.z - s.z;
    const u = rx * c + rz * sn, w = -rx * sn + rz * c;
    const cu = clamp(u, -s.half, s.half), cw = clamp(w, -s.hw, s.hw), cy = clamp(p.y, s.y0, s.y1);
    const du = u - cu, dw = w - cw, dy = p.y - cy;
    const d2 = du * du + dw * dw + dy * dy;
    if (d2 >= R * R) return false;
    let lnu, lnw, lny, pen;
    if (d2 > 1e-10) { const d = Math.sqrt(d2); lnu = du / d; lnw = dw / d; lny = dy / d; pen = R - d; }
    else { lnu = 0; lnw = w >= 0 ? 1 : -1; lny = 0; pen = R + s.hw - Math.abs(w); }
    const nx = lnu * c - lnw * sn, nz = lnu * sn + lnw * c, ny = lny;
    p.x += nx * pen; p.y += ny * pen; p.z += nz * pen;
    if (ny > 0.6) { if (p.vy < 0) p.vy = 0; flags.ground = true; return true; }   // 跳到杆顶上就站着
    const vn = p.vx * nx + p.vz * nz;
    if (vn < PHYS.knock) { p.vx += nx * (PHYS.knock - vn); p.vz += nz * (PHYS.knock - vn); }
    ev.push({ type: 'bump' });
    return true;
}

/* 一个固定步长。input = { ix, iy, jumpPressed, jumpHeld }（摇杆：ix 向右为正、iy 向前为正）；yaw = 镜头水平角 */
export function stepPlayer(world, p, input, yaw, dt, carrying, ev) {
    for (const s of world.spinners) s.angle += s.omega * dt;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = fx * input.iy + rx * input.ix, wz = fz * input.iy + rz * input.ix;
    const mag = Math.hypot(wx, wz);
    if (mag > 1) { wx /= mag; wz /= mag; }
    const speed = PHYS.maxSpeed * (carrying ? PHYS.carryMul : 1);
    const tx = wx * speed, tz = wz * speed;
    let dvx = tx - p.vx, dvz = tz - p.vz;
    const dv = Math.hypot(dvx, dvz);
    const a = (mag > 0.05 ? PHYS.accel : PHYS.friction) * (p.onGround ? 1 : PHYS.airControl) * dt;
    if (dv <= a) { p.vx = tx; p.vz = tz; } else { p.vx += dvx / dv * a; p.vz += dvz / dv * a; }

    p.coyote = p.onGround ? PHYS.coyote : Math.max(0, p.coyote - dt);
    p.buffer = input.jumpPressed ? PHYS.jumpBuffer : Math.max(0, p.buffer - dt);
    if (p.buffer > 0 && p.coyote > 0) { p.vy = PHYS.jump; p.jumping = true; p.buffer = 0; p.coyote = 0; p.onGround = false; ev.push({ type: 'jump' }); }
    if (!input.jumpHeld && p.jumping && p.vy > 0) { p.vy *= PHYS.jumpCut; p.jumping = false; }     // 松手提前收跳 = 可变跳高
    const inAir = !p.onGround && p.coyote <= 0;           // 刚走下平台的 coyote 时间内不算“起跳后的空中”，不悬停
    const g = PHYS.gravity * (p.vy < 0 ? PHYS.fallMul : 1) * (inAir && Math.abs(p.vy) < PHYS.hangV ? PHYS.hang : 1);
    p.vy = Math.max(-PHYS.maxFall, p.vy - g * dt);
    const vyBefore = p.vy;

    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

    const flags = { ground: false, rp: null };
    for (let it = 0; it < 3; it++) {
        let hit = false;
        for (const b of world.boxes) hit = collideAABB(p, b, ev, flags) || hit;
        for (const s of world.spinners) hit = collideSpinner(p, s, ev, flags) || hit;
        if (!hit) break;
    }
    const was = p.onGround;
    p.onGround = flags.ground;
    if (p.onGround) { p.jumping = false; if (flags.rp) p.lastRp = flags.rp; if (!was && vyBefore < -3) ev.push({ type: 'land', speed: -vyBefore }); }
    const hs = Math.hypot(p.vx, p.vz);
    if (hs > 0.35) p.facing = Math.atan2(p.vx, p.vz);
    if (p.y < world.fallY) ev.push({ type: 'fall' });
}