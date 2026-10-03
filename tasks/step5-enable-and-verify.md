# 步骤 5/5:打开开关 + 端到端验证 + 更新 skill

## 背景(只需要知道这些)
葡语学习网页的单词任务新增了题型 **mode 3 = 句子填空**。前面四步已完成:
- 步骤 1:`memory/word_planner.py` 有 `make_cloze`、`CLOZE_BLANK`、`CLOZE_MAX`。
- 步骤 2:调度规则已写好,但总开关 `CLOZE_ENABLED = False`(关闭)。
- 步骤 3:后端能接收 mode 3、构造 `cloze`、评判。
- 步骤 4:前端能渲染填空题。

**本步:把开关打开,并验证整条链路。这是唯一会让功能"上线"的一步。**

## 要附的文件
`memory/word_planner.py`(步骤 2 的产物)、`SKILL.md`(项目的 skill 文档,没有就不附)

## 只读这两个文件。

## 任务

### A. 前置检查(任何一项不满足就**停下**,不要改开关,把缺什么告诉用户)
让用户确认以下脚本都已经跑过并通过(AI 如果能运行就自己跑):
```
python tools/check_cloze.py     # 覆盖率 ≥ 50%
python tools/test_step2.py      # 步骤2测试全部通过
python tools/test_step3.py      # 步骤3测试全部通过
python tools/test_step4.py      # 步骤4测试全部通过
```

### B. 打开开关
`memory/word_planner.py` 里把 `CLOZE_ENABLED = False` 改成 `True`,注释改成 `# 句子填空总开关：True=开启；出问题改回 False 重启即可回退，其余代码不用动`。**只改这一处。**

### C. 新建端到端模拟脚本 `tools/test_step5.py`(**完整输出**)
纯 Python,不启动服务器。`sys.path.insert(0, 项目根目录)`,`from memory import word_planner as P`。`assert`,全部通过打印 `步骤5测试全部通过`。

**场景 1:单词毕业路径必过句子关。** 模拟一个新词,从 2026-09-28(周一)开始,每个工作日都"答对"(`good`),每天:用当天的进度调用 `P.choose_mode(row, "casa")` 得到 mode,再 `P.apply_outcome(row, 1, "good", mode, 当天)`;只在该词**到期**那天测试(`due_date <= 当天`)。循环到 `mastered == 1` 或 60 天为止。断言:
- 最终 `mastered == 1`;
- 记录下它经历过的所有 mode 序列,**其中至少出现过一次 3**(毕业前过了填空关);
- 出现 3 的那次,当时的 `box == 3`。

**场景 2:开关关闭时完全回到旧行为。** `P.CLOZE_ENABLED = False` 后重跑场景 1,mode 序列里**没有 3**,且词仍能毕业。(测完把开关恢复成 `True`。)

**场景 3:限量。** 工作日(2026-09-30)有 10 个到期复习词,全是 box=3、last_outcome="good"、lapses=0、未掌握。`build_today_plan` 后 `mode==3` 的条目数 == `P.CLOZE_MAX`。

**场景 4:周六不出填空。** 周六(2026-10-03)有若干弱词(lapses=2、box=3、last="good"),计划里 `kind=="extra"` 的条目没有 `mode==3`。

**场景 5:新词不出填空。** 周一(2026-09-28)的计划里 `kind=="new"` 的条目 mode 都 ∈ {1,2}。

> `build_today_plan` 的参数多于 `(today, week_ids, progress)` 时,看函数签名给多出的参数传合理默认值。

### D. 更新 `SKILL.md`(如果用户附了)
只做最小改动,在"单词任务"相关的几处补充(找不到对应小节就加在最接近的位置):
1. **调度参数表**增加两行:`CLOZE_ENABLED`(句子填空总开关,True)、`CLOZE_MAX`(6,一天最多几道填空题)。
2. **结果判定表下面的说明**补一句:mode 3(填空)答对也会置 `mode2_ok=1`;mode 3 答错**不会**清 `mode2_ok`。
3. 新增一小节「句子填空(mode 3)」,内容(照抄要点,不要扩写):
   - 定义:显示挖空例句(`____`)+ 中文翻译 + 提示,用户只说缺的词;不自动朗读、无喇叭。
   - 出题规则:仅 `kind=review`;`choose_mode` 在「顽固/上次 again → 1」之后、「box≥2」之前,`box==3 且 last_outcome=="good"` → 3;一天最多 `CLOZE_MAX` 个;非 review 的 mode 3 一律降为 2。
   - 挖空:`word_planner.make_cloze(sentence, pt_word)`,只做整词精确匹配、忽略大小写、去掉 `pt_word` 里的括号备注,只换第一处;`word_routes._load_words` 里对 mode 3 构造 `cloze`,**找不到就把该词 mode 降为 2 且不带 `cloze`**(不回写计划表)。
   - 评判:`_judge_pt_cloze` = 规则 → 逐词规则 → `_judge_pt_llm`;ASR 与 mode 2 一样用葡语。
   - 前端:`fetchToday` 的 mode 白名单为 `[1,2,3]`;`viewCloze` 渲染;下一轮翻转 `3→1, 1→2, 2→1`。
   - 接口:`/words/today` 的 `words[].mode` 可为 3 并带 `cloze`;`/words/evaluate`、`/words/complete`、`/words/record_error` 的 `mode` 取值 `1|2|3`。
   - 回退:`CLOZE_ENABLED=False` 重启即可,不用动其他代码。
   - 已知取舍:"掌握前必过填空"是概率保证(box 3 且 last 非 good 时走 mode 1 可绕过);动词变位/复数的词会降级回 mode 2。
4. **"已知简化 / 别顺手修复"** 一节补一条:填空只做精确匹配,模糊匹配(共享前缀 + 相似度)是未做的后续项。

## 不要做
- 不要改除 `CLOZE_ENABLED` 以外的任何代码。
- 不要实现聊天联动、造句、多例句等后续功能。
- 不要为了让测试通过而改步骤 2/3/4 的逻辑;测试不过就如实报告哪一条、什么原因。

## 交付格式
1. 改后的 `memory/word_planner.py`(只有开关一行的改动,可只给那一行)。
2. 完整的 `tools/test_step5.py`。
3. 改后的 `SKILL.md`(完整文件,若用户附了)。
4. **最终报告**(给用户看,5 行内):
```
步骤5完成，句子填空已开启。
- 前置脚本：<都通过 / 哪个没过>
- 端到端测试：<5 个场景全部通过 / 哪个没过>
- 覆盖率：<用户在步骤1得到的比例，不知道就写"未提供">
- 回退方法：memory/word_planner.py 里 CLOZE_ENABLED 改回 False 并重启
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_step5.py` 打印 `步骤5测试全部通过`,且开关为 `True`。

## 上线后用户该观察什么(AI 把这段原样放进最终报告末尾)
- 进入单词页,约在词进入 box 3 之后会看到 🧩 填空题;每天最多 6 题。
- 填空题没有喇叭、不自动朗读;答错后下一轮会变成"看葡语说中文"。
- 如果发现某些词总是出不了填空(句子里是变位/复数形式),这是预期行为,说明该词被自动降级回普通题;大量出现时再考虑做模糊匹配。
