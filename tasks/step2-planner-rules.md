# 步骤 2/5:调度规则——何时出填空题(**开关默认关闭**)

## 背景(只需要知道这些)
项目是葡语学习网页。单词任务里每个词有一个"测试方向"`mode`:`1`=看葡语说中文,`2`=看中文说葡语。要新增 `mode 3` = **句子填空**(显示挖空例句,用户说缺的那个词)。
每个词有熟练度 `box`(0~5);`box >= 4` 且说葡语答对过 = "掌握"毕业。`last_outcome` 是上次结果:`good`/`hard`/`again`/`skipped`。
**本步只改调度规则(纯函数),并加一个开关 `CLOZE_ENABLED`,默认 `False`。开关关闭时,所有行为必须和改动前完全一样。** 后端和前端还没支持 mode 3,所以绝对不能默认打开。

## 要附的文件
`memory/word_planner.py`(步骤 1 的产物,已含 `CLOZE_BLANK`、`CLOZE_MAX`、`make_cloze`)

## 只读这个文件。定位用下面的 grep 锚点。

## 任务

### A. 顶部常量区新增开关
```python
CLOZE_ENABLED = False     # 句子填空总开关：后端/前端都支持 mode 3 之后（步骤 5）才改成 True
```
(`CLOZE_MAX` 步骤 1 已加,不要重复添加。)

### B. `choose_mode(row, pt_word=None)`(锚点:`def choose_mode`)
当前逻辑顺序:
1. `not row` → `choose_new_mode(0, pt_word)`
2. `lapses >= STUBBORN_LAPSES` 或 `last_outcome == "again"` → `1`
3. `box >= 2` → `2 if last_outcome == "good" else 1`
4. 其余 → `choose_new_mode(...)`

**只在第 2 条和第 3 条之间插入一条:**
```python
    if CLOZE_ENABLED and int(row["box"]) == 3 and row.get("last_outcome") == "good":
        return 3                        # 句子填空：box 3 再答对就升到 4（掌握线），毕业前必过一次句子关
```
其余分支原样不动。docstring 里补一句 `3=句子填空（看挖空例句，说缺的词）`。

### C. `apply_outcome`(锚点:`def apply_outcome`)
该函数里有两处 `if mode == 2:`:
- **`good` 分支里的**(原来是 `if mode == 2: r["mode2_ok"] = 1`)→ 改成 `if mode in (2, 3): r["mode2_ok"] = 1`。(在句子里能说出这个词,说明已经"会说"。)
- **`again` 分支里的**(原来是 `if mode == 2: r["mode2_ok"] = 0`)→ **保持不变**(mode 3 答错不清掉之前的"会说"证明)。

其余(box、lapses、hard_streak、streak 的计算,`last_mode = mode`,`mastered` 判定)**一律不动**。

### D. `build_today_plan`(锚点:`def build_today_plan`)
在 `items` 已经包含 review / extra / weekly / new **全部条目之后、函数 return 之前**,加一段后处理(不改 `meta` 的计数):

```python
    # 句子填空限量：只给复习词出，且一天最多 CLOZE_MAX 道；其余降级为 mode 2
    n3 = 0
    for it in items:
        if it["mode"] != 3:
            continue
        if it["kind"] != "review" or n3 >= CLOZE_MAX:
            it["mode"] = 2
        else:
            n3 += 1
```
(`items` 里的元素是 `{word_id, kind, mode}` 字典。)

## 不要做
- 不要把 `CLOZE_ENABLED` 设成 `True`。
- 不要改 `choose_new_mode` / `assign_new_modes`(新词永远不会是 mode 3)。
- 不要改复习间隔、box 升降、周六加练规则。
- 不要碰 `word_routes.py` 等其他文件。

## 要新建的测试脚本 `tools/test_step2.py`(**完整输出**)
脚本放在项目 `tools/` 下,开头 `sys.path.insert(0, 项目根目录)`,`from memory import word_planner as P`。**不用任何测试框架,用 `assert`,全部通过打印 `步骤2测试全部通过`**。

构造行的辅助:一个 `row(box, last="good", lapses=0, **kw)` 函数返回完整的进度 dict(字段:`word_id, box, due_date, streak, lapses, hard_streak, introduced_on, last_mode, last_outcome, mode2_ok, mastered`)。

| # | 场景 | 期望 |
|---|---|---|
| 1 | `P.CLOZE_ENABLED = False`:box=3,last=good,lapses=0 | `choose_mode(row, "casa") == 2`(和改动前一样,开关关闭不出 3) |
| 2 | `P.CLOZE_ENABLED = True`:box=3,last=good | `== 3` |
| 3 | 开关开:box=3,last="hard" | `== 1` |
| 4 | 开关开:box=3,last=good,lapses=3 | `== 1`(顽固词优先) |
| 5 | 开关开:box=3,last="again" | `== 1` |
| 6 | 开关开:box=2,last=good | `== 2` |
| 7 | 开关开:box=4,last=good | `== 2` |
| 8 | 开关开:`choose_mode(None, "casa")`(新词) | 结果 ∈ {1, 2},不是 3 |
| 9 | `apply_outcome(row(box=3,last="good"), 1, "good", 3, 某工作日)` | 返回 `mode2_ok == 1`、`last_mode == 3`、`box == 4`、`mastered == 1` |
| 10 | `apply_outcome(mode2_ok=1 的行, 1, "again", 3, 某工作日)` | `mode2_ok == 1`(没被清) |
| 11 | `apply_outcome(mode2_ok=1 的行, 1, "again", 2, 某工作日)` | `mode2_ok == 0`(原行为不变) |
| 12 | 开关开,某个**工作日**(如 2026-09-30 周三)的计划:进度里有 9 个到期复习词,全部 box=3、last=good、lapses=0、`mastered=0`、due 在今天之前 | 计划里 `kind=="review"` 且 `mode==3` 的恰好 `CLOZE_MAX`(6)个,其余 3 个 `mode==2` |
| 13 | 开关开,**周六**(2026-10-03)的计划:有弱词(lapses=2)且 box=3、last=good | `kind=="extra"` 的条目没有一个 `mode==3` |
| 14 | 开关**关**,同第 12 条数据 | 计划里没有任何 `mode==3` |

> `build_today_plan` 的参数如果比 `(today, week_ids, progress)` 多,看函数签名给多出来的参数传合理默认值(如词文本字典传 `{}`)。第 12、13 条的 `week_ids` 传这些词的 id 列表。

## 交付格式
1. 改后的 `memory/word_planner.py`(完整文件,或只给改动的 `choose_mode`、`apply_outcome` 的改动处、`build_today_plan` 的新增段 + 新增常量,按总览里的"两种输出方式")。
2. 完整的 `tools/test_step2.py`。
3. **交接备注**:
```
步骤2完成。
- 改动：word_planner.py 新增 CLOZE_ENABLED(=False)；choose_mode 新增 box==3 分支；apply_outcome good 分支 mode in (2,3)；build_today_plan 末尾新增限量后处理；新增 tools/test_step2.py
- 测试：<14 条全部通过 / 哪几条没过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_step2.py` 打印 `步骤2测试全部通过`。
