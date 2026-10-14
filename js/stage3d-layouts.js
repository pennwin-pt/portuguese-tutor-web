/* 3D 舞台布局：每个场景模板 id 必须有一份（缺失时该场景显示错误卡）。
 * 单位 ≈ 米；x 向右、y 向上、z 朝向镜头。街道在 x≈0，“place”（商店/餐厅/客厅/公园…）在 x≈19。
 * model = models/ 下的相对路径（不带 .glb）；找不到文件时自动用 fb（简易几何体）代替，所以没下载模型也能跑。
 *   - 没写 model 的物件（黑板、菜单板、花、球…）永远用 fb 拼出来，不需要下载。
 *   - fb.parts = 用小方块（默认）/ 圆柱 cyl / 球 sph 拼出来的家具，整体会按 h 自动缩放，零件只需比例对。
 * h / w：目标高度 / 宽度（自动按包围盒缩放，不同模型包的尺寸差异不用管）。
 * hs：这个物件对应的热点 id，被点中 / 答对时会弹一下；同一个热点可以挂多个物件（比如“几座房子”）。
 * find：在街上帮朋友找东西，镜头一直是街道（cameras 只有 street，人物只写 me / friend），热点 bin / bench / mailbox 就站在街边。
 * roomOnly 模板（find_room / verb_school / verb_home / verb_note / verb_treasure / verb_magic）：朋友和帮手是同一个人、一开始就在室内，
 *   没有街道，所以只需要 cameras.place，人物只写 me 和 helper 的 place。
 * 手机竖屏时画面约只看得到 place 镜头中心左右 ±3.5 米：热点尽量排在这个范围内，热点之间留 2.3 米以上。
 * people（可选）：站在场景里的“群众演员”（describe_person 的男孩/女孩），写法和 props 类似：
 *   { model, pos, h, rotY, hs, look }；有 idle 动画就播放；没放模型文件时用 look 拼一个兜底小人（look.girl=true 加裙子和长发）。
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
  bin: [box(.5, .8, 0, 0, .4, 0, '#16a34a', 'cyl'), box(.54, .06, 0, 0, .83, 0, '#15803d', 'cyl'), box(.18, .04, .04, 0, .9, 0, '#14532d')],
  mailbox: [box(.55, 1.1, 0, 0, .55, 0, '#dc2626', 'cyl'), box(.55, 0, 0, 0, 1.1, 0, '#b91c1c', 'sph'), box(.3, .05, .04, 0, .85, .27, '#111827')],
  duck: [box(.34, 0, 0, 0, .17, 0, '#fde047', 'sph'), box(.2, 0, 0, 0, .38, .12, '#fde047', 'sph'), box(.1, .05, .1, 0, .37, .26, '#fb923c')],
  ball: [box(.4, 0, 0, 0, .2, 0, '#ef4444', 'sph')],
  goal: [box(.08, 1.2, .08, -1.0, .6, 0, '#f8fafc'), box(.08, 1.2, .08, 1.0, .6, 0, '#f8fafc'), box(2.08, .08, .08, 0, 1.2, 0, '#f8fafc'),
    box(2.0, 1.1, .03, 0, .6, -.3, '#e2e8f0')],
  picnic: [box(1.7, .08, .8, 0, .76, 0, '#c58b4e'), box(1.7, .06, .3, 0, .45, .62, '#b9824a'), box(1.7, .06, .3, 0, .45, -.62, '#b9824a'),
    box(.08, .76, .7, -.7, .38, 0, '#8a5a2b'), box(.08, .76, .7, .7, .38, 0, '#8a5a2b')],
  camera: [box(.05, .8, .05, -.2, .4, -.1, '#374151'), box(.05, .8, .05, .2, .4, -.1, '#374151'), box(.05, .8, .05, 0, .4, .22, '#374151'),
    box(.42, .3, .3, 0, .95, 0, '#1f2937'), box(.2, .16, 0, 0, .95, .24, '#60a5fa', 'cyl')],
  icecream: [box(.2, .3, 0, 0, .15, 0, '#e0a458', 'cyl'), box(.32, 0, 0, 0, .38, 0, '#f9a8d4', 'sph'), box(.24, 0, 0, 0, .56, 0, '#fde68a', 'sph')],
  flower: c => [box(.04, .3, .04, 0, .15, 0, '#16a34a'), box(.2, 0, 0, 0, .34, 0, c, 'sph')],
  /* 海岛寻宝（verb_treasure）：没下载 beach/ 模型时用这些兜底 */
  palm: [box(.2, 2.6, 0, 0, 1.3, 0, '#a16207', 'cyl'), box(1.3, 0, 0, 0, 2.65, 0, '#16a34a', 'sph'),
    box(.9, 0, 0, .75, 2.4, 0, '#22c55e', 'sph'), box(.9, 0, 0, -.75, 2.4, 0, '#22c55e', 'sph'),
    box(.9, 0, 0, 0, 2.4, .75, '#22c55e', 'sph'), box(.9, 0, 0, 0, 2.4, -.75, '#22c55e', 'sph')],
  rock: [box(1.3, 0, 0, 0, .45, 0, '#94a3b8', 'sph'), box(.8, 0, 0, .55, .28, .2, '#a8b3c4', 'sph'), box(.6, 0, 0, -.5, .22, .25, '#7c8aa0', 'sph')],
  boat: [box(2.2, .3, .9, 0, .25, 0, '#a16207'), box(2.2, .3, .08, 0, .52, .45, '#8a5a2b'), box(2.2, .3, .08, 0, .52, -.45, '#8a5a2b'),
    box(.1, .3, .9, 1.1, .52, 0, '#8a5a2b'), box(.1, .3, .9, -1.1, .52, 0, '#8a5a2b'), box(.1, .08, .8, 0, .42, 0, '#d9a066')],
  chest: [box(.8, .35, .5, 0, .18, 0, '#92400e'), box(.8, .16, .5, 0, .43, 0, '#b45309'), box(.1, .55, .52, 0, .28, 0, '#facc15'), box(.12, .14, .05, 0, .34, .27, '#fde047')],
  barrel: [box(.55, .8, 0, 0, .4, 0, '#a16207', 'cyl'), box(.58, .06, 0, 0, .25, 0, '#6b4423', 'cyl'), box(.58, .06, 0, 0, .55, 0, '#6b4423', 'cyl')],
  /* 魔法小屋（verb_magic）：没下载 magic/ 模型时用这些兜底 */
  cauldron: [box(1.1, 0, 0, 0, .55, 0, '#1f2937', 'sph'), box(.95, .08, 0, 0, .98, 0, '#374151', 'cyl'), box(.8, .03, 0, 0, 1.0, 0, '#4ade80', 'cyl'),
    box(.12, .2, .12, -.4, .1, .25, '#111827'), box(.12, .2, .12, .4, .1, .25, '#111827'), box(.12, .2, .12, 0, .1, -.45, '#111827')],
  spellbook: [box(.5, .04, .34, 0, .02, 0, '#7c3aed'), box(.23, .03, .3, -.12, .055, 0, '#fef3c7'), box(.23, .03, .3, .12, .055, 0, '#fffbeb')],
  crystal: [box(.32, .12, 0, 0, .06, 0, '#6b7280', 'cyl'), box(.5, 0, 0, 0, .37, 0, '#a5b4fc', 'sph')],
  potion: c => [box(.2, .24, 0, 0, .12, 0, c, 'cyl'), box(.08, .12, 0, 0, .3, 0, c, 'cyl'), box(.09, .04, 0, 0, .38, 0, '#a16207', 'cyl')],
  broom: [box(.05, 1.5, .05, 0, .75, 0, '#8a5a2b'), box(.3, .35, .3, 0, .17, 0, '#d9a066')],
  /* 笔记本电脑（商店数码区货架前的箱子上）：底座 + 立起的屏幕 + 蓝色屏幕面 */
  laptop: [box(.7, .04, .5, 0, .02, 0, '#9ca3af'), box(.7, .5, .04, 0, .27, -.23, '#1f2937'), box(.6, .4, .02, 0, .27, -.2, '#60a5fa')],
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
      // 商店：四个货架（对应热点 fruit / bakery / drinks / digital），货架前各放一个箱子；间距 2.3 米，整体以 x=19.1 为中心
      { model: 'shop/shelf', pos: [15.65, 0, -3.0], h: 2.2, hs: 'fruit', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'shop/shelf', pos: [17.95, 0, -3.0], h: 2.2, hs: 'bakery', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'shop/shelf', pos: [20.25, 0, -3.0], h: 2.2, hs: 'drinks', fb: { w: 1.9, color: '#c58b4e', shelf: true } },
      { model: 'shop/shelf', pos: [22.55, 0, -3.0], h: 2.2, hs: 'digital', fb: { w: 1.9, color: '#64748b', shelf: true } },
      { model: 'shop/crate', pos: [15.65, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#d9a066' } },
      { model: 'shop/crate', pos: [17.95, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#e8c58a' } },
      { model: 'shop/crate', pos: [20.25, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#9ec5e8' } },
      { model: 'shop/crate', pos: [22.55, 0, -1.9], h: 0.55, fb: { w: 0.8, color: '#94a3b8' } },
      { pos: [22.55, 0.55, -1.9], h: 0.5, fb: { parts: PARTS.laptop } },                                  // 数码区箱子上的笔记本电脑
      { model: 'shop/counter', pos: [21.9, 0, 0.1], h: 1.05, rotY: 0, fb: { w: 1.9, color: '#b9824a' } },
      { model: 'shop/plant', pos: [14.0, 0, -2.6], h: 1.2, fb: { tree: true, small: true } }
    ],
    // 热点按钮悬浮的位置（货架前上方）
    hotspots: { fruit: [15.65, 1.75, -2.2], bakery: [17.95, 1.75, -2.2], drinks: [20.25, 1.75, -2.2], digital: [22.55, 1.75, -2.2] },
    cameras: { street: STREET_CAM, place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.4, 0, 1.7] },
      friend: FRIEND,
      helper: { model: 'characters/helper', h: 1.7, place: [21.9, 0, 1.5] }      // 站在柜台前面（z 比柜台 0.1 大 = 更靠近镜头）；原来在柜台后面 z=-0.9，镜头偏低会被柜台挡住
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
  /* ---------- find：在街上帮朋友找东西（不换场景，镜头一直是街道；热点 bin / bench / mailbox，各间隔 3 米，在手机竖屏 ±3.5 米范围内） ---------- */
  find: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS],
    props: [
      ...STREET_PROPS.filter(p => !p.model.startsWith('street/tree')),      // 只留楼；树挪到画面两侧，中间留给热点
      { model: 'street/tree_1', pos: [-5.6, 0, -1.2], h: 2.8, fb: { tree: true } },
      { model: 'street/tree_2', pos: [5.8, 0, -1.4], h: 2.4, fb: { tree: true } },
      { model: 'street/bin', pos: [-3.0, 0, -1.3], h: 0.95, hs: 'bin', fb: { parts: PARTS.bin } },
      { model: 'park/bench', pos: [0, 0, -1.7], h: 0.95, hs: 'bench', fb: { parts: PARTS.bench } },
      { model: 'street/mailbox', pos: [3.0, 0, -1.3], h: 1.5, hs: 'mailbox', fb: { parts: PARTS.mailbox } }
    ],
    hotspots: { bin: hot(-3.0, 1.45, -1.0), bench: hot(0, 1.4, -1.4), mailbox: hot(3.0, 2.0, -1.0) },
    cameras: { street: STREET_CAM },
    actors: { me: ME, friend: FRIEND }
  },

  /* ---------- describe_object：描述物体（热点 copo / casa / livros / casas，四个展台排一排） ---------- */
  describe_object: {
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

  /* ---------- describe_person：描述人物（热点 rapaz / rapariga / rapazes / raparigas，四组人站成一排）----------
   * 一个男孩 / 一个女孩 / 两个男孩 / 两个女孩，各站在一块浅色站台上；热点和 describe_object 一样间隔 2.5 米，竖屏看得全。
   * 新模型（可选，缺了用兜底小人）：people/boy_a、people/boy_b、people/girl_a、people/girl_b，清单见 models/MODELS_describe_person.md。 */
  describe_person: {
    sky: '#cfe9ff',
    blocks: [...STREET_BLOCKS,
      { pos: [19.2, 0.03, -1.9], size: [11.6, 0.05, 3.4], color: '#e6d3a3' },                                        // 空地
      ...[15.45, 17.95, 20.45, 22.95].map(x => ({ pos: [x, 0.07, -2.4], size: [2.1, 0.05, 1.7], color: '#f6ecd0' }))],  // 四块站台（顶面 y≈0.095）
    props: [
      ...STREET_PROPS,
      // 远处的教学楼 + 两侧的树
      { model: 'street/building_1', pos: [13.0, 0, -8.4], h: 4.8, fb: { w: 3.2, color: '#f2c7a5' } },
      { model: 'street/building_2', pos: [19.2, 0, -9.0], h: 5.6, fb: { w: 3.6, color: '#a7c7e7' } },
      { model: 'street/building_1', pos: [25.4, 0, -8.4], h: 4.8, fb: { w: 3.2, color: '#f6e0a4' } },
      { model: 'street/tree_1', pos: [13.4, 0, -4.8], h: 3.4, fb: { tree: true } },
      { model: 'street/tree_2', pos: [25.2, 0, -4.8], h: 3.0, fb: { tree: true } }
    ],
    people: [
      { model: 'people/boy_a', pos: [15.45, 0.095, -2.4], h: 1.5, hs: 'rapaz', look: { shirt: '#3b82f6', hair: '#3b2a20' } },                       // rapaz：一个男孩
      { model: 'people/girl_a', pos: [17.95, 0.095, -2.4], h: 1.5, hs: 'rapariga', look: { girl: true, shirt: '#ec4899', hair: '#7c2d12' } },        // rapariga：一个女孩
      { model: 'people/boy_a', pos: [20.05, 0.095, -2.35], h: 1.5, hs: 'rapazes', look: { shirt: '#3b82f6', hair: '#3b2a20' } },                       // rapazes：两个男孩（两个人外观要不同）
      { model: 'people/boy_b', pos: [20.85, 0.095, -2.5], h: 1.5, hs: 'rapazes', look: { shirt: '#22c55e', hair: '#111827' } },
      { model: 'people/girl_a', pos: [22.55, 0.095, -2.35], h: 1.5, hs: 'raparigas', look: { girl: true, shirt: '#ec4899', hair: '#7c2d12' } },       // raparigas：两个女孩
      { model: 'people/girl_b', pos: [23.35, 0.095, -2.5], h: 1.5, hs: 'raparigas', look: { girl: true, shirt: '#a855f7', hair: '#fbbf24' } }
    ],
    hotspots: { rapaz: hot(15.45, 2.2, -2.3), rapariga: hot(17.95, 2.2, -2.3), rapazes: hot(20.45, 2.2, -2.3), raparigas: hot(22.95, 2.2, -2.3) },
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
    hotspots: { board: hot(15.4, 5.95, -0.9), shelf: hot(17.9, 1.9, -2.5), bag: hot(20.4, 1.7, -2.0) },
    cameras: { place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [17.4, 0, 1.9] },
      helper: { model: 'characters/friend', h: 1.7, place: [22.6, 0, 0.2] }
    }
  },

  /* ---------- verb_persuade：说服朋友（roomOnly；热点 ball / icecream / duck；小Rui站在客厅前面，三样他喜欢的东西排在后排）----------
   * 说服类动词专用（manualOnly，只有管理端明确选了“说服朋友”的词才进来）。小Rui = people/boy_a（和 describe_person 共用同一个模型；没放模型时用兜底小人）。
   * 足球/冰淇淋/小鸭子：球和冰淇淋没有模型也能显示（兜底几何体），鸭子复用 park/duck，冰淇淋可选 shop/icecream。 */
  verb_persuade: {
    sky: '#fbeee6',
    blocks: [...room('#e6cfa8', '#fbeee6', '#f3dccb', '#c9a27a'), rug(19.1, -0.4, 7.4, 3.6, '#bfdbfe'), ...windowAt(21.6, 2.8)],
    props: [
      { model: 'room/sofa', pos: [19.1, 0, -3.1], h: 0.95, fb: { parts: PARTS.sofa } },
      { model: 'room/table', pos: [19.1, 0, -1.9], h: 0.45, fb: { parts: PARTS.table } },
      { model: 'shop/icecream', pos: [19.1, 0.46, -1.9], h: 0.35, hs: 'icecream', fb: { parts: PARTS.icecream } },        // 茶几上的冰淇淋
      { model: 'park/ball', pos: [16.2, 0.05, -2.0], h: 0.4, hs: 'ball', fb: { parts: PARTS.ball } },                       // 地毯上的足球
      { model: 'park/duck', pos: [22.0, 0.05, -2.0], h: 0.4, hs: 'duck', fb: { parts: PARTS.duck } }                        // 小鸭子玩具
    ],
    people: [
      { model: 'people/boy_a', pos: [17.9, 0, 0.3], h: 1.5, rotY: 0.25, look: { shirt: '#3b82f6', hair: '#3b2a20' } }       // 小Rui：站在中间偏左，不挡后排的东西
    ],
    hotspots: { ball: hot(16.2, 1.25, -1.8), icecream: hot(19.1, 1.45, -1.8), duck: hot(22.0, 1.25, -1.8) },
    cameras: { place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.2, 0, 1.9] },
      helper: { model: 'characters/friend', h: 1.7, place: [22.4, 0, 0.7] }
    }
  },

  /* ---------- group_photo：拍集体照（roomOnly；热点 field / picnic / school；三群人站成一排，朋友在前面架好相机）----------
   * 名词里“一群人”类的词专用（manualOnly，只有管理端明确选了“拍集体照”的词才进来）：equipa、grupo、família、turma、banda…
   * 球场 / 野餐桌 / 教学楼 / 球门 / 野餐桌都用兜底几何体拼，不需要下载；人物复用 people/ 里的模型，缺了用兜底小人。
   * 新模型（可选）：people/man、people/woman（大人）、shop/camera（相机），清单见 models/MODELS_group_photo.md。 */
  group_photo: {
    sky: '#cfe9ff',
    blocks: [{ pos: [14, -0.06, 1], size: [80, 0.12, 30], color: '#cfe7c4' },                                            // 草地
      { pos: [19.2, 0.03, -1.6], size: [11.6, 0.05, 4.6], color: '#e6d3a3' },                                           // 空地
      { pos: [16.0, 0.065, -2.5], size: [3.5, 0.03, 3.3], color: '#7ec96b' },                                           // 小球场
      { pos: [16.0, 0.085, -2.5], size: [3.3, 0.01, 0.06], color: '#ffffff' },                                          // 中线
      { pos: [16.0, 0.085, -2.5], size: [0.06, 0.01, 3.1], color: '#ffffff' }],
    props: [
      { model: 'street/building_2', pos: [22.2, 0, -6.0], h: 5.2, fb: { w: 3.8, color: '#a7c7e7' } },                    // 教学楼
      { model: 'street/building_1', pos: [18.0, 0, -7.4], h: 4.6, fb: { w: 3.2, color: '#f2c7a5' } },
      { model: 'street/tree_1', pos: [13.6, 0, -5.0], h: 3.4, fb: { tree: true } },
      { model: 'street/tree_2', pos: [25.2, 0, -4.6], h: 3.0, fb: { tree: true } },
      { pos: [16.0, 0, -4.1], h: 1.2, fb: { parts: PARTS.goal } },                                                       // 球门
      { pos: [17.1, 0.05, -1.6], h: 0.35, fb: { parts: PARTS.ball } },                                                   // 足球
      { pos: [19.2, 0, -1.7], h: 0.8, fb: { parts: PARTS.picnic } },                                                     // 野餐桌
      { model: 'shop/camera', pos: [19.2, 0, 2.5], h: 1.1, fb: { parts: PARTS.camera } }                                 // 前面的三脚架相机
    ],
    people: [
      // 球场边：三个穿球衣的孩子（热点 field）
      { model: 'people/boy_a', pos: [15.2, 0.065, -2.3], h: 1.5, hs: 'field', look: { shirt: '#ef4444', hair: '#3b2a20' } },
      { model: 'people/boy_b', pos: [16.0, 0.065, -2.6], h: 1.5, hs: 'field', look: { shirt: '#ef4444', hair: '#111827' } },
      { model: 'people/girl_b', pos: [16.8, 0.065, -2.3], h: 1.5, hs: 'field', look: { girl: true, shirt: '#ef4444', hair: '#fbbf24' } },
      // 野餐桌后面：一家人（热点 picnic）
      { model: 'people/man', pos: [18.4, 0, -2.7], h: 1.75, hs: 'picnic', look: { shirt: '#22c55e', hair: '#1f2937' } },
      { model: 'people/girl_a', pos: [19.2, 0, -2.7], h: 1.3, hs: 'picnic', look: { girl: true, shirt: '#ec4899', hair: '#7c2d12' } },
      { model: 'people/woman', pos: [20.0, 0, -2.7], h: 1.65, hs: 'picnic', look: { girl: true, shirt: '#a855f7', hair: '#451a03' } },
      // 教学楼前：三个同学（热点 school）
      { model: 'people/girl_a', pos: [21.5, 0.03, -2.4], h: 1.5, hs: 'school', look: { girl: true, shirt: '#3b82f6', hair: '#7c2d12' } },
      { model: 'people/boy_a', pos: [22.3, 0.03, -2.6], h: 1.5, hs: 'school', look: { shirt: '#3b82f6', hair: '#3b2a20' } },
      { model: 'people/boy_b', pos: [23.1, 0.03, -2.4], h: 1.5, hs: 'school', look: { shirt: '#3b82f6', hair: '#111827' } }
    ],
    hotspots: { field: hot(16.0, 2.3, -2.3), picnic: hot(19.2, 2.3, -2.3), school: hot(22.3, 2.3, -2.3) },
    cameras: { place: PLACE_CAM() },
    actors: {
      me: { ...ME, place: [16.4, 0, 2.4] },
      helper: { model: 'characters/friend', h: 1.7, place: [21.6, 0, 2.3] }
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
/* ---------- verb_treasure：海岛寻宝（roomOnly 户外；热点 palm / rock / boat，另有只用来“打开宝箱”的 chest） ----------
 * 需要下载的模型（可选，放 web/models/beach/，找不到就用上面的兜底几何体）：palm / rock / boat / chest / barrel */
LAYOUTS.verb_treasure = {
  sky: '#cfe9ff',
  blocks: [
    { pos: [19, -0.06, 2], size: [80, 0.12, 30], color: '#f1dfaa' },          // 沙滩（整片地面）
    { pos: [19.1, 0.0, -6.4], size: [60, 0.05, 6.8], color: '#5aaee8' },       // 海水
    { pos: [19.1, 0.03, -2.85], size: [60, 0.05, 0.45], color: '#ffffff' },    // 浪花
    { pos: [19.1, 0.02, 0.5], size: [9, 0.03, 4.4], color: '#e6cf8f' }         // 宝箱前的深色沙地
  ],
  props: [
    { model: 'beach/palm', pos: [15.6, 0, -2.5], h: 3.1, hs: 'palm', fb: { parts: PARTS.palm } },
    { model: 'beach/rock', pos: [19.2, 0, -2.3], h: 1.1, hs: 'rock', fb: { parts: PARTS.rock } },
    { model: 'beach/boat', pos: [22.6, 0, -3.5], h: 0.9, rotY: 0.2, hs: 'boat', fb: { parts: PARTS.boat } },
    { model: 'beach/chest', pos: [19.1, 0, 0.3], h: 0.6, hs: 'chest', fb: { parts: PARTS.chest } },   // 锁着的宝箱：答对后 open:chest
    { model: 'beach/barrel', pos: [24.7, 0, -1.5], h: 0.8, fb: { parts: PARTS.barrel } },
    { model: 'beach/palm', pos: [26.0, 0, -3.0], h: 2.8, fb: { parts: PARTS.palm } }
  ],
  hotspots: { palm: hot(15.6, 3.0, -2.2), rock: hot(19.2, 1.5, -1.9), boat: hot(22.6, 1.6, -3.0), chest: hot(19.1, 1.0, 0.3) },
  cameras: { place: PLACE_CAM() },
  actors: {
    me: { ...ME, place: [15.6, 0, 1.7] },
    helper: { model: 'characters/friend', h: 1.7, place: [22.9, 0, 1.6] }
  }
};
/* ---------- verb_magic：魔法小屋（roomOnly；热点 book / potion / crystal，另有只用来“给大锅施法”的 cauldron） ----------
 * 需要下载的模型（可选，放 web/models/magic/，找不到就用上面的兜底几何体）：cauldron / book / crystal / potion / broom */
LAYOUTS.verb_magic = {
  sky: '#4c3a6b',
  blocks: [...room('#8b6f9e', '#4c3a6b', '#5b4580', '#3b2a55'), rug(19.1, 0.2, 6.4, 3.0, '#7c3aed'),
    { pos: [24.6, 2.8, -3.56], size: [1.7, 1.5, 0.05], color: '#ffffff' },                   // 夜空窗户：窗框 + 夜色 + 两颗星
    { pos: [24.6, 2.8, -3.52], size: [1.5, 1.3, 0.05], color: '#1e1b4b' },
    { pos: [24.2, 3.1, -3.48], size: [0.12, 0.12, 0.03], color: '#fde68a' },
    { pos: [25.0, 2.6, -3.48], size: [0.1, 0.1, 0.03], color: '#fde68a' }],
  props: [
    { model: 'room/table', pos: [15.7, 0, -2.5], h: 0.8, fb: { parts: PARTS.table } },
    { model: 'magic/book', pos: [15.7, 0.8, -2.5], h: 0.25, hs: 'book', fb: { parts: PARTS.spellbook } },
    { model: 'room/table', pos: [19.1, 0, -2.6], h: 0.8, fb: { parts: PARTS.table } },
    ...spread([
      { model: 'magic/potion', pos: [18.7, 0.8, -2.6], h: 0.4, fb: { parts: PARTS.potion('#f472b6') } },
      { model: 'magic/potion', pos: [19.1, 0.8, -2.6], h: 0.4, fb: { parts: PARTS.potion('#60a5fa') } },
      { model: 'magic/potion', pos: [19.5, 0.8, -2.6], h: 0.4, fb: { parts: PARTS.potion('#4ade80') } }], 'potion'),
    { model: 'room/table', pos: [22.5, 0, -2.5], h: 0.8, fb: { parts: PARTS.table } },
    { model: 'magic/crystal', pos: [22.5, 0.8, -2.5], h: 0.6, hs: 'crystal', fb: { parts: PARTS.crystal } },
    { model: 'magic/cauldron', pos: [19.1, 0, 0.6], h: 1.1, hs: 'cauldron', fb: { parts: PARTS.cauldron } },   // 中间的大锅：答对后 open:cauldron
    { model: 'magic/broom', pos: [25.6, 0, -2.6], h: 1.6, rotY: 0.3, fb: { parts: PARTS.broom } }
  ],
  hotspots: { book: hot(15.7, 1.6, -2.2), potion: hot(19.1, 1.6, -2.3), crystal: hot(22.5, 1.9, -2.2), cauldron: hot(19.1, 1.7, 0.6) },
  cameras: { place: PLACE_CAM() },
  actors: {
    me: { ...ME, place: [15.1, 0, 1.7] },
    helper: { model: 'characters/friend', h: 1.7, place: [22.9, 0, 1.6] }
  }
};
LAYOUTS.verb_note = LAYOUTS.verb_school;                // verb_note 用教室布局（热点同为 board / shelf / bag），藏字条的地方
LAYOUTS.verb_restaurant = LAYOUTS.restaurant;        // 两个餐厅模板的热点一样（menu / counter / kitchen），布局共用
/* 兜底零件也给 js/roam/arena.js 的道具用 */
export { PARTS };