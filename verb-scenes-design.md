# 动词场景设计（4 个模板 + 落地清单）

> 配套文件：`scenes/verb_park.json`、`verb_restaurant.json`、`verb_home.json`、`verb_school.json`（均为 `status: "draft"`）。
> 依据：你上传的后端 `scene_registry.py` 校验规则、`scene.js` 渲染逻辑、`word_routes.py` / `routes.py` / `admin_routes.py`、C# `FormSceneMetadata.cs`。

---

## 1. 现状：为什么现在动词进不了场景

动词在管道里"被认出来了，但被一路挡住"：

| 环节 | 位置 | 现状 |
|---|---|---|
| AI 生成场景字段 | `admin_routes.py` 第 237~246 行提示词、第 262 行 | 允许输出 `pos:"verb"`，但第 280 行强制 `scene_ok=False` |
| 管理端保存 | `admin_routes.py` 第 301 行；C# `FormSceneMetadata.cs` 第 416 行 | 非 noun/adjective 一律 `scene_ok=False` |
| 前端可玩判断 | `scene.js` `canPlay`（第 67~79 行） | 有场景数据时只放行 noun / adjective |
| 前端选模板 | `scene.js` `chooseTemplate`（第 135~150 行） | `pos` 只分形容词 / 其他=名词 |
| 前端选项 | `scene.js` `buildOptions`（第 379~402 行） | 非形容词都当名词，干扰项池里会混进动词 |
| 单词页入口 | `words.js` `canUseAssessmentScene`（第 407 行） | `['noun','adjective']` |
| 判分接口 | `word_routes.py` 第 466 行 | 非 noun/adjective 返回 400 |
| 跟读句接口 | `routes.py` 第 109 行 | 同上，且只会拼名词句 |

所以**模板 JSON 只是一半**，另一半是上面这些放行点（见第 5 节）。我把模板做成 `draft`，现在放进 `scenes/` 目录**不会改变任何现有行为**：`load_registry` 只校验、不加载 draft（我已用项目校验器跑过，9 个模板 0 错误）。

---

## 2. 设计思路

**动词怎么教？** 用葡语里最自然的"助动/情态 + 动词原形"框架，词表里存的就是原形（comer、correr），所以**不需要任何变位数据**：

| 框架 | 例 | 用在 |
|---|---|---|
| Vamos + 原形 | Vamos ____ no parque? | 公园 |
| Quero + 原形 | Hoje, no restaurante, quero ____! | 餐厅 |
| Já é hora de + 原形 | Já é hora de ____! | 在家 |
| Vamos + 原形 | Na aula de hoje, vamos ____. | 教室 |

**保持项目既有骨架**（只用现有 6 种节点，不新增节点类型）：
`朋友提出动作（中文意思在气泡里）→ 点人物问线索 → 选地点 → 选动作（只有这一步提交判分）`。

**诚实说明一点**：现有名词场景里"选地点"这一步，在画面上并没有真的把物品"放进"那个地点（选对地点后货架直接换成 4 个选项），它本质是"探索 + 减少乱点"的互动步骤。动词场景沿用同样的机制，目标地点随机，**不假装动作和地点有语义绑定**。动词和场景的对应，靠**主题模板**来表达（吃喝 → 餐厅，运动 → 公园）。

**预习 / 测验的差别沿用名词逻辑**：预习显示"动作 emoji + 葡语"，测验只显示葡语，靠气泡里的中文意思作线索。

---

## 3. 四个场景

### 3.1 `verb_park` · 公园里一起玩（运动 / 游戏）

- **舞台**：街道 → 公园（`search-place` 户外底，沿用 `template-find` 样式）；朋友在街上，教练在公园。
- **人物**：朋友（橙衣）、教练（绿衣）。
- **流程**
  1. 朋友：`Olá! Hoje está um bom dia!`（预习才有）
  2. 朋友提出：`Vamos ____ no parque?` ——「我们去公园……{中文意思}吧？」（不朗读，气泡显示中文意思）
  3. 教练：`Bom dia! Bem-vindo ao parque!` → 点教练问线索：`Procura bem!`
  4. 选地点：🌿 relvado 草地 / 🦆 lago 湖边 / 🪑 banco 长椅（错了：`Não está aqui.`）
  5. 选动作（4 选 1）→ 教练 `Boa ideia!` → 回去告诉朋友 → `Obrigado! Vamos lá!`
- **适合的动词**：correr、caminhar、nadar、saltar、jogar、dançar、cantar、passear、rir

### 3.2 `verb_restaurant` · 在餐厅里的动作（饮食）

- **舞台**：街道 → 餐厅（沿用 `restaurant` 场景底和三个热点：cardápio / balcão / cozinha）。
- **人物**：朋友（橙衣）、服务员（青绿衣）。
- **流程**：`Hoje, no restaurante, quero ____!` → 服务员 `Boa tarde! Seja bem-vindo!` → 点服务员 → 选地点 → 选动作 → `Muito bem!` → 回去 `Obrigado! Excelente!`
- **适合的动词**：comer、beber、pedir、pagar、provar、cortar、escolher

### 3.3 `verb_home` · 在家的一天（日常 / 家务）

- **舞台**：室内（`room`，像 `find_room`）：朋友就在房间里，不需要走路。
- **流程**：`Olá! Bem-vindo à minha casa!` → `Já é hora de ____! Vem comigo?` → 点朋友 → 选房间：🍳 cozinha 厨房 / 🛏️ quarto 卧室 / 🛋️ sala 客厅 → 选动作 → `Isso mesmo!`
- **适合的动词**：dormir、acordar、lavar、cozinhar、limpar、abrir、fechar、descansar

### 3.4 `verb_school` · 在教室里学习（学习 / 沟通）

- **舞台**：室内（`room`），蓝衣同学。
- **流程**：`Olá! Estamos na escola!` → `Na aula de hoje, vamos ____.` → 点朋友 → 选角落：📝 quadro 黑板 / 📚 estante 书架 / 🎒 mochila 书包 → 选动作 → `Muito bem!`
- **适合的动词**：ler、escrever、estudar、ouvir、falar、desenhar、aprender、perguntar、responder、contar

---

## 4. 推荐动词清单（A1 · pt-PT）

emoji 要求：同一模板里选项 emoji 必须互不相同（`buildOptions` 的规则），所以下面每个动词用独一无二的 emoji。

| 模板 | 动词 | 中文 | emoji |
|---|---|---|---|
| park | correr | 跑 | 🏃 |
| park | caminhar | 走路 | 🚶 |
| park | nadar | 游泳 | 🏊 |
| park | saltar | 跳 | 🤸 |
| park | jogar | 玩（球/游戏） | ⚽ |
| park | dançar | 跳舞 | 💃 |
| park | cantar | 唱歌 | 🎤 |
| park | passear | 散步 | 🐕 |
| park | rir | 笑 | 😂 |
| restaurant | comer | 吃 | 🍽️ |
| restaurant | beber | 喝 | 🥤 |
| restaurant | pedir | 点（餐）/ 要求 | 🙋 |
| restaurant | pagar | 付款 | 💳 |
| restaurant | provar | 尝 | 😋 |
| restaurant | cortar | 切 | 🔪 |
| restaurant | escolher | 选择 | 👉 |
| home | dormir | 睡觉 | 😴 |
| home | acordar | 醒来 | ⏰ |
| home | lavar | 洗 | 🧼 |
| home | cozinhar | 做饭 | 🍳 |
| home | limpar | 打扫 | 🧹 |
| home | abrir | 打开 | 🔓 |
| home | fechar | 关上 | 🔒 |
| school | ler | 读 | 📖 |
| school | escrever | 写 | ✍️ |
| school | estudar | 学习 | 📚 |
| school | ouvir | 听 | 👂 |
| school | falar | 说 | 🗣️ |
| school | desenhar | 画画 | 🖍️ |
| school | aprender | 学会 | 🎓 |
| school | perguntar | 问 | ❓ |
| school | responder | 回答 | 💬 |

**暂不适合场景的动词**：ser / estar / ter / ir / fazer / poder / querer 等抽象或高频助动词，没有一个"看得见的动作"，`scene_ok` 应设为 false，走普通测验即可。

---

## 5. 落地清单（实现状态：已完成）

### 5.1 后端

| 文件 / 位置 | 改动 |
|---|---|
| `api/word_routes.py` 第 466 行 | `word.pos in ("noun","adjective")` → 加 `"verb"` |
| `api/routes.py` 第 109 行 + 跟读句分支（约第 120 行起） | 允许 `verb`；新增动词句子拼接（见下表）；动词不走冠词/性数逻辑 |
| `api/admin_routes.py` 第 280、301 行 | `scene_ok` 对 `verb` 不再强制 False |
| `api/admin_routes.py` 第 237~246 行（AI 提示词） | 补一句：动词仅当"有明显可观察的动作"时 `scene_ok` 为 true，emoji 用动作 emoji |
| `tools/test_scenes.py` 第 36、102 行 | 发布后，期望模板集合要加上 4 个新 id（现在是 draft，不加也能过） |

**跟读句**（`/api/scene/sentence-audio`，服务端按模板拼，不接受任意文本）：

| scene_template | 句子 |
|---|---|
| `verb_park` | `Vamos {动词} no parque?` |
| `verb_restaurant` | `Hoje, no restaurante, quero {动词}!` |
| `verb_home` | `Já é hora de {动词}!` |
| `verb_school` | `Na aula de hoje, vamos {动词}.` |

### 5.2 前端

| 文件 / 位置 | 改动 |
|---|---|
| `scene.js` `canPlay`（第 67~79 行） | 新增 `pos === 'verb'` 分支：`scene_template` 为空或以 `verb_` 开头，且有 emoji 或中文意思 |
| `scene.js` `chooseTemplate`（第 135~150 行） | `pos` 改为三分支 noun / adjective / verb；动词没指定模板时在 `verb_*` 里轮换；报错文案加"动词" |
| `scene.js` `buildOptions`（第 379~402 行） | 名词分支排除 `verb`；新增动词分支：同批池只取 `pos==='verb'`；新增 `GENERIC_VERB` 兜底表（见下） |
| `words.js` 第 407 行 | `['noun','adjective']` → 加 `'verb'` |
| `scene-lab.html` 第 38 行 / `scene-lab.js` | 词性下拉加"动词" |

**`GENERIC_VERB` 兜底（词太少、同批池不够 3 个干扰项时用）**，每个 emoji 唯一，且不与模板固定台词撞词：

`correr 🏃` `comer 🍽️` `beber 🥤` `dormir 😴` `ler 📖` `escrever ✍️` `nadar 🏊` `cantar 🎤` `dançar 💃` `lavar 🧼` `pagar 💳` `abrir 🔓`

### 5.3 管理端 C#

`FormSceneMetadata.cs`：动词可启用场景练习；动词状态隐藏名词性数和形容词词形字段。本轮已用 Visual Studio 2022 MSBuild 成功生成管理端。

### 5.4 当前实现与部署文件

本轮已完成后端、学习前端、场景实验页和 C# 管理端支持；`verb_home`、`verb_park`、`verb_restaurant`、`verb_school` 的 JSON 状态都已设为 `published`。

- 后端部署：`api/word_routes.py`、`api/routes.py`、`api/admin_routes.py`、`scenes/verb_*.json`；重启服务后加载模板。
- 前端部署：`js/scene.js`、`js/words.js`、`scene-lab.html`、`js/scene-lab.js`。
- 管理端重新生成：`WordMemorizer.Core/WordMemorizer.Core/FormSceneMetadata.cs` 所在的 C# 工程。
- 自动验证：`tools/validate_scenes.py` 验证 9 个模板无错误；`tools/test_scenes.py` 的 10 项测试全部通过；三个前端脚本通过 `node --check`；C# 解决方案通过 MSBuild。
- 尚未做浏览器和手机尺寸的可视检查；已有场景实验页可用于预习/测验模式预览。

---

## 6. 防"泄题"规则（写新动词台词时必看）

校验器和前端都会检查：**固定葡语台词里不能出现目标词原形**（整词匹配）。动词的陷阱比名词多，因为高频动词本身就是日常用语：

| 容易踩的原形 | 常见出现场合 | 本次处理 |
|---|---|---|
| ver | "Vamos ver!" | 改成 `Olha ali!` / `Olha!` |
| ajudar | "Em que posso ajudar?" | 改成 `Bem-vindo…` |
| ir / comprar | "Podes ir comprar?" | 不使用 |
| ter | "vem ter comigo" | 不使用 |
| começar | "Vamos começar!" | 不使用 |
| jantar / almoçar | 既是动词又是名词 | 热点标签不用这两个词 |

我用 60 个候选动词对 4 个模板做了静态泄露扫描，**0 命中**。你以后新增动词时，请先在候选词里加上它，再跑 `python tools/validate_scenes.py`。

---

## 7. 可选增强（不影响上线，之后再做）

**`act_target` 动作特效**：现在朋友头上的气泡只显示中文意思；预习时如果能让动作 emoji 在朋友身边弹跳（跑 = 横向跳、睡 = 缓慢摇摆），动词的"可见动作"会直观得多。需要给 `scene_registry.py` 的 `EFFECTS` 加一项，并在 `scene.js` 加一个特效函数；测验模式仍显示中文，避免直接给答案。

---

## 8. 验证范围与局限

- **已验证**：4 个 JSON 通过项目的 `validate_scene`（0 错误 0 警告）；60 词静态泄露扫描 0 命中；放进 `scenes/` 后 `validate_scenes.py` 对 9 个模板 0 错误；`load_registry` 仍只加载原来的 5 个（draft 不生效）。
- **未验证**：没有在浏览器里实际跑过——引擎还没支持动词，必须先做第 5 节的改动才能预览；`tools/test_scenes.py` 因当前环境没装 fastapi 没能运行（draft 不暴露，预计不受影响）。
- 动作 emoji 里 🤸（saltar）、🙋（pedir）、🎓（aprender）含义偏抽象，建议你在 `scene-lab` 里看过效果后再决定是否换掉。
