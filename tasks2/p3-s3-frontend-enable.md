# P3 步骤 3/3:前端渲染造句题 + 打开开关 + 验证 + 更新 skill

## 背景(只需要知道这些)
葡语学习网页的单词任务页是原生 JS(无框架无构建),文件 `js/words.js`(**CRLF**)。要新增题型 **mode 4 = 造句**。
后端已经做好(P3 步骤 1、2):`GET /api/words/today` 返回的词对象里 `mode` 可为 4(字段同别的词:`id, pt_word, cn_meaning, pt_sentence, cn_sentence, mode, kind`,**没有** `cloze`);`POST /api/words/evaluate` 对 `mode=4` 的返回多一个 `corrected`(字符串,可为空):`{word_id, mode, passed, recognized_text, comment, corrected}`。调度开关 `word_planner.SENTENCE_ENABLED` 目前是 `False`。
**本步:前端能显示 → 打开开关 → 端到端验证 → 更新 skill。这是唯一会让造句"上线"的一步。**

## 要附的文件
`js/words.js`(最新版,已含填空 `viewCloze` 和麦克风复用改动)、`memory/word_planner.py`、`SKILL.md`(没有就不附)

## 只读这些文件。定位用 grep 锚点,不要信行号。**`words.js` 是 CRLF,改完必须保持 CRLF。**

## 任务

### A. 前置检查(任何一项不满足就**停下**,不要改开关,告诉用户缺什么)
```
python tools/test_p3s1.py     # 调度
python tools/test_p3s2.py     # 后端
python tools/test_step3.py    # 第一阶段后端回归（已同步放开 mode 4）
python tools/test_step4.py    # 第一阶段前端静态检查（在前端目录下运行）
```

### B. `js/words.js` 的改动(共 5 处)
1. **放开词过滤**(锚点:`async function fetchToday`):`[1, 2, 3].includes(w.mode)` → `[1, 2, 3, 4].includes(w.mode)`。⚠️ 漏改这一处会导致 mode 4 的词被整个过滤掉。
2. **新增 `viewSentence(w, c)`**,放在 `viewCloze` 前面或后面都行;并在 `viewTest` 里 `kind` 标签之后、`viewCloze` 那一行之后加一行:
   ```js
   if (w.mode === 4) return viewSentence(w, c);
   ```
   `viewSentence` 往 `c`(已是 `.wcard`)里依次追加,**全部用 `el()`(`textContent`)构造,禁止 `innerHTML`**:
   1. `el('div', 'tag', '✍️ 造句：用这个词说一句完整的话')`
   2. 目标词一行:**照 mode 1 的写法**(grep `termrow`)——`.termrow` 里放 `.term`(`w.pt_word`)和喇叭按钮(`spk(w, 'word')`)。**不自动朗读。**
   3. 中文释义:`el('div', 'azh', w.cn_meaning)`。
   4. 询问行:`el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : '请用这个词，说一句完整的葡语')`。
   5. `return c`。
   (造句**不用**挖空,也**不显示**例句——显示例句会让用户照抄。)
3. **结果页显示 AI 的参考说法**(锚点:`function viewResult`,里面显示"你说的"/识别结果的那一行,grep `'heard'`):在该行之后追加
   ```js
   if (w.mode === 4 && lastRes?.corrected) c.append(el('div', 'cmt', '参考说法：' + lastRes.corrected));
   ```
   (`cmt` 是已有的小号灰字类;只在 mode 4 且 `corrected` 非空时显示;用 `lastRes`,即 `evaluate()` 里保存的上一次评判返回。如果 `viewResult` 里变量名不叫 `lastRes`/`w`,按实际名字改,**不要新增全局变量**。)
4. **下一轮翻转方向**(锚点:`mode: w.mode === 3 ? 1 : (w.mode === 1 ? 2 : 1)`,在 `function next` 里)改成:
   ```js
   mode: w.mode === 3 ? 1 : (w.mode === 4 ? 2 : (w.mode === 1 ? 2 : 1))
   ```
   (造句答错的词,下一轮退回"看中文说葡语",先确认认得这个词;其余方向不变。)
5. **顶部注释**(锚点:`Word Item（与后端 memory/word_source.py 的 WordItem 一致）`):mode 说明补上 `4=造句（说一句用到目标词的话，评判返回 corrected）`。

**其余一律不动**:`next()`/`retry()` 里的 `if (cur.mode === 1) speak(...)` 保持原样(mode 4 不自动朗读);公布答案、跳过、录音、`evaluate`、`noteOutcome`(它原样传 `w.mode`)、`markMastered`、`render` 都不用改。**不要碰 `css/words.css`**(只用已有类 `tag/termrow/term/azh/ask/cmt`)。

### C. 打开开关
`memory/word_planner.py` 里把 `SENTENCE_ENABLED = False` 改成 `True`,注释改成 `# 造句（mode 4）总开关：True=开启；出问题改回 False 重启即可回退，其余代码不用动`。**只改这一处。**

### D. 新建 `tools/test_p3s3.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`,用 `assert`,全部通过打印 `P3步骤3测试全部通过`。
**1. 静态检查 `words.js`**(路径按 `js/words.js`,不存在则按 `portuguese-tutor-web/js/words.js` 再找一次):
- 包含 `[1, 2, 3, 4].includes(w.mode)`,且不再包含 `[1, 2, 3].includes(w.mode)`;
- 包含 `function viewSentence`,且 `viewTest` 里有 `viewSentence(`;
- `viewSentence` 函数体(从 `function viewSentence` 到下一个顶层 `function`)里不含 `innerHTML`、`speak(`;
- 包含 `w.mode === 4 ? 2`;包含 `lastRes?.corrected`(或你实际使用的等价写法)和 `参考说法：`;
- 全是 CRLF(没有单独的 `\n`);有 `node` 时 `node --check` 通过,没有就跳过并打印提示。

**2. 端到端模拟**(纯 Python,不启动服务器;`from memory import word_planner as P`;`P.CLOZE_ENABLED = P.SENTENCE_ENABLED = True`;测完恢复):
| # | 场景 | 期望 |
|---|---|---|
| a | **默认开关**:`import` 后不改任何开关,读 `P.SENTENCE_ENABLED` | `True` |
| b | "顽固路径毕业":一个词 box=4、`mode2_ok=0`、`mastered=0`、last=good、lapses=0、due 在 2026-09-30(周三)之前;`build_today_plan` | 该词 `mode==4`;对它 `apply_outcome(row,1,"good",4,周三)` → `mastered==1` |
| c | 同一个词答 `again`(mode 4) | `mastered==0`、`mode2_ok` 仍为原值、`due_date` 为下一个工作日 |
| d | 周六(2026-10-03)有 5 个弱词(lapses=2、box=2、due 在未来、last=good) | `kind=="extra"` 且 `mode==4` 恰好 3 个 |
| e | 周三同时有 2 个 box=4 未掌握复习词 + 9 个 box=3 good 复习词 | 4 的 2 个、3 的 `CLOZE_MAX` 个 |
| f | 关掉 `SENTENCE_ENABLED` 再跑 d、e | 计划里没有任何 4;填空数不变(第一阶段行为) |
| g | 新词、周五 `weekly` 条目 | 没有 4 |

### E. 更新 `SKILL.md`(如果用户附了;只做最小改动,找不到对应小节就加在最接近的位置)
1. **调度参数表**增加三行:`SENTENCE_ENABLED`(造句总开关,True)、`SENTENCE_MAX`(3,一天最多几道造句)、`SENTENCE_BOX_MIN`(4,复习词 box ≥ 此值才出)。
2. **结果判定表下面的说明**补一句:mode 4(造句)答对也会置 `mode2_ok=1`;mode 4 答错**不会**清 `mode2_ok`。
3. 新增一小节「造句(mode 4)」,照抄要点,不要扩写:
   - 定义:显示目标词 + 中文释义,用户用它说一整句葡语;不显示例句、不自动朗读(词旁有喇叭可手动听)。
   - 出题规则:`build_today_plan` 后处理(**在填空限量之前**):仅 ① `kind=review` 且 `box >= SENTENCE_BOX_MIN` 且未掌握 ② `kind=extra`(周六加练);排除 `lapses >= STUBBORN_LAPSES` 或 `last_outcome == "again"` 的词;一天最多 `SENTENCE_MAX` 个;`choose_mode` 本身永不返回 4;`weekly`/`new` 不出。
   - 评判:`_judge_sentence`——少于 2 个词直接判错(不调 LLM)→ `WORD_PT_USE_LLM` 关或 LLM 抛异常时退回规则(`pt_text.find_words` 整词匹配)→ 否则 `WORD_SENTENCE_JUDGE_PROMPT`,返回 `{pass, comment, corrected}`;语法小错不扣通过。ASR 用葡语 + `ASR_PROMPT_PT`(整句提示词)。
   - 前端:`fetchToday` 白名单 `[1,2,3,4]`;`viewSentence` 渲染;结果页显示"参考说法";下一轮翻转 `4→2, 3→1, 1→2, 2→1`。
   - 接口:`/words/today` 的 `words[].mode` 可为 4(无 `cloze`);`/words/evaluate` 对 mode 4 额外返回 `corrected`;`/words/evaluate`、`/words/complete`、`/words/record_error` 的 `mode` 取值 `1|2|3|4`。
   - 回退:`SENTENCE_ENABLED=False` 重启即可,不用动其他代码。
   - 已知取舍:出现频率很低(复习词里 box≥4 且未掌握的很少——box 3 的词先走填空、过了就毕业;主要靠周六加练);每次造句评判消耗一次 LLM,故严格限量;`corrected` 只显示文字,没有朗读。
4. **"已知简化 / 别顺手修复"** 补一条:造句评判完全依赖 LLM 判断词义与用法,规则兜底只检查"是否说出目标词"。

## 不要做
- 不要改除 `SENTENCE_ENABLED` 以外的后端代码;不要改 `words.css`;不要为了让测试通过而改 P3 步骤 1、2 的逻辑,测试不过就如实报告哪一条、什么原因。
- 不要实现"造句后朗读更正句""造句聊天联动"等后续功能。

## 手动预览(可选,给用户自己看效果)
打开单词页,**在「领取今日任务」首页**,在浏览器控制台粘贴:
```js
today.words = [{id:1,pt_word:'casa',cn_meaning:'家；房子',pt_sentence:'Eu gosto da minha casa.',cn_sentence:'我喜欢我的家。',mode:4,kind:'extra'}]; today.completed = null; render();
```
点「领取今日任务」,应看到:✍️ 标签、大号单词 + 喇叭、"家；房子"、"请用这个词，说一句完整的葡语",**没有例句、不自动朗读**。(评判会因为词库里没有 id=1 而报错,这是正常的,只看界面。)

## 交付格式
1. 改后的 `js/words.js`、`memory/word_planner.py`(只有开关一行,可只给那一行)。
2. 完整的 `tools/test_p3s3.py`。
3. 改后的 `SKILL.md`(完整文件,若用户附了)。
4. **最终报告**(给用户看,6 行内):
```
P3完成，造句（mode 4）已开启。
- 前置脚本：<都通过 / 哪个没过>
- P3步骤3测试：<通过 / 哪条没过>
- 回退方法：memory/word_planner.py 里 SENTENCE_ENABLED 改回 False 并重启
- 偏差：<无 / 具体说明>
```
末尾**原样附上**这段「上线后观察什么」:
- 造句题不会天天出现:主要在周六的加练里(最多 3 道),平时只有 box≥4 且还没毕业的复习词才会遇到。
- 说一整句葡语(至少 2 个词);评判要几秒钟。通过后结果页会给"参考说法",语法小错不影响通过。
- 造句答错后,下一轮会变成"看中文说葡语"。
- 如果觉得 AI 评判太严/太松,改 `prompts/word_prompts.py` 里 `WORD_SENTENCE_JUDGE_PROMPT` 的通过标准即可,不用动代码。

## 完成标志
`python tools/test_p3s3.py` 打印 `P3步骤3测试全部通过`,且 `SENTENCE_ENABLED` 为 `True`。
