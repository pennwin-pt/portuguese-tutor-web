# 单词任务升级设计:句子填空(mode 3)

> 给实现者(AI)的说明:这是一份**可直接照做**的设计。先通读"0. 执行须知",只读其中列出的文件,按"4. 实施步骤"的顺序做,做完按"6. 验收"自测。**只做第一阶段**,第二、三、四阶段仅作后续参考,没被要求时不要实现。

## 0. 执行须知(省 token 必读)

- **只读这些文件**,别的不用打开:
  `memory/word_planner.py`、`memory/word_progress_manager.py`(只看 `settle` 和建表部分)、`api/word_routes.py`、`js/words.js`、`css/words.css`。
- **不要读也不要改**:`index.js`、`index.css`、`index.html`、`touch-protection.css`、`words.html`、`core/*`、`prompts/*`、`word_source.py`。
- **不需要新建表、不需要新增列、不需要数据库迁移。**(第一阶段的设计目标之一)
- 定位代码**用 grep 锚点,不要信行号**(行号会随改动偏移)。
- **换行符**:后端 `.py` 和 `words.js` 都是 **CRLF**,改完必须保持 CRLF。
- **交付**:每个改动的文件以完整文件输出到 `/mnt/user-data/outputs/` 下同名路径(`memory/…`、`api/…`、`js/…`、`css/…`),不要把代码贴在聊天里。说明只用几句话:改了哪些文件、做了什么、有什么偏差。
- 不要重构、不要改命名、不要顺手"优化"无关代码、不要给前端引入框架或构建工具。
- 项目风格:简体中文注释和 UI 文案,Python 用 async/类型注解,前端是原生 JS。

## 1. 背景与目标

**现状**:单词任务只有两种题型:mode 1「看葡语说中文」(只是认得)、mode 2「看中文说葡语」(会说)。例句 `pt_sentence`/`cn_sentence` 只在答题后的结果页展示,从来没被用来测试。结果是单词离开语境就容易忘。

**目标**:新增 **mode 3「句子填空」**——显示挖掉目标词的葡语例句(附中文翻译),用户**说出缺的那个词**。让词在语境里被回忆、被用出来,并让 mode 3 成为单词「毕业」前的必经关卡。

**不是目标**(第一阶段不做):造句、聊天页联动、多例句轮换、改动「掌握」判定的数据结构。

## 2. 核心规则(设计决定,不要改动)

### 2.1 mode 3 的定义
| 项目 | 规则 |
|---|---|
| 展示 | 挖空的葡语句子(缺词处显示 `____`)+ 该句中文翻译 + 小号提示:目标词的 `cn_meaning` |
| 用户操作 | 按住说话,**只说缺的那个词**(整句读出来包含目标词也算对) |
| 是否自动朗读 | **不自动朗读、测试界面不放喇叭按钮**(朗读句子会泄露答案)。结果页照旧有单词和例句两个喇叭 |
| 评判 | ASR 用葡语(同 mode 2),规则放行 → 否则 LLM 复判,见 3.2 |
| 谁能被出 mode 3 | **仅复习词**(`kind=review`)。新词、周五回顾(weekly)、预览不出 mode 3 |

### 2.2 何时出 mode 3(`choose_mode` 的新规则)
在 `memory/word_planner.py` 的 `choose_mode(row, pt_word)` 里,**保持原有分支顺序,只新增一条**:

```
已有:lapses >= STUBBORN_LAPSES 或 last_outcome == "again"   → 1   (不变,顽固/刚答错的词走最容易的)
新增:box == 3 且 last_outcome == "good"                        → 3   (放在 box>=2 分支之前)
已有:box >= 2 → (2 if last_outcome == "good" else 1)           (不变)
已有:其余 → choose_new_mode(...)                                (不变)
```

**为什么选 box == 3**:box 3 的词答对会升到 box 4,而 `MASTER_BOX = 4`,即「掌握」的门槛。所以**一个词要掌握,几乎必然先过一次句子填空**。这样不用改表结构就实现了"句子级验证后才毕业"。(代价:`last_outcome` 不是 good 时 box 3 的词走 mode 1,理论上可以绕过,概率很低,接受。)

### 2.3 每天上限
新增常量 `CLOZE_MAX = 6`(放在 `word_planner.py` 顶部常量区,带中文注释)。`build_today_plan` 在生成 `items` 之后,**按 items 现有顺序**数 `mode == 3` 的条目,超过 `CLOZE_MAX` 的后面几个改成 `mode = 2`。只处理 `kind == "review"` 的条目(其他 kind 本来就不会是 3)。

### 2.4 挖空的构造(`make_cloze`)
在 `word_planner.py` 新增**纯函数**(不碰数据库、不 import 路由):

```python
CLOZE_BLANK = "____"

def make_cloze(sentence: str | None, pt_word: str | None) -> str | None:
    """把例句里的目标词换成 ____；找不到返回 None（调用方据此退回 mode 2）。"""
```

规则:
1. 任一入参为空/全空白 → `None`。
2. `target = pt_word` 去掉括号及括号内备注(如 `"casa (n.)"` → `"casa"`),`strip()`。结果为空 → `None`。
3. 用正则 `(?<!\w)` + `re.escape(target)` + `(?!\w)`,flags=`re.IGNORECASE`(Python 3 的 `\w` 默认支持 Unicode 字母,重音字母会被当作单词字符)。在 NFC 规范化后的句子里匹配。
4. **只替换第一处匹配**,替换成 `CLOZE_BLANK`;没匹配到 → `None`。
5. **V1 只做整词精确匹配**(不做动词变位模糊匹配)。这是有意的:先看覆盖率,见 4 的第 0 步门槛。

### 2.5 找不到挖空位置时的降级
挖空是在**读计划时**(`word_routes._load_words`)构造的,不是在生成计划时:
- `entries` 里 `mode == 3` 的条目,调用 `make_cloze(w.pt_sentence, w.pt_word)`。
- 成功 → 返回的词对象里加字段 `cloze`(字符串,含 `____`),`mode` 保持 3。
- 失败(`None`)→ 该词对象 `mode` 改成 **2**,不带 `cloze`。前端拿到的永远是**最终** mode,所以 `outcomes[].mode` 与实际题型一致。
- **不要**回写 `word_daily_plan`(计划表里仍是 3,每次读取时重新判定,结果是稳定的)。

### 2.6 结果与进度(`apply_outcome`)
`word_planner.apply_outcome` 里,**只改一处**:`good` 分支里原来是 `if mode == 2: r["mode2_ok"] = 1`,改成 `if mode in (2, 3): r["mode2_ok"] = 1`(句子里能说出这个词,说明已经会说了)。
`again` 分支里清 `mode2_ok` 的条件**保持只有 `mode == 2` 时清**(mode 3 答错不清,避免一次填空失误作废之前的"会说"证明)。其余 box/lapses/hard_streak/streak 逻辑**一律不变**。`last_mode` 照旧记录 3。

### 2.7 答错后下一轮的方向翻转
前端 `next()` 里,下一轮把错词翻转方向。**mode 3 翻转成 mode 1**(填空都答不出来,就退回最容易的"看葡语说中文");1 → 2、2 → 1 不变。

## 3. 接口与契约变化

### 3.1 字段
| 接口 | 变化 |
|---|---|
| `GET /api/words/today` | `words[].mode` 可能是 `3`;mode 3 的词多一个字段 `cloze: string`(含 `____`)。`preview`、`meta` 结构不变。(可选:`meta.cloze` 放今天出题的 mode 3 数量,前端开始页展示用,不强求) |
| `POST /api/words/evaluate` | FormData 的 `mode` 接受 `1 | 2 | 3` |
| `POST /api/words/complete` | `outcomes[].mode` 接受 `1 | 2 | 3` |
| `POST /api/words/record_error` | `mode` 接受 `1 | 2 | 3` |

### 3.2 评判(mode 3 在 `words_evaluate` 里的处理)
- ASR:**与 mode 2 完全一样**(`language="pt"`,`prompt=settings.ASR_PROMPT_WORD`)。
- 评判新增一个函数 `_judge_pt_cloze(word, heard)`(放在 `_judge_pt_llm` 旁边),逻辑:
  1. `passed, comment = _judge_pt(word.pt_word, heard)`(**规则**,现有函数)。通过则返回。
  2. 否则把 `_norm_pt(heard)` 按空格切成词,**逐个词**再过一遍 `_judge_pt(word.pt_word, token)`;任一通过则返回通过(用户把整句念出来的情况)。
  3. 否则走现有的 `_judge_pt_llm(word, heard)` 复判(含 `WORD_PT_USE_LLM` 开关与 LLM 失败退回规则的既有行为)。
- `words_evaluate` 里:`mode not in (1, 2)` 校验改成 `(1, 2, 3)`;`asr` 语言选择里 `"zh" if mode == 1 else "pt"` 保持(mode 3 走 pt);评判分支改成 `mode == 1 → _judge_zh`、`mode == 2 → _judge_pt_llm`、`mode == 3 → _judge_pt_cloze`。

### 3.3 必须同步放开 mode 校验的位置(漏一处就会 422/丢词)
用 `grep -n "1, 2"` 和 `grep -n "Literal\[1"` 复核,**已知共 5 处后端 + 前端若干**:

| 文件 | 位置(grep 锚点) | 改成 |
|---|---|---|
| `api/word_routes.py` | `class` 里的 `mode: Literal[1, 2]`(**两处**:结算的 outcome 项、`RecordErrorBody`) | `Literal[1, 2, 3]` |
| `api/word_routes.py` | `if mode not in (1, 2):` | `(1, 2, 3)` |
| `memory/word_progress_manager.py` | `settle` 里 `mode not in (1, 2)` | `(1, 2, 3)` |
| `memory/word_source.py` | `mode: Literal[1, 2]` | **不要改**(词源默认值永远是 1,与本设计无关) |

数据库:`word_daily_plan.mode`、`word_errors.mode`、`word_progress.last_mode` 都是 `INTEGER`,**没有 CHECK 约束**,不用迁移。

## 4. 实施步骤(按顺序)

**第 0 步:覆盖率门槛(先做,5 分钟,决定要不要继续)**
写一个一次性脚本(放 `/home/claude`,**不要**交付到项目里):从 `settings.WORD_DB_PATH` 的 `Words` 表读出所有词,对每个词调用 `make_cloze(ExampleSentence, Text)`,打印"成功数 / 总数 / 比例"以及 10 个失败样例。
- **比例 ≥ 50%**:继续。
- **比例 < 50%**:**停下来**,把比例和失败样例告诉用户,不要继续实现(说明 V1 的精确匹配覆盖不够,需要先设计模糊匹配,见 7.4)。
> 该脚本要先实现好 `make_cloze` 才能跑,所以先做第 1 步里的 `make_cloze`,再回来跑门槛。

1. `memory/word_planner.py`:新增 `CLOZE_BLANK`、`CLOZE_MAX`、`make_cloze`;改 `choose_mode`(2.2);改 `apply_outcome` 一处(2.6);`build_today_plan` 里加每天上限(2.3)。**跑第 0 步门槛**。
2. `api/word_routes.py`:`_load_words` 里加挖空与降级(2.5);3 处 mode 校验放开(3.3);新增 `_judge_pt_cloze` 并接入 `words_evaluate`(3.2)。
3. `memory/word_progress_manager.py`:`settle` 的 mode 校验放开(3.3)。
4. `js/words.js`:见 5.1。
5. `css/words.css`:见 5.2。
6. 做**第 6 节**的验收。

## 5. 前端改动(`js/words.js`、`css/words.css`)

### 5.1 `words.js` 必须改的位置(grep 锚点)
| 锚点 | 改动 |
|---|---|
| `fetchToday` 里 `(w.mode === 1 \|\| w.mode === 2)` | 放开到 `[1, 2, 3].includes(w.mode)`。**漏改会导致 mode 3 的词被整个过滤掉,今日任务少词。** |
| `viewTest` | 新增 mode 3 分支(见下) |
| `next()` 里 `mode: w.mode === 1 ? 2 : 1` | 改成翻转函数:`m === 3 ? 1 : (m === 1 ? 2 : 1)` |
| `next()` 与 `retry()` 里的 `if (cur.mode === 1) speak(...)` | **保持不变**(mode 3 不自动朗读,正好符合) |
| `viewResult` | mode 3 时,单词/例句两行照旧;**可选加分**:在例句行用 `<b>` 高亮目标词(用 `textContent` 拼接,不要 `innerHTML`) |
| 顶部注释里的 Word Item 说明 | 补上 `mode: 3=句子填空` 与 `cloze` 字段 |

**`viewTest` 的 mode 3 渲染**(用 `el()` 与 `textContent`,**禁止 `innerHTML`**,避免例句里的特殊字符被当 HTML):
1. 标签 `tag`:`🧩 填空：看句子，说出缺的词`。
2. 主体:把 `w.cloze` 按 `"____"` 切成两段,拼成 `前段 + <span class="blank">＿＿＿</span> + 后段`,放在 `term` 同级的新类 `.cloze`(字号比 `.term` 小一档,见 5.2)。
3. 下面一行 `azh` 样式:`w.cn_sentence`(中文翻译,作为语境提示)。
4. 再下面一个小提示 `hint` 样式:`提示：` + `w.cn_meaning`。
5. `ask` 行:评判中显示原有的 `⏳ AI 评判中…`;否则 `请只说出缺的那个词`。
6. **不放喇叭按钮**。
7. `w.cloze` 缺失(理论上不会发生)时,退回按 mode 2 渲染,不要抛错。

**公布答案、跳过、录音、评判、`noteOutcome`、`markMastered` 的逻辑一行都不用动**:它们只依赖 `w.mode` 原样传递。

### 5.2 `words.css`
只新增(不改已有规则,不要动 `index.css`):
```css
.cloze{font-size:24px;font-weight:600;line-height:1.5;word-break:break-word}
.cloze .blank{display:inline-block;min-width:3.2em;margin:0 .15em;border-bottom:3px solid var(--blue);color:transparent;user-select:none}
.hint{margin-top:10px;font-size:13px;color:#9aa5b1}
```

## 6. 验收(实现者自测,都要通过再交付)

### 6.1 调度模拟(纯函数,用 Python 直接跑 `word_planner`)
| 场景 | 期望 |
|---|---|
| `row`: box=3, last_outcome="good", lapses=0 | `choose_mode(row, "casa")` == 3 |
| `row`: box=3, last_outcome="hard" | == 1(走原有分支) |
| `row`: box=3, last_outcome="good", lapses=3 | == 1(顽固词优先) |
| `row`: box=2, last_outcome="good" | == 2(不变) |
| 新词 | 仍是 1 或 2,不会出 3 |
| 一个 review 列表里有 9 个 box=3、last=good 的词 | `build_today_plan` 后 mode 3 的条目恰好 `CLOZE_MAX`(6)个,其余 3 个是 2 |
| `apply_outcome(row, id, "good", 3, d)` | `mode2_ok` 变 1,`last_mode`==3 |
| `apply_outcome(row, id, "again", 3, d)` | `mode2_ok` **不被清零**(若原来是 1) |
| 一个 box=3、mode2_ok=1 的词在 mode 3 答 good | box=4,`mastered`==1 |

### 6.2 `make_cloze`
| 输入 | 期望 |
|---|---|
| `("Eu gosto da minha casa.", "casa")` | `"Eu gosto da minha ____."` |
| `("A Casa é grande.", "casa")` | `"A ____ é grande."`(忽略大小写) |
| `("As casas são grandes.", "casa")` | `None`(`casas` 不是整词,V1 不做变位) |
| `("Eu gosto da minha casa.", "casa (n.)")` | 同第一条(括号备注被去掉) |
| `("Vou à praia.", "")` / `(None, "x")` | `None` |

### 6.3 接口
- 造一个让 mode 3 词句子里找不到目标词的场景:`GET /api/words/today` 里该词 `mode == 2` 且没有 `cloze`。
- 能找到时:`mode == 3` 且 `cloze` 含 `____`。
- `POST /api/words/evaluate` 传 `mode=3`:不再 422;传 `mode=4` 仍是 422。
- `POST /api/words/complete` 带 `outcomes:[{word_id,outcome:"good",mode:3}]`:200,进度被结算。
- `_judge_pt_cloze`:`heard="eu gosto da minha casa"` 且目标词 `casa` → 通过;`heard="mesa"` → 走 LLM(或在 `WORD_PT_USE_LLM=0` 时失败)。

### 6.4 前端(手动或读代码确认)
- mode 3 的词出现在今日任务里(没被 `fetchToday` 过滤)。
- 题面是挖空句 + 中文翻译 + 提示,**没有喇叭、不自动朗读**。
- 答错后进入下一轮,该词变成 mode 1。
- 公布答案会朗读单词,结果页有单词/例句两个喇叭。
- 提交的 `outcomes[].mode` 是 3。
- 页面其他功能(新词、周六加练、预习)不受影响。

## 7. 后续阶段(**仅供参考,没被要求时不要实现**)

### 7.1 第二阶段:聊天页联动(最贴合本 App 的"实践")
- **目标**:教练在对话里自然引导用户用到本周目标词,用到了就给熟练度加一点。
- **注入**:`_run_turn` 里取该用户**未掌握且最弱的 ≤5 个词**(`lapses`、`last_outcome`、`hard_streak` 排序)+ 本周新词,拼进 `build_system_prompt(persona, target_words)`。提示词要求:每次回复最多自然带入 1~2 个目标词、保持 A1 难度、不破坏人设、不要列单词表。成本约 +40 token/轮。
- **检测**:`mode=pt` 时,对 `user_pt` 做归一化分词,匹配目标词(复用 `word_routes._norm_pt`,需要先挪到公共位置)。
- **效果**:新增 `word_progress.used_count`、`last_used_on`(**这时才需要加列,照 `hard_streak` 的 `PRAGMA table_info` 自动迁移模式**)。每词每天最多生效一次;只允许 box ≤ 2 的词 +1;**聊天用到绝不能直接让词毕业**(box 封顶 3,毕业只能靠测试)。
- **前端**:聊天响应加 `used_words`,聊天页弹一个轻提示"✅ 用到了:xxx"。

### 7.2 第三阶段:自己造句(mode 4)
- 只给 box ≥ 4 且未掌握的词、以及周六加练里的词,每天最多 3 个。
- 用户用目标词说一句话 → ASR(pt)→ LLM 判断:用法是否自然、是否有语法错误,返回 JSON `{passed, comment, corrected}`。耗 LLM、慢,所以严格限量。
- 新提示词放 `prompts/word_prompts.py`,风格同现有两个评判提示词(只输出 JSON)。

### 7.3 第四阶段:多例句轮换
- 新表 `word_examples(word_id, idx, pt_sentence, cn_sentence)`,由 LLM 为每个词生成 2~3 条 pt-PT 的 A1~A2 例句并缓存。
- 挖空时在可用例句里选"最近没用过"的一条,避免背住的是句子而不是词。

### 7.4 如果 V1 覆盖率不够(见第 0 步)
给 `make_cloze` 加第二层:精确匹配失败时,在句子里找与目标词**共享前缀 ≥ max(4, len−3)** 且相似度 ≥ 0.8 的词(参考 `word_routes._near_single_word` 的思路),把它挖空,并把**这个实际出现的词形**作为 `answer` 一起返回;评判时用 `answer` 而不是 `pt_word` 做规则比对。需要给词对象多带一个 `answer` 字段。

## 8. 已知取舍(不是 bug)
- 「掌握」前必过句子填空是**概率保证**,不是硬保证(2.2 的代价说明)。要硬保证:给 `word_progress` 加 `mode3_ok` 列并把它加进 `mastered` 判定,但要处理"句子里找不到目标词的词永远毕业不了"的问题(需要 `no_cloze` 标记)。第一阶段有意不做。
- 动词变位、复数等词形变化的词,V1 会降级回 mode 2。
- mode 3 的评判比 mode 2 略宽松(允许整句念出),这是有意的。
- 本设计只改调度、评判与前端展示,**不改变复习间隔表、box 升降规则、周六加练规则**。

## 9. 完成后的收尾
- 如果环境里有项目 skill(`pt-tutor-app` 的 `SKILL.md`),把下面几点同步进去:mode 3 的定义与 `choose_mode` 新规则、`CLOZE_MAX`、`make_cloze` 与降级流程、`/words/*` 接口 mode 取值变为 1|2|3 及 `cloze` 字段、`apply_outcome` 里 mode 3 good 也置 `mode2_ok`。没有就忽略。
- 最后回复用户:改了哪几个文件、覆盖率比例是多少、有无偏离本设计的地方。
