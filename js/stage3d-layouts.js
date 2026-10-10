/* 3D 舞台布局：每个场景模板 id 一份。没有布局的模板自动继续用 2D。
 * 单位 ≈ 米；x 向右、y 向上、z 朝向镜头。街道在 x≈0，商店室内在 x≈19。
 * model = models/ 下的相对路径（不带 .glb）；找不到文件时自动用 fb（简易几何体）代替，所以没下载模型也能跑。
 * h / w：目标高度 / 宽度（自动按包围盒缩放，不同模型包的尺寸差异不用管）。
 * hs：这个物件对应的热点 id，被点中 / 答对时会弹一下。 */
export const LAYOUTS = {
  shop: {
    sky: '#cfe9ff',
    // 地面、墙：纯几何体，不需要模型
    blocks: [
      { pos: [14, -0.06, 1], size: [80, 0.12, 24], color: '#cfe7c4' },        // 草地
      { pos: [0, 0.0, 4.6], size: [34, 0.05, 2.6], color: '#9aa4b2' },        // 马路
      { pos: [0, 0.02, 2.7], size: [34, 0.05, 1.4], color: '#e5e7eb' },        // 人行道
      { pos: [19.5, 0.0, 0.2], size: [17, 0.1, 7.6], color: '#e2c08d' },      // 商店地板
      { pos: [19.5, 2.0, -3.7], size: [17, 4, 0.2], color: '#fff1d0' },       // 后墙
      { pos: [11.0, 2.0, 0.2], size: [0.3, 4, 7.6], color: '#f5deb3' }       // 左墙（街道侧外立面）
    ],
    props: [
      // 街道
      { model: 'street/building_1', pos: [-4.4, 0, -5.4], h: 4.6, rotY: 0, fb: { w: 3.2, color: '#f2c7a5' } },
      { model: 'street/building_2', pos: [0.4, 0, -5.6], h: 5.2, rotY: 0, fb: { w: 3.4, color: '#a7c7e7' } },
      { model: 'street/building_1', pos: [5.4, 0, -5.4], h: 4.6, rotY: 0, fb: { w: 3.2, color: '#f6e0a4' } },
      { model: 'street/tree_1', pos: [-3.0, 0, -1.2], h: 2.8, fb: { tree: true } },
      { model: 'street/tree_2', pos: [3.4, 0, -1.4], h: 2.4, fb: { tree: true } },
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
    cameras: {
      street: { pos: [0, 3.3, 11.6], look: [0, 1.3, 0] },
      place: { pos: [19.1, 3.5, 11.2], look: [19.1, 1.2, -1] }
    },
    actors: {
      me: { model: 'characters/me', h: 1.7, street: [-1.5, 0, 0.5], place: [16.4, 0, 1.7] },
      friend: { model: 'characters/friend', h: 1.7, from: [-6.5, 0, 1.1], street: [1.5, 0, 0.3] },
      helper: { model: 'characters/helper', h: 1.7, place: [21.9, 0, -0.9] }
    }
  }
};
