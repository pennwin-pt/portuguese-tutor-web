# 3D 模型清单：group_photo（拍集体照）

新增的名词场景模板 **group_photo**（“拍集体照”），给 **“一群人”类的名词**用：equipa（队伍）、grupo（小组）、família（家庭）、turma（班级）、banda（乐队）、coro（合唱团）、casal（情侣）……
流程和其他名词场景一样：朋友说 “Quero uma foto de ______!”（我想拍一张……的照片！）→ 点朋友问线索（“先看看球场那边的人”）→ 在三群人里点出朋友要拍的那一群 → 选出表示这个意思的词 → “Que bela foto!”。

葡语里 foto de equipa / foto de família 这类说法，“de”后面不带冠词，所以空格里直接填单词本身，不用考虑阴阳性和单复数（equipas 填进去是 “foto de equipas”，也通）。

**没有下面这些文件也能运行**：缺哪个就用代码拼的兜底几何体/小人代替，可以一个个替换。球场、球门、足球、野餐桌本来就是代码拼的，不需要下载。

## 要准备的模型（共 7 个，全部可选）

| # | 放到的路径 | 用在哪 | 说明 |
|---|---|---|---|
| 1 | `models/people/boy_a.glb` | 球场边、教学楼前的男孩 | **和 describe_person 共用**，已经准备了就不用再做 |
| 2 | `models/people/boy_b.glb` | 球场边、教学楼前的另一个男孩 | 同上，共用 |
| 3 | `models/people/girl_a.glb` | 野餐桌边的小女孩、教学楼前的女孩 | 同上，共用 |
| 4 | `models/people/girl_b.glb` | 球场边的女孩 | 同上，共用 |
| 5 | `models/people/man.glb` | 野餐桌边“一家人”里的爸爸 | **新增**，一位成年男性 |
| 6 | `models/people/woman.glb` | 野餐桌边“一家人”里的妈妈 | **新增**，一位成年女性 |
| 7 | `models/shop/camera.glb` | 前面三脚架上的相机 | **新增**，一台相机（带不带三脚架都行），放在 shop 文件夹；poly.pizza 搜 camera，筛选 CC0 |

也就是说：如果你已经做完“描述人物”的 4 个人物，这个场景只需要再新增 3 个文件（man、woman、camera）。大人最好和孩子来自同一个画风的人物包。

## 其余用到的模型（都是已有的，不用再准备）

| 文件 | 用途 |
|---|---|
| `models/street/building_1.glb`、`building_2.glb`、`tree_1.glb`、`tree_2.glb` | 远处的教学楼和树（和别的场景共用） |
| `models/characters/me.glb`、`friend.glb` | 你自己、拿着相机的朋友（和别的场景共用） |

## 模型要求

- 格式 **GLB**，人物**正面朝向 +Z**，最好带 idle（待机）动画（动画名含 `idle` 或 `stand`）；不用管大小，代码会自动缩放（孩子约 1.5 米、爸爸约 1.75 米、妈妈约 1.65 米、相机约 1.1 米）。
- 背对镜头的模型，在 `js/stage3d-layouts.js` 的 `group_photo.people` 里给那一行加 `rotY: 3.14`。
- 放进去显示成一片白，用 `models/glb-doctor.js` 检查贴图。

## 怎么给词指定这个模板（管理端“场景字段”）

1. 词性选 **noun**，性别和单复数照常填；Emoji 可以填 👥 或 🏆（没有合适的也可以空着，会用中文意思）。
2. 勾选“适合用于场景演练”，**场景模板**选“拍集体照”。**这个模板不会参加名词的自动轮换**，所以必须手动选。
3. 确认字段，然后重启后端（模板只在启动时加载）。

## 适合哪些词

“一群人”类的名词。不适合 multidão（人群）、fila（队伍）这类没有固定形状的词，也不适合单个人的名词（amigo、professor 这类请继续用商店 / 找东西）。

## 怎么看效果 / 调位置

- 预览页：`scene-lab.html?template=group_photo`（词性选名词，预习和测验各走一遍）；加 `&debug=1` 可以拖动视角，把满意的相机坐标抄进 `js/stage3d-layouts.js`。
- 位置在 `js/stage3d-layouts.js` 的 `group_photo` 里：`blocks` 是草地、空地和小球场，`props` 是教学楼、球门、足球、野餐桌和相机，`people` 是 9 个人（三群，每群 3 个），`hotspots` 是热点按钮悬浮的位置。
- 注意：前面的“你”和朋友站在画面最前面的两侧，可能会挡住人群的脚，微调时可以把他们再往两边挪一点，或者把人群往后挪。
