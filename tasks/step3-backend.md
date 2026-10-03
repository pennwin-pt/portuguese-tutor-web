# 步骤 3/5:后端——接收 mode 3、构造挖空题、评判

## 背景(只需要知道这些)
葡语学习网页(FastAPI)的单词任务要新增题型 **mode 3 = 句子填空**:前端显示挖掉目标词的葡语例句(`____` 占位)+ 中文翻译,用户**只说缺的那个词**。
- mode `1` = 看葡语说中文(ASR 中文)。`2` = 看中文说葡语(ASR 葡语,规则优先、LLM 复判)。`3` = 填空(ASR 葡语,评判见下)。
- 步骤 1 已在 `memory/word_planner.py` 写好纯函数 `make_cloze(sentence, pt_word) -> str | None` 和常量 `CLOZE_BLANK = "____"`。**签名就是这样,不用打开那个文件。**
- 调度(步骤 2)里 mode 3 的开关 `CLOZE_ENABLED` 现在是 `False`,所以**本步做完后,线上不会出现 mode 3**,行为和改动前一致;本步只是让后端"能接住"mode 3。

## 要附的文件
`api/word_routes.py`、`memory/word_progress_manager.py`

## 只读这两个文件。定位用下面的 grep 锚点,不要信行号。

## 任务

### A. 放开 mode 校验(漏一处就会 422 或丢数据)
| 文件 | grep 锚点 | 改成 |
|---|---|---|
| `api/word_routes.py` | `mode: Literal[1, 2]`(**共两处**:结算接口的 outcome 项模型、`RecordErrorBody`) | `mode: Literal[1, 2, 3]` |
| `api/word_routes.py` | `if mode not in (1, 2):`(在 `words_evaluate` 里,同时更新它的报错文案为"mode 只能是 1、2 或 3") | `if mode not in (1, 2, 3):` |
| `memory/word_progress_manager.py` | `mode not in (1, 2)`(在 `settle` 里) | `mode not in (1, 2, 3)` |

**不要改** `memory/word_source.py` 里的 `mode: Literal[1, 2]`(词源默认值永远是 1)。
数据库列 `mode` / `last_mode` 都是 `INTEGER` 且没有 CHECK 约束,**不需要迁移**。

### B. `_load_words`:构造挖空 + 降级(锚点:`async def _load_words`)
它把计划条目 `{word_id, kind, mode}` 展开成前端用的词对象,现在大致是 `{**w.model_dump(), "mode": e["mode"], "kind": e["kind"]}`。改成:
- 对 `e["mode"] == 3` 的条目:`cloze = make_cloze(w.pt_sentence, w.pt_word)`。
  - 成功(非 `None`)→ 词对象里加字段 `"cloze": cloze`,`mode` 保持 3。
  - 失败(`None`)→ 词对象的 `mode` 改成 **2**,**不带** `cloze` 字段。
- **不要把降级回写到数据库**(计划表里仍是 3,每次读取重新判定,结果稳定)。
- `make_cloze` 的导入方式:先 grep 看 `word_routes.py` 现在是怎么导入 `word_planner` 的(`from memory import word_planner as ...` 之类),**沿用同一种写法**,不要新增风格不一致的导入。
- 其他 kind(预览等)的行为不变。

### C. 新增评判函数 `_judge_pt_cloze`(放在 `_judge_pt_llm` 的定义旁边)
```python
async def _judge_pt_cloze(word: word_source.WordItem, heard: str) -> tuple[bool, str]:
```
逻辑(按顺序,命中即返回):
1. `passed, comment = _judge_pt(word.pt_word, heard)`(**现有的规则函数**,同步)。`passed` 为真 → `return passed, comment`。
2. 把 `_norm_pt(heard)` 按空白切成词,**逐个词**再 `_judge_pt(word.pt_word, token)`;任何一个通过 → `return True, "…"`(用户把整句念出来的情况,comment 随意写一句中文)。
3. 以上都没通过 → `return await _judge_pt_llm(word, heard)`(**现有函数,原样复用**,它已经包含 `WORD_PT_USE_LLM` 开关和"LLM 失败退回规则结果"的行为,不要重写)。

### D. 接入 `words_evaluate`(锚点:`async def words_evaluate`)
- 语音识别语言/提示词的选择现在是 `"zh" if mode == 1 else "pt"`、`None if mode == 1 else settings.ASR_PROMPT_WORD`。**确认它是按 `mode == 1` 判断的**(这样 mode 3 自动走葡语识别);如果哪里写的是 `mode == 2`,改成 `mode != 1`。
- 评判分支现在是 `await _judge_pt_llm(word, heard) if mode == 2 else await _judge_zh(word, heard)`。改成三路:
  - `mode == 1` → `_judge_zh`
  - `mode == 2` → `_judge_pt_llm`
  - `mode == 3` → `_judge_pt_cloze`
- 返回结构不变(`{word_id, mode, passed, recognized_text, comment}`)。

## 不要做
- 不要改 `_judge_pt`、`_judge_pt_llm`、`_judge_zh`、`_norm_pt` 的内部逻辑。
- 不要改 `/today` 接口的其他字段、`meta`、`preview`。
- 不要新增表/列。
- 不要碰 `word_planner.py` 和前端。

## 要新建的测试脚本 `tools/test_step3.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`。用 `assert`,全部通过打印 `步骤3测试全部通过`。不启动服务器,直接 import 函数测。
- 把 `settings.WORD_PT_USE_LLM = False`(避免真的调 LLM)。
- 对 `_load_words` 用 `monkeypatch` 的方式把词源的取词函数换成返回固定 `WordItem` 的假函数(先看 `_load_words` 里实际调用的是哪个函数再替换)。

| # | 场景 | 期望 |
|---|---|---|
| 1 | 词 `pt_word="casa"`,`pt_sentence="Eu gosto da minha casa."`,条目 `mode=3` | 返回的词对象 `mode==3`,`cloze=="Eu gosto da minha ____."` |
| 2 | 词 `pt_word="casa"`,`pt_sentence="As casas são grandes."`,条目 `mode=3` | `mode==2`,**没有** `cloze` 键 |
| 3 | 条目 `mode=1` 和 `mode=2` | 原样返回,**没有** `cloze` 键 |
| 4 | `_judge_pt_cloze`:目标 `casa`,`heard="casa"` | `passed==True` |
| 5 | 目标 `casa`,`heard="eu gosto da minha casa"` | `passed==True` |
| 6 | 目标 `casa`,`heard="mesa"`(LLM 已关) | `passed==False` |
| 7 | 构造 outcome 项模型 `mode=3` / `RecordErrorBody(mode=3)` | 校验通过 |
| 8 | 同上 `mode=4` | 抛 `ValidationError` |

另外在脚本末尾**调用 `grep` 等价的检查**:用 Python 遍历 `api/*.py` 和 `memory/*.py`,查找字符串 `(1, 2)` 和 `Literal[1, 2]`,**只允许出现在 `memory/word_source.py`**,否则打印出位置并失败。

## 交付格式
1. 改后的 `api/word_routes.py`、`memory/word_progress_manager.py`(完整文件,或只给被改动的函数/行 + 新增函数,按总览里的"两种输出方式")。
2. 完整的 `tools/test_step3.py`。
3. **交接备注**:
```
步骤3完成。
- 改动：word_routes.py（Literal×2、evaluate 校验与三路评判、_load_words 挖空与降级、新增 _judge_pt_cloze）；word_progress_manager.py settle 校验；新增 tools/test_step3.py
- 测试：<全部通过 / 哪几条没过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_step3.py` 打印 `步骤3测试全部通过`。
