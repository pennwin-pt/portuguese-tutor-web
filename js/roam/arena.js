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

/* 室内场地的公共外壳：一块地板 + 后墙 / 左右墙（单面墙，镜头在墙外不会被挡）。w×d 是地板大小，中心 (0, -0.5) */
function roomShell(floor, wall, w = 22, d = 13) {
    const z0 = -0.5 - d / 2, hw = w / 2;
    return {
        tile: { x: 0, z: -0.5, w, d, thick: 0.6, color: floor, flat: true, rp: [-hw + 2, 0, 3] },
        walls: [
            { wall: true, pos: [0, 2.2, z0], size: [w, 4.4], rotY: 0, color: wall, collide: [w, 4.4, 0.4] },
            { wall: true, pos: [-hw, 2.2, -0.5], size: [d, 4.4], rotY: Math.PI / 2, color: wall, collide: [0.4, 4.4, d] },
            { wall: true, pos: [hw, 2.2, -0.5], size: [d, 4.4], rotY: -Math.PI / 2, color: wall, collide: [0.4, 4.4, d] }
        ]
    };
}
const HOME = roomShell('#e6cfa8', '#f3dccb', 26), CLASS = roomShell('#d9c7a3', '#e2e8f0'), STUDY = roomShell('#e0c79a', '#ead9bd');

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
        ring: { pos: [0, 0, 2.0], r: 1.3 }, deliverProp: 'chest',
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
    },

    /* verb_magic：魔法小屋。大锅在屋子中间（交付环绕着它）；四个咒语卷轴挂在 魔法书桌 / 药水桌 / 水晶球桌 / 扫帚 前面。
       墙用单面墙（见 decor.wall）；夜空窗户是后墙上的装饰。 */
    magic_room: {
        sky: '#4c3a6b', seaY: null, fallY: -3,
        spawn: [-9.5, 0, 3],
        ring: { pos: [0, 0, 1.5], r: 1.3 }, deliverProp: 'cauldron',
        friend: { pos: [3.4, 0, 2.9], rotY: -2.4 },
        tiles: [{ x: 0, z: -0.5, w: 22, d: 13, thick: 0.6, color: '#8b6f9e', flat: true, rp: [-9, 0, 3] }],
        decor: [
            { wall: true, pos: [0, 2.2, -7.0], size: [22, 4.4], rotY: 0, color: '#5b4580', collide: [22, 4.4, 0.4] },
            { wall: true, pos: [-11.0, 2.2, -0.5], size: [13, 4.4], rotY: Math.PI / 2, color: '#5b4580', collide: [0.4, 4.4, 13] },
            { wall: true, pos: [11.0, 2.2, -0.5], size: [13, 4.4], rotY: -Math.PI / 2, color: '#5b4580', collide: [0.4, 4.4, 13] },
            { pos: [0, 0.03, 1.5], size: [7, 0.04, 4.4], color: '#7c3aed' },                         // 大锅下面的地毯
            { pos: [5, 2.8, -6.96], size: [1.7, 1.5, 0.05], color: '#ffffff' },                      // 夜空窗户：窗框 + 夜色 + 两颗星
            { pos: [5, 2.8, -6.92], size: [1.5, 1.3, 0.05], color: '#1e1b4b' },
            { pos: [4.6, 3.1, -6.88], size: [0.12, 0.12, 0.03], color: '#fde68a' },
            { pos: [5.4, 2.6, -6.88], size: [0.1, 0.1, 0.03], color: '#fde68a' }
        ],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'room/table', pos: [-7.5, 0, -5.0], h: 0.8, fb: 'table', solid: [1.3, 0.8, 0.8] },
            { model: 'magic/book', pos: [-7.5, 0.8, -5.0], h: 0.25, fb: 'spellbook' },
            { model: 'room/table', pos: [-2.5, 0, -5.0], h: 0.8, fb: 'table', solid: [1.3, 0.8, 0.8] },
            { model: 'magic/potion', pos: [-2.9, 0.8, -5.0], h: 0.4, fb: { parts: PARTS.potion('#f472b6') } },
            { model: 'magic/potion', pos: [-2.5, 0.8, -5.0], h: 0.4, fb: { parts: PARTS.potion('#60a5fa') } },
            { model: 'magic/potion', pos: [-2.1, 0.8, -5.0], h: 0.4, fb: { parts: PARTS.potion('#4ade80') } },
            { model: 'room/table', pos: [2.5, 0, -5.0], h: 0.8, fb: 'table', solid: [1.3, 0.8, 0.8] },
            { model: 'magic/crystal', pos: [2.5, 0.8, -5.0], h: 0.6, fb: 'crystal' },
            { model: 'magic/broom', pos: [7.5, 0, -5.2], h: 1.6, rotY: 0.3, fb: 'broom', solid: [0.4, 1.6, 0.4] },
            { id: 'cauldron', model: 'magic/cauldron', pos: [0, 0, 1.5], h: 1.1, fb: 'cauldron', solid: [1.1, 1.1, 1.1] }
        ],
        slots: [{ id: 'book', pos: [-7.5, 0, -3.5] }, { id: 'potion', pos: [-2.5, 0, -3.5] }, { id: 'crystal', pos: [2.5, 0, -3.5] }, { id: 'broom', pos: [7.5, 0, -3.7] }],
        camIntro: { pos: [0, 16, 14], look: [0, 0, -1] }
    },

    /* verb_home：在家。四个区：厨房 / 卧室 / 客厅 / 书房（第 4 个是新补的，原来只有前三个）。 */
    home_house: {
        sky: '#fbeee6', seaY: null, fallY: -3, spawn: [-11.5, 0, 3],
        ring: { pos: [0, 0, 2.2], r: 1.3 }, friend: { pos: [2.8, 0, 3.0], rotY: -2.3 },
        tiles: [HOME.tile],
        decor: [...HOME.walls,
            { pos: [-8.4, 0.03, -3.8], size: [4.6, 0.04, 5.2], color: '#e2e8f0' },     // 厨房：浅灰地砖
            { pos: [-2.8, 0.03, -3.8], size: [4.6, 0.04, 5.2], color: '#fecdd3' },     // 卧室：粉色地毯
            { pos: [2.8, 0.03, -3.8], size: [4.6, 0.04, 5.2], color: '#bfdbfe' },      // 客厅：蓝色地毯
            { pos: [8.4, 0.03, -3.8], size: [4.6, 0.04, 5.2], color: '#fde68a' },      // 书房：黄色地毯
            { pos: [-2.8, 2.8, -6.96], size: [1.7, 1.5, 0.05], color: '#ffffff' }, { pos: [-2.8, 2.8, -6.92], size: [1.5, 1.3, 0.05], color: '#bfe3ff' }],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'room/stove', pos: [-8.8, 0, -5.8], h: 1.0, fb: 'stove', solid: [0.9, 0.9, 0.7] },
            { model: 'shop/counter', pos: [-7.4, 0, -5.7], h: 1.0, fb: { w: 1.2, color: '#b9824a' }, solid: [1.2, 1.0, 0.6] },
            { model: 'room/bed', pos: [-2.8, 0, -5.4], h: 0.9, fb: 'bed', solid: [1.7, 0.6, 2.0] },
            { model: 'room/sofa', pos: [2.8, 0, -5.9], h: 0.95, fb: 'sofa', solid: [2.0, 0.9, 0.9] },
            { model: 'room/table', pos: [2.8, 0, -4.0], h: 0.45, fb: 'table', solid: [1.1, 0.45, 0.6] },
            { model: 'room/desk', pos: [8.4, 0, -5.8], h: 0.8, fb: 'desk', solid: [1.3, 0.8, 0.7] },
            { model: 'room/chair', pos: [8.4, 0, -4.7], h: 0.95, rotY: Math.PI, fb: 'chair', solid: [0.5, 0.9, 0.5] }
        ],
        slots: [{ id: 'kitchen', pos: [-8.1, 0, -3.9] }, { id: 'bedroom', pos: [-2.8, 0, -3.0] }, { id: 'living', pos: [2.8, 0, -2.6] }, { id: 'study', pos: [8.4, 0, -3.3] }],
        camIntro: { pos: [0, 17, 15], look: [0, 0, -1] }
    },

    /* verb_school + verb_note 共用：教室。四个位置：黑板 / 书架 / 书包（在课桌上）/ 讲台（第 4 个，新补的）。 */
    classroom: {
        sky: '#eef2f7', seaY: null, fallY: -3, spawn: [-9.5, 0, 3],
        ring: { pos: [0, 0, 2.0], r: 1.3 }, friend: { pos: [3.0, 0, 2.8], rotY: -2.3 },
        tiles: [CLASS.tile],
        decor: [...CLASS.walls, { pos: [0, 0.03, 0.8], size: [8, 0.04, 4], color: '#bfdbfe' }],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { id: 'board', pos: [-7.5, 1.45, -6.85], h: 1.5, fb: { parts: PARTS.board('#1e4d3a', 3) } },       // 黑板（挂在墙上，不用下载）
            { model: 'shop/shelf', pos: [-2.5, 0, -6.2], h: 2.2, fb: { w: 1.9, color: '#c58b4e', shelf: true }, solid: [1.9, 2.2, 0.6] },
            { model: 'room/desk', pos: [2.5, 0, -5.0], h: 0.8, fb: 'desk', solid: [1.3, 0.8, 0.7] },
            { model: 'room/bag', pos: [2.1, 0.8, -5.0], h: 0.5, rotY: 0.3, fb: 'bag' },                       // 书包放在课桌上
            { model: 'room/chair', pos: [2.5, 0, -3.9], h: 0.95, rotY: Math.PI, fb: 'chair', solid: [0.5, 0.9, 0.5] },
            { model: 'room/desk', pos: [7.5, 0, -5.0], h: 0.8, fb: 'desk', solid: [1.3, 0.8, 0.7] },          // 讲台
            { pos: [7.5, 0.8, -5.0], h: 0.3, fb: 'books' },
            { model: 'room/desk', pos: [-8.5, 0, 4.8], h: 0.8, fb: 'desk', solid: [1.3, 0.8, 0.7] },          // 角落的学生桌椅（不挡主通道）
            { model: 'room/chair', pos: [-8.5, 0, 3.7], h: 0.95, rotY: Math.PI, fb: 'chair', solid: [0.5, 0.9, 0.5] }
        ],
        slots: [{ id: 'board', pos: [-7.5, 0, -5.0] }, { id: 'shelf', pos: [-2.5, 0, -4.6] }, { id: 'bag', pos: [2.5, 0, -3.1] }, { id: 'desk', pos: [7.5, 0, -3.3] }],
        camIntro: { pos: [0, 16, 14], look: [0, 0, -1] }
    },

    /* find_room：房间里找东西。四个位置：桌子 / 书架 / 背包 / 床（第 4 个，新补的）。 */
    study_room: {
        sky: '#f4ead8', seaY: null, fallY: -3, spawn: [-9.5, 0, 3],
        ring: { pos: [0, 0, 2.0], r: 1.3 }, friend: { pos: [2.8, 0, 2.8], rotY: -2.3 },
        tiles: [STUDY.tile],
        decor: [...STUDY.walls, { pos: [0, 0.03, 0.4], size: [7, 0.04, 3.6], color: '#fde68a' },
            { pos: [5.0, 2.8, -6.96], size: [1.7, 1.5, 0.05], color: '#ffffff' }, { pos: [5.0, 2.8, -6.92], size: [1.5, 1.3, 0.05], color: '#bfe3ff' }],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'room/desk', pos: [-7.5, 0, -5.6], h: 0.8, fb: 'desk', solid: [1.3, 0.8, 0.7] },
            { model: 'room/chair', pos: [-7.5, 0, -4.4], h: 0.95, rotY: Math.PI, fb: 'chair', solid: [0.5, 0.9, 0.5] },
            { model: 'shop/shelf', pos: [-2.5, 0, -6.2], h: 2.2, fb: { w: 1.9, color: '#c58b4e', shelf: true }, solid: [1.9, 2.2, 0.6] },
            { model: 'room/bag', pos: [2.5, 0, -5.0], h: 0.5, rotY: -0.4, fb: 'bag', solid: [0.5, 0.5, 0.4] },
            { model: 'room/bed', pos: [7.5, 0, -5.6], h: 0.9, fb: 'bed', solid: [1.7, 0.6, 2.0] }
        ],
        slots: [{ id: 'desk', pos: [-7.5, 0, -2.9] }, { id: 'shelf', pos: [-2.5, 0, -4.6] }, { id: 'bag', pos: [2.5, 0, -3.3] }, { id: 'bed', pos: [7.5, 0, -3.5] }],
        camIntro: { pos: [0, 16, 14], look: [0, 0, -1] }
    },

    /* group_photo：学校操场拍集体照。四个位置：球场边的孩子 / 野餐桌一家人 / 教学楼前的同学 / 三脚架相机（第 4 个，新补的）。 */
    schoolyard: {
        sky: '#cfe9ff', seaY: null, fallY: -3, spawn: [-11, 0, 4],
        ring: { pos: [-1, 0, 3.2], r: 1.3 }, friend: { pos: [1.8, 0, 3.6], rotY: -2.3 },
        tiles: [{ x: 0, z: 0, w: 28, d: 18, thick: 0.6, color: '#cfe7c4', flat: true, rp: [-10, 0, 4] }],
        decor: [
            { pos: [0, 0.02, -2.6], size: [7, 0.04, 4.6], color: '#e6d3a3' },                        // 野餐的空地
            { pos: [-8, 0.03, -4.2], size: [6, 0.04, 4.4], color: '#7ec96b' },                       // 小球场
            { pos: [-8, 0.05, -4.2], size: [5.8, 0.01, 0.08], color: '#ffffff' },
            { pos: [-8, 0.05, -4.2], size: [0.08, 0.01, 4.2], color: '#ffffff' }
        ],
        pads: [], spinners: [], slotPedestal: false,
        props: [
            { model: 'street/building_2', pos: [8.5, 0, -7.6], h: 5.2, fb: { w: 3.8, color: '#a7c7e7' }, solid: [3.8, 4, 2.4] },
            { model: 'street/building_1', pos: [3.5, 0, -8.0], h: 4.6, fb: { w: 3.2, color: '#f2c7a5' }, solid: [3.2, 4, 2.4] },
            { model: 'street/tree_1', pos: [-12.4, 0, -7.0], h: 3.4, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { model: 'street/tree_2', pos: [12.6, 0, -6.0], h: 3.0, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { pos: [-8, 0, -7.0], h: 1.2, fb: 'goal' },
            { pos: [-6.2, 0.05, -3.4], h: 0.35, fb: 'ball' },
            { id: 'picnic', pos: [0, 0, -3.3], h: 0.8, fb: 'picnic', solid: [1.4, 0.8, 0.9] },
            { model: 'shop/camera', pos: [11, 0, 2.2], h: 1.1, fb: 'camera', solid: [0.5, 1.1, 0.5] }
        ],
        people: [
            { model: 'people/boy_a', pos: [-9.0, 0.03, -4.4], h: 1.5, look: { shirt: '#ef4444', hair: '#3b2a20' } },       // 球场边的三个孩子
            { model: 'people/boy_b', pos: [-8.0, 0.03, -4.8], h: 1.5, look: { shirt: '#ef4444', hair: '#111827' } },
            { model: 'people/girl_b', pos: [-7.0, 0.03, -4.4], h: 1.5, look: { girl: true, shirt: '#ef4444', hair: '#fbbf24' } },
            { model: 'people/man', pos: [-0.9, 0, -4.4], h: 1.75, look: { shirt: '#22c55e', hair: '#1f2937' } },             // 野餐桌后面的一家人
            { model: 'people/girl_a', pos: [0, 0, -4.4], h: 1.3, look: { girl: true, shirt: '#ec4899', hair: '#7c2d12' } },
            { model: 'people/woman', pos: [0.9, 0, -4.4], h: 1.65, look: { girl: true, shirt: '#a855f7', hair: '#451a03' } },
            { model: 'people/girl_a', pos: [7.2, 0, -5.2], h: 1.5, look: { girl: true, shirt: '#3b82f6', hair: '#7c2d12' } },   // 教学楼前的同学
            { model: 'people/boy_a', pos: [8.2, 0, -5.4], h: 1.5, look: { shirt: '#3b82f6', hair: '#3b2a20' } },
            { model: 'people/girl_b', pos: [9.2, 0, -5.2], h: 1.5, look: { girl: true, shirt: '#3b82f6', hair: '#111827' } }
        ],
        slots: [{ id: 'field', pos: [-8, 0, -2.4] }, { id: 'picnic', pos: [0, 0, -1.9] }, { id: 'school', pos: [8.2, 0, -3.4] }, { id: 'camera', pos: [11, 0, 0.9] }],
        camIntro: { pos: [0, 18, 16], look: [0, 0, 0] }
    },

    /* ---- 形容词走路版（describe_object / describe_person）----
       玩法：名词（物件 / 人）摆在场地中央，4 张形容词词牌挂在四角，抓对的带到交付环，词牌飞到名词上"贴"上去。
       variants：长度必须等于模板 noun_contexts 的个数（4），顺序和模板一致；scene.js 把本词的语境序号传进来，只显示那一组。
         每组 { props / people, deliver: 词牌飞向的终点, bounce: 交付成功时一起弹一下的摆件 id }；摆件和人物都登记进 props，所以人物也能弹。
       startYaw：镜头起始水平角（0 = 镜头在南侧朝北看，正对中央的展台 / 舞台）；不写则沿用默认（朝东）。 */
    /* describe_object：展台广场。variants 0 杯子 / 1 房子 / 2 书（两摞）/ 3 几座房子（三座）。 */
    adj_plaza: {
        sky: '#cfe9ff', seaY: null, fallY: -3, spawn: [0, 0, 5.5], startYaw: 0,
        ring: { pos: [0, 0, 1.2], r: 1.3 }, friend: { pos: [3.4, 0, 1.6], rotY: -2.3 },
        tiles: [{ x: 0, z: 0, w: 24, d: 14, thick: 0.6, color: '#e7e1d6', flat: true, rp: [0, 0, 5.5] }],
        decor: [{ pos: [0, 0.02, -2.4], size: [5.6, 0.04, 5.0], color: '#d4ccbc' }],
        pads: [], spinners: [],
        props: [
            // 圆形展台（直径约 2.4 m、高 0.5 m）：有 roam/podium.glb 用模型，没有就用圆柱兜底；solid 是碰撞盒（跳得上去，但不用上去）
            { id: 'podium', model: 'roam/podium', pos: [0, 0, -2.4], h: 0.5, solid: [2.4, 0.5, 2.4],
              fb: { parts: [{ shape: 'cyl', size: [2.7, 0.5], pos: [0, 0.25, 0], color: '#f5efe6' }, { shape: 'cyl', size: [2.3, 0.06], pos: [0, 0.53, 0], color: '#e5b86b' }] } },
            { model: 'street/tree_1', pos: [-10.6, 0, -5.6], h: 3.2, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { model: 'street/tree_2', pos: [10.6, 0, -5.8], h: 3.0, fb: { tree: true }, solid: [0.5, 3, 0.5] }
        ],
        variants: [
            { props: [{ id: 'cup', model: 'room/cup', pos: [0, 0.5, -2.4], h: 0.5, fb: 'cup' }], deliver: [0, 1.3, -2.4], bounce: ['cup'] },
            { props: [{ id: 'house', model: 'street/building_1', pos: [0, 0.5, -2.4], h: 1.3, fb: { w: 1.1, color: '#f2c7a5', house: true } }], deliver: [0, 2.2, -2.4], bounce: ['house'] },
            { props: [{ id: 'booksL', model: 'room/books', pos: [-0.5, 0.5, -2.4], h: 0.45, fb: 'books' }, { id: 'booksR', model: 'room/books', pos: [0.5, 0.5, -2.4], h: 0.45, rotY: 0.5, fb: 'books' }],
              deliver: [0, 1.3, -2.4], bounce: ['booksL', 'booksR'] },
            { props: [{ id: 'h1', model: 'street/building_1', pos: [-0.8, 0.5, -2.3], h: 0.85, fb: { w: 0.7, color: '#f2c7a5', house: true } },
                      { id: 'h2', model: 'street/building_1', pos: [0, 0.5, -2.7], h: 0.85, fb: { w: 0.7, color: '#a7c7e7', house: true } },
                      { id: 'h3', model: 'street/building_1', pos: [0.8, 0.5, -2.3], h: 0.85, fb: { w: 0.7, color: '#f5d98b', house: true } }],
              deliver: [0, 1.8, -2.5], bounce: ['h1', 'h2', 'h3'] }
        ],
        slots: [{ id: 'nw', pos: [-7, 0, -3.8] }, { id: 'ne', pos: [7, 0, -3.8] }, { id: 'sw', pos: [-7, 0, 3.2] }, { id: 'se', pos: [7, 0, 3.2] }],
        camIntro: { pos: [0, 16, 12], look: [0, 0, -1] }
    },

    /* describe_person：舞台操场。variants 0 一个男孩 / 1 一个女孩 / 2 三个男孩 / 3 三个女孩。
       舞台高 0.2 m（≤ PHYS.step 0.25，走过去自动上台阶，不用跳）；人站在舞台上（y = 0.2）。 */
    adj_stage: {
        sky: '#cfe9ff', seaY: null, fallY: -3, spawn: [0, 0, 5.5], startYaw: 0,
        ring: { pos: [0, 0, 1.6], r: 1.3 }, friend: { pos: [3.8, 0, 2.0], rotY: -2.3 },
        tiles: [{ x: 0, z: 0, w: 26, d: 15, thick: 0.6, color: '#cfe7c4', flat: true, rp: [0, 0, 5.5] }],
        decor: [
            { pos: [0, 0.1, -2.9], size: [6.4, 0.2, 3.2], color: '#e8c98a', solid: true },        // 矮舞台
            { pos: [0, 0.205, -2.9], size: [6.0, 0.01, 2.8], color: '#f3dfb0' }                    // 台面（浅色一圈，看得出是舞台）
        ],
        pads: [], spinners: [],
        props: [
            { model: 'street/tree_1', pos: [-11.2, 0, -6.2], h: 3.4, fb: { tree: true }, solid: [0.5, 3, 0.5] },
            { model: 'street/tree_2', pos: [11.2, 0, -6.4], h: 3.0, fb: { tree: true }, solid: [0.5, 3, 0.5] }
        ],
        variants: [
            { people: [{ id: 'a', model: 'people/boy_a', pos: [0, 0.2, -2.9], h: 1.5, look: { shirt: '#3b82f6', hair: '#3b2a20' } }], deliver: [0, 2.1, -2.9], bounce: ['a'] },
            { people: [{ id: 'a', model: 'people/girl_a', pos: [0, 0.2, -2.9], h: 1.4, look: { girl: true, shirt: '#ec4899', hair: '#7c2d12' } }], deliver: [0, 2.0, -2.9], bounce: ['a'] },
            { people: [{ id: 'a', model: 'people/boy_a', pos: [-1.3, 0.2, -2.9], h: 1.5, look: { shirt: '#3b82f6', hair: '#3b2a20' } },
                       { id: 'b', model: 'people/boy_b', pos: [0, 0.2, -2.9], h: 1.5, look: { shirt: '#ef4444', hair: '#111827' } },
                       { id: 'c', model: 'people/boy_a', pos: [1.3, 0.2, -2.9], h: 1.5, look: { shirt: '#22c55e', hair: '#3b2a20' } }],
              deliver: [0, 2.1, -2.9], bounce: ['a', 'b', 'c'] },
            { people: [{ id: 'a', model: 'people/girl_a', pos: [-1.3, 0.2, -2.9], h: 1.4, look: { girl: true, shirt: '#ec4899', hair: '#7c2d12' } },
                       { id: 'b', model: 'people/girl_b', pos: [0, 0.2, -2.9], h: 1.4, look: { girl: true, shirt: '#a855f7', hair: '#fbbf24' } },
                       { id: 'c', model: 'people/girl_a', pos: [1.3, 0.2, -2.9], h: 1.4, look: { girl: true, shirt: '#f97316', hair: '#111827' } }],
              deliver: [0, 2.0, -2.9], bounce: ['a', 'b', 'c'] }
        ],
        slots: [{ id: 'nw', pos: [-8, 0, -4.6] }, { id: 'ne', pos: [8, 0, -4.6] }, { id: 'sw', pos: [-8, 0, 3.4] }, { id: 'se', pos: [8, 0, 3.4] }],
        camIntro: { pos: [0, 17, 13], look: [0, 0, -1] }
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
    const variantItems = (A.variants || []).flatMap(v => [...(v.props || []), ...(v.people || [])]);
    const wanted = [...new Set([...BASE_MODELS, ...(A.props || []).map(p => p.model).filter(Boolean), ...(A.people || []).map(p => p.model).filter(Boolean), ...variantItems.map(p => p.model).filter(Boolean)])];
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

    /* ---- 人群（group_photo 的球场边 / 野餐桌 / 教学楼前的人；没有 people/ 模型就用 look 画简易小人；不参与碰撞） ---- */
    for (const p of A.people || []) {
        const g = loaded[p.model] ? normalize(clone(p.model), { h: p.h }) : normalize(fallbackPerson(p.look || null), { h: p.h });
        g.position.set(...p.pos); g.rotation.y = p.rotY || 0; root.add(g);
    }

    /* ---- 变体（形容词走路版：按名词语境换摆件 / 人物，一次只显示一组）----
       摆件和人物都登记进 props（键 "变体序号:id"），交付时和普通道具一样"弹一下"；变体里的东西不参与碰撞（站在展台 / 舞台上）。 */
    const variants = (A.variants || []).map((v, i) => {
        const group = new T.Group(); group.visible = false; root.add(group);
        const put = (p, person) => {
            const spec = { h: p.h, fb: typeof p.fb === 'string' ? { parts: PARTS[p.fb] } : (p.fb || {}) };
            const obj = person
                ? (loaded[p.model] ? normalize(clone(p.model), { h: p.h }) : normalize(fallbackPerson(p.look || null), { h: p.h }))
                : (p.model && loaded[p.model] ? normalize(clone(p.model), { h: p.h }) : normalize(fallbackProp(spec), { h: p.h }));
            obj.position.set(...p.pos); obj.rotation.y = p.rotY || 0; group.add(obj);
            props[`${i}:${p.id}`] = { obj, base: obj.scale.clone(), bounce: 0 };
        };
        (v.props || []).forEach(p => put(p, false));
        (v.people || []).forEach(p => put(p, true));
        return { group, deliver: v.deliver ? new T.Vector3(...v.deliver) : null, bounce: (v.bounce || []).map(id => `${i}:${id}`) };
    });
    let variant = -1;

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
        deliverProp: A.deliverProp, startYaw: A.startYaw, variantCount: variants.length,
        padHit(i) { if (pads[i]) pads[i].squash = 1; },
        bounce(id) { for (const k of [].concat(id)) if (props[k]) props[k].bounce = 1; },   // 交付成功：宝箱之类的道具弹一下（id 可以是数组：复数名词的几个摆件 / 几个人一起弹）
        setVariant(i) { variant = variants[i] ? i : -1; variants.forEach((v, k) => { v.group.visible = k === variant; }); },   // 形容词走路版：只显示本词名词语境对应的那一组
        /* 交付成功时词牌飞向哪里、哪些东西弹一下：有变体用变体的；没有变体保持老行为（target=null → 飞向朋友，弹 deliverProp） */
        delivery() { const v = variants[variant]; return v ? { target: v.deliver, bounce: v.bounce } : { target: null, bounce: A.deliverProp ? [A.deliverProp] : [] }; },
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