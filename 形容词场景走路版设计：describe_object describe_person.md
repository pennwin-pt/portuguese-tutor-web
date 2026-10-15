# 形容词场景走路版设计：describe\_object / describe\_person

设计稿 · 只出设计，暂不实现 · 2026-10-15

## 1. 结论先说

- **可以做，而且两个场景做成同一种玩法**：名词的“展台”摆在场地中央，形容词的词牌挂在四周，跑去抓对的词牌，贴到名词上。
- **判分一行不改**：选项怎么构造、`noun_contexts`、管理端的 `scene_noun`、按 id 取余选语境、`evaluateChoice(w, x.ok ? w.id : x.id)`，全部沿用。
- **真正要新增的只有三样**：① 场地按名词语境换摆件（“变体”）；② HUD 多显示一个名词标签；③ 校验器放宽到形容词。
- **代价**：去掉原来“先在 4 个名词里找出朋友说的那个”这一步。理由见第 3 节。
- **做完后**：16 个场景里只剩 `verb_persuade`（手动）不是走路版。

## 2. 现在的形容词场景怎么运作

| 项目 | 现状 |
| --- | --- |
| 词 | 形容词，带 4 个词形：阳性单数 / 阴性单数 / 阳性复数 / 阴性复数 |
| 名词语境 | 模板里 4 个 `noun_contexts`，每个带名词、冠词、性、数 |
| 一个词用哪个语境 | 管理端配了 `scene_noun` 就用它；没配就 `word.id % 4` |
| 题干 | 朋友说“Quero uma casa \_\_\_\_\_\_”（我要一座……的房子），中文提示“帮朋友找一个{target\_zh}的{noun\_zh}” |
| 第一步（不计分） | 在 4 个名词展台里点出朋友说的那个，目标固定为本词的语境，不随机 |
| 第二步（计分） | 选形容词：1 个正确 + 3 个干扰，**全部是同一性数的不同形容词**（比如都是阴性复数），来自本批词或通用形容词池，没有 emoji |
| 判分 | 一次点选一次请求，干扰项传它自己的词 id（通用池是 -1） |

两个场景的 4 个语境：

| 序号 | describe\_object | describe\_person | 冠词 / 性 / 数 |
| --- | --- | --- | --- |
| 0 | copo 杯子 | rapaz 男孩 | um · 阳 · 单 |
| 1 | casa 房子 | rapariga 女孩 | uma · 阴 · 单 |
| 2 | livros 书 | rapazes 男孩们 | uns · 阳 · 复 |
| 3 | casas 几座房子 | raparigas 女孩们 | umas · 阴 · 复 |

## 3. 为什么不能照搬其他走路场景的做法

1. **选项没有“位置含义”。** 其他走路场景把选项挂在不同的地方（`shop` 的货架区、`find` 的垃圾桶），位置本身就是线索或剧情。形容词选项只是几个词，没有空间语义。
2. **四个选项是同一性数。** 不能把它们挂到四个不同的名词上，那会让“阴性词牌”挂在“阳性名词”旁边，等于教错。
3. **名词语境是题目的一部分。** 每个词只有一种语境，必须把它在场景里摆出来，而不是摆四种让玩家挑。
4. **原来的“找名词”一步，在走路版里是多余的路。** 它本质是“读到 uma casa，再点对应的图”。走路版里名词一直摆在展台上，玩家不用再绕一圈去找，也不容易走偏。

唯一的损失是少了一次“冠词 + 名词 → 对应图”的识别练习。这一步不计分，我建议 v1 先不做；如果想保留，第 9 节有一个后续方案。

## 4. 玩法：把词牌贴到名词上

一个词的一局：

| 阶段 | 玩家看到 / 做 | 系统 |
| --- | --- | --- |
| 1 入场 | 展台上摆着本词语境对应的名词（比如一座房子）；朋友站在旁边说“Quero uma casa \_\_\_\_\_\_” | 沿用 `intro` / `request`，`{art} {noun}` 照常填 |
| 2 看线索 | 左上角线索卡：名词图标 + “一座房子” + “找“{target\_zh}”的词牌” | 名词图标取自 `noun_contexts`（新增 `icon` 字段） |
| 3 找词牌 | 场地四个角各挂一张词牌，写着形容词（都是同一性数的形式） | 靠近站定自动抓，或按「抓」；沿用 `roam_choice` |
| 4 抓取 | 抓错：词牌冒烟，朋友 “Não é isso…”；抓对：词牌飞到头顶 | 一次抓取一次判分，和现在完全一致 |
| 5 贴上去 | 带着词牌走进展台前的交付环，词牌“啪”地贴到名词上方，名词弹一下 | 沿用 `roam_deliver`；交付成功读形容词、朋友欢呼 |

要点：

- **预习**：词牌上只有形容词（没有 emoji，和现在一致），靠近时读音；25 秒没抓则正确词牌发光。
- **测验**：靠近不读音；抓错 2 次后出箭头；60 秒出快速通道。
- **名词摆件不会出错**：由 `nounCtx.index` 决定，管理端配的 `scene_noun` 仍然生效。
- **可选的“一致性小标记”**：展台名牌和每张词牌角上各画一个小徽章（♂/♀ + 单数一个点、复数两个点），让玩家直观看到“这些词牌都是阴性复数”。默认只在预习显示，测验不显示。

## 5. 两个场景各自的场地

两个场景共用同一套机制，只是场地和摆件不同。

### describe\_object：展台广场（场地名 `adj_plaza`）

- 地面：一块石板广场，约 24×14 米，边缘不围墙，掉下去回出生点。
- 中央：圆形展台，直径约 2.4 米，展台上按语境摆放名词：
  - 0：一只杯子
  - 1：一座房子
  - 2：一摞书
  - 3：三座小房子
- 展台前一圈交付环，朋友站在旁边。
- 四角各一个词牌架（复用现有的 `roam/pedestal` 模型），词牌悬在上方 1.5 米。
- 出生点在广场一侧，到每个词牌架约 7–9 米，来回走一趟约 5 秒，在预算内。

### describe\_person：舞台操场（场地名 `adj_stage`）

- 地面：草地操场，中央一个矮舞台（台高 0.3 米，不用跳也能走上去，台阶用 0.25 米以内的自动上台阶）。
- 舞台上按语境站人：
  - 0：一个男孩
  - 1：一个女孩
  - 2：三个男孩
  - 3：三个女孩
- 人物沿用现有的 `people/boy_a`、`boy_b`、`girl_a`、`girl_b`，缺模型时用 `look` 画简易小人，和 `group_photo` 的做法一样。
- 词牌架和交付环的布局与展台广场相同。
- 交付时词牌“挂”在人物头顶；复数时挂在中间那个人上方，三个人一起弹一下。

这样两个场景的差别只在**场地数据和模型**，节点结构、判分、HUD 完全相同。

## 6. 数据与代码改动（设计层面）

### 6.1 模板 JSON 草案（以 describe\_object 为例，describe\_person 只换文字和场地名）

```json
{
  "id": "describe_object",
  "title": "描述物体：跑去贴词牌",
  "status": "published",
  "applies_to": { "pos": ["adjective"] },
  "adjectiveOnly": true,
  "roam": true,
  "arena": "adj_plaza",
  "carrier": "🖌️",
  "helperName": "朋友",
  "context_pick": "by_word_id",
  "noun_contexts": [
    { "noun": "copo", "noun_zh": "杯子", "article": "um", "gender": "m", "number": "singular", "icon": "🥛" },
    { "noun": "casa", "noun_zh": "房子", "article": "uma", "gender": "f", "number": "singular", "icon": "🏠" },
    { "noun": "livros", "noun_zh": "书", "article": "uns", "gender": "m", "number": "plural", "icon": "📚" },
    { "noun": "casas", "noun_zh": "房子", "article": "umas", "gender": "f", "number": "plural", "icon": "🏘️" }
  ],
  "start": "intro",
  "nodes": {
    "intro": "沿用现有",
    "request": "沿用现有：Quero {art} {noun} {blank}, por favor.",
    "roam": {
      "type": "roam_choice",
      "prompt_zh": "找到“{target_zh}”的词牌，带去贴在{noun_zh}上。",
      "variant_by": "noun_context",
      "display": { "preview": "pt", "assessment": "pt" },
      "options": { "correct": 1, "distractors": 3, "source": ["batch", "fallback_pool"] },
      "grab_range": 1.4,
      "wrong_feedback": { "pt": "Não é isso…", "zh": "这个特征不对，再试一次。" },
      "hints": { "preview_glow_s": 25, "arrow_after_wrong": 2, "fast_track_s": 60 },
      "on_correct": "deliver"
    },
    "deliver": { "type": "roam_deliver", "prompt_zh": "把词牌贴到{noun_zh}上！", "pt": "Cola aqui!", "zh": "贴在这儿！", "speech": "auto", "next": "thanks" },
    "thanks": "沿用现有",
    "done": "沿用现有"
  }
}
```

另外和其他走路场景一样：`actors` 只留 friend，`hotspots` 为空，`cast` 只留 friend，`locations` 写一个占位。

### 6.2 服务端校验器（`scene_registry.py`）

- roam 模板的 `applies_to.pos` 在现有的 `["noun"]` / `["verb"]` 之外再允许 `["adjective"]`。
- 词性是形容词时必须同时满足：`adjectiveOnly: true`、正好 4 个 `noun_contexts`、`roam_choice` 带 `variant_by: "noun_context"`；其他词性不允许出现 `variant_by`。
- `noun_contexts[*].icon` 作为可选字符串，长度 ≤ 4。
- 现有的限制不动：只有 describe\_object / describe\_person 才能用 `{art}` `{noun}` 占位符和 `noun_context`。

### 6.3 前端（`scene.js` 与 `js/roam/`）

- `doRoamChoice` 往 `stage.run` 多传两样：`variant`（= 本词的 `nounCtx.index`）和 `clue.noun`（`{ icon, zh }`）。形容词没有单词 emoji，线索卡左侧显示名词图标，右侧显示“找“{target\_zh}”的{noun\_zh}”。
- 场地数据加 `variants`：长度 4 的数组，每项是一组摆件或人物。`arena.setVariant(i)` 只显示第 i 组，其余隐藏；顺序必须和模板的 `noun_contexts` 一致。
- 每个变体可以单独指定交付成功时弹一下的对象（复数时三个一起弹）。
- 词牌标签沿用现有标签，不带 emoji；形容词词形较长（如 inteligentes），标签宽度要自适应，字号仍 ≥ 28px。
- 可选的“一致性小标记”：`roam_choice.show_form_badge`，默认只在预习显示。

### 6.4 完全不用改的

- `buildOptions` 的形容词分支、`GENERIC_ADJ` 通用池、`evaluateChoice`、积分。
- `noun_contexts` 的选择规则、管理端的 `scene_noun`、服务端对 `variant` 的 line-audio 处理。
- 自动抓取、提示梯度、快速通道、重生、HUD 其余部分。

## 7. 资源清单

全部可以不新增，现有模型都能用；只有展台是可选的新模型。

| 文件（相对 `models/`） | 状态 | 用途 |
| --- | --- | --- |
| `room/cup` | 已有 | 杯子（变体 0） |
| `street/building_1` | 已有 | 房子，缩小后单个、三个（变体 1、3） |
| `room/books` | 已有 | 书（变体 2） |
| `people/boy_a` `boy_b` `girl_a` `girl_b` | 已有 | 男孩 / 女孩（describe\_person） |
| `roam/pedestal` | 已有 | 四个词牌架 |
| `roam/player` `roam/delivery_ring` `characters/friend` | 已有 | 沿用 |
| `roam/podium.glb` | **可选新增** | 圆形展台，直径约 2.4 米、高约 0.5 米，顶面平整；没有时用圆柱兜底 |

兜底：杯子、书、房子、人物都有原来的兜底零件，缺文件时画面仍可用。

## 8. 风险与取舍

- **形容词没有可视化。** 没有 emoji，也没有对应物体，学习仍然靠中文提示，这点和现在完全一样，走路版不会更好也不会更差。
- **一致性仍是被动学习。** 四个词牌都是同一性数，玩家看到的是“这个形容词在阴性复数下长这样”。想让它变成主动练习要另做，见第 9 节。
- **少了“找名词”这一练习。** 不计分，影响小，但确实是内容上的减少。
- **摆件要摆对。** 四种语境里“几本书”“几座房子”是复数，要真的摆成多个，否则和台词里的 uns / umas 对不上。
- **自动选择模板的现状要留意。** 现有逻辑里，没明确指定模板的形容词总是取第一个可用模板（即 describe\_object），describe\_person 只有在词里明确选了它才出现。**不要给两个都加 `manualOnly`**，否则没指定模板的形容词会报“没有适用于形容词的已发布场景模板”。
- **时长。** 和其他走路版一样，一个词约 40–75 秒。转完后形容词没有点选版可选，如果觉得慢，只能靠管理端把部分词改成别的方式，或者另外保留一个点选版。

## 9. 后续可选方案（v1 不做）

**A. 保留“先找名词”。** 新增节点 `roam_noun`：广场里同时摆 4 个名词展台，玩家要根据台词里的“uma casa”走到对应展台，才会放出词牌。不计分，走错只提示。成本：一个新节点加一个场地数据。

**B. 一致性挑战（第三个模板）。** 选项改成同一个形容词的 4 个词形（阳单 / 阴单 / 阳复 / 阴复），玩家要抓和展台名词一致的那张。这练的是性数一致，不是词义，所以服务端判分要多带一个 `form` 参数，并作为 `manualOnly` 的独立模板。词形数据现成（`adjective_m_singular` 等四个字段）。

**C. 贴上后的动画演示。** 词牌贴上去后让名词做一个程序动画（比如“大”就放大）。只对少数形容词有意义，不推荐。

## 10. 里程碑与验收

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M1 引擎 | 场地 `variants`、HUD 名词标签、校验器放宽到形容词 | 校验器 0 错误；旧的 13 个走路模板不受影响 |
| M2 describe\_object | `adj_plaza` 场地和 4 个变体、模板改写 | 4 种语境各跑一遍；管理端配 `scene_noun` 后展台跟着变；一次抓取一次请求 |
| M3 describe\_person | `adj_stage` 场地和 4 个变体 | 复数时三个人同时弹；缺人物模型时简易小人可用 |
| M4 可选 | 一致性小标记 | 只在预习出现，测验不出现 |

**回归检查**：长词形的标签不溢出；预习靠近读音，测验不读；掉下场地后词牌回原位且不重复判分；横竖屏、切后台与其他走路场景一致。

## 11. 待你决定

1. **玩法**：采用“贴词牌”（推荐，改动最小），还是先做第 9 节的 A（保留找名词）？
2. **一致性小标记**：要不要加？默认只在预习显示。
3. **模板选择**：两个形容词场景是否都留在自动选择里？（注意不能两个都 `manualOnly`。）
4. **人物**：`describe_person` 用真人模型（`people/*`）还是只用简易小人？
5. **要不要同时规划第 9 节的 B（一致性挑战）**，作为第三个模板？
