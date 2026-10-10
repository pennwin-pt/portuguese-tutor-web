/* 3D 舞台布局：每个场景模板 id 一份。没有布局的模板自动继续用 2D。
 * 单位 ≈ 米；x 向右、y 向上、z 朝向镜头。街道在 x≈0，“place”（商店/餐厅/客厅/公园…）在 x≈19。
 * model = models/ 下的相对路径（不带 .glb）；找不到文件时自动用 fb（简易几何体）代替，所以没下载模型也能跑。
 *   - 没写 model 的物件（黑板、菜单板、花、球…）永远用 fb 拼出来，不需要下载。
 *   - fb.parts = 用小方块（默认）/ 圆柱 cyl / 球 sph 拼出来的家具，整体会按 h 自动缩放，零件只需比例对。
 * h / w：目标高度 / 宽度（自动按包围盒缩放，不同模型包的尺寸差异不用管）。
 * hs：这个物件对应的热点 id，被点中 / 答对时会弹一下；同一个热点可以挂多个物件（比如“几座房子”）。
 * roomOnly 模板（find_room / verb_school / verb_home）：朋友和帮手是同一个人、一开始就在室内，
 *   没有街道，所以只需要 cameras.place，人物只写 me 和 helper 的 place。
 * 手机竖屏时画面约只看得到 place 镜头中心左右 ±3.5 米：热点尽量排在这个范围内，热点之间留 2.3 米以上。
 * 调位置：URL 加 ?debug=1，拖动视角后把读数抄回 cameras；人物/物件坐标直接改这里。 */

/* ================= 兜底几何体零件（没有模型文件时用；比例对就行） ================= */
const box = (w, h, d, x, y, z, color, shape) => ({ size: [w, h, d], pos: [x, y, z], color, shape });
const PARTS = {
  sofa: [box(2.2, .4, .95, 0, .2, 0, '#8b7cf6'), box(2.2, .55, .25, 0, .68, -.35, '#7567e0'),
    box(.25, .6, .95, -.98, .5, 0, '#7567e0'), box(.25, .6, .95, .98, .5, 0, '#7567e0'),
    box(.8, .14, .7, -.5, .47, .08, '#a597ff'), box(.8, .14, .7, .5, .47, .08, '#a597ff')],
  cabinet: [box(1.4, 2, .6, 0, 1, 0, '#a16207'), box(.64, 1.8, .04, -.34, 1, .31, '#b9822a'), box(.64, 1.8, .04, .34, 1, .31, '#b9822a'),
    box(.05, .22, .05, -.07, 1, .35, '#fde68a'), box(.05, .22, .05, .07, 1, .35, '#fde68a')],
  desk: [box(1.9, .08, .9, 0, .76, 0, '#c58b4e'), box(.5, .3, .8, .6, .55, 0, '#b9824a'),
    box(.08, .72, .08, -.88, .36, -.38, '#8a5a2b'), box(.08, .72, .08, .88, .36, -.38, '#8a5a2b'),
    box(.08, .72, .08, -.88, .36, .38, '#8a5a2b'), box(.08, .72, .08, .88, .36, .38, '#8a5a2b')],
  chair: [box(.5, .06, .5, 0, .45, 0, '#d9a066'), box(.5, .5, .06, 0, .72, -.22, '#c58b4e'),
    box(.05, .45, .05, -.2, .225, -.2, '#8a5a2b'), box(.05, .45, .05, .2, .225, -.2, '#8a5a2b'),
    box(.05, .45, .05, -.2, .225, .2, '#8a5a2b'), box(.05, .45, .05, .2, .225, .2, '#8a5a2b')],
  table: [box(1.1, .06, 0, 0, .72, 0, '#d9a066', 'cyl'), box(.12, .7, 0, 0, .35, 0, '#8a5a2b', 'cyl'), box(.5, .04, 0, 0, .02, 0, '#8a5a2b', 'cyl')],
  bed: [box(1.6, .3, 2, 0, .2, 0, '#b9824a'), box(1.5, .2, 1.9, 0, .45, .02, '#fef3c7'), box(1.5, .12, 1.2, 0, .58, .4, '#fb7185'),
    box(.6, .14, .35, -.35, .62, -.7, '#ffffff'), box(.6, .14, .35, .35, .62, -.7, '#ffffff'), box(1.6, .8, .1, 0, .5, -1, '#8a5a2b')],
  stove: [box(.9, .9, .7, 0, .45, 0, '#e5e7eb'), box(.92, .04, .72, 0, .92, 0, '#374151'), box(.7, .45, .04, 0, .42, .36, '#9ca3af'),
    box(.6, .03, .03, 0, .68, .4, '#111827'), box(.22, .02, 0, -.2, .95, -.12, '#111827', 'cyl'), box(.22, .02, 0, .2, .95, .12, '#111827', 'cyl')],
  books: [box(.5, .1, .35, 0, .05, 0, '#ef4444'), box(.46, .1, .33, .02, .15, 0, '#3b82f6'),
    box(.5, .1, .34, -.02, .25, 0, '#22c55e'), box(.44, .1, .32, .01, .35, 0, '#f59e0b')],
  bag: [box(.38, .5, .2, 0, .25, 0, '#ef4444'), box(.3, .2, .06, 0, .18, .12, '#b91c1c'), box(.38, .12, .22, 0, .46, 0, '#dc2626'),
    box(.04, .3, .04, -.12, .3, .12, '#7f1d1d'), box(.04, .3, .04, .12, .3, .12, '#7f1d1d'), box(.12, .04, .04, 0, .54, 0, '#7f1d1d')],
  cup: [box(.34, .4, 0, 0, .2, 0, '#60a5fa', 'cyl'), box(.28, .02, 0, 0, .41, 0, '#bfdbfe', 'cyl'), box(.12, .22, .05, .22, .2, 0, '#60a5fa')],
  bench: [box(1.7, .08, .5, 0, .46, 0, '#c58b4e'), box(1.7, .4, .06, 0, .78, -.22, '#c58b4e'),
    box(.08, .46, .46, -.75, .23, 0, '#4b5563'), box(.08, .46, .46, .75, .23, 0, '#4b5563'),
    box(.06, .5, .06, -.75, .7, -.22, '#4b5563'), box(.06, .5, .06, .75, .7, -.22, '#4b5563')],
  duck: [box(.34, 0, 0, 0, .17, 0, '#fde047', 'sph'), box(.2, 0, 0, 0, .38, .12, '#fde047', 'sph'), box(.1, .05, .1, 0, .37, .26, '#fb923c')],
  ball: [box(.4, 0, 0, 0, .2, 0, '#ef4444', 'sph')],
  flower: c => [box(.04, .3, .04, 0, .15, 0, '#16a34a'), box(.2, 0, 0, 0, .34, 0, c, 'sph')],
  /* 墙上的板子：黑板（深绿）/ 菜单板（深色）。lines = 粉笔字的条数 */
  board: (c, lines) => [box(2.7, 1.5, .08, 0, .75, 0, '#7c4a1e'), box(2.5, 1.3, .06, 0, .75, .04, c),
    ...Array.from({ length: lines }, (_, i) => box(1.9 - i * .35, .07, .03, -.1 - i * .08, 1.1 - i * .27, .09, '#f5f5dc')),
    box(2.5, .06, .25, 0, .06, .1, '#a16207')]
};

/* ================= 共用的地面 / 街道 / 室内外壳 ================= */
const STREET_BLOCKS = [
  { pos: [14, -0.06, 1], size: [80, 0.12, 24], color: '#cfe7c4' },        // 草地
  { pos: [0, 0.0, 4.6], size: [34, 0.05, 2.6], color: '#9aa4b2' },        // 马路
  { pos: [0, 0.02, 2.7], size: [34, 0.05, 1.4], color: '#e5e7eb' }        // 人行道
];
const STREET_PROPS = [
  { model: 'street/building_1', pos: [-4.4, 0, -5.4], h: 4.6, rotY: 0, fb: { w: 3.2, color: '#f2c7a5' } },
  { model: 'street/building_2', pos: [0.4, 0, -5.6], h: 5.2, rotY: 0, fb: { w: 3.4, color: '#a7c7e7' } },
  { model: 'street/building_1', pos: [5.4, 0, -5.4], h: 4.6, rotY: 0, fb: { w: 3.2, color: '#f6e0a4' } },
  { model: 'street/tree_1', pos: [-3.0, 0, -1.2], h: 2.8, fb: { tree: true } },
  { model: 'street/tree_2', pos: [3.4, 0, -1.4], h: 2.4, fb: { tree: true } }
];
const STREET_CAM = { pos: [0, 3.3, 11.6], look: [0, 1.3, 0] };
const PLACE_CAM = (cx = 19.1) => ({ pos: [cx, 3.5, 11.2], look: [cx, 1.2, -1] });
const ME = { model: 'characters/me', h: 1.7, street: [-1.5, 0, 0.5] };
const FRIEND = { model: 'characters/friend', h: 1.7, from: [-6.5, 0, 1.1], street: [1.5, 0, 0.3] };

/* 街边小楼的室内（商店/餐厅/客厅/展示室）：地板 + 后墙 + 左墙（街道侧外立面） */
const building = (floor, wall, side) => [
  { pos: [19.5, 0.0, 0.2], size: [17, 0.1, 7.6], color: floor },
  { pos: [19.5, 2.0, -3.7], size: [17, 4, 0.2], color: wall },
  { pos: [11.0, 2.0, 0.2], size: [0.3, 4, 7.6], color: side }
];
/* 纯室内房间（roomOnly）：四周都是墙，背景色 = 墙色，镜头里不会露出天空 */
const room = (floor, wall, side, trim) => [
  { pos: [19, -0.06, 2], size: [80, 0.12, 30], color: floor },
  { pos: [19.1, 0, 0.8], size: [17, 0.1, 9.2], color: floor },
  { pos: [19.1, 5, -3.7], size: [17, 10, 0.2], color: wall },
  { pos: [10.7, 5, 0.8], size: [0.3, 10, 9.2], color: side },
  { pos: [27.5, 5, 0.8], size: [0.3, 10, 9.2], color: side },
  { pos: [19.1, 0.2, -3.55], size: [17, 0.4, 0.1], color: trim }
];
const rug = (x, z, w, d, color) => ({ pos: [x, 0.07, z], size: [w, 0.03, d], color });
const windowAt = (x, y = 2.7) => [
  { pos: [x, y, -3.56], size: [1.8, 1.3, 0.05], color: '#ffffff' },
  { pos: [x, y, -3.52], size: [1.6, 1.1, 0.05], color: '#cfe9ff' },
  { pos: [x, y, -3.48], size: [0.06, 1.1, 0.04], color: '#ffffff' }
];
const hot = (x, y, z) => [x, y, z];
const spread = (list, tag) => list.map(p => ({ ...p, hs: tag }));

/* ================= 布局 ================= */
export const LAYOUTS = {
  /* ---------- shop：去商店买东西（第一期，数值保持不变） ---------- */
  shop: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS, ...building('#e2c08d', '#fff1d0', '#f5deb3')],
    props: [
      ...STREET_PROPS,
      // 商店：三个货架（对应热点 fruit / bakery / drinks），货架前各放一个箱子
      { model: 'shop/shelf', pos: [15.7, 0, -3.0], h: 2.2, hs: 'fruit', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'shop/shelf', pos: [18.0, 0, -3.0], h: 2.2, hs: 'bakery', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'shop/shelf', pos: [20.3, 0, -3.0], h: 2.2, hs: 'drinks', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'shop/crate', pos: [15.7, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#d9a066' } },
      { model: 'shop/crate', pos: [18.0, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#e8c58a' } },
      { model: 'shop/crate', pos: [20.3, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#9ec5e8' } },
      { model: 'shop/counter', pos: [21.9, 0, 0.1], h: 1.05, rotY: 0, fb: { w: 1.9, color: '#b9824a' } },
      { model: 'shop/plant', pos: [14.2, 0, -2.6], h: 1.2, fb: { tree: true, small: true } }
    ],
    // 热点按钮悬浮的位置（货架前上方）
    hotspots: { fruit: [15.7, 1.75, -2.2], bakery: [18.0, 1.75, -2.2], drinks: [20.3, 1.75, -2.2] },
    cameras: { street: STREET_CAM, place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.4, 0, 1.7] },
      friend: FRIEND,
      helper: { model: 'characters/helper', h: 1.7, place: [21.9, 0, -0.9] }
    }
  },

  /* ---------- restaurant / verb_restaurant：去餐厅（热点 menu / counter / kitchen，两个模板共用） ---------- */
  restaurant: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS, ...building('#e8d5b5', '#fff3e0', '#fde7c7'),
      // 后墙上的厨房出餐口：外框 + 暖色里窗 + 台面
      { pos: [18.0, 1.85, -3.57], size: [2.5, 1.3, 0.1], color: '#6b7280' },
      { pos: [18.0, 1.85, -3.5], size: [2.2, 1.0, 0.08], color: '#fbbf24' },
      { pos: [18.0, 1.2, -3.25], size: [2.5, 0.08, 0.55], color: '#b9824a' },
      rug(20.6, -0.8, 3.4, 2.4, '#fecaca')],
    props: [
      ...STREET_PROPS,
      { pos: [15.6, 1.4, -3.45], h: 1.5, hs: 'menu', fb: { parts: PARTS.board('#1f3b2d', 3) } },                       // 菜单板（不用下载）
      { model: 'room/stove', pos: [18.0, 0, -3.1], h: 1.0, hs: 'kitchen', fb: { parts: PARTS.stove } },                // 出餐口下面的灶台
      { model: 'shop/counter', pos: [20.6, 0, -1.5], h: 1.05, hs: 'counter', fb: { w: 2.4, color: '#b9824a' } },       // 柜台
      // 两侧的餐桌椅（装饰；竖屏看不到，横屏能看到）
      { model: 'room/table', pos: [13.2, 0, -0.6], h: 0.75, fb: { parts: PARTS.table } },
      { model: 'room/chair', pos: [12.3, 0, -0.6], h: 0.95, rotY: Math.PI / 2, fb: { parts: PARTS.chair } },
      { model: 'room/chair', pos: [14.1, 0, -0.6], h: 0.95, rotY: -Math.PI / 2, fb: { parts: PARTS.chair } },
      { model: 'room/table', pos: [25.2, 0, -1.2], h: 0.75, fb: { parts: PARTS.table } },
      { model: 'room/chair', pos: [24.3, 0, -1.2], h: 0.95, rotY: Math.PI / 2, fb: { parts: PARTS.chair } }
    ],
    hotspots: { menu: hot(15.6, 2.4, -2.9), kitchen: hot(18.0, 2.4, -2.9), counter: hot(20.6, 1.75, -1.2) },
    cameras: { street: STREET_CAM, place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.4, 0, 1.7] },
      friend: FRIEND,
      helper: { model: 'characters/helper', h: 1.7, place: [22.7, 0, -0.2] }
    }
  },

  /* ---------- find：帮朋友找东西（热点 sofa / cabinet / plant） ---------- */
  find: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS, ...building('#d7b98e', '#f6efe6', '#eadfce'),
      rug(15.7, -1.2, 3.0, 2.0, '#c4b5fd'), ...windowAt(18.1, 2.9)],
    props: [
      ...STREET_PROPS,
      { model: 'room/sofa', pos: [15.7, 0, -2.8], h: 0.95, hs: 'sofa', fb: { parts: PARTS.sofa } },
      { model: 'room/cabinet', pos: [18.1, 0, -3.2], h: 2.0, hs: 'cabinet', fb: { parts: PARTS.cabinet } },
      { model: 'shop/plant', pos: [20.5, 0, -3.0], h: 1.3, hs: 'plant', fb: { tree: true, small: true } }
    ],
    hotspots: { sofa: hot(15.7, 1.75, -2.2), cabinet: hot(18.1, 2.2, -2.5), plant: hot(20.5, 1.9, -2.3) },
    cameras: { street: STREET_CAM, place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.4, 0, 1.7] },
      friend: FRIEND,
      helper: { model: 'characters/helper', h: 1.7, place: [22.6, 0, -0.5] }
    }
  },

  /* ---------- describe：描述特征（热点 copo / casa / livros / casas，四个展台排一排） ---------- */
  describe: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS, ...building('#ead9bd', '#fdf6e3', '#f1e1c1'),
      ...[15.45, 17.95, 20.45, 22.95].map(x => ({ pos: [x, 0.35, -2.6], size: [2.0, 0.7, 1.1], color: '#f3e0c0' })),
      ...windowAt(19.2, 3.0)],
    props: [
      ...STREET_PROPS,
      { model: 'room/cup', pos: [15.45, 0.7, -2.6], h: 0.5, hs: 'copo', fb: { parts: PARTS.cup } },                                   // copo：一个杯子
      { model: 'street/building_1', pos: [17.95, 0.7, -2.6], h: 1.3, hs: 'casa', fb: { w: 1.1, color: '#f2c7a5', house: true } },       // casa：一座房子
      { model: 'room/books', pos: [20.45, 0.7, -2.6], h: 0.45, hs: 'livros', fb: { parts: PARTS.books } },                              // livros：几本书
      { model: 'street/building_1', pos: [22.35, 0.7, -2.5], h: 0.9, hs: 'casas', fb: { w: 0.5, color: '#f6e0a4', house: true } },      // casas：几座房子
      { model: 'street/building_1', pos: [22.95, 0.7, -2.7], h: 1.0, hs: 'casas', fb: { w: 0.5, color: '#f2c7a5', house: true } },
      { model: 'street/building_1', pos: [23.55, 0.7, -2.5], h: 0.9, hs: 'casas', fb: { w: 0.5, color: '#c7d9f2', house: true } }
    ],
    hotspots: { copo: hot(15.45, 2.3, -2.3), casa: hot(17.95, 2.3, -2.3), livros: hot(20.45, 2.3, -2.3), casas: hot(22.95, 2.3, -2.3) },
    cameras: { street: STREET_CAM, place: PLACE_CAM(19.2) },
    actors: {
      me: { ...ME, place: [16.5, 0, 1.8] },
      friend: FRIEND,
      helper: { model: 'characters/helper', h: 1.7, place: [19.2, 0, 2.0] }
    }
  },

  /* ---------- verb_park：公园里一起玩（热点 lawn / lake / bench；户外，没有墙） ---------- */
  verb_park: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS,
      { pos: [19, 0.03, 0.9], size: [12, 0.05, 1.3], color: '#e6d3a3' },                     // 小路
      { pos: [15.7, 0.03, -1.7], size: [3.6, 0.06, 3.0], color: '#86d36b' },                 // 草坪
      { pos: [22.2, 0.02, -1.9], size: [4.8, 0.05, 3.4], color: '#cbd5e1' },                 // 湖边石岸
      { pos: [22.2, 0.045, -1.9], size: [4.4, 0.05, 3.0], color: '#5aaee8' },                // 湖水
      { pos: [21.2, 0.08, -1.2], size: [0.4, 0.02, 0.4], color: '#4ade80' },
      { pos: [23.4, 0.08, -2.7], size: [0.5, 0.02, 0.5], color: '#4ade80' }],
    props: [
      ...STREET_PROPS,
      // 远处的楼 + 周围的树
      { model: 'street/building_1', pos: [15.0, 0, -8.8], h: 5.0, fb: { w: 3.4, color: '#f2c7a5' } },
      { model: 'street/building_2', pos: [22.0, 0, -9.2], h: 5.6, fb: { w: 3.6, color: '#a7c7e7' } },
      { model: 'street/tree_1', pos: [13.4, 0, -4.2], h: 3.4, fb: { tree: true } },
      { model: 'street/tree_2', pos: [19.4, 0, -4.6], h: 3.0, fb: { tree: true } },
      { model: 'street/tree_1', pos: [25.6, 0, -3.8], h: 3.6, fb: { tree: true } },
      // 草坪：球 + 三朵花
      ...spread([
        { pos: [15.4, 0.05, -1.1], h: 0.4, fb: { parts: PARTS.ball } },
        { pos: [14.6, 0.05, -2.3], h: 0.4, fb: { parts: PARTS.flower('#f472b6') } },
        { pos: [16.6, 0.05, -2.5], h: 0.4, fb: { parts: PARTS.flower('#fbbf24') } },
        { pos: [16.9, 0.05, -1.3], h: 0.4, fb: { parts: PARTS.flower('#a78bfa') } }], 'lawn'),
      // 长椅
      { model: 'park/bench', pos: [18.7, 0, -2.9], h: 0.95, hs: 'bench', fb: { parts: PARTS.bench } },
      // 湖里的两只鸭子
      { model: 'park/duck', pos: [21.4, 0.06, -1.7], h: 0.4, hs: 'lake', fb: { parts: PARTS.duck } },
      { model: 'park/duck', pos: [23.0, 0.06, -2.4], h: 0.4, hs: 'lake', fb: { parts: PARTS.duck } }
    ],
    hotspots: { lawn: hot(15.7, 2.1, -1.9), bench: hot(18.7, 2.1, -2.6), lake: hot(22.2, 2.1, -1.9) },
    cameras: { street: STREET_CAM, place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.2, 0, 1.9] },
      friend: FRIEND,
      helper: { model: 'characters/helper', h: 1.7, place: [20.4, 0, 2.2] }
    }
  },

  /* ---------- find_room：房间里找东西（roomOnly；热点 desk / shelf / bag） ---------- */
  find_room: {
    sky: '#f4ead8',
    blocks: [...room('#e0c79a', '#f4ead8', '#ead9bd', '#c9a96a'), rug(19.1, -0.3, 6.0, 2.8, '#fde68a'), ...windowAt(21.8, 2.8)],
    props: [
      { model: 'room/desk', pos: [15.6, 0, -2.9], h: 0.8, hs: 'desk', fb: { parts: PARTS.desk } },
      { model: 'room/chair', pos: [15.6, 0, -1.8], h: 0.95, rotY: Math.PI, fb: { parts: PARTS.chair } },
      { model: 'shop/shelf', pos: [18.3, 0, -3.1], h: 2.2, hs: 'shelf', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'room/bag', pos: [20.8, 0, -2.3], h: 0.5, rotY: -0.4, hs: 'bag', fb: { parts: PARTS.bag } }
    ],
    hotspots: { desk: hot(15.6, 1.75, -2.3), shelf: hot(18.3, 1.9, -2.5), bag: hot(20.8, 1.3, -2.1) },
    cameras: { place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.4, 0, 1.7] },
      helper: { model: 'characters/friend', h: 1.7, place: [22.9, 0, -0.2] }
    }
  },

  /* ---------- verb_school：教室里学习（roomOnly；热点 board / shelf / bag） ---------- */
  verb_school: {
    sky: '#eef2f7',
    blocks: [...room('#d9c7a3', '#eef2f7', '#e2e8f0', '#94a3b8'), rug(19.1, -0.2, 7.0, 2.6, '#bfdbfe')],
    props: [
      { pos: [15.4, 1.45, -3.45], h: 1.5, hs: 'board', fb: { parts: PARTS.board('#1e4d3a', 3) } },                                // 黑板（不用下载）
      { model: 'shop/shelf', pos: [17.9, 0, -3.1], h: 2.2, hs: 'shelf', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'room/desk', pos: [20.5, 0, -2.2], h: 0.8, fb: { parts: PARTS.desk } },
      { model: 'room/bag', pos: [20.1, 0.8, -2.2], h: 0.5, rotY: 0.3, hs: 'bag', fb: { parts: PARTS.bag } },                        // 书包放在课桌上
      { model: 'room/chair', pos: [20.5, 0, -1.1], h: 0.95, rotY: Math.PI, fb: { parts: PARTS.chair } },
      { model: 'room/desk', pos: [15.4, 0, -0.6], h: 0.8, fb: { parts: PARTS.desk } },
      { model: 'room/chair', pos: [15.4, 0, 0.5], h: 0.95, rotY: Math.PI, fb: { parts: PARTS.chair } }
    ],
    hotspots: { board: hot(15.4, 2.45, -2.9), shelf: hot(17.9, 1.9, -2.5), bag: hot(20.4, 1.7, -2.0) },
    cameras: { place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [17.4, 0, 1.9] },
      helper: { model: 'characters/friend', h: 1.7, place: [22.6, 0, 0.2] }
    }
  },

  /* ---------- verb_home：在家的一天（roomOnly；热点 kitchen / bedroom / living，三个区域并排） ---------- */
  verb_home: {
    sky: '#fbeee6',
    blocks: [...room('#e6cfa8', '#fbeee6', '#f3dccb', '#c9a27a'),
      rug(15.1, -1.3, 3.2, 3.0, '#e2e8f0'),         // 厨房：浅灰地砖
      rug(18.6, -1.3, 3.2, 3.0, '#fecdd3'),         // 卧室：粉色地毯
      rug(22.0, -1.3, 3.2, 3.0, '#bfdbfe'),         // 客厅：蓝色地毯
      ...windowAt(18.6, 2.8)],
    props: [
      { model: 'room/stove', pos: [14.5, 0, -3.1], h: 1.0, hs: 'kitchen', fb: { parts: PARTS.stove } },
      { model: 'shop/counter', pos: [15.9, 0, -3.0], h: 1.0, hs: 'kitchen', fb: { w: 1.2, color: '#b9824a' } },
      { model: 'room/bed', pos: [18.6, 0, -2.6], h: 0.9, hs: 'bedroom', fb: { parts: PARTS.bed } },
      { model: 'room/sofa', pos: [22.0, 0, -2.9], h: 0.95, hs: 'living', fb: { parts: PARTS.sofa } },
      { model: 'room/table', pos: [22.0, 0, -1.2], h: 0.45, fb: { parts: PARTS.table } }
    ],
    hotspots: { kitchen: hot(15.1, 2.2, -2.3), bedroom: hot(18.6, 2.2, -2.2), living: hot(22.0, 2.2, -2.2) },
    cameras: { place: PLACE_CAM(18.6) },
    actors: {
      me: { ...ME, place: [15.9, 0, 1.9] },
      helper: { model: 'characters/friend', h: 1.7, place: [18.6, 0, 2.2] }
    }
  }
};
LAYOUTS.verb_restaurant = LAYOUTS.restaurant;        // 两个餐厅模板的热点一样（menu / counter / kitchen），布局共用