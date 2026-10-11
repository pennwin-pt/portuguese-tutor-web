# 3D 模型清单：verb_persuade（说服朋友）

新增的动词场景模板 **verb_persuade**（“说服朋友”），给 convencer 这类“说服/劝说别人”的动词用。
流程和其他动词场景一样：朋友说 “Quero convencer o Rui. Ele não vem ao parque!” → 点朋友问线索（“想想小Rui喜欢什么”）→ 在三样东西（足球 / 冰淇淋 / 小鸭子）里点出小Rui会被什么吸引 → 选出表示“说服”的动作 → 小Rui愿意跟着走了。

**没有下面这些文件也能运行**：缺哪个就用代码拼的兜底几何体代替（足球 = 红球，冰淇淋 = 甜筒，小Rui = 蓝衣小人），可以一个个替换。

## 要准备的模型（共 3 个，都是可选的）

| # | 放到的路径 | 用在哪 | 说明 |
|---|---|---|---|
| 1 | `models/people/boy_a.glb` | 小Rui（被说服的男孩） | **和 describe_person 共用同一个文件**；做“描述人物”时已经准备了就不用再做 |
| 2 | `models/park/ball.glb` | 热点 ball（足球） | 一个足球，放在 park 文件夹（和 bench、duck 同一个文件夹） |
| 3 | `models/shop/icecream.glb` | 热点 icecream（冰淇淋） | 一个甜筒冰淇淋，放在 shop 文件夹；Kenney 的 Food Kit 里有冰淇淋一类，也可以在 poly.pizza 搜 ice cream cone，筛选 CC0 |

足球可以在 Kenney 的体育类素材或 poly.pizza 搜 soccer ball（筛选 CC0）。

## 其余用到的模型（都是已有的，不用再准备）

| 文件 | 用途 |
|---|---|
| `models/room/sofa.glb`、`room/table.glb` | 客厅沙发和茶几（和 verb_home 共用） |
| `models/park/duck.glb` | 热点 duck（小鸭子玩具，和 verb_park 共用） |
| `models/characters/me.glb`、`friend.glb` | 你自己、身边说话的朋友（和别的场景共用） |

## 模型要求

- 格式 **GLB**，物体不用管大小（足球约 0.4 米、冰淇淋约 0.35 米，代码会自动缩放）。
- 小Rui的要求同 describe_person：正面朝向 +Z，最好带 idle 动画；背对镜头就在 `js/stage3d-layouts.js` 的 `verb_persuade.people` 里改 `rotY`。
- 放进去显示成一片白，用 `models/glb-doctor.js` 检查贴图。

## 怎么给词指定这个模板（管理端“场景字段”）

1. 词性选 **verb**，填一个动作 emoji（convencer 可以用 🗣️ 或 🤝），勾选“适合用于场景演练”。
2. **场景模板** 选“说服朋友”（verb_persuade）。**这个模板不会参加动词的自动轮换**，所以必须手动选，否则不会进来。
3. 确认字段，然后重启后端（模板只在启动时加载）。

## 适合哪些动词

句型是 “Quero ______ o Rui.”，适合后面直接接人的“说服/劝说/请求”类及物动词：convencer、persuadir、aconselhar、incentivar、convidar、obrigar、ajudar 等。不及物的动词（correr、dormir 这类）不要选这个模板，句子会不通。

## 怎么看效果 / 调位置

- 预览页：`scene-lab.html?template=verb_persuade`（词性选动词，预习和测验各走一遍）；加 `&debug=1` 可以拖动视角，把满意的相机坐标抄进 `js/stage3d-layouts.js`。
- 位置在 `js/stage3d-layouts.js` 的 `verb_persuade` 里：`props` 是沙发、茶几和三样东西，`people` 是小Rui，`hotspots` 是热点按钮悬浮的位置。
