# 3D 场景模型清单（第一期：只做 shop「去商店买东西」）

**没有这些文件也能运行**：缺哪个就自动用简易几何体（盒子 / 圆柱人）代替，所以可以一个一个替换，随时刷新看效果。
全部放在前端根目录的 `models/` 下（和 `css/`、`js/` 同级），文件名必须**完全一致**（小写、下划线、.glb）。

下载页：Kenney（kenney.nl/assets，CC0 可商用，无需署名）。下载后选 **GLB** 格式文件（zip 里的 `Models/GLB format/` 目录）。
下面的“对应模型”只是推荐，包里的实际文件名以你下载到的为准，**挑外形最接近的、同一画风的**，重命名成右边的名字即可。

| # | 放到的路径 | 用途 | 推荐来源与对应模型 |
|---|---|---|---|
| 1 | `models/characters/me.glb` | 「你」 | Blocky Characters 里任选一个角色 |
| 2 | `models/characters/friend.glb` | 朋友 | 同一包里另一个**不同**的角色 |
| 3 | `models/characters/helper.glb` | 售货员 | 同一包里再选一个**不同**的角色 |
| 4 | `models/street/building_1.glb` | 街道建筑 A（会出现 2 次） | City Kit (Suburban) 或 (Commercial) 里一栋建筑 |
| 5 | `models/street/building_2.glb` | 街道建筑 B（居中、略高） | 同一个包里另一栋不同的建筑 |
| 6 | `models/street/tree_1.glb` | 街道树（大） | City Kit (Suburban) 的 tree-large 一类 |
| 7 | `models/street/tree_2.glb` | 街道树（小） | 同包的 tree-small 一类 |
| 8 | `models/shop/shelf.glb` | 货架（会出现 3 次） | Furniture Kit 的 bookcaseOpen 一类（开放式书架） |
| 9 | `models/shop/counter.glb` | 柜台 | Furniture Kit 的 kitchenBar / kitchenCabinet 一类 |
| 10 | `models/shop/crate.glb` | 货架前的箱子（会出现 3 次） | Furniture Kit 的 cardboardBox 一类 |
| 11 | `models/shop/plant.glb` | 盆栽（可选，装饰） | Furniture Kit 的 pottedPlant 一类 |

要点：
- 人物包最好带动画（idle / walk / wave / jump 等），有就自动播放，没有也会用代码做蹦跳，不影响使用。
- 不用管模型大小和朝向：代码会按布局里的目标高度自动缩放，并把底部放到地面。人物默认应当“正面朝向镜头（+Z）”，Kenney 的都是这样。
- 如果某个模型放进去后朝向反了，在 `js/stage3d-layouts.js` 里给对应行加 `rotY: 3.14` 即可。

## 怎么看效果 / 调位置
- 打开 `scene-lab.html?stage=3d`：开启 3D（会记住，之后 words.html 也是 3D）；`?stage=2d` 关回 2D。
- 加 `&debug=1`：画面上显示相机坐标和**缺少哪些模型**，可以用手指/鼠标拖动旋转视角、滚轮缩放，把满意的相机坐标抄进 `js/stage3d-layouts.js` 的 `cameras`。
- 只有 `shop` 模板有 3D 布局，其他模板自动继续用 2D。
