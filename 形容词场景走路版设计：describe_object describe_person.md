# 形容词场景走路版设计：describe\_object / describe\_person

设计稿 v2 · 只出设计，暂不实现 · 2026-10-15
v2 相对 v1 的变化：对照三端代码补齐了 4 处"做不出来"的缺口（读音词形、交付飞行终点、人物弹跳、线索卡图标），补充了 describe\_person 的差异、测试与部署顺序，并把第 11 节的决定落定。

## 1. 结论先说

- **可以做，而且两个场景做成同一种玩法**：名词的"展台"摆在场地中央，形容词的词牌挂在四周，跑去抓对的词牌，贴到名词上。
- **判分一行不改**：选项怎么构造、`noun_contexts`、管理端的 `scene_noun`、按 id 取余选语境、`evaluateChoice(w, x.ok ? w.id : x.id)`，全部沿用。
- **真正要新增的有五样**：① 场地按名词语境换摆件（"变体"）；② HUD 多显示一个名词标签；③ 校验器放宽到形容词；④ 交付动画改为飞向展台名词，人物支持"弹一下"；⑤ 词牌读音要读**牌上显示的词形**（后端 `/words/{id}/audio` 加 `form` 参数，唯一改接口的地方）。
- **代价**：去掉原来"先在 4 个名词里找出朋友说的那个"这一步。理由见第 3 节。
- **做完后**：16 个场景里只剩 `verb_persuade`（手动）不是走路版，走路模板由 13 个变成 15 个。
- **管理端（C#）不需要改**，见第 6.5 节。

## 2. 现在的形容词场景怎么运作

| 项目 | 现状 |
| --- | --- |
| 词 | 形容词，带 4 个词形：阳性单数 / 阴性单数 / 阳性复数 / 阴性复数 |
| 名词语境 | 模板里 4 个 `noun_contexts`，每个带名词、冠词、性、数 |
| 一个词用哪个语境 | 管理端配了 `scene_noun` 就用它；没配就 `word.id % 4`（前端 `adjectiveContext()` 与服务端 `adjective_context_index()` 必须一致） |
| 题干 | describe\_object：Quero uma casa \_\_\_\_\_\_, por favor（中文"帮朋友找一个{target\_zh}的{noun\_zh}"）；describe\_person：Procuro uma rapariga \_\_\_\_\_\_.（中文"帮朋友找"{target\_zh}"的{noun\_zh}"，没有"一个"，也没有 por favor） |
| 第一步（不计分） | 在 4 个名词展台里点出朋友说的那个，目标固定为本词的语境，不随机 |
| 第二步（计分） | 选形容词：1 个正确 + 3 个干扰，**全部是同一性数的不同形容词**（比如都是阴性复数），来自本批词或通用形容词池，没有 emoji |
| 判分 | 一次点选一次请求，干扰项传它自己的词 id（通用池是 -1） |
| 跟读句 | describe\_object 用默认句型 `Quero {art} {noun} {adj}, por favor.`；describe\_person 模板自带 `sentence_pt`：`Procuro {art} {noun} {adj}.`，供 `/api/scene/sentence-audio` 使用 |

两个场景的 4 个语境：

| 序号 | describe\_object | describe\_person | 冠词 / 性 / 数 |
| --- | --- | --- | --- |
| 0 | copo 杯子 | rapaz 男孩 | um · 阳 · 单 |
| 1 | casa 房子 | rapariga 女孩 | uma · 阴 · 单 |
| 2 | livros 书 | rapazes 男孩们 | uns · 阳 · 复 |
| 3 | casas 几座房子 | raparigas 女孩们 | umas · 阴 · 复 |

## 3. 为什么不能照搬其他走路场景的做法

1. **选项没有"位置含义"。** 其他走路场景把选项挂在不同的地方（`shop` 的货架区、`find` 的垃圾桶），位置本身就是线索或剧情。形容词选项只是几个词，没有空间语义。
2. **四个选项是同一性数。** 不能把它们挂到四个不同的名词上，那会让"阴性词牌"挂在"阳性名词"旁边，等于教错。
3. **名词语境是题目的一部分。** 每个词只有一种语境，必须把它在场景里摆出来，而不是摆四种让玩家挑。
4. **原来的"找名词"一步，在走路版里是多余的路。** 它本质是"读到 uma casa，再点对应的图"。走路版里名词一直摆在展台上，玩家不用再绕一圈去找，也不容易走偏。

唯一的损失是少了一次"冠词 + 名词 → 对应图"的识别练习。这一步不计分，v1 不做；如果想保留，第 9 节有一个后续方案。

## 4. 玩法：把词牌贴到名词上

一个词的一局：

| 阶段 | 玩家看到 / 做 | 系统 |
| --- | --- | --- |
| 1 入场 | 展台上摆着本词语境对应的名词（比如一座房子）；朋友站在旁边说台词 | 沿用 `intro` / `request`，`{art} {noun}` 照常填 |
| 2 看线索 | 左上角线索卡：名词图标 + "一座房子" + "找"{target\_zh}"的词牌" | 名词图标取自 `noun_contexts[i].icon`（新增字段），**不受 `display` 控制，预习和测验都显示**（名词图标不泄露答案） |
| 3 找词牌 | 场地 4 个挂点各挂一张词牌，写着形容词（都是同一性数的形式） | 靠近站定自动抓，或按"抓"；沿用 `roam_choice` |
| 4 抓取 | 抓错：词牌冒烟，朋友 "Não é isso…"；抓对：词牌飞到头顶 | 一次抓取一次判分，和现在完全一致 |
| 5 贴上去 | 带着词牌走进展台前的交付环，词牌**飞向展台上的名词**并"啪"地贴上，名词（或三个人）弹一下 | 沿用 `roam_deliver`；终点由变体的 `deliverTarget` 决定（见 6.3）；交付成功读**这张牌的形容词词形** |

要点：

- **预习**：词牌上只有形容词（没有 emoji，和现在一致），靠近时读音，读的是**牌上显示的那个词形**（见第 6.4 节）；25 秒没抓则正确词牌发光。
- **测验**：靠近不读音；抓错 2 次后出箭头；60 秒出快速通道。
- **通用池干扰牌（`id=-1`）不读音**：它们没有对应的词记录，也没有音频；预习里有的牌会读、有的不读，属于已知且可接受的差异。
- **名词摆件不会出错**：由 `nounCtx.index` 决定，管理端配的 `scene_noun` 仍然生效。
- **一致性小标记（♂/♀ + 圆点）v1 不做**，放 M4。理由：四张牌本来就是同一性数，再加标记容易让玩家只看标记不看词。

## 5. 两个场景各自的场地

两个场景共用同一套机制，只是场地和摆件不同。引擎的挂点叫 `slots`，每个场地正好 4 个（不是"四角"，位置参考现有场地：排成一排或错落分布，相邻挂点留足间距）。

### describe\_object：展台广场（场地名 `adj_plaza`）

- 地面：一块石板广场，约 24×14 米，边缘不围墙，掉下去回出生点。
- 中央：圆形展台，直径约 2.4 米，展台上按语境摆放名词：
  - 0：一只杯子
  - 1：一座房子
  - 2：一摞书
  - 3：三座小房子
- 展台前一圈交付环；朋友站在交付环旁边（和展台是两个位置）。
- 4 个 `slots` 各放一个词牌架（复用现有的 `roam/pedestal` 模型），词牌悬在上方 1.5 米，`randomTarget` 全部默认（正确答案随机放）。
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
- 交付时词牌飞向人物头顶；复数时飞向中间那个人，三个人一起弹一下（需要人物弹跳支持，见 6.3）。

两个场景的差别只在**场地数据和模型**，节点结构、判分、HUD 完全相同。

## 6. 数据与代码改动（设计层面）

### 6.1 模板 JSON 草案（以 describe\_object 为例）

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
      "prompt_zh": "找到"{target_zh}"的词牌，带去贴在{noun_zh}上。",
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

**describe\_person 不是"只换文字和场地名"，改写时必须注意：**

- **保留 `sentence_pt`**（`Procuro {art} {noun} {adj}.`）。它供 `/api/scene/sentence-audio` 跟读，丢了会退回 `Quero…por favor` 默认句型，和场景对不上。
- 请求句保持 `Procuro {art} {noun} {blank}.`（没有 por favor）。
- 中文保持 `帮朋友找"{target_zh}"的{noun_zh}。`（没有"一个"）。
- 线索卡提示、`wrong_feedback`、`deliver` 的中文要换成"人"的口吻（"这个词不对，再试一次" / "把词牌贴到{noun\_zh}身上！"）。
- `noun_contexts` 与 `context_pick` 照旧不动，只新增 `icon`（👦 👧 👦👦👦 👧👧👧，≤4 个字符）。
- `deliver` 节点的 `pt` 是固定句 `Cola aqui!`：校验器的静态泄露扫描会检查它是否含目标词，形容词不会撞上，但改写后仍要跑一遍。

### 6.2 服务端校验器（`memory/scene_registry.py`）

现状有**两处**相关限制，都要改：

1. 第 321 行附近：roam 模板的 `applies_to.pos` 目前只允许 `["noun"]` / `["verb"]`，放宽为再允许 `["adjective"]`。
2. 第 336 行附近：`describe_*` 要求 `applies_to.pos == ["adjective"]`，保持不变。

新增规则：

- 词性是形容词的 roam 模板必须同时满足：`adjectiveOnly: true`、`noun_contexts` 正好 4 个、`roam_choice` 带 `variant_by: "noun_context"`；其他词性出现 `variant_by` 一律报错。
- 场地的变体数量必须等于 `noun_contexts` 数量（服务端只能校验模板侧，场地数据在前端，见下）。
- `noun_contexts[*].icon` 作为可选字符串，长度 ≤ 4。
- 现有的限制不动：只有 describe\_object / describe\_person 才能用 `{art}` `{noun}` 占位符和 `noun_context`。
- **注意盲区**：`arena` 在服务端只校验格式，**不会发现前端缺这个场地**。缺 `ARENAS` 键只会在运行时变成错误卡，所以验收要走 `scene-lab.html` 实际跑一遍。

### 6.3 前端（`scene.js`、`js/roam/`、`css/roam.css`）

**scene.js**

- `doRoamChoice` 往 `stage.run` 多传：`variant`（= 本词的 `nounCtx.index`，**和 `speakNode` 里给 line-audio 用的 variant 是同一个序号**）和 `clue.noun`（`{ icon, zh }`）。
- 每个牌的读音要带词形：`onApproach` 和交付后的 `speakWord` 改为传 `form`（见 6.4）。通用池牌（`id=-1`）直接不读。

**roam/index.js**

- 线索卡：现在 `clueEmoji` 只在 `opts.display !== 'pt'` 时显示，形容词 `display` 恒为 `pt`，所以要给名词图标**单独开一条显示路径**（读 `clue.noun.icon`，与 `display` 无关）。
- 交付动画：现在词牌飞向 `arena.friend.root.position`（朋友）。要改为：当前变体有 `deliverTarget` 就飞向它，没有则保持原行为（不影响其他 13 个走路模板）。
- 交付后的弹跳：沿用 `arena.deliverProp`，但形容词场景按变体取（见下）。

**roam/arena.js**

- 场地数据加 `variants`：长度 4 的数组，每项包含该变体的摆件/人物、`deliverTarget`（词牌的终点坐标）、`bounce`（交付成功要弹的对象 id 列表）。顺序必须和模板的 `noun_contexts` 一致。
- `arena.setVariant(i)` 只显示第 i 组，其余隐藏。
- **人物不能弹的问题**：现有 `bounce(id)` 只作用于 `props`，而人物（`A.people`）是单独的循环，没有 id，也没有记录 `base` 缩放。要让"三个人一起弹"成立，需要把 people 也登记进可弹跳表（给每个人加分组 id，或让人物循环也写入 `props`）。这是引擎改动，不是只改数据。
- `ARENAS` 新增 `adj_plaza`、`adj_stage` 两项。

**css/roam.css（标签宽度）**

- `.rm-label` 是 `white-space:nowrap`、字号 28px。*inteligentes*、*simpáticas* 这类长词在手机横屏上可能超出。
- 方案：保持不换行，标签最大宽度约为视口 22%，超出时字号等比缩小，**下限 22px**；超过下限仍放不下的词（极少）才允许省略号。不再写"字号 ≥ 28px"。

### 6.4 读音词形（唯一改接口的地方，前后端同步）

**问题**：`words.js` 的 `speak(w,'word')` 请求 `GET /api/words/{id}/audio?kind=word`，后端 `word_routes.py` 对 `kind=word` 永远读 `word.pt_word`（词典原形）。牌上写 *pequenas*，读出来却是 *pequeno*。

**方案**：

- **后端**：`/api/words/{id}/audio` 新增可选参数 `form`，**白名单只允许四个字段名**：`adjective_m_singular` / `adjective_f_singular` / `adjective_m_plural` / `adjective_f_plural`；传了且该词该字段非空就读该字段，空或没传回退 `pt_word`；非法值 422（和音色白名单一致，不静默丢弃）。缓存键要带上 `form`，否则不同词形会读到同一份缓存。
- **前端**：`words.js` 的 `speak(w, kind, btn)` 增加可选的第四个参数 `form`，非空时加进查询串；`scene.js` 在 `onApproach` 和交付后读词时传入当前牌的词形字段名（由 `nounCtx` 的性数拼出，和 `adjectiveForm()` 同一规则）。
- **干扰牌**：本批词的牌用它自己的 `id` + 同一个 `form`；通用池牌不读。
- **兼容**：不传 `form` 时行为与现在逐字节相同；点选版（如果保留）不受影响。
- **跟读句和结果卡**：`complete` 节点显示的 `{target}` 仍是 `pt_word`，保持不变（它是"这个词是什么"，不是"这张牌写的是什么"）。

### 6.5 完全不用改的

- `buildOptions` 的形容词分支、`GENERIC_ADJ` 通用池、`evaluateChoice`、积分。
- `noun_contexts` 的选择规则、管理端的 `scene_noun`、服务端对 `variant` 的 line-audio 处理。
- 自动抓取、提示梯度、快速通道、重生、HUD 其余部分。
- **管理端 C#（WordMemorizer）**：`FormSceneMetadata` 的模板列表和"形容对象"名词选项都从 `/api/scene/templates` 的 `noun_contexts` 读，新增的 `icon` 字段会被忽略，**不需要改**。需要留意的只有一点：模板选"自动"时它默认按 `describe_object` 取名词语境，这与前端 `chooseTemplate`（形容词自动取第一个可用模板）一致，保持即可。

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

兜底：杯子、书、房子、人物都有原来的兜底零件，缺文件时画面仍可用。如果新增 `podium.glb`：单个 `.glb`、贴图内嵌、不需要骨骼动画、风格与现有低多边形模型一致，面数建议 ≤ 2000，体积 ≤ 200 KB，正面朝镜头（`rotY=0`）。

## 8. 风险与取舍

- **形容词没有可视化。** 没有 emoji，也没有对应物体，学习仍然靠中文提示，这点和现在完全一样，走路版不会更好也不会更差。
- **一致性仍是被动学习。** 四个词牌都是同一性数，玩家看到的是"这个形容词在阴性复数下长这样"。想让它变成主动练习要另做，见第 9 节 B。
- **少了"找名词"这一练习。** 不计分，影响小，但确实是内容上的减少。
- **摆件要摆对。** 四种语境里"几本书""几座房子"是复数，要真的摆成多个，否则和台词里的 uns / umas 对不上。
- **自动选择模板的实际行为。** 没明确指定模板的形容词，前端 `chooseTemplate` 恒取第一个可用模板，也就是 `describe_object`；`describe_person` **不参与轮换，只在词里明确选了它时才出现**。**不要给两个都加 `manualOnly`**，否则没指定模板的形容词会报"没有适用于形容词的已发布场景模板"。两个都留在自动列表里即可。
- **读音词形依赖后端 `form` 参数。** 如果 M1 只上线前端而后端没跟上，预习会读回词典原形（和现状一致，不会更糟）；但不要在后端没部署时让前端传 `form`，否则旧后端会忽略它或报 422（取决于后端是否校验未知参数）。部署顺序见第 10 节。
- **时长。** 和其他走路版一样，一个词约 40–75 秒。转完后形容词没有点选版可选。详见第 11 节的待定项。

## 9. 后续可选方案（v1 不做）

**A. 保留"先找名词"。** 新增节点 `roam_noun`：广场里同时摆 4 个名词展台，玩家要根据台词里的"uma casa"走到对应展台，才会放出词牌。不计分，走错只提示。成本：一个新节点加一个场地数据。

**B. 一致性挑战（第三个模板）。** 选项改成同一个形容词的 4 个词形（阳单 / 阴单 / 阳复 / 阴复），玩家要抓和展台名词一致的那张。这练的是性数一致，不是词义，所以服务端判分要多带一个 `form` 参数，并作为 `manualOnly` 的独立模板。词形数据现成（`adjective_m_singular` 等四个字段）。

**C. 一致性小标记。** 展台名牌和每张词牌角上画小徽章（♂/♀ + 单数一个点、复数两个点）。v1 不做（见第 4 节理由），若以后要做，默认只在预习显示，由 `roam_choice.show_form_badge` 控制。

**D. 贴上后的动画演示。** 词牌贴上去后让名词做一个程序动画（比如"大"就放大）。只对少数形容词有意义，不推荐。

## 10. 里程碑与验收

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M1 引擎 | 场地 `variants` / `deliverTarget`、人物可弹跳、HUD 名词图标路径、标签自适应宽度、校验器放宽到形容词、后端 `form` 参数 | `python tools/validate_scenes.py` 零错误；旧的 13 个走路模板不受影响（交付仍飞向朋友）；不传 `form` 的音频请求与旧行为一致 |
| M2 describe\_object | `adj_plaza` 场地和 4 个变体、模板改写 | 4 种语境各跑一遍；管理端配 `scene_noun` 后展台跟着变；一次抓取一次请求；预习读的是牌上的词形 |
| M3 describe\_person | `adj_stage` 场地和 4 个变体，保留 `sentence_pt` | 复数时三个人同时弹；缺人物模型时简易小人可用；跟读句仍是 `Procuro…` |
| M4 可选 | 一致性小标记（第 9 节 C） | 只在预习出现，测验不出现 |

**部署顺序（必须按这个来）**：

1. 先部署**前端**（`scene.js`、`words.js`、`css/roam.css`、`js/roam/*`）。
2. 再部署**后端**：`scene_registry.py`（校验器）+ `word_routes.py`（`form` 参数）。
3. 最后部署**模板 JSON**（`scenes/describe_object.json`、`describe_person.json`），然后重启后端。

否则旧前端遇到新模板会在 `roam_choice` 卡住，或服务端校验器直接拒绝加载新模板。

**测试同步（M1 要一起处理）**：以下自测里有针对 `describe_*` 的断言，改完要跑并按需更新：

- `tools/test_scenes.py`：`variant_test` 往 `describe_*` 里临时塞节点并按语境取台词；`describe_person` 的跟读句；模板 id 集合。
- `tools/test_scene_noun.py`：`describe_*` 有 4 个名词语境；`scene_noun` 与模板的配对校验（rapaz 只能配 describe\_person 等）；"只有 describe\_* 带 `noun_contexts`"。
- `tools/test_scene_api.py`：里面的模板 id 集合看起来已经过期（只有 5 个），先确认它现在能不能跑，再决定是否一起修。
- 新增用例：走路版 `describe_*` 通过校验；形容词 roam 缺 `variant_by` 报错；非形容词出现 `variant_by` 报错；`form` 参数白名单（合法 / 空 / 非法 422）。

**回归检查**：长词形的标签不溢出（360 / 390 宽度的手机横屏）；预习靠近读音且读对词形，测验不读；掉下场地后词牌回原位且不重复判分；横竖屏、切后台与其他走路场景一致；`scene-lab.html?template=describe_object&word=<id>` 先走预习再走测验，测验里点错一个再点对，网络面板只能有 2 次 `/words/scene/evaluate`。

## 11. 决定（已确认）与待定

**已确认：**

1. **玩法**：采用"贴词牌"（改动最小），第 9 节 A 不做。
2. **一致性小标记**：v1 不做，放 M4 / 第 9 节 C。
3. **模板选择**：两个形容词场景都留在自动选择里（实际行为：自动 = `describe_object`，`describe_person` 只能手动选）；不能两个都加 `manualOnly`。
4. **人物**：`describe_person` 用现有 `people/*` 模型，缺模型时用 `look` 画简易小人。
5. **第 9 节 B（一致性挑战）**：暂不规划，v1 完成后再评估。
6. **读音**：后端 `/api/words/{id}/audio` 加 `form` 白名单参数，前端同步传词形；通用池牌不读音。

**仍待定（建议在 M2 开始前定下来）：**

- **测验里是否给形容词保留一个快速点选版？** 走路版一个词约 40–75 秒，形容词在每天任务里的占比决定了总时长是否可接受。可选做法：① 完全不保留（和其他走路场景一致）；② 保留旧点选版作为独立的 `manualOnly` 模板，管理端可以把时间紧的词指定过去。我倾向 ②，成本很低（把现有两个模板 JSON 另存为新 id 即可），但这会让 `describe_*` 的 id 集合变化，要同步改上面列出的测试。