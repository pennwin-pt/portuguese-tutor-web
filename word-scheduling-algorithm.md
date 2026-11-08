# 葡语陪练 · 单词任务调度算法说明

> 范围：「单词任务」页（`words.html`）每天出什么词、用什么题型（mode 1/2/3/4）、答完后怎么升降级的整套逻辑。
> 依据：你上传的 `portuguese-tutor-server.zip`（后端）和 `words.js`（前端）。行号是这份代码当时的行号，改动后会漂移，以函数名为准。
> 后端 `.py` 是 CRLF 换行，用编辑器看行号时无影响。

---

## 0. 一页总览

```
WordMemorizer(C# 管理端)                         陪练后端                                    陪练前端 words.js
  录入每周 30 词                                                                              
  Words / WeeklyPlans / WeeklyPlanWords  ──►  word_source.list_word_ids()   ┐
                                              word_progress.ensure_week()    │  ① 本周词表(word_week，整周固定)
                                                                             │
  word_progress(每词一行：box/due/lapses…) ─►  word_planner.build_today_plan() ┤  ② 今日计划(纯函数)
  word_outcomes(昨天通过率)               ─►  yesterday_rate()               │
                                              word_progress.save_plan()      ┘  → word_daily_plan(当天固定)
                                              word_routes._load_words()         ③ 展开成题目(挖空/例句轮换/降级)
                                              GET /api/words/today  ───────────────────────────►  fetchToday() 渲染题目
                                                                                                  逐词答题 + 判分
                                              POST /api/words/evaluate  ◄───────────────────────  (语音 → ASR → 规则/LLM)
                                                                                                  noteOutcome() 记第1轮结果
                                              POST /api/words/complete  ◄───────────────────────  finish() 提交 outcomes
                                              word_progress.settle()
                                                └ word_planner.apply_outcome()   ④ 升降 box、算下次到期日
                                                  写 word_progress + word_outcomes
```

核心思想：**Leitner 盒子（box 0~5）+ 工作日间隔 + 每词每天只结算一次**。调度函数都是纯函数（不碰数据库），数据库读写集中在 `word_progress_manager.py`。

---

## 1. 文件位置总表

后端根目录就是 `portuguese-tutor-server/`。

| 模块 | 文件 | 作用 |
|---|---|---|
| **调度算法（纯函数）** | `memory/word_planner.py` | 所有参数、出题规则、升降级、周六加练、挖空 |
| **进度存储** | `memory/word_progress_manager.py` | 4 张进度表的建表与读写、结算 `settle` |
| 每日完成记录 | `memory/word_task_manager.py` | `word_task_done` 表、`today_str()`（服务器本地日期） |
| 错词事件流 | `memory/word_error_manager.py` | `word_errors` 表（只记录，不参与调度） |
| 例句轮换 | `memory/word_example_manager.py` | `word_examples` / `word_example_use` 两表、`pick_example` |
| 词库只读数据源 | `memory/word_source.py` | 从 `Words`/`WeeklyPlans`/`WeeklyPlanWords` 取词 |
| 管理端表与积分 | `memory/wm_manager.py` | 建 `Words` 等六张管理表 + `WordQuizRun`/`WordQuizAward` |
| 日期工具 | `memory/wm_calendar.py` | 管理端的周/批次号工具（与调度间隔无关） |
| 聊天联动 | `memory/chat_words.py` + `word_planner.pick_chat_focus` | 聊天里带入弱词、用到加一点 box |
| **接口** | `api/word_routes.py` | `/api/words/*`：今日任务、判分、结算、标记掌握、朗读 |
| 例句批量生成 | `tools/gen_examples.py` | 手动运行，给词生成额外例句 |
| 手动重置 | `tools/reset_week.py` | 兜底：重置某智能体本周词表 / 当天计划 |
| **前端** | `words.html` / `css/words.css` / `js/words.js` | 状态机、录音、答题、`noteOutcome` |

---

## 2. 调度参数（全部在 `word_planner.py` 第 20~44 行）

| 参数 | 值 | 含义 |
|---|---|---|
| `WEEK_SIZE` | 30 | 每周新词数（仅参考，`word_week` 不再按它截断） |
| `WORKLOAD` | 20 | 一天总量上限（复习 + 新词） |
| `NEW_MIN` / `NEW_MAX` | 3 / 10 | 每天新词数下限 / 上限 |
| `REVIEW_MAX` | 15 | 工作日复习上限 |
| `WEEKEND_REVIEW_MAX` | 8 | 周末复习上限 |
| `PREVIEW_MAX` | 8 | 预习词上限 |
| `INTERVALS` | {1:1, 2:2, 3:4, 4:7, 5:14} | box → 下次复习间隔（**工作日**数） |
| `MASTER_BOX` | 4 | box ≥ 4 且 `mode2_ok=1` ⇒ 掌握 |
| `RATE_LOW` / `RATE_HIGH` | 0.6 / 0.9 | 昨日一次通过率阈值（低 → 新词 −2，高 → +1） |
| `STUBBORN_LAPSES` | 3 | 忘记次数 ≥ 3 ⇒ 顽固词（排最前，固定 mode 1） |
| `WEAK_LAPSES` | 2 | 周六加练：忘记次数 ≥ 2 |
| `WEAK_HARD_STREAK` | 2 | 周六加练：连续 hard ≥ 2 |
| `LAPSE_DECAY_STREAK` | 2 | 每连续答对 2 次，`lapses` −1 |
| `SATURDAY_MAX` | 10 | 周六任务总上限 |
| `CLOZE_ENABLED` / `CLOZE_MAX` | True / 6 | 填空（mode 3）开关 / 一天最多几道 |
| `CLOZE_BLANK` | `"____"` | 挖空占位符，前端按它切分 |
| `SENTENCE_ENABLED` / `SENTENCE_MAX` | True / 3 | 造句（mode 4）开关 / 一天最多几道 |
| `SENTENCE_BOX_MIN` | 3 | 造句：复习词 box ≥ 3 才有资格 |
| `SENTENCE_LOW_RATE` | 0.5 | box 3 的词有多大比例改成造句（其余留给填空） |
| `SHADOW_ENABLED` | False | 跟读（mode 5）总开关；前端上线后才改 True |
| `SHADOW_MAX` | 3 | 跟读：一天最多几道 |
| `SHADOW_BOX_MIN` / `SHADOW_BOX_MAX` | 1 / 2 | 跟读：复习词 box 范围（含两端） |
| `SHADOW_MIN_WORDS` / `SHADOW_MAX_WORDS` | 3 / 14 | 跟读：句子词数范围（`norm_pt` 后按空格数） |
| `CHAT_FOCUS_NEW` | 2 | 聊天联动里「新词」名额 |

---

## 3. 数据库表

全部在同一个 SQLite（`SQLITE_PATH`，默认 `sessions.db`）。

### 3.1 陪练自有的进度表（`word_progress_manager.py`，建表 `_SCHEMA` 第 26~71 行）

**`word_progress`**：每个智能体 × 每个词一行，**调度的核心状态**

| 列 | 含义 |
|---|---|
| `session_id`, `word_id` | 主键（智能体名 = session_id） |
| `box` | 0~5，Leitner 盒子 |
| `due_date` | 下次复习日（ISO 日期） |
| `streak` | 连续答对（good）次数 |
| `lapses` | 忘记次数（again +1，good 每连续 2 次 −1） |
| `hard_streak` | 连续 hard（答错后才对）次数 |
| `introduced_on` | 第一次学这个词的日期 |
| `last_mode` / `last_outcome` | 上次题型 / 上次结果（good/hard/again/skipped） |
| `mode2_ok` | 是否「会说」：mode 2/3/4 good 置 1；mode 2 again 置 0 |
| `mastered` | `box ≥ 4 且 mode2_ok` ⇒ 1 |
| `used_count`, `last_used_on` | 聊天联动用，后加列，不在 `_COLS` 里 |

索引：`idx_word_progress_due(session_id, mastered, due_date)`。

**`word_week`**：每周词表，首次请求时生成后固定

`(session_id, week_start, seq, word_id)`，主键 `(session_id, week_start, word_id)`。`week_start` 是 WordMemorizer 周计划的 StartDate（**周日**）。

**`word_daily_plan`**：当天计划，首次请求时生成后固定

`(session_id, plan_date, seq, word_id, kind, mode)`，主键 `(session_id, plan_date, word_id)`。`kind` 取值 `review / weekly / extra / new / preview`。

**`word_outcomes`**：每词每天只结算一次的「防重复」表

`(session_id, task_date, word_id, outcome, mode, box_before, box_after)`，主键 `(session_id, task_date, word_id)`。`yesterday_rate` 也从这里算。

### 3.2 其他相关表

| 表 | 文件 | 用途 |
|---|---|---|
| `word_task_done` | `word_task_manager.py` 第 29 行 | 每天是否完成：`rounds/total/first_pass/attempts/round_score/times`，`UNIQUE(session_id, task_date)` |
| `word_errors` | `word_error_manager.py` 第 27 行 | 每次答错一行（`pt_word/cn_meaning` 是快照，`user_text` 是识别到的话），**只记录不参与调度** |
| `word_examples` | `word_example_manager.py` 第 28 行 | 额外生成的例句：`(word_id, idx)`，`idx 0` = 词库原例句不入表，`enabled` 可停用 |
| `word_example_use` | 同上 | 每人每词上次用哪条例句，用于轮换 |

### 3.3 WordMemorizer 管理表（调度只读，`wm_manager.py` 建表）

| 表 | 调度用到的列 |
|---|---|
| `Words` | `Id, Text`(葡语词)`, ChineseMeaning, ExampleSentence, ExampleChinese, Source, Remark, ReferenceImageNumber, Scene*` 系列 |
| `WeeklyPlans` | `Id, StartDate, EndDate`：`_plan_for()` 按今天找覆盖它的计划，没有就退回最近一份已开始的 |
| `WeeklyPlanWords` | `WeeklyPlanId, WordId, AddedDate`：本周 30 词，按 `AddedDate, rowid` 排序 |
| `WordQuizRun` / `WordQuizAward` | 单词测验积分（`/words/run` 用），与调度无关 |

---

## 4. 算法分步详解

### 步骤 ① 本周词表 —— `ensure_week`

位置：`word_progress_manager.py` 第 111 行，由 `word_routes.words_today` 调用（第 140 行起）。

1. 取今天所在的周计划 StartDate：`word_source.current_plan_week_start()`（`word_source.py` 第 144 行），取不到退回周一。
2. 取该周计划的词：`word_source.list_word_ids()`（第 162 行），读 `WeeklyPlanWords`。
3. `word_week` 里已有这一周的记录就直接用（**整周固定**）。
4. 没有就生成：**往周没学完的词顺延在前**（`carry`），再接上词源里没用过的新词（`fresh`）。不设上限，所以顺延多少，本周就多多少词。

### 步骤 ② 今日计划 —— `build_today_plan`

位置：`word_planner.py` 第 247 行，纯函数。只在当天**第一次**请求 `/words/today` 时执行，结果由 `save_plan` 落到 `word_daily_plan`，之后刷新、重新学习都读这份。

**输入**：今天日期、本周词表、全部进度、昨日通过率、词文本。
**输出**：`items`（要测的词，每项 `{word_id, kind, mode}`）、`preview`（只看不测）、`meta`。

按顺序做 7 件事：

1. **到期复习（review）**
   候选 = 未掌握且 `due_date <= 今天`。
   排序键：`(lapses < 3, -priority, word_id)`，即顽固词在最前，其次按优先级。
   `priority = 逾期天数 + 2×lapses + (5 − box)`（第 223 行）。
   取前 `REVIEW_MAX`（工作日 15 / 周末 8）个。每个词的 mode 由 `choose_mode` 决定（见 §5）。
2. **周六加练（extra）**，仅周六
   候选 = 未掌握、不在今天复习里，且满足任一：`lapses ≥ 2` / `last_outcome == again` / `hard_streak ≥ 2`。
   排序：顽固词 → 上次 again → lapses 多 → hard_streak 多 → box 低 → word_id。
   取前 `10 − 已有条数` 个。
3. **周五本周回顾（weekly）**，仅周五
   候选 = 本周词表里、未掌握、`box < 4`、且今天没被选进复习的词。**mode 固定为 2**（看中文说葡语）。
4. **新词（new）**
   `pending` = 本周词表里还没进 `word_progress` 的词。
   每天配额 `calc_new_quota`（第 229 行）：`ceil(剩余新词 / 本周剩余工作日)` 为基准；昨日通过率 < 0.6 → −2，> 0.9 → +1；再受「`20 − 已有复习数`」限制；最后夹在 3~10。周末为 0。
   mode 由 `assign_new_modes`（第 184 行）决定。
5. **预习（preview）**
   周日：本周全部 `pending`（只看不测）。工作日：把「明天大概要学」的几个（≤ 8）摆出来。
6. **造句（mode 4）后处理**（详见 §5.3）
7. **填空限量后处理**
   所有 `mode == 3` 的条目：若 `kind != review` 或已超过 `CLOZE_MAX`，一律降为 `mode 2`。

测试顺序：复习 → 回顾 → 新词；预习最后。

### 步骤 ③ 展开成题目 —— `_load_words`

位置：`word_routes.py` 第 67 行。把 `{word_id, kind, mode}` 展开成前端要的单词对象。

- 从 `word_source.get_word` 取词文本；词库里找不到的词跳过并记 warning。
- **mode 3**：
    - 没有生成例句 → 用词库原例句 `make_cloze` 挖空；**挖不出空就把 mode 降为 2**（不回写计划表，每次读取重新判定）。
    - 有生成例句 → 候选池 = 原例句(idx 0) + 启用的生成例句，读取时逐条 `make_cloze` 重新校验；`pick_example` 轮换（同一天稳定）；池为空才降级为 2。选中后写 `word_example_use`。
- 例句表读取异常一律吞掉并退回只用原例句，绝不让 `/today` 失败。

### 步骤 ④ 答题与判分 —— `/words/evaluate`

位置：`word_routes.py` 第 390 行。FormData：`audio, word_id, mode`。

| mode | 题型 | ASR 语言 | 判分 |
|---|---|---|---|
| 1 | 看葡语，说中文 | zh | `_judge_zh`（第 332 行）：义项精确匹配 → LLM 语义判 |
| 2 | 看中文，说葡语 | pt | `_judge_pt`（第 265 行）规则（归一化、相似度 0.85、长词近似 0.80）→ `_judge_pt_llm`（第 344 行） |
| 3 | 句子填空，说缺的词 | pt | `_judge_pt_cloze`（第 357 行）：规则 → 逐词规则 → LLM |
| 4 | 造句 | pt | `_judge_sentence`（第 369 行），返回纠正后的句子 |

录音 ≥ `WORD_MAX_AUDIO_SIZE`（10 MB）返回 413；没听清返回 422，**不算答错**。

### 步骤 ⑤ 当天结果 outcome —— 前端 `noteOutcome`

位置：`words.js` 第 631 行。**只记每个词第 1 轮的结果**，后面翻转方向重测不改。

```
outcome =
   点了「公布答案」 或 AI 判错 ≥ 2 次  → again
   答错后重试才对                        → hard
   一次答对                              → good
   点了「跳过」                          → skipped
```

相关前端位置：

| 内容 | `words.js` 位置 |
|---|---|
| `SKIP_AFTER = 2` | 第 189 行 |
| mode 白名单 `[1,2,3,4]`、`fetchToday` | 第 506~508 行 |
| `begin()` 开始一遍测试 | 第 512 行 |
| 周日以测代看 `beginSun` / `sunMode` | 第 197~204、521 行 |
| `finish()` 提交 `/words/complete` | 第 561~571 行 |
| 第 1 轮结束后翻转方向 | 第 582~588 行（`3→1, 4→2, 1→2, 2→1`） |
| `retry()` | 第 604 行 |
| 跳过 `noteOutcome(w,'skipped')` | 第 612 行 |
| 「我已掌握」→ `/words/mark_mastered` | 第 622 行 |
| `markMissed` | 第 636 行 |
| 填空渲染 `viewCloze` | 第 283 行 |
| 开始测验积分 `/words/run` | 第 44 行 |

### 步骤 ⑥ 结算 —— `/words/complete` → `settle` → `apply_outcome`

- 接口：`word_routes.py` 第 205 行。服务端 `total` 取计划里的词数，**不信前端**；结算异常只记日志，不影响「完成」记录。
- `settle`：`word_progress_manager.py` 第 254 行。
    - 只认今天计划里的词（`allowed`），不信前端传的 id。
    - 已掌握的词直接跳过。
    - `INSERT OR IGNORE INTO word_outcomes`，**插入成功才更新进度**，所以同一词同一天只结算一次。重新学习再提交会被忽略。
- `apply_outcome`：`word_planner.py` 第 103 行，真正的升降规则：

| outcome | box | lapses | hard_streak | streak | 下次到期 |
|---|---|---|---|---|---|
| good | +1（≤5） | `streak % 2 == 0 且 lapses>0` 时 −1 | 清零 | +1 | `add_workdays(今天, INTERVALS[box])` |
| hard | 不降，至少 1 | 不变 | +1 | 清零 | 同上 |
| again | −2，至少 1 | +1 | 清零 | 清零 | **下一个工作日** |
| skipped | 不变，至少 1 | 不变 | 不变 | 不变 | 同 good 的间隔公式 |

附带规则：

- `mode in (2, 3, 4)` 且 good ⇒ `mode2_ok = 1`。
- `mode == 2` 且 again ⇒ `mode2_ok = 0`。mode 3 答错**不会**清 `mode2_ok`。
- `mastered = (box ≥ 4 且 mode2_ok)`。
- 手动「我已掌握」：`master_row`（第 140 行）直接 box 5、`mode2_ok=1`、`mastered=1`。

### 间隔与日期

`add_workdays` / `next_workday`（`word_planner.py` 第 78、85 行）**跳过周末**。「今天」= 服务器本地日期 `word_task_manager.today_str()`。

---

## 5. 题型怎么选（mode 1/2/3/4）

### 5.1 新词的 mode —— `choose_new_mode` / `assign_new_modes`（第 172、184 行）

按词形偏向：短词（≤5 字母）p(mode 2) = 0.18；长词/短语/连字符长词 p = 0.82；其余 0.48。再用 `_mix01(word_id, 词)` 做稳定伪随机（同一词同一天结果不变，不依赖 `PYTHONHASHSEED`）。一批 ≥ 4 个词若全抽成同一方向，隔一个翻掉。

### 5.2 复习词的 mode —— `choose_mode`（第 194 行）

从上到下，命中第一条就返回：

1. `lapses ≥ 3`（顽固）或 `last_outcome == "again"` → **mode 1**（回到最容易的题）
2. `CLOZE_ENABLED` 且 **`box == 3` 且 `last_outcome == "good"`** → **mode 3（填空）**
3. `box ≥ 2`：上次 good → **mode 2**，否则 → **mode 1**
4. 其余（box 0/1）→ 同新词，`choose_new_mode`

### 5.3 造句（mode 4）后处理（`build_today_plan` 内，第 301~323 行）

候选：未掌握、非顽固、上次非 again，且满足其一：

- `kind == review` 且 `box ≥ 3`；其中 **box 3 的词按 `_mix01(word_id, "sent"+日期) ≥ 0.5` 的稳定概率「留给填空」**，其余才成为造句候选。
- `kind == extra`（周六加练）。

排序：`box ≥ 4` 的复习词优先；取前 `SENTENCE_MAX = 3` 个改为 mode 4。**这一步发生在填空限量之前**，所以被改成 4 的词不再占填空名额。

---

## 6. 一周节奏

| 日 | 内容 |
|---|---|
| 周日 | 新一周词表已生成，全部 `preview`，**只看不记进度**（前端有「以测代看」sunMode，也不提交服务器） |
| 周一~周四 | 到期复习（≤15）→ 新词 → 预习明天的词 |
| 周五 | 复习 → **本周回顾**（本周未掌握的词再测一遍 mode 2）→ 新词 → 预习 |
| 周六 | 无新词；到期复习（≤8）+ 加练，总数 ≤10；没有弱词时就是休息日（`/complete` 对空计划返回 422） |

---

## 7. 聊天联动（调度的旁路）

- 目标词选择：`word_planner.pick_chat_focus`（第 208 行）。排序键 `(-lapses, last_outcome != again, -hard_streak, box, word_id)`，加最多 2 个本周还没测过的新词。
- 本周词表：`word_progress_manager.get_latest_week_ids`（第 143 行，取 `word_week` 里 `week_start` 最大的一周）。
- 加分：`credit_chat_use`（第 157 行）。每词每天最多生效一次；**只有 box ≤ 2 才 +1，封顶 3，聊天绝不让词毕业**；不动 `due_date/lapses/streak/last_outcome/mode2_ok/mastered`。
- 调用点：`api/routes.py` 第 255 行（`pick_focus`）、第 303 行（`detect_and_credit`）。
- 开关：`.env` 里 `CHAT_WORD_LINK=0` 关闭，`CHAT_WORD_N` 控制目标词个数。

---

## 8. 接口一览（`api/word_routes.py`，前缀 `/api/words`）

| 接口 | 行号 | 作用 |
|---|---|---|
| `GET /today?session_id=` | 140 | 生成/读取当天计划，返回 `words / preview / meta / completed` |
| `POST /run` | 191 | 开始/重开一次测验积分 run（`WordQuizRun`） |
| `POST /evaluate` | 390 | 语音判分（mode 1/2/3/4） |
| `POST /scene/evaluate` | 455 | 场景点选判分（不再接收音频） |
| `POST /record_error` | 504 | 写 `word_errors`（公布答案/答错时） |
| `POST /complete` | 205 | 结算进度 + 记完成 + 结束 run |
| `POST /mark_mastered` | 520 | 手动标记已掌握 |
| `GET /{id}/audio` | 532 | 朗读单词/例句（只按 id 取服务端文本） |
| `GET /source-image/{n}` | 55 | 单词来源图片 |

---

## 9. 为什么 mode 3（填空）出现得晚、出现得少

这是**设计结果，不是 bug**。我用真实的 `word_planner.py` 做过模拟（答对率分别约 90% / 80% / 65%，各 40 次，6 周）：

**入口很窄**：必须同时满足 `kind=review` + `box==3` + `last_outcome==good` + 非顽固。

**到达 box 3 要时间**：间隔依次是 1、2、4 个工作日。即使每次都一次答对，周一学的词要到**下周四**才第一次以 mode 3 出现。模拟里首次出现是第 10~12 天。

**被分流或绕过**（词从 box 3 升到 box 4 那天的题型占比，答对率约 80%）：

| 那天的题型 | 约占 |
|---|---|
| mode 3 填空 | 45% |
| mode 4 造句（box 3 约一半分给造句） | 39% |
| 周五「本周回顾」固定 mode 2，直接把 box 3 推过毕业线 | 10% |
| mode 1（上次是 hard） | 5% |

**其他损耗**：
- 例句里是动词变位/复数的词挖不出空，降级为 mode 2（词库实测约 22%）。
- `hard`（答错后重试才对）不升 box，还会让该词走 mode 1。
- 模拟里约一半「已掌握」的词从没做过一次填空，和「毕业前必过填空」的设想有出入。

**重复测试没有用**：同一词同一天只结算一次（`word_outcomes` 唯一键），当天计划也固定，只有日历上的工作日推进才会让词到期。

### 可调方案（均未实施）

| 方案 | 改哪里 |
|---|---|
| A. 填空入口提前到 box 2 | `word_planner.py` 第 201 行 `int(row["box"]) == 3` 改为 `>= 2` |
| B. 减少造句分流 | `SENTENCE_LOW_RATE` 0.5 → 0.3 |
| C. 堵周五绕过 | `build_today_plan` 的周五回顾段（第 277~285 行），box 3 的词改用 mode 3 |
| D. 回退填空 | `CLOZE_ENABLED = False` 重启 |

改调度规则前，建议先用纯函数造几个 row，跑 `apply_outcome` + `build_today_plan` 模拟，确认再上线（与本文档第 9 节模拟方法相同）。

---

## 10. 排查用 SQL

把 `'你的智能体名'` 换成实际名称。

```sql
-- 1) 每个未掌握词的状态：谁在 box 2/3、什么时候到期
SELECT word_id, box, due_date, last_outcome, lapses, hard_streak, mode2_ok, mastered, introduced_on
FROM word_progress
WHERE session_id = '你的智能体名'
ORDER BY mastered, box DESC, due_date;

-- 2) 哪些词「下一次会出填空」（box 3 且上次 good）
SELECT word_id, due_date FROM word_progress
WHERE session_id = '你的智能体名' AND mastered = 0 AND box = 3 AND last_outcome = 'good'
ORDER BY due_date;

-- 3) 历史上每天出过哪些题型
SELECT plan_date, kind, mode, COUNT(*) FROM word_daily_plan
WHERE session_id = '你的智能体名'
GROUP BY plan_date, kind, mode ORDER BY plan_date;

-- 4) 实际结算记录：看哪天哪个词从 box几 升到 box几
SELECT task_date, word_id, outcome, mode, box_before, box_after FROM word_outcomes
WHERE session_id = '你的智能体名' ORDER BY task_date, word_id;

-- 5) 哪些词是在没做过填空的情况下毕业的（mode 3 从未出现在 word_outcomes）
SELECT p.word_id FROM word_progress p
WHERE p.session_id = '你的智能体名' AND p.mastered = 1
  AND NOT EXISTS (SELECT 1 FROM word_outcomes o
                  WHERE o.session_id = p.session_id AND o.word_id = p.word_id AND o.mode = 3);
```

---

## 11. 维护注意事项

- **改字段 = 前后端一起改**：`WordItem` 字段、`mode` 取值、`outcomes` 结构在 `word_source.py`、`word_routes.py`、`words.js` 三处要一致。
- **新增列照既有模式**：`word_progress_manager.init_db()` 用 `PRAGMA table_info` 检测缺列自动 `ALTER TABLE`，旧库不需要删。
- **备份**：必须用 `tools/backup_db.py`（SQLite backup API），不要直接复制 `.db`（WAL 开启）。
- **别顺手放宽的设计**：聊天联动封顶 box 3；`validate_example` 不要为了通过而放宽；`settle` 只认服务端计划里的词。

---

## 12. 跟读题（mode 5）

听一遍整句 → 复述（录音只转文字，可改字）→ 提交后服务端用**自己取的原句**做词级比对（纯规则，不调 LLM；判分见 `memory/shadow_judge.py`）。

- **出题条件**（`build_today_plan` 末尾的后处理，仅 `SHADOW_ENABLED=True` 时执行）：
  `kind == "review"`、当前 mode 为 1 或 2（已被改成 3 / 4 的不碰）、未掌握、`SHADOW_BOX_MIN ≤ box ≤ SHADOW_BOX_MAX`（1~2）。
  **顽固词（`lapses ≥ STUBBORN_LAPSES`）和上次 `again` 的词也有资格，并且优先抽中**（跟读比回忆容易，适合拿来巩固它们）；其余词按稳定随机顺序补满名额。
  新词、周五回顾（weekly）、周六加练（extra）这一版**不出**。
- **每日上限**：`SHADOW_MAX = 3`。候选先按「顽固 / 上次 again 优先」，再按 `_mix01(word_id, "shadow" + 日期)` 升序取前几个：同一天重复生成结果相同，换一天换不同的词。
- **句子来源与降级**（`word_routes._load_words`）：候选池 = 词库原例句（idx 0）+ 启用的生成例句，只留词数在 3~14 之间的（**不要求能挖空**），用 `pick_example` 轮换（与填空共用 `word_example_use`）。池为空 → 该词降级为 mode 2（不带 `ex`，不回写计划表）。mode 5 的词不带 `cloze`。
- **进度结算**：照常走 `settle` / `apply_outcome`；**mode 5 答对不会置位 `mode2_ok`**（`apply_outcome` 只对 mode 2 / 3 / 4 置位，故意不改）。答对按葡语题给积分。
- **失败后的重测方向**：5 → 1（前端处理，见前端第 3 步）。
- **回退**：`SHADOW_ENABLED = False` 后重启。当天已落库的计划不变；已落库的 mode 5 在后端仍能正常展开，但**前端若是旧版会过滤掉 mode 5**，所以关开关前不要回退前端。
- **排查**：`SELECT plan_date, word_id, kind, mode FROM word_daily_plan WHERE session_id='…' AND mode=5;`