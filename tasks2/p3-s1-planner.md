# P3 步骤 1/3:调度规则——何时出造句题 mode 4(**开关默认关闭**)

## 背景(只需要知道这些)
葡语学习网页的单词任务里,每个词有测试方向 `mode`:`1`=看葡语说中文,`2`=看中文说葡语,`3`=句子填空(已上线)。要新增 **`mode 4` = 造句**:给出目标词,用户用它说一整句葡语,由 LLM 评判(后续步骤做)。
每个词有熟练度 `box`(0~5);`box >= 4` 且会说(`mode2_ok`)= 掌握(`mastered`)。`last_outcome`:`good/hard/again/skipped`。计划条目是 `{word_id, kind, mode}`,`kind`:`review` 复习 / `weekly` 周五回顾 / `extra` 周六加练 / `new` 新词。
**本步只改调度规则(纯函数),加开关 `SENTENCE_ENABLED`,默认 `False`。关闭时行为和改动前完全一样。** 后端、前端还不支持 mode 4,所以绝对不能默认打开。

## 要附的文件
`memory/word_planner.py`(第一阶段产物,已含 `make_cloze`、`CLOZE_*`、`build_today_plan` 末尾的填空限量后处理)

## 只读这个文件。定位用 grep 锚点,不要信行号。CRLF 保持。

## 任务

### A. 顶部常量区新增(放在 `CLOZE_ENABLED` 之后)
```python
SENTENCE_ENABLED = False   # 造句（mode 4）总开关：后端/前端都支持 mode 4 之后（P3 步骤 3）才改成 True
SENTENCE_MAX = 3           # 造句：一天最多几道
SENTENCE_BOX_MIN = 4       # 造句：复习词 box ≥ 此值（且未掌握）才出
```

### B. `apply_outcome`(锚点:`def apply_outcome`)
good 分支里 `if mode in (2, 3):  r["mode2_ok"] = 1` → 改成 `if mode in (2, 3, 4):`(用目标词造出句子,说明"会说")。
**again 分支不动**(`if mode == 2:` 保持原样:mode 3、4 答错都不清掉之前的"会说"证明)。其余一律不动。
docstring / 注释里涉及 mode 列表的地方顺手补 `4=造句`。

### C. `build_today_plan`(锚点:`def build_today_plan`)
在 `items` 已经包含 review / extra / weekly / new 全部条目之后,**在现有"句子填空限量"后处理(`n3 = 0` 那一段)之前**,新增一段后处理(不改 `meta`):
```python
    # 造句（mode 4）：只给 ① box ≥ SENTENCE_BOX_MIN 且未掌握的复习词 ② 周六加练词；一天最多 SENTENCE_MAX 道。
    # 顽固词 / 上次 again 的词不出（它们要先回到最容易的题）。必须放在填空限量之前：被改成 4 的条目不再占填空名额。
    if SENTENCE_ENABLED:
        n4 = 0
        for it in items:
            if n4 >= SENTENCE_MAX:
                break
            r = progress.get(it["word_id"])
            if not r or r["mastered"]:
                continue
            if int(r["lapses"]) >= STUBBORN_LAPSES or r.get("last_outcome") == "again":
                continue
            if it["kind"] == "extra" or (it["kind"] == "review" and int(r["box"]) >= SENTENCE_BOX_MIN):
                it["mode"] = 4
                n4 += 1
```
按 `items` 现有顺序取前 `SENTENCE_MAX` 个符合条件的(复习在前、加练在后)。`weekly` / `new` 永远不出 mode 4。

**不要改** `choose_mode`、`choose_new_mode`、`assign_new_modes`、`make_cloze`、填空限量那段、复习间隔、box 升降、周六加练规则。不要碰 `word_routes.py` 等其他文件。

## 要新建的测试脚本 `tools/test_p3s1.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`,`from memory import word_planner as P`。用 `assert`,全部通过打印 `P3步骤1测试全部通过`。**每个用例开头显式设置 `P.CLOZE_ENABLED = True`**,`SENTENCE_ENABLED` 按用例设;测完把两个开关恢复成进入时的值。
辅助:`row(box, last="good", lapses=0, word_id=1, due="2026-09-01", mode2_ok=0, hard=0, mastered=0)` 返回完整进度 dict(字段:`word_id, box, due_date, streak, lapses, hard_streak, introduced_on, last_mode, last_outcome, mode2_ok, mastered`)。`build_today_plan` 若参数比 `(today, week_ids, progress)` 多,看签名传合理默认值(`yesterday_rate=None, word_text={}`)。工作日用 2026-09-30(周三),周六用 2026-10-03,周五用 2026-10-02。

| # | 场景 | 期望 |
|---|---|---|
| 1 | `SENTENCE_ENABLED=False`:周六 5 个弱词(lapses=2,box=2,due 在未来 2026-10-12),另有周三 box=4 的复习词 | 周六、周三的计划里都没有 `mode==4` |
| 2 | 开关开,周六 5 个弱词(同上) | `kind=="extra"` 且 `mode==4` 的恰好 `SENTENCE_MAX`(3)个,其余 2 个 `mode!=4` |
| 3 | 开关开,周六弱词里:一个 `lapses=3`(顽固),一个 `last="again"`,3 个正常弱词 | 前两个从不是 4;正常的 3 个有 3 个是 4 |
| 4 | 开关开,周三 5 个到期复习词:box=4、`mastered=0`、`mode2_ok=0`、last=good、lapses=0、due 在今天之前 | `mode==4` 的恰好 3 个,都是 `kind=="review"` |
| 5 | 开关开,周三到期复习词 box=3、last=good | 仍然是 `mode==3`(填空),没有 4;填空数 ≤ `CLOZE_MAX` |
| 6 | 开关开,周三:2 个 box=4 未掌握复习词(会变 4)+ 9 个 box=3 good 复习词(会变 3) | 4 的有 2 个;3 的恰好 `CLOZE_MAX`(6)个——造句不占填空名额,填空也不占造句名额 |
| 7 | 开关开,周三 box=2 的复习词、`weekly`(周五)条目、`new` 条目 | 全都不是 4 |
| 8 | 开关开,`mastered=1` 的词 | 不会被选(`build_today_plan` 本就不含已掌握词,这里直接断言计划里没有它) |
| 9 | `apply_outcome(row(box=4,mode2_ok=0), 1, "good", 4, 某工作日)` | `mode2_ok==1`、`last_mode==4`、`box==5`、`mastered==1` |
| 10 | `apply_outcome(row(box=3,mode2_ok=1), 1, "again", 4, 某工作日)` | `mode2_ok==1`(没被清),`last_mode==4` |
| 11 | `apply_outcome(row(box=3,mode2_ok=1), 1, "again", 2, 某工作日)` | `mode2_ok==0`(原行为不变) |
| 12 | `choose_mode` 在开关开/关两种状态下对 box=3,good 的行 | 开→3,关→2(第一阶段行为不变);任何情况下 `choose_mode` 都不返回 4 |

另外**运行已有的** `tools/test_step2.py` 和 `tools/test_step5.py`,确认仍然全部通过(默认 `SENTENCE_ENABLED=False`)。

## 交付格式
1. 改后的 `memory/word_planner.py`(完整文件,或只给新增常量、`apply_outcome` 的一行改动、`build_today_plan` 的新增段,按总览里的"两种输出方式")。
2. 完整的 `tools/test_p3s1.py`。
3. **交接备注**:
```
P3步骤1完成。
- 改动：word_planner.py 新增 SENTENCE_ENABLED(=False)/SENTENCE_MAX/SENTENCE_BOX_MIN；apply_outcome good 分支 mode in (2,3,4)；build_today_plan 新增造句后处理（填空限量之前）；新增 tools/test_p3s1.py
- 测试：<12 条全部通过 / 哪几条没过>；test_step2/test_step5 回归：<通过/不通过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_p3s1.py` 打印 `P3步骤1测试全部通过`,且 `SENTENCE_ENABLED` 仍为 `False`。
