# 3D 模型清单：describe_person（描述人物）

新增的形容词场景模板 **describe_person**（“描述人物”），用来练「形容人」的形容词（alto / simpático / feliz / cansado …）。
流程和 describe 一样：朋友说“Procuro um rapaz ______.” → 点身边的朋友问线索 → 在四组人里点出朋友要找的那组 → 选出能描述这个人的形容词词形。

**没有下面这些文件也能运行**：缺哪个就自动用代码拼的兜底小人（男孩穿彩色上衣；女孩带裙子和长发）代替，所以可以一个一个替换，随时刷新看效果。

## 要准备的模型（共 4 个，全部是新增）

先在前端根目录的 `models/` 下**新建文件夹 `people/`**（和 `characters/`、`room/` 同级），文件名必须完全一致（小写、下划线、.glb）：

| # | 放到的路径 | 用在哪（热点） | 说明 |
|---|---|---|---|
| 1 | `models/people/boy_a.glb` | `rapaz`（一个男孩）；`rapazes`（两个男孩里的第一个） | 一个男孩 |
| 2 | `models/people/boy_b.glb` | `rapazes`（两个男孩里的第二个） | 另一个男孩，**外观要和 boy_a 明显不同**（发型/衣服颜色） |
| 3 | `models/people/girl_a.glb` | `rapariga`（一个女孩）；`raparigas`（两个女孩里的第一个） | 一个女孩 |
| 4 | `models/people/girl_b.glb` | `raparigas`（两个女孩里的第二个） | 另一个女孩，**外观要和 girl_a 明显不同** |

场景里同时会出现 6 个人：1 个男孩、1 个女孩、2 个男孩、2 个女孩，所以 boy_a / girl_a 各会出现 2 次。

## 其余用到的模型（都是已有的，不用再准备）

| 文件 | 用途 |
|---|---|
| `models/characters/me.glb`、`friend.glb`、`helper.glb` | 「你」、朋友、身边的朋友（和别的场景共用） |
| `models/street/building_1.glb`、`building_2.glb`、`tree_1.glb`、`tree_2.glb` | 街道 + 远处的教学楼、两侧的树（和别的场景共用） |

## 模型要求

- 格式 **GLB**，人物**正面朝向 +Z**（朝向镜头），Kenney 的人物包都是这样；放进去发现背对镜头，就在 `js/stage3d-layouts.js` 的 `describe_person.people` 里给那一行加 `rotY: 3.14`。
- 不用管大小：代码会把人物统一缩放到约 1.5 米高、脚底放到站台上。
- 最好带 **idle（待机）动画**（动画名包含 `idle` 或 `stand`），有就自动循环播放，几个人的起始时间是随机的，不会同步晃动；没有 idle 动画就是静止姿势，不影响使用。
- 4 个模型最好来自同一个画风的人物包；男孩/女孩要看得出来（热点就靠这个让孩子区分“男孩还是女孩、一个还是几个”）。
- 来源可以继续用 Kenney（kenney.nl/assets，CC0）的 Blocky Characters 一类人物包，从里面挑 2 个男孩 + 2 个女孩，重命名成上面的名字（包里的实际文件名和人物性别以预览图为准）。项目里已有的 `characters*/` 目录如果是同一套人物，也可以直接复制改名。
- 如果某个模型放进去显示成一片白，用 `models/glb-doctor.js` 检查贴图（和之前一样）。

## 怎么看效果 / 调位置

- 预览页：`scene-lab.html?template=describe_person`（词性选「形容词」，四个词形填满；预习和测验各走一遍）。加 `&debug=1` 会显示缺少哪些模型，可以拖动视角、把满意的相机坐标抄进 `js/stage3d-layouts.js`。
- 人物位置、站台、背景物件都在 `js/stage3d-layouts.js` 的 `describe_person` 里（`people` 是 6 个人，`props` 是背景，`hotspots` 是热点按钮悬浮的位置）。

## 怎么给词指定这个模板（管理端「场景演练字段审核」）

1. 词性选 **adjective**，四个词形（阳单 / 阴单 / 阳复 / 阴复）填全，勾选“适合用于场景演练”。
2. **场景模板** 选“描述人物”。
3. **形容对象** 现在会跟着模板变：选“描述人物”时可选 rapaz / rapariga / rapazes / raparigas（想让这个词固定形容哪一类人就选；不选就按单词 ID 自动轮换）。形容“女性/复数”专用的词可以固定到对应的人。
4. 确认字段。重启一次后端（模板和注册表只在启动时加载）。

注意：模板选“自动轮换”的形容词仍然用原来的 describe（描述物件），只有明确选了“描述人物”的词才会进这个场景。