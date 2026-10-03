# P4 步骤 3/3:前端朗读带 `ex` + 端到端验证 + 更新 skill

## 背景(只需要知道这些)
葡语学习网页的单词任务页是原生 JS(无框架无构建),文件 `js/words.js`(**CRLF**)。P4 后端已经做好(步骤 1、2):`GET /api/words/today` 里 mode 3 的词对象,如果挖空用的是**生成例句**,会把 `pt_sentence` / `cn_sentence` 换成该例句,并带一个整数字段 **`ex`**(例句编号;原例句为 0,没有 `ex` 键表示没走例句轮换)。朗读接口 `GET /api/words/{id}/audio?kind=sentence&tts_provider=…&ex=N` 用 `ex` 读对应例句。
**问题**:前端的 `speak(w, kind, btn)` 现在不传 `ex`,朗读例句时会读成词库**原例句**——结果页上显示的是生成例句、读出来的却是原句,不一致。
**本步:修这一处 → 端到端验证 → 更新 skill。** 第四阶段没有"开关"(没生成例句 = 行为不变;回退用 SQL 停用例句,见下)。

## 要附的文件
`js/words.js`(最新版,已含填空 `viewCloze`;若已做 P3 则含造句 `viewSentence`)、`SKILL.md`(没有就不附)

## 只读这些文件。定位用 grep 锚点,不要信行号。**`words.js` 是 CRLF,改完必须保持 CRLF。**

## 任务

### A. 前置检查(任何一项不满足就**停下**,告诉用户缺什么)
```
python tools/test_p4s1.py
python tools/test_p4s2.py
python tools/test_step3.py
```
另外问用户:**`python tools/gen_examples.py` 是否已经真正跑过**(P4 步骤 1 末尾的"要用户自己做的事")。没跑过也可以继续做本步(这时功能没有任何效果,也没有任何副作用),但最终报告里要写明"例句尚未生成,功能未生效"。

### B. `js/words.js`:`speak` 带上 `ex`(锚点:`function speak(w, kind, btn)`)
现在是:
```js
const c = ttsCfg(), q = new URLSearchParams({ kind, tts_provider: c.provider });
if (c.voice) q.set('tts_voice', c.voice);
```
在 `if (c.voice)` 这行之后加一行:
```js
if (kind === 'sentence' && w.ex) q.set('ex', w.ex);       // 填空题用的是第 ex 条生成例句：读的必须和屏幕上显示的是同一句（ex 为 0 / 没有 = 原例句）
```
- `w.ex` 为 `undefined` / `0` 时不传参数,行为和改动前完全一样。
- **只改这一处**。`viewCloze`、`viewResult`、`next()`、`retry()`、过滤、翻转都不用改——词对象是整个传递的,`ex` 会随 `{...w, mode: ...}` 一起带到下一轮。
- grep 确认文件里**没有第二处**自己拼 `/audio?` 的地方(应该只有 `speak` 一处);有就一并处理并在备注里说明。

### C. 新建 `tools/test_p4s3.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`,用 `assert`,全部通过打印 `P4步骤3测试全部通过`。
**1. 静态检查 `words.js`**(路径按 `js/words.js`,不存在则按 `portuguese-tutor-web/js/words.js` 再找一次):
- `speak` 函数体里包含 `q.set('ex', w.ex)` 且带有 `kind === 'sentence'` 条件;
- 全文只有一处 `/audio?`;
- 全是 CRLF(没有单独的 `\n`);有 `node` 时 `node --check` 通过,没有就跳过并打印提示。

**2. 端到端(后端,HTTP)**——`TestClient` 只挂 `word_routes.router`;临时 `SQLITE_PATH`;假 `word_source`(`get_words` / `get_word` / `list_word_ids` / `current_plan_week_start`)、`word_task_manager.today_str` 可 patch;`tts_engine.synthesize_any` 换成记录文本、返回真实临时 wav 的假函数;进度表里预先放 2 个到期复习词(box=3、last=good、`due_date` 在今天之前)。词:`W1`(`casa`,原例句 `"Eu gosto da minha casa."`)和 `W2`(`escrever`,原例句 `"Agora escrevam a resposta."`——挖不出空);例句表里给 `W1` 放 `"A casa é grande."`(idx1)、`"Vivo numa casa nova."`(idx2),给 `W2` 放 `"Eu quero escrever uma carta."`(idx1)。**`CLOZE_ENABLED=True`,今天是工作日。**
| # | 场景 | 期望 |
|---|---|---|
| a | 第 1 天 `GET /api/words/today?session_id=sid1` | 两个词都是 `mode==3`;`W1` 的 `ex==0`;**`W2` 被救回**:`ex==1`、`cloze=="Eu quero ____ uma carta."`、返回的 `pt_sentence` 是 `"Eu quero escrever uma carta."` |
| b | 同一天再请求一次 | 与 a 完全相同 |
| c | 第 2 天、第 3 天、第 4 天(patch `today_str`,并保证计划仍把两词排成 mode 3:每天重置进度/计划表) | `W1` 的 `ex` 依次 1、2、0 |
| d | 朗读:`GET /api/words/2/audio?kind=sentence&ex=1` | 合成文本是 `"Eu quero escrever uma carta."`;不带 `ex` 则是原句 `"Agora escrevam a resposta."` |
| e | 覆盖率对比:对词库 `[W1, W2]` 用 `tools/gen_examples.compute_coverage`,分别传空例句和上述例句 | `clozable_original` 从 1 → `clozable_with_examples` 2,`rescued==1` |
| f | **回退演练**:`UPDATE word_examples SET enabled = 0;` 后重新请求(换新 `session_id`) | 行为回到第一阶段:`W1` 用原例句(`ex==0`),`W2` 降级为 `mode==2` 且无 `cloze` |
| g | 评判不受影响:`POST /api/words/evaluate`(假 ASR 返回 `"escrever"`)对 `W2`、`mode=3` | `passed==True`(评判仍以 `pt_word` 为准,与用了哪条例句无关) |

### D. 更新 `SKILL.md`(如果用户附了;只做最小改动,找不到对应小节就加在最接近的位置)
1. **数据表说明**增加两张表:`word_examples(word_id, idx, pt_sentence, cn_sentence, enabled, source, created_on)`(idx≥1;**idx 0 = 词库原例句,不入表**;`enabled=0` 停用某条)、`word_example_use(session_id, word_id, last_idx, last_used_on)`(每人每词上次用的例句编号,用于轮换);两张表由 `memory/word_example_manager.py` 管理,`main.py` 启动时 `init_db`。
2. 新增一小节「多例句轮换(P4)」,照抄要点,不要扩写:
   - 生成:`tools/gen_examples.py`(**在用户机器上手动运行**,只读词库、只写 `word_examples`;`--report` / `--dry-run` / `--only-failing` / `--ids` / `--limit` / `--per-word` / `--batch` / `--sleep`;可断点续跑)。提示词 `WORD_EXAMPLES_PROMPT`:pt-PT、A1~A2、5~12 词、**必须原样包含目标词(不变位不变复数)**、简体中文翻译。校验 `validate_example`:能 `make_cloze` 挖空、有汉字、词数 3~16、不与已有重复。
   - 选择:只在 mode 3 时发生。`_load_words(entries, session_id)` 对每个词,候选池 = 原例句(idx 0)+ 启用的生成例句,**读取时重新用 `make_cloze` 校验**,保留能挖空的;`word_example_manager.pick_example` 轮换(`last_idx` 之后的下一个,回绕);同一天刷新保持不变(`last_used_on == 今天` 则沿用);池为空才降级为 mode 2。
   - 词对象:选中例句时 `pt_sentence`/`cn_sentence` 换成该例句,新增 `ex`(整数,原例句 0);不传 `session_id` 或例句表不可用时退回只用原例句。
   - 朗读:`GET /api/words/{id}/audio?kind=sentence&ex=N`;前端 `speak` 在 `kind==='sentence' && w.ex` 时带 `ex`。
   - 评判:不变(`_judge_pt_cloze` 仍以 `pt_word` 为准)。
   - 回退:`UPDATE word_examples SET enabled = 0;` 即回到只用原例句,不用改代码。
   - 已知取舍:生成例句没有人工审核,靠自动校验 + 抽查,不好的用 `enabled=0` 停用;mode 1 / 2 / 结果页以外的地方不轮换例句;挖空仍是精确匹配,所以生成例句必须含原形(模糊匹配仍是未做的后续项)。
3. **接口说明**里 `/words/today` 的 `words[].ex` 和 `/words/{id}/audio` 的 `ex` 参数补一行。
4. **"已知简化 / 别顺手修复"** 补一条:例句轮换的"今天已用"判定按服务器日期 `today_str()`;`record_use` 是在读取 `/today` 时写的(不是在用户真正答题时)。

## 不要做
- 不要改后端代码、`words.css`;不要为了让测试通过而改 P4 步骤 1、2 的逻辑,测试不过就如实报告哪一条、什么原因。
- 不要加"手动换一句"按钮、不要在结果页展示全部例句等后续功能。

## 交付格式
1. 改后的 `js/words.js`(只有 `speak` 里一行的改动,可只给那一处)。
2. 完整的 `tools/test_p4s3.py`。
3. 改后的 `SKILL.md`(完整文件,若用户附了)。
4. **最终报告**(给用户看,6 行内):
```
P4完成。
- 前置脚本：<都通过 / 哪个没过>；gen_examples 是否已运行：<已运行 / 未运行（功能未生效）>
- P4步骤3测试：<通过 / 哪条没过>
- 覆盖率：<用户 --report 的前后数字，不知道就写"未提供">
- 回退方法：UPDATE word_examples SET enabled = 0; 无需改代码
- 偏差：<无 / 具体说明>
```
末尾**原样附上**这段「上线后观察什么」:
- 同一个词的填空题,每隔几天会换一句例句;同一天刷新页面不会变。
- 原来因为例句里是变位/复数而挖不出空的词,现在能出填空题了(前提是你已经跑过 `gen_examples.py`)。
- 点结果页的喇叭读例句,读出来的应和屏幕上显示的是同一句。
- 如果某条生成的例句不好(不地道、翻译错),在数据库里把那条 `enabled` 改成 0,不用改代码。

## 完成标志
`python tools/test_p4s3.py` 打印 `P4步骤3测试全部通过`。
