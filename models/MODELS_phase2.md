# 3D 场景模型清单

第一期：shop「去商店买东西」；第二期：其余 8 个已发布模板（restaurant / verb_restaurant / find / find_room / describe / verb_park / verb_school / verb_home）。

**没有这些文件也能运行**：缺哪个就自动用简易几何体（盒子 / 圆柱人 / 拼出来的家具）代替，所以可以一个一个替换，随时刷新看效果。
全部放在前端根目录的 `models/` 下（和 `css/`、`js/` 同级），文件名必须**完全一致**（小写、下划线、.glb）。

下载页：Kenney（kenney.nl/assets，CC0 可商用，无需署名）。下载后选 **GLB** 格式文件（zip 里的 `Models/GLB format/` 目录）。
下面的“对应模型”只是推荐方向，包里的实际文件名以你下载到的为准，**挑外形最接近的、同一画风的**，重命名成右边的名字即可。

## 第一期（shop，已有，不用再下载）

| # | 放到的路径 | 用途 | 推荐来源与对应模型 |
|---|---|---|---|
| 1 | `models/characters/me.glb` | 「你」 | Blocky Characters 里任选一个角色 |
| 2 | `models/characters/friend.glb` | 朋友 | 同一包里另一个**不同**的角色 |
| 3 | `models/characters/helper.glb` | 售货员 / 服务员 / 教练 | 同一包里再选一个**不同**的角色 |
| 4 | `models/street/building_1.glb` | 街道建筑 A（街道会出现 2 次；describe 里还会缩小当“小房子”） | City Kit (Suburban) 或 (Commercial) 里一栋建筑 |
| 5 | `models/street/building_2.glb` | 街道建筑 B（居中、略高） | 同一个包里另一栋不同的建筑 |
| 6 | `models/street/tree_1.glb` | 街道树（大；公园里也用） | City Kit (Suburban) 的 tree-large 一类 |
| 7 | `models/street/tree_2.glb` | 街道树（小；公园里也用） | 同包的 tree-small 一类 |
| 8 | `models/shop/shelf.glb` | 货架 / 书架（shop、find_room、verb_school 共用） | Furniture Kit 的 bookcaseOpen 一类（开放式书架） |
| 9 | `models/shop/counter.glb` | 柜台（shop、restaurant、verb_restaurant、verb_home 共用） | Furniture Kit 的 kitchenBar / kitchenCabinet 一类 |
| 10 | `models/shop/crate.glb` | 货架前的箱子 | Furniture Kit 的 cardboardBox 一类 |
| 11 | `models/shop/plant.glb` | 盆栽（shop 装饰；find 里是热点“绿植”） | Furniture Kit 的 pottedPlant 一类 |

## 第二期（新增 12 个，全部来自 Kenney Furniture Kit 一类；标“可选”的包里可能没有，留空会自动用简易形状）

新增目录：`models/room/`（室内家具）、`models/park/`（公园）。这两个文件夹要自己新建。

| # | 放到的路径 | 用在哪些场景（热点） | 推荐来源与对应模型（找外形最接近的） | 必要性 |
|---|---|---|---|---|
| 12 | `models/room/sofa.glb` | find（sofá 沙发）、verb_home（sala 客厅） | Furniture Kit 里的 sofa / loungeSofa 一类，长沙发 | 推荐 |
| 13 | `models/room/cabinet.glb` | find（armário 柜子） | Furniture Kit 里带门的柜子：bookcaseClosedDoors / cabinet 一类（要高、有柜门） | 推荐 |
| 14 | `models/room/desk.glb` | find_room（mesa 桌子）、verb_school（课桌，书包放在上面） | Furniture Kit 的 desk 一类（普通书桌） | 推荐 |
| 15 | `models/room/chair.glb` | find_room、verb_school、restaurant / verb_restaurant 的装饰椅 | Furniture Kit 的 chair 一类（普通椅子） | 推荐 |
| 16 | `models/room/table.glb` | restaurant / verb_restaurant 的餐桌装饰；verb_home 客厅茶几（缩成 0.45 米高） | Furniture Kit 的 table / tableRound / tableCoffee 一类 | 推荐 |
| 17 | `models/room/bed.glb` | verb_home（quarto 卧室） | Furniture Kit 的 bed 一类（单人或双人都行，床头靠后墙） | 推荐 |
| 18 | `models/room/stove.glb` | restaurant / verb_restaurant（cozinha 厨房窗口）、verb_home（cozinha 厨房） | Furniture Kit 的 kitchenStove 一类（灶台） | 推荐 |
| 19 | `models/room/books.glb` | describe（livros 几本书） | Furniture Kit 的 books 一类（一小摞书） | 可选 |
| 20 | `models/room/bag.glb` | find_room（mochila 背包）、verb_school（mochila 书包） | 背包 / 书包类；Kenney 没有合适的可以去 poly.pizza 搜 backpack，**筛选 CC0**（CC-BY 要署名，别用） | 可选 |
| 21 | `models/room/cup.glb` | describe（copo 杯子） | 杯子 / 马克杯类；Kenney Food Kit 里有就用，没有可去 poly.pizza 搜 mug / cup，筛选 CC0 | 可选 |
| 22 | `models/park/bench.glb` | verb_park（banco 长椅） | Furniture Kit 的 bench 一类，或任意公园长椅 | 推荐 |
| 23 | `models/park/duck.glb` | verb_park（lago 湖边的鸭子，会出现 2 次） | 鸭子类；Kenney 的动物包（Cube Pets / Animal Pack 一类）里找，没有就留空，用黄色小鸭兜底 | 可选 |

**不用下载的东西**（代码里直接拼出来）：黑板、菜单板、厨房出餐口、各种地毯、窗户、展台、草坪、湖水、小路、公园里的球和花。

我没法联网核实各个包里的确切文件名，上面的名字只是关键词，挑的时候看预览图为准。

## 每个场景用到哪些模型

| 场景 | 流程 | 用到的文件 |
|---|---|---|
| shop | 街道 → 商店 | 第一期全部 |
| restaurant / verb_restaurant（共用布局） | 街道 → 餐厅 | characters ×3、street ×5、`shop/counter`、`room/stove`、`room/table`、`room/chair` |
| find | 街道 → 客厅 | characters ×3、street ×5、`room/sofa`、`room/cabinet`、`shop/plant` |
| describe | 街道 → 展示室（四个展台） | characters ×3、street ×5、`room/cup`、`room/books`、`street/building_1`（缩小当房子） |
| verb_park | 街道 → 公园 | characters ×3、street ×5、`park/bench`、`park/duck` |
| find_room | 直接在房间里（没有街道） | `characters/me`、`characters/friend`、`room/desk`、`room/chair`、`shop/shelf`、`room/bag` |
| verb_school | 直接在教室里（没有街道） | `characters/me`、`characters/friend`、`shop/shelf`、`room/desk`、`room/chair`、`room/bag` |
| verb_home | 直接在家里（没有街道） | `characters/me`、`characters/friend`、`room/stove`、`shop/counter`、`room/bed`、`room/sofa`、`room/table` |

房间类场景（find_room / verb_school / verb_home）里“朋友”和“帮手”是同一个人，用的是 `characters/friend.glb`。

要点：
- 人物包最好带动画（idle / walk / wave / jump 等），有就自动播放，没有也会用代码做蹦跳，不影响使用。
- 不用管模型大小和朝向：代码会按布局里的目标高度自动缩放，并把底部放到地面。人物和家具默认应当“正面朝向镜头（+Z）”，Kenney 的都是这样。
- 如果某个模型放进去后朝向反了，在 `js/stage3d-layouts.js` 里给对应行加 `rotY: 3.14` 即可。
- 如果模型显示成一片白，用 `models/glb-doctor.js` 检查贴图（和第一期一样）。

## 怎么看效果 / 调位置
- 3D 默认开启，现在 9 个模板都有 3D 布局。`?stage=2d` 关闭并记住（之后都是 2D），`?stage=3d` 恢复默认。
- 逐个看：`scene-lab.html?template=restaurant`（可换成 find / find_room / describe / verb_park / verb_school / verb_home / verb_restaurant），预习和测验各走一遍。
- 加 `&debug=1`：画面上显示相机坐标和**缺少哪些模型**，可以用手指/鼠标拖动旋转视角、滚轮缩放，把满意的相机坐标抄进 `js/stage3d-layouts.js` 的 `cameras`。
- 物件位置、大小、朝向都在 `js/stage3d-layouts.js` 里，一行一个物件；热点按钮悬浮的位置在每个布局的 `hotspots`。
- 手机竖屏只看得到 place 镜头中心左右各约 3.5 米，热点和人物尽量排在这个范围里；热点之间至少留 2.3 米，不然按钮会挤在一起。