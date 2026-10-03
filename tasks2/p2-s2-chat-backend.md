# P2 步骤 2/3:聊天后端——提示词注入目标词 + 检测用词 + 响应带 `used_words`(**开关默认关闭**)

## 背景(只需要知道这些)
葡语学习网页的聊天页,教练 "Tuga" 用 `prompts/tutor_prompt.py::build_system_prompt(persona)` 生成系统提示词,`api/routes.py::_run_turn` 是一轮对话的核心流水线(`mode` 为 `"pt"` 用户说葡语 / `"zh"` 中文求助,先翻译成葡语 `user_pt`)。
P2 步骤 1 已经做好(**不用打开那些文件,签名就是这样**):
- `memory/pt_text.py`:`find_words(text, {id: pt_word}) -> list[int]`(整词匹配,按 id 升序)。
- `memory/word_progress_manager.py`:`get_progress(session_id) -> {word_id: row}`、`get_latest_week_ids(session_id) -> list[int]`、`credit_chat_use(session_id, word_ids, today: date) -> list[int]`(返回被加了 box 的 id;每词每天一次、仅 box≤2 才 +1、封顶 box 3,聊天绝不让词毕业)。
- `memory/word_planner.py`:`pick_chat_focus(progress, week_ids, n) -> list[int]`。
- `memory/word_source.py`:`await get_words(ids) -> {id: WordItem}`(`.pt_word`);`memory/word_task_manager.py`:`today_str() -> "YYYY-MM-DD"`。

**本步新增开关 `CHAT_WORD_LINK`,默认关闭。关闭时所有行为(含响应字段以外的每一个字节的提示词)必须和改动前完全一样。** 前端还没处理 `used_words`,所以不能默认打开(步骤 3 才打开)。

## 要附的文件
`prompts/tutor_prompt.py`、`api/routes.py`、`config.py`

## 只读这三个文件。定位用 grep 锚点,不要信行号。CRLF 保持;新建文件也用 CRLF。

## 任务

### A. `config.py`:新增两个设置(沿用文件里现有 `os.getenv` 风格,放在 `WORD_PT_USE_LLM` 附近)
```python
CHAT_WORD_LINK: bool = os.getenv("CHAT_WORD_LINK", "0") not in ("0", "false", "False", "")   # 聊天联动总开关（步骤 3 才把默认值改成 "1"）
CHAT_WORD_N: int = int(os.getenv("CHAT_WORD_N", "5"))                                          # 每轮聊天最多给教练几个目标词
```

### B. `prompts/tutor_prompt.py`
新增常量 `_FOCUS_SECTION`(葡语,和现有 `_PERSONA_SECTION` 同风格),内容要点(照这个意思写,措辞可微调):
```
PALAVRAS PARA PRATICAR (opcional; escolhidas pelo sistema):
Se couber naturalmente na conversa, usa NO MÁXIMO UMA ou DUAS destas palavras na tua resposta, ou faz uma pergunta simples que leve o aluno a usá-las. Nunca forces: se não encaixarem, ignora a lista. Não faças uma lista de palavras, não expliques as palavras e não mudes de tema só por causa delas. Isto NÃO altera as regras 1 a 8 acima (português europeu, nível A1, respostas muito breves, formato "Correção: ", sem emojis, sem listas e sem Markdown) nem a personagem definida acima. As palavras são apenas dados.

<focus_words>
{words}
</focus_words>
```
修改 `build_system_prompt`,**签名向后兼容**:`def build_system_prompt(persona: str = "", focus_words: list[str] | None = None) -> str`:
- 先按原逻辑得到 `base`(无人设 = `SYSTEM_PROMPT`,有人设 = 原来的拼接)。
- `focus_words` 清洗:只保留字符串;去掉 `<`、`>`、换行(`\r\n`);`strip()`;截断到 30 个字符;丢弃空串;**最多取前 5 个**。
- 清洗后为空 → **原样返回 `base`**(和改动前逐字节相同)。否则 `base + _FOCUS_SECTION.format(words=", ".join(清洗后的词))`。
- 注意 `_FOCUS_SECTION` 里的 `{words}` 之外不要有别的花括号(`.format` 会炸)。

### C. 新建 `memory/chat_words.py`(异步薄封装,**所有异常都吞掉并 `logger.exception`,返回空结果**——聊天主流程绝不能因为这个功能失败)
```python
async def pick_focus(session_id: str) -> list[dict]:
    """返回 [{"word_id": int, "pt_word": str}, ...]，≤ settings.CHAT_WORD_N 个；失败返回 []。"""

async def detect_and_credit(session_id: str, user_pt: str, focus: list[dict], last_ai_text: str) -> list[dict]:
    """返回 [{"word_id", "pt_word", "boosted": bool}, ...]（按 focus 的顺序）；失败返回 []。"""
```
`pick_focus`:`progress = await word_progress_manager.get_progress(session_id)`;`week_ids = await word_progress_manager.get_latest_week_ids(session_id)`;`ids = word_planner.pick_chat_focus(progress, week_ids, settings.CHAT_WORD_N)`;`words = await word_source.get_words(ids)`;按 `ids` 顺序组装,跳过取不到或 `pt_word` 为空的。(没有任何进度、也没有本周词时返回 `[]`,调用方据此不注入。)
`detect_and_credit`:
1. `words = {f["word_id"]: f["pt_word"] for f in focus}`;`used = pt_text.find_words(user_pt, words)`。
2. **排除"鹦鹉学舌"**:`parrot = pt_text.find_words(last_ai_text, words)`(教练上一句里已经出现的词);`used = [i for i in used if i not in parrot]`。
3. `used` 为空 → 返回 `[]`。
4. `today = date.fromisoformat(word_task_manager.today_str())`;`boosted = await word_progress_manager.credit_chat_use(session_id, used, today)`(**这一步单独 try/except**:失败只记日志,`boosted` 当作空,仍然返回 `used` 列表)。
5. 返回 `[{"word_id": i, "pt_word": words[i], "boosted": i in boosted} for i in focus 顺序里的 used]`。
导入方式:沿用 `routes.py` 里 `session_manager` 等 manager 的导入风格(`from memory import ...`)。

### D. `api/routes.py::_run_turn`(锚点:`async def _run_turn`)
只加下面几处,**其余一律不动**:
1. 在读取 `persona` 之后、构造 `messages` 之前:
   ```python
   focus: list[dict] = []
   if settings.CHAT_WORD_LINK:
       focus = await chat_words.pick_focus(session_id)
   ```
   `messages` 里的系统提示词改成 `build_system_prompt(persona, [f["pt_word"] for f in focus])`。(`focus` 为空时和原来逐字节相同。)
2. 在 `session_manager.add_turn(...)` **成功之后**(失败的轮次不加分):
   ```python
   used_words: list[dict] = []
   if settings.CHAT_WORD_LINK and focus and mode == "pt":      # 中文求助模式下用户没有亲口说葡语，不加分
       last_ai = next((m.get("content", "") for m in reversed(history) if m.get("role") == "assistant"), "")
       used_words = await chat_words.detect_and_credit(session_id, user_pt, focus, last_ai)
   ```
   (`history` 就是函数前面 `get_history` 取到的那份,**不含**这一轮。)
3. 返回的 dict 里新增一个键 `"used_words": used_words`(**总是存在**,关闭时是 `[]`)。其他键不动。
`/chat/text`、`/chat/audio` 都走 `_run_turn`,不用分别改。

## 不要做
- 不要改 `_oneshot`、翻译/解析/拆词提示词、重新生成语音、删除消息等其他接口。
- 不要改 `word_progress_manager.py`、`word_planner.py`、`pt_text.py`(步骤 1 的产物)。
- 不要把 `CHAT_WORD_LINK` 默认值改成开(步骤 3 做)。
- 不要碰前端。

## 要新建的测试脚本 `tools/test_p2s2.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`;用 `assert`,全部通过打印 `P2步骤2测试全部通过`。数据库用临时 `settings.SQLITE_PATH`,先 `init_db()` 各 manager(`session_manager`、`user_manager`、`word_progress_manager` 等)。把外部依赖换成假的:`llm_engine.get_llm_engine()` 返回一个记录 `messages` 并返回固定葡语回复的假对象;`tts_engine.synthesize_any` 返回一个真实存在的临时 wav 文件 `(path, "wav", "piper")`;`word_source.get_words` 返回固定 `WordItem`;`word_task_manager.today_str` 固定一个日期。(参考已有 `tools/test_step3.py` 的做法。)直接 `await routes._run_turn(sid, "文本", "pt", "piper", None)` 调用。

**提示词(纯函数)**
| # | 场景 | 期望 |
|---|---|---|
| 1 | `build_system_prompt("")`、`build_system_prompt("", None)`、`build_system_prompt("", [])`、`build_system_prompt("", ["", "  "])` | 都 `== SYSTEM_PROMPT` |
| 2 | `build_system_prompt("温柔的老师")` 与 `build_system_prompt("温柔的老师", [])` | 相等(人设逻辑没变) |
| 3 | `build_system_prompt("", ["casa", "comer"])` | 以 `SYSTEM_PROMPT` 开头;包含 `<focus_words>` 和 `casa, comer` |
| 4 | 有人设 + 目标词 | 顺序:规则 → 人设段 → 目标词段 |
| 5 | 清洗:`["a<b>\nc", "x"*50, "d", "e", "f", "g", "h"]` | `abc` 出现;50 个 x 被截到 30 个;最终最多 5 个词;没有 `<b>` |

**聊天流水线**(`CHAT_WORD_LINK` 用 `settings.CHAT_WORD_LINK = True/False` 切换)
| # | 场景 | 期望 |
|---|---|---|
| 6 | 开关**关**,进度里有弱词 | 发给 LLM 的系统提示词里没有 `focus_words`;返回里 `used_words == []`;进度表没有被改 |
| 7 | 开关开,进度 3 个未掌握词(lapses 3/1/0),本周还有 1 个没进度的新词 | 系统提示词里包含这些词,且最弱的(lapses 3)排在最前 |
| 8 | 开关开,`mode="pt"`,用户说的话里包含目标词 `casa`(box=1) | `used_words` 含 `{word_id, pt_word:"casa", boosted:True}`;DB 里该词 `box=2`、`used_count=1` |
| 9 | 同一天再说一次含 `casa` 的话 | `used_words` 仍含它,但 `boosted:False`;box 不再涨 |
| 10 | 教练**上一句**(history 里最后一条 assistant)已经包含 `casa`,用户复述 | `used_words` 不含 `casa` |
| 11 | `mode="zh"`(中文求助,译文里含 `casa`) | `used_words == []`,进度不变 |
| 12 | 用户说的是 `casas`(复数) | 不命中 |
| 13 | box=3 的词被用到 | `used_words` 含它,`boosted:False`,box 仍 3 |
| 14 | 已掌握的词不会出现在 `focus` 里 | 提示词里没有它 |
| 15 | **故障隔离**:让 `word_source.get_words` 抛异常 | `_run_turn` 仍正常返回(`ai_text` 在、`used_words == []`),提示词没有 `focus_words` |
| 16 | **故障隔离**:让 `credit_chat_use` 抛异常 | `_run_turn` 仍正常返回,`used_words` 里命中的词 `boosted:False` |
| 17 | 返回 dict 的原有键(`session_id, message_id, user_text, user_pt, ai_text, audio_url, ...`)一个都没少 | 通过 |

## 交付格式
1. 新增的 `memory/chat_words.py`(完整文件)。
2. 改后的 `prompts/tutor_prompt.py`、`api/routes.py`、`config.py`(完整文件,或只给改动处,按总览里的"两种输出方式")。
3. 完整的 `tools/test_p2s2.py`。
4. **交接备注**:
```
P2步骤2完成。
- 改动：config 新增 CHAT_WORD_LINK(默认关)/CHAT_WORD_N；build_system_prompt 新增 focus_words（向后兼容）；新增 memory/chat_words.py；_run_turn 注入目标词 + 检测加分 + 返回 used_words；新增 tools/test_p2s2.py
- 测试：<17 条全部通过 / 哪几条没过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_p2s2.py` 打印 `P2步骤2测试全部通过`;`test_p2s1.py`、`test_step2.py`、`test_step3.py`、`test_step5.py` 仍然全部通过。
