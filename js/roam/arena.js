/* 派对闯关的场地：数据（ARENAS）+ 构建（buildArena）。
   坐标：x 向东、z 向南、y 向上，单位米，中心为原点。每个模板的 arena 字段对应 ARENAS 的键。
   模型都放 models/roam/（characters/friend 复用）；缺文件时用兜底几何体，所以没模型也能玩。
   v1 最小版：N（弹跳垫 → 高台）、E（旋转杆窄桥）是障碍岛，S、A 是平地岛。 */
import * as T from '../vendor/three-bundle.js';
import { shared3d } from '../stage3d.js';
import { PARTS } from '../stage3d-layouts.js';

const { loadModel, normalize, blobShadow, fallbackPerson, fallbackProp, mat } = shared3d;

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
    },

    /* verb_treasure（海岛寻宝，动词）：一整块沙滩岛，没有弹跳垫和旋转杆。四把"钥匙"挂在棕榈树 / 岩石 / 小船 / 木桶前面，
       抓对的那把带到宝箱前的交付环。props 的模型沿用 beach/（缺了用 stage3d-layouts.js 的 PARTS 兜底）；solid = 碰撞盒 [宽, 高, 深]。 */
    treasure_island: {
        sky: '#cfe9ff', seaY: -0.5, seaColor: '#5aaee8', fallY: -2.5,
        spawn: [-9.5, 0, 2],
        ring: { pos: [0, 0, 2.0], r: 1.3 },
        friend: { pos: [2.8, 0, 2.0], rotY: -2.0 },
        tiles: [{ x: 0, z: 0, w: 22, d: 14, thick: 1.2, color: '#f1dfaa', flat: true, rp: [-8, 0, 2] }],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { id: 'palm', model: 'beach/palm', pos: [-6, 0, -3.5], h: 3.1, fb: 'palm', solid: [0.5, 3, 0.5] },
            { id: 'rock', model: 'beach/rock', pos: [-1.5, 0, -4.5], h: 1.1, fb: 'rock', solid: [1.1, 1, 1.1] },
            { id: 'boat', model: 'beach/boat', pos: [6, 0, -4], h: 0.9, rotY: 0.2, fb: 'boat', solid: [2.0, 0.6, 0.9] },
            { id: 'barrel', model: 'beach/barrel', pos: [7.5, 0, 3], h: 0.8, fb: 'barrel', solid: [0.55, 0.8, 0.55] },
            { id: 'chest', model: 'beach/chest', pos: [0, 0, 0.4], h: 0.6, fb: 'chest', solid: [0.8, 0.5, 0.5] },
            { id: 'palm2', model: 'beach/palm', pos: [-9.5, 0, -5], h: 2.8, fb: 'palm', solid: [0.5, 3, 0.5] },
            { id: 'palm3', model: 'beach/palm', pos: [9.5, 0, -5.5], h: 2.9, fb: 'palm', solid: [0.5, 3, 0.5] }
        ],
        slots: [{ id: 'palm', pos: [-6, 0, -2.4] }, { id: 'rock', pos: [-1.5, 0, -3.4] }, { id: 'boat', pos: [6, 0, -2.9] }, { id: 'barrel', pos: [7.5, 0, 4.1] }],
        camIntro: { pos: [0, 20, 18], look: [0, 0, 0] }
    },

    /* ============ 下面四个是"走路版"的老场景：find / shop / restaurant / verb_park（模型路径和比例沿用它们原来的 3D 布局） ============
       通用约定：每个场地正好 4 个 slots（钥匙/物品挂的位置，站在 slot 1.4 米内能抓）；slot 放在道具"前面"（z 更大，靠镜头一侧）；
       decor = 地面上的路 / 草坪 / 墙（solid:true 才有碰撞）；seaY:null = 没有海面；掉出地面（y < fallY）回 tiles[].rp。 */

    /* find：街上帮朋友找东西。四个位置：垃圾桶 / 长椅 / 邮筒 / 树。 */
    street_find: {
        sky: '#cfe9ff', seaY: null, fallY: -3,
        spawn: [-11, 0, 3],
        ring: { pos: [0, 0, 2.8], r: 1.3 },
        friend: { pos: [2.4, 0, 3.4], rotY: -2.2 },
        tiles: [{ x: 0, z: 0, w: 28, d: 16, thick: 0.6, color: '#cfe7c4', flat: true, rp: [-10, 0, 3] }],
        decor: [
            { pos: [0, 0.02, 2.2], size: [28, 0.04, 2.4], color: '#e5e7eb' },          // 人行道
            { pos: [0, 0.02, 5.4], size: [28, 0.04, 4.0], color: '#9aa4b2' }           // 马路
        ],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'street/building_1', pos: [-8.5, 0, -6.2], h: 4.6, fb: { w: 3.2, color: '#f2c7a5' }, solid: [3.2, 4, 2.4] },
            { model: 'street/building_2', pos: [-2.8, 0, -6.4], h: 5.2, fb: { w: 3.4, color: '#a7c7e7' }, solid: [3.4, 4, 2.4] },
            { model: 'street/building_1', pos: [3.0, 0, -6.2], h: 4.6, fb: { w: 3.2, color: '#f6e0a4' }, solid: [3.2, 4, 2.4] },
            { model: 'street/building_2', pos: [9.0, 0, -6.4], h: 5.2, fb: { w: 3.4, color: '#a7c7e7' }, solid: [3.4, 4, 2.4] },
            { model: 'street/tree_1', pos: [-12.2, 0, -2], h: 2.8, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { model: 'street/tree_2', pos: [12.4, 0, -1], h: 2.4, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { id: 'bin', model: 'street/bin', pos: [-7, 0, 0.2], h: 0.95, fb: 'bin', solid: [0.6, 0.9, 0.6] },
            { id: 'bench', model: 'park/bench', pos: [-2, 0, -1.5], h: 0.95, fb: 'bench', solid: [1.6, 0.5, 0.6] },
            { id: 'mailbox', model: 'street/mailbox', pos: [3.5, 0, 0.2], h: 1.5, fb: 'mailbox', solid: [0.6, 1.4, 0.6] },
            { id: 'tree', model: 'street/tree_1', pos: [9, 0, -1.6], h: 2.8, fb: { tree: true }, solid: [0.5, 3, 0.5] }
        ],
        slots: [{ id: 'bin', pos: [-7, 0, 1.3] }, { id: 'bench', pos: [-2, 0, -0.4] }, { id: 'mailbox', pos: [3.5, 0, 1.3] }, { id: 'tree', pos: [9, 0, -0.5] }],
        camIntro: { pos: [0, 18, 16], look: [0, 0, 0] }
    },

    /* shop：商店。四个货架区 fruit / bakery / drinks / digital；slot id 就是词的 scene_zone，所以"水果"会出现在水果区
       （roam_choice.slot_by_zone = true）；digital 不参与随机分配（和原来 random_target:false 一致）。 */
    shop_inside: {
        sky: '#cfe9ff', seaY: null, fallY: -3,
        spawn: [-9.5, 0, 3],
        ring: { pos: [0, 0, 1.8], r: 1.3 },
        friend: { pos: [2.6, 0, 2.6], rotY: -2.2 },
        tiles: [{ x: 0, z: -0.5, w: 22, d: 13, thick: 0.6, color: '#e8d5b5', flat: true, rp: [-9, 0, 3] }],
        decor: [
            { wall: true, pos: [0, 2.2, -7.0], size: [22, 4.4], rotY: 0, color: '#f5deb3', collide: [22, 4.4, 0.4] },                 // 后墙（面朝 +z）
            { wall: true, pos: [-11.0, 2.2, -0.5], size: [13, 4.4], rotY: Math.PI / 2, color: '#f5deb3', collide: [0.4, 4.4, 13] },   // 左墙（面朝 +x）
            { wall: true, pos: [11.0, 2.2, -0.5], size: [13, 4.4], rotY: -Math.PI / 2, color: '#f5deb3', collide: [0.4, 4.4, 13] },  // 右墙（面朝 -x）
            { pos: [0, 0.03, 0.8], size: [9, 0.04, 5], color: '#fecaca' }                            // 地毯
        ],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'shop/shelf', pos: [-7.5, 0, -6.2], h: 2.2, fb: { w: 1.9, color: '#c58b4e', shelf: true }, solid: [1.9, 2.2, 0.6] },
            { model: 'shop/shelf', pos: [-2.5, 0, -6.2], h: 2.2, fb: { w: 1.9, color: '#c58b4e', shelf: true }, solid: [1.9, 2.2, 0.6] },
            { model: 'shop/shelf', pos: [2.5, 0, -6.2], h: 2.2, fb: { w: 1.9, color: '#c58b4e', shelf: true }, solid: [1.9, 2.2, 0.6] },
            { model: 'shop/shelf', pos: [7.5, 0, -6.2], h: 2.2, fb: { w: 1.9, color: '#64748b', shelf: true }, solid: [1.9, 2.2, 0.6] },
            { model: 'shop/crate', pos: [-7.5, 0, -4.9], h: 0.55, fb: { w: 0.8, color: '#d9a066' }, solid: [0.8, 0.55, 0.8] },
            { model: 'shop/crate', pos: [-2.5, 0, -4.9], h: 0.55, fb: { w: 0.8, color: '#e8c58a' }, solid: [0.8, 0.55, 0.8] },
            { model: 'shop/crate', pos: [2.5, 0, -4.9], h: 0.55, fb: { w: 0.8, color: '#9ec5e8' }, solid: [0.8, 0.55, 0.8] },
            { model: 'shop/crate', pos: [7.5, 0, -4.9], h: 0.55, fb: { w: 0.8, color: '#94a3b8' }, solid: [0.8, 0.55, 0.8] },
            { pos: [7.5, 0.55, -4.9], h: 0.5, fb: 'laptop' },                                          // 数码区箱子上的笔记本电脑
            { model: 'shop/counter', pos: [0, 0, 4.4], h: 1.05, fb: { w: 2.4, color: '#b9824a' }, solid: [2.4, 1.05, 0.7] },
            { model: 'shop/plant', pos: [-10, 0, -5.8], h: 1.2, fb: { tree: true, small: true }, solid: [0.5, 1.2, 0.5] }
        ],
        slots: [{ id: 'fruit', pos: [-7.5, 0, -3.5] }, { id: 'bakery', pos: [-2.5, 0, -3.5] }, { id: 'drinks', pos: [2.5, 0, -3.5] }, { id: 'digital', pos: [7.5, 0, -3.5], randomTarget: false }],
        camIntro: { pos: [0, 16, 14], look: [0, 0, -1] }
    },

    /* restaurant：餐厅。四个位置：菜单板 / 厨房出餐口 / 柜台 / 餐桌。 */
    restaurant_inside: {
        sky: '#cfe9ff', seaY: null, fallY: -3,
        spawn: [-9.5, 0, 3],
        ring: { pos: [0, 0, 2.2], r: 1.3 },
        friend: { pos: [2.7, 0, 2.8], rotY: -2.2 },
        tiles: [{ x: 0, z: -0.5, w: 22, d: 13, thick: 0.6, color: '#e8d5b5', flat: true, rp: [-9, 0, 3] }],
        decor: [
            { wall: true, pos: [0, 2.2, -7.0], size: [22, 4.4], rotY: 0, color: '#fff3e0', collide: [22, 4.4, 0.4] },
            { wall: true, pos: [-11.0, 2.2, -0.5], size: [13, 4.4], rotY: Math.PI / 2, color: '#fff3e0', collide: [0.4, 4.4, 13] },
            { wall: true, pos: [11.0, 2.2, -0.5], size: [13, 4.4], rotY: -Math.PI / 2, color: '#fff3e0', collide: [0.4, 4.4, 13] },
            { pos: [-2.5, 1.85, -6.97], size: [2.5, 1.3, 0.1], color: '#6b7280' },                   // 厨房出餐口：外框 + 暖色里窗 + 台面
            { pos: [-2.5, 1.85, -6.92], size: [2.2, 1.0, 0.08], color: '#fbbf24' },
            { pos: [-2.5, 1.2, -6.7], size: [2.5, 0.08, 0.55], color: '#b9824a' },
            { pos: [0, 0.03, 0.8], size: [8, 0.04, 4.6], color: '#fecaca' }
        ],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { id: 'menu', pos: [-7.5, 1.4, -6.85], h: 1.5, fb: { parts: PARTS.board('#1f3b2d', 3) } },                  // 菜单板（挂在墙上，不用下载）
            { id: 'kitchen', model: 'room/stove', pos: [-2.5, 0, -6.3], h: 1.0, fb: 'stove', solid: [0.9, 0.9, 0.7] },
            { id: 'counter', model: 'shop/counter', pos: [3, 0, -3.8], h: 1.05, fb: { w: 2.4, color: '#b9824a' }, solid: [2.4, 1.05, 0.7] },
            { id: 'table', model: 'room/table', pos: [8, 0, -2.5], h: 0.75, fb: 'table', solid: [1.1, 0.75, 1.1] },
            { model: 'room/chair', pos: [6.9, 0, -2.5], h: 0.95, rotY: Math.PI / 2, fb: 'chair', solid: [0.5, 0.9, 0.5] },
            { model: 'room/chair', pos: [9.1, 0, -2.5], h: 0.95, rotY: -Math.PI / 2, fb: 'chair', solid: [0.5, 0.9, 0.5] },
            { model: 'room/table', pos: [-8.5, 0, 4.8], h: 0.75, fb: 'table', solid: [1.1, 0.75, 1.1] },
            { model: 'room/chair', pos: [-9.6, 0, 4.8], h: 0.95, rotY: Math.PI / 2, fb: 'chair', solid: [0.5, 0.9, 0.5] },
            { model: 'room/chair', pos: [-7.4, 0, 4.8], h: 0.95, rotY: -Math.PI / 2, fb: 'chair', solid: [0.5, 0.9, 0.5] }
        ],
        slots: [{ id: 'menu', pos: [-7.5, 0, -5.0] }, { id: 'kitchen', pos: [-2.5, 0, -4.9] }, { id: 'counter', pos: [3, 0, -2.2] }, { id: 'table', pos: [8, 0, -0.9] }],
        camIntro: { pos: [0, 16, 14], look: [0, 0, -1] }
    },

    /* verb_park：公园。四个位置：草坪（球和花）/ 湖边（鸭子）/ 长椅 / 冰淇淋车。选项是动词。 */
    park: {
        sky: '#cfe9ff', seaY: null, fallY: -3,
        spawn: [-11, 0, 4],
        ring: { pos: [-1, 0, 3.2], r: 1.3 },
        friend: { pos: [1.7, 0, 3.6], rotY: -2.2 },
        tiles: [{ x: 0, z: 0, w: 28, d: 18, thick: 0.6, color: '#86d36b', flat: true, rp: [-10, 0, 4] }],
        decor: [
            { pos: [0, 0.02, 6.4], size: [28, 0.04, 2.0], color: '#e6d3a3' },                        // 小路
            { pos: [-8.5, 0.02, -3.5], size: [6, 0.04, 4.5], color: '#9be37f' },                     // 草坪
            { pos: [5, 0.15, -3.5], size: [7, 0.3, 5], color: '#cbd5e1', solid: true },              // 湖边石岸（有碰撞，进不去）
            { pos: [5, 0.32, -3.5], size: [6.4, 0.04, 4.4], color: '#5aaee8' }                       // 湖水
        ],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'street/tree_1', pos: [-12.4, 0, -7.2], h: 3.4, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { model: 'street/tree_2', pos: [1.5, 0, -7.6], h: 3.0, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { model: 'street/tree_1', pos: [12.6, 0, -6.8], h: 3.6, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { id: 'ball', model: 'park/ball', pos: [-8.5, 0.05, -3.0], h: 0.4, fb: 'ball' },
            { pos: [-9.6, 0.05, -4.3], h: 0.4, fb: { parts: PARTS.flower('#f472b6') } },
            { pos: [-7.4, 0.05, -4.5], h: 0.4, fb: { parts: PARTS.flower('#fbbf24') } },
            { pos: [-7.1, 0.05, -2.9], h: 0.4, fb: { parts: PARTS.flower('#a78bfa') } },
            { id: 'bench', model: 'park/bench', pos: [-1.5, 0, -6.0], h: 0.95, fb: 'bench', solid: [1.6, 0.5, 0.6] },
            { model: 'park/duck', pos: [4.2, 0.34, -3.2], h: 0.4, fb: 'duck' },
            { model: 'park/duck', pos: [6.0, 0.34, -4.2], h: 0.4, fb: 'duck' },
            { id: 'cart', model: 'shop/icecream', pos: [11, 0, -2.0], h: 1.3, fb: 'icecream', solid: [1.0, 1.3, 0.8] }
        ],
        slots: [{ id: 'lawn', pos: [-8.5, 0, -1.9] }, { id: 'lake', pos: [5, 0, -0.6] }, { id: 'bench', pos: [-1.5, 0, -4.7] }, { id: 'cart', pos: [11, 0, -0.8] }],
        camIntro: { pos: [0, 18, 16], look: [0, 0, 0] }
    }
};

const BASE_MODELS = ['roam/platform_tile', 'roam/bounce_pad', 'roam/spinner', 'roam/pedestal', 'roam/delivery_ring', 'roam/cloud', 'characters/friend'];
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
    const wanted = [...new Set([...BASE_MODELS, ...(A.props || []).map(p => p.model).filter(Boolean)])];
    await Promise.all(wanted.map(async p => { loaded[p] = await loadModel(p); }));
    const clone = p => T.cloneSkinned(loaded[p].scene);

    const root = new T.Group();
    const boxes = [];                                         // 静态碰撞：{ min:[x,y,z], max:[x,y,z], bounce?, rp?, pad? }
    const tileMeshes = [];

    /* ---- 平台 / 桥 ---- */
    for (const t of A.tiles) {
        const top = t.top ?? 0, thick = t.thick ?? 0.6;
        let obj;
        if (loaded['roam/platform_tile'] && !t.flat) obj = fitBox(clone('roam/platform_tile'), t.w, thick, t.d);
        else { obj = new T.Group(); const m = new T.Mesh(new T.BoxGeometry(t.w, thick, t.d), mat(t.color)); m.position.y = thick / 2; obj.add(m); }
        obj.position.set(t.x, top - thick, t.z);
        root.add(obj); tileMeshes.push(obj);
        boxes.push({ min: [t.x - t.w / 2, top - thick, t.z - t.d / 2], max: [t.x + t.w / 2, top, t.z + t.d / 2], rp: t.rp || null });
    }

    /* ---- 弹跳垫 ---- */
    const pads = [];
    for (const [x, z] of A.pads || []) {
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
    for (const s of A.spinners || []) {
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
        if (A.slotPedestal === false) return { id: s.id, pos: new T.Vector3(...s.pos), obj: null, randomTarget: s.randomTarget };      // 海岛：钥匙直接挂在道具前面，不要底座
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
        return { id: s.id, pos: new T.Vector3(...s.pos), obj, randomTarget: s.randomTarget };
    });

    /* ---- 装饰方块（地面上的路 / 草坪 / 墙；solid:true 的同时参与碰撞） ---- */
    for (const d of A.decor || []) {
        if (d.wall) {                                                    // 单面墙：只从屋内（法线一侧）看得见，镜头跑到墙外面不会被挡；collide 是它的碰撞盒 [宽, 高, 深]
            const m = new T.Mesh(new T.PlaneGeometry(d.size[0], d.size[1]), mat(d.color)); m.position.set(...d.pos); m.rotation.y = d.rotY || 0; root.add(m);
            if (d.collide) boxes.push({ min: [d.pos[0] - d.collide[0] / 2, d.pos[1] - d.collide[1] / 2, d.pos[2] - d.collide[2] / 2], max: [d.pos[0] + d.collide[0] / 2, d.pos[1] + d.collide[1] / 2, d.pos[2] + d.collide[2] / 2] });
            continue;
        }
        const m = new T.Mesh(new T.BoxGeometry(...d.size), mat(d.color)); m.position.set(...d.pos); root.add(m);
        if (d.solid) boxes.push({ min: [d.pos[0] - d.size[0] / 2, d.pos[1] - d.size[1] / 2, d.pos[2] - d.size[2] / 2], max: [d.pos[0] + d.size[0] / 2, d.pos[1] + d.size[1] / 2, d.pos[2] + d.size[2] / 2] });
    }

    /* ---- 道具（海岛的棕榈树 / 岩石 / 小船 / 木桶 / 宝箱）：模型缺了用 PARTS 兜底；solid 是碰撞盒 ---- */
    const props = {};
    for (const p of A.props || []) {
        const spec = { h: p.h, fb: typeof p.fb === 'string' ? { parts: PARTS[p.fb] } : (p.fb || {}) };   // fb：PARTS 的键，或直接写 fallbackProp 的参数（{w,color} / {tree:true} / {parts}）
        const obj = p.model && loaded[p.model] ? normalize(clone(p.model), { h: p.h }) : normalize(fallbackProp(spec), { h: p.h });
        obj.position.set(...p.pos); obj.rotation.y = p.rotY || 0; root.add(obj);
        props[p.id] = { obj, base: obj.scale.clone(), bounce: 0 };
        if (p.solid) boxes.push({ min: [p.pos[0] - p.solid[0] / 2, 0, p.pos[2] - p.solid[2] / 2], max: [p.pos[0] + p.solid[0] / 2, p.solid[1], p.pos[2] + p.solid[2] / 2] });
    }

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
    if (A.seaY != null) {                                                   // seaY 写 null = 不要海面（室内 / 公园）
        const sea = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshBasicMaterial({ color: A.seaColor || '#7dd3fc', transparent: true, opacity: 0.9 }));
        sea.rotation.x = -Math.PI / 2; sea.position.y = A.seaY; root.add(sea);
    }
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
        bounce(id) { if (props[id]) props[id].bounce = 1; },                  // 交付成功：宝箱之类的道具弹一下
        update(dt) {
            t += dt;
            for (const s of spinners) { s.obj.rotation.y = -s.angle; }
            for (const p of pads) { if (p.squash > 0) { p.squash = Math.max(0, p.squash - dt * 4); const k = 1 - 0.35 * Math.sin(p.squash * Math.PI); p.obj.scale.set(1 + (1 - k) * 0.6, k, 1 + (1 - k) * 0.6); } }
            for (const pr of Object.values(props)) { if (pr.bounce > 0) { pr.bounce = Math.max(0, pr.bounce - dt * 1.6); const k = 1 + Math.sin(pr.bounce * Math.PI * 3) * 0.18 * pr.bounce; pr.obj.scale.set(pr.base.x * (2 - k), pr.base.y * k, pr.base.z * (2 - k)); } }
            if (ring.active) { const k = 1 + Math.sin(t * 5) * 0.06; ring.obj.scale.set(k, 1, k); }
            if (friend.mixer) friend.mixer.update(dt);
            if (friend.hop > 0) { friend.hop = Math.max(0, friend.hop - dt * 2.2); friend.root.position.y = A.friend.pos[1] + Math.sin(friend.hop * Math.PI) * 0.35; }
        },
        dispose() {
            root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); });
        }
    };
}