# P2 步骤 1/3:公共文本工具 + 进度表加列 + 选词 / 加分函数

## 背景(只需要知道这些)
葡语学习网页(FastAPI + SQLite + 原生 JS)。要做「聊天联动」:教练聊天时自然带入用户最弱的几个词;用户在对话里用到了,给该词熟练度 `box` 加一点。
本步**只准备地基**:把葡语归一化函数挪到公共位置、写"在句子里找词"的纯函数、进度表加两列、写"选目标词"纯函数和"加分"数据库函数。**不接入聊天,行为完全不变。**

项目里每个词有进度行 `word_progress`:`box`(0~5 熟练度)、`lapses`、`last_outcome`(`good/hard/again/skipped`)、`hard_streak`、`mastered`。`box >= 4` 且会说 = 掌握。

## 要附的文件
`memory/word_progress_manager.py`、`memory/word_planner.py`、`api/word_routes.py`

## 只读这三个文件。定位用 grep 锚点,不要信行号。三个文件都是 CRLF,改完保持 CRLF;新建文件也用 CRLF。

## 任务

### A. 新建 `memory/pt_text.py`(纯函数,不 import 项目里任何别的模块)
```python
import re, unicodedata

MIN_TARGET_LETTERS = 3                        # 目标词（去空格后）少于 3 个字母不参与匹配（a / o / e / é 在任何句子里都会命中）
_PAREN = re.compile(r"[(（][^)）]*[)）]")
_VARIANT_SPLIT = re.compile(r"[/,;，；、]")    # "obrigado/obrigada" 拆成两个变体，任一命中即算

def norm_pt(s: str) -> str: ...
def strip_parens(s: str) -> str: ...
def find_words(text: str | None, words: dict[int, str]) -> list[int]: ...
```
1. `norm_pt`:**逻辑必须和 `word_routes._norm_pt` 完全一致**(原样搬过来):`NFC` → `casefold` → 各种连字符换成空格 → 去掉所有非字母数字空白的标点(`[^\w\s]|_`)→ 压缩空白。重音符号保留。
2. `strip_parens`:去掉全角/半角括号及括号内内容,`strip()`。
3. `find_words(text, words)`:返回 `text` 里出现了哪些目标词的 id,**按 id 升序**。规则:
   - `text` 为 `None`/空 → `[]`。
   - `padded = " " + norm_pt(text) + " "`。
   - 对每个 `(id, pt_word)`:`strip_parens` → 按 `_VARIANT_SPLIT` 拆成变体 → 每个变体 `norm_pt`;变体去掉空格后字母数 `< MIN_TARGET_LETTERS` 的丢弃;**任一变体满足 `" " + 变体 + " " in padded` 即命中**(整词/整短语匹配,不做词形变化、不做模糊)。
   - `pt_word` 不是字符串或处理后没有可用变体 → 跳过,不报错。

### B. `api/word_routes.py`:`_norm_pt` 改为从公共模块导入
- grep `def _norm_pt`,**删除这个函数体**,改成 `from memory.pt_text import norm_pt as _norm_pt`(放在文件顶部现有 import 区,沿用现有 import 风格)。
- 文件里其他对 `_norm_pt` 的调用**一律不动**。`_strip_accents` 等其他函数不动,不要清理 import。

### C. `memory/word_progress_manager.py`
1. **加列**(锚点:`CREATE TABLE IF NOT EXISTS word_progress` 和 `async def init_db`)。完全照 `hard_streak` 的模式:
   - `CREATE TABLE` 里新增两列:`used_count INTEGER NOT NULL DEFAULT 0`、`last_used_on TEXT NOT NULL DEFAULT ''`(放在 `mastered` 之后、`PRIMARY KEY` 之前)。
   - `init_db` 里用 `PRAGMA table_info(word_progress)` 检测,缺哪列就 `ALTER TABLE word_progress ADD COLUMN ...`(两列各检测各加)。
   - **不要**把这两列加进 `_COLS`(否则 `new_row` / `_upsert` 全要跟着改)。它们只被下面两个新函数读写。
2. 新增 `async def get_latest_week_ids(session_id: str) -> List[int]`:`SELECT MAX(week_start) FROM word_week WHERE session_id = ?`,再按 `seq` 升序返回该周的 `word_id` 列表;没有记录返回 `[]`。(`word_week.week_start` 存的是周计划起始日,不是周一,所以不能用 `today` 去算。)
3. 新增 `async def credit_chat_use(session_id: str, word_ids: List[int], today: date) -> List[int]`,**返回被加了 box 的 word_id 列表**。对每个 `word_id`:
   - 没有进度行,或 `mastered = 1` → 跳过。
   - `last_used_on == today.isoformat()` → 跳过(**每词每天最多生效一次**)。
   - 否则 `used_count += 1`、`last_used_on = today`;**只有 `box <= 2` 才 `box += 1`**(所以聊天最多把 box 推到 3,**绝不会让词毕业**,毕业只能靠测试),并把这个 id 放进返回列表。
   - `due_date`、`lapses`、`streak`、`last_outcome`、`mode2_ok`、`mastered` **一律不动**。
   - 一次连接、一次 `commit`;参数用占位符,不要拼 SQL。

### D. `memory/word_planner.py`:新增常量和一个纯函数
常量(放在 `CLOZE_ENABLED` 附近):
```python
CHAT_FOCUS_NEW = 2        # 聊天联动：目标词里最多留几个“本周还没测过的新词”名额
```
函数(放在 `choose_mode` 之后,不改任何现有函数):
```python
def pick_chat_focus(progress: dict[int, dict], week_ids: list[int], n: int) -> list[int]:
    """聊天联动的目标词 id：未掌握且最弱的词 + 本周还没进入进度表的新词，共 ≤ n 个。纯函数。"""
```
规则:
1. `new_part` = `week_ids` 里不在 `progress` 中的 id(保持周内顺序)取前 `CHAT_FOCUS_NEW` 个。
2. `weak` = `progress` 里 `mastered` 为假的行,排序键 `(-lapses, last_outcome != "again", -hard_streak, box, word_id)`(越靠前越弱);取前 `max(0, n - len(new_part))` 个。
3. 返回 `[弱词 id…] + [新词 id…]`,`n <= 0` 返回 `[]`。行里缺 `hard_streak` 当 0。

## 不要做
- 不要改 `make_cloze`、`choose_mode`、`apply_outcome`、`build_today_plan`、`settle`、`ensure_week` 等任何现有函数。
- 不要碰 `routes.py`、`tutor_prompt.py`、前端。
- 不要新增表。

## 要新建的测试脚本 `tools/test_p2s1.py`(**完整输出**)
放 `tools/`,开头 `sys.path.insert(0, 项目根目录)`;用 `assert`,全部通过打印 `P2步骤1测试全部通过`;数据库测试用临时文件(`settings.SQLITE_PATH` 指向 `tempfile`),用 `asyncio.run`。

**`find_words`**(`W` 为 `{id: pt_word}`):
| # | 输入 | 期望 |
|---|---|---|
| 1 | `("Eu gosto da minha casa.", {1:"casa"})` | `[1]` |
| 2 | `("As casas são grandes.", {1:"casa"})` | `[]` |
| 3 | `("Eu quero pão e leite", {3:"queijo",1:"pão",2:"leite"})` | `[1, 2]` |
| 4 | `("Eu tomo o pequeno-almoço às oito", {1:"pequeno-almoço"})` | `[1]` |
| 5 | `("Bom dia, como estás?", {1:"bom dia"})` | `[1]` |
| 6 | `("Tenho uma casa", {1:"casa (n.)"})` 和 `{1:"casa（名词）"}` | 都 `[1]` |
| 7 | `("Muito obrigada!", {1:"obrigado/obrigada"})` | `[1]` |
| 8 | `("CASA grande", {1:"casa"})` | `[1]` |
| 9 | `("Ele e ela", {1:"é"})` | `[]`(重音敏感且 < 3 字母) |
| 10 | `("Eu vou a casa", {1:"a"})` | `[]`(太短不参与) |
| 11 | `(None, {1:"casa"})`、`("", {1:"casa"})`、`("casa", {1:""})`、`("casa", {1:None})` | 都 `[]`,不报错 |

**`norm_pt` 与 `word_routes._norm_pt` 一致**:对 `["Pequeno-almoço.", "  Olá,  Mundo! ", "ÉPOCA", "casa_grande", "não"]` 逐个断言 `pt_text.norm_pt(x) == word_routes._norm_pt(x)`,且 `norm_pt("Pequeno-almoço.") == "pequeno almoço"`。(导入 `word_routes` 在沙箱缺 `faster_whisper` 时会失败:这一条用 `try/except ImportError` 跳过并打印提示,但在用户机器上必须真的跑。)

**`pick_chat_focus`**(`row(box, lapses=0, last="good", hard=0, mastered=0)` 构造行):
| # | 场景 | 期望 |
|---|---|---|
| 12 | 进度 5 个词(id 1~5)lapses 分别 0,3,1,2,0;`week_ids=[]`,`n=5` | 顺序 `[2,4,3,...]`(lapses 降序),长度 5,不含已掌握词 |
| 13 | 同上,id 3 `mastered=1` | 结果不含 3 |
| 14 | `week_ids=[10,11,12]` 都不在进度里,进度有 5 个弱词,`n=5` | 长度 5:前 3 个是最弱的 3 个词,后 2 个是 `[10, 11]` |
| 15 | lapses 相同,一个 `last="again"`,一个 `"good"` | `again` 的排前面 |
| 16 | `n=0` | `[]` |

**数据库**(临时库,`init_db()` 后用 `_upsert` 造行,行里 `box/due_date/...` 字段齐全):
| # | 场景 | 期望 |
|---|---|---|
| 17 | 旧库迁移:先手工建一个**没有** `used_count`/`last_used_on` 的 `word_progress` 表再 `init_db()` | 两列都存在 |
| 18 | box=1 的词 `credit_chat_use(..., day1)` | 返回 `[id]`;box=2;`used_count=1`;`last_used_on=day1` |
| 19 | 同一天再调用一次 | 返回 `[]`,box 不变,`used_count` 仍为 1 |
| 20 | 第二天再调用 | 返回 `[id]`,box=3,`used_count=2` |
| 21 | box=3 的词 | 返回 `[]`,box 仍 3,但 `used_count` +1(用到了,只是不加分) |
| 22 | box=2 的词连续三天 | box 依次 3、3、3(封顶 3) |
| 23 | `mastered=1` 的词、没有进度行的 id | 返回里没有它们,表里没有被改动/新建行 |
| 24 | 加分后该行的 `due_date / lapses / last_outcome / mode2_ok / mastered` | 与加分前完全相同 |
| 25 | `get_latest_week_ids`:往 `word_week` 手工插入两周(不同 `week_start`)各几个词 | 返回较晚那周、按 `seq` 排序;没有记录时 `[]` |

## 交付格式
1. 新增的 `memory/pt_text.py`(完整文件)。
2. 改后的 `api/word_routes.py`、`memory/word_progress_manager.py`、`memory/word_planner.py`(完整文件,或只给改动处,按总览里的"两种输出方式")。
3. 完整的 `tools/test_p2s1.py`。
4. **交接备注**:
```
P2步骤1完成。
- 改动：新增 memory/pt_text.py（norm_pt/strip_parens/find_words）；word_routes._norm_pt 改为导入；word_progress 加列 used_count/last_used_on（建表+自动迁移）；新增 get_latest_week_ids、credit_chat_use；word_planner 新增 CHAT_FOCUS_NEW、pick_chat_focus；新增 tools/test_p2s1.py
- 测试：<25 条全部通过 / 哪几条没过 / 哪几条因缺依赖跳过>
- 偏差：<无 / 具体说明>
```

## 完成标志
`python tools/test_p2s1.py` 打印 `P2步骤1测试全部通过`;并且已有的 `tools/test_step2.py`、`test_step3.py`、`test_step5.py` 仍然全部通过。
